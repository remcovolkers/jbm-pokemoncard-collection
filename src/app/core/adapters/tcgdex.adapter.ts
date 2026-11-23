import { Injectable, inject } from '@angular/core';
import {
  buildTcgdexAssetUrl,
  getDisplaySetCode,
  hasKnownSetCode,
  parseCardIdInput,
  registerDynamicSetCodes,
  resolveCardArtworkUrl,
} from '../domain/card-id.utils';
import { roundCurrency, roundOneDecimal } from '../domain/card-math.utils';
import {
  CatalogCard,
  CatalogCardSummary,
  CatalogSetDetail,
  CatalogSetSummary,
} from '../domain/models';
import { CardCatalogPort } from '../ports/card-catalog.port';
import { LocalCacheAdapter } from './local-cache.adapter';

interface TcgdexSetBriefResponse {
  id: string;
  name: string;
  tcgOnline?: string;
  abbreviation?: { official?: string };
  serie?: { id?: string; name?: string };
  logo?: string;
  symbol?: string;
  cardCount?: { official?: number; total?: number };
}

interface TcgdexSetDetailResponse extends TcgdexSetBriefResponse {
  cards?: TcgdexBriefResponse[];
}

interface StaticSetsCatalogFile {
  generatedAt?: string;
  totalPhysicalSets?: number;
  sets?: CatalogSetSummary[];
}

const SETS_CACHE_KEY = 'pokebinder_tcgdex_sets_v2';
const SET_DETAIL_CACHE_PREFIX = 'pokebinder_tcgdex_set_v2_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 uur cache -> voorkomt API throttling!
const DIGITAL_POCKET_ID_RE = /^(?:[AB]\d+[a-z]?|P-A)$/i;

interface TcgdexCardResponse {
  id: string;
  localId: string;
  name: string;
  image?: string;
  category?: string;
  rarity?: string;
  types?: string[];
  dexId?: number[];
  set?: {
    id?: string;
    name?: string;
    serie?: { id?: string; name?: string };
    cardCount?: { official?: number; total?: number };
  };
  pricing?: {
    cardmarket?: {
      unit?: string;
      idProduct?: number | null;
      trend?: number | null;
      avg?: number | null;
      avg1?: number | null;
      avg7?: number | null;
      avg30?: number | null;
      low?: number | null;
      'trend-holo'?: number | null;
      'avg7-holo'?: number | null;
    };
  };
}

interface TcgdexBriefResponse {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

const TCGDEX_API_BASE = 'https://api.tcgdex.net/v2/en';

const RARITY_NORMALIZATION: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'rare holo': 'Rare',
  'double rare': 'Double Rare',
  'illustration rare': 'Illustration Rare',
  'ultra rare': 'Ultra Rare',
  'special illustration rare': 'Special Illustration Rare',
  'hyper rare': 'Hyper Rare',
  promo: 'Promo',
  'secret rare': 'Hyper Rare',
  'rare holo vmax': 'Ultra Rare',
  'rare holo v': 'Ultra Rare',
  'rare holo vstar': 'Ultra Rare',
  'rare ultra': 'Ultra Rare',
  'rare secret': 'Special Illustration Rare',
  'holo rare': 'Vintage Holo',
};

@Injectable({ providedIn: 'root' })
export class TcgdexAdapter implements CardCatalogPort {
  private readonly cache = inject(LocalCacheAdapter);
  private readonly memoryCards = new Map<string, CatalogCard>();
  private readonly memorySetDetails = new Map<string, CatalogSetDetail>();
  private memoryAllSets: CatalogSetSummary[] | null = null;
  private staticCatalogAttempted = false;
  private readonly artworkMap: Record<string, string>;
  private readonly cardmarketIdMap: Record<string, number>;

  constructor() {
    this.artworkMap = this.cache.loadArtworkCache();
    this.cardmarketIdMap = this.cache.loadCardmarketIdCache();
  }

  async lookupByCardId(rawInput: string): Promise<CatalogCard | null> {
    let parsed = parseCardIdInput(rawInput);
    if (!parsed) return null;

    // Als de ingetypte setcode (bijv. een splinternieuwe set) nog niet bekend is, laad 1x de gebundelde setcatalogus
    if (!hasKnownSetCode(parsed.inputSetCode) && !this.staticCatalogAttempted) {
      await this.tryLoadBundledSetsCatalog();
      parsed = parseCardIdInput(rawInput);
      if (!parsed) return null;
    }

    for (const candidateId of parsed.candidateIds) {
      const card = await this.getCardByExactId(candidateId);
      if (card) return card;
    }
    return null;
  }

  async getCardByExactId(cardId: string): Promise<CatalogCard | null> {
    const cleanId = cardId.trim();
    if (!cleanId) return null;

    const cached = this.memoryCards.get(cleanId.toLowerCase());
    if (cached) return cached;

    try {
      const response = await fetch(`${TCGDEX_API_BASE}/cards/${encodeURIComponent(cleanId)}`);
      if (!response.ok) return null;
      const raw = (await response.json()) as TcgdexCardResponse;
      if (!raw || !raw.id) return null;

      const mapped = this.mapFullCard(raw);
      this.memoryCards.set(cleanId.toLowerCase(), mapped);
      this.memoryCards.set(mapped.id.toLowerCase(), mapped);

      if (mapped.imageUrl) {
        this.rememberArtwork(mapped.id, mapped.imageUrl);
      }
      if (mapped.cardmarketProductId) {
        this.rememberCardmarketProductId(mapped.id, mapped.cardmarketProductId);
        if (cleanId.toLowerCase() !== mapped.id.toLowerCase()) {
          this.rememberCardmarketProductId(cleanId, mapped.cardmarketProductId);
        }
      }
      return mapped;
    } catch {
      return null;
    }
  }

  async searchByName(query: string, limit = 18): Promise<CatalogCardSummary[]> {
    const clean = query.trim();
    if (clean.length < 2) return [];

    try {
      const url = `${TCGDEX_API_BASE}/cards?name=${encodeURIComponent(clean)}`;
      const response = await fetch(url);
      if (!response.ok) return [];

      const items = (await response.json()) as TcgdexBriefResponse[];
      if (!Array.isArray(items)) return [];

      // Sorteer kaarten met artwork eerst en moderne/bekende sets vooraan
      const withArt = items.filter((item) => Boolean(item.image));
      const withoutArt = items.filter((item) => !item.image);
      const combined = [...withArt.reverse(), ...withoutArt].slice(0, limit);

      return combined.map((item) => {
        const imageUrl = resolveCardArtworkUrl(item.id, item.image, 'low');
        if (item.image) {
          this.rememberArtwork(item.id, `${item.image}/high.webp`);
        }
        return {
          id: item.id,
          localId: item.localId,
          name: item.name,
          imageBase: item.image,
          imageUrl,
        };
      });
    } catch {
      return [];
    }
  }

  getCachedArtworkUrl(cardId: string): string {
    const key = cardId.trim().toLowerCase();
    if (!key) return '';
    if (this.artworkMap[key]) return this.artworkMap[key];
    return buildTcgdexAssetUrl(cardId, 'high');
  }

  getCachedCardmarketProductId(cardId: string): number | undefined {
    const key = cardId.trim().toLowerCase();
    if (!key) return undefined;
    const val = this.cardmarketIdMap[key];
    return typeof val === 'number' && val > 0 ? val : undefined;
  }

  /**
   * Laadt alle fysieke Pokémon TCG-sets (zonder digitale TCG Pocket-sets) met geprinte kaartcodes (DLR, PBL, 30C, MEW...).
   * Gebruikt eerst de lokaal gebundelde sets-catalog.json (0 externe calls) en valt bij nood terug op TCGdex REST.
   */
  async listAllSets(): Promise<CatalogSetSummary[]> {
    if (this.memoryAllSets) return this.memoryAllSets;

    const cached = this.readTtlCache<CatalogSetSummary[]>(SETS_CACHE_KEY);
    if (cached && cached.length > 0) {
      registerDynamicSetCodes(cached);
      this.memoryAllSets = cached;
      return cached;
    }

    const bundled = await this.tryLoadBundledSetsCatalog();
    if (bundled && bundled.length > 0) {
      this.memoryAllSets = bundled;
      this.writeTtlCache(SETS_CACHE_KEY, bundled);
      return bundled;
    }

    try {
      const response = await fetch(`${TCGDEX_API_BASE}/sets`);
      if (!response.ok) return [];
      const raw = (await response.json()) as TcgdexSetBriefResponse[];
      if (!Array.isArray(raw)) return [];

      const mapped: CatalogSetSummary[] = raw
        .filter(
          (s) =>
            Boolean(s.id && s.name) &&
            s.serie?.id !== 'tcgp' &&
            !DIGITAL_POCKET_ID_RE.test(s.id)
        )
        .reverse()
        .map((s) => ({
          id: s.id,
          code: (
            s.abbreviation?.official ||
            s.tcgOnline ||
            getDisplaySetCode(s.id, s.name)
          ).toUpperCase(),
          name: s.name,
          series: s.serie?.name,
          seriesId: s.serie?.id,
          logoUrl: s.logo ? `${s.logo}.webp` : undefined,
          symbolUrl: s.symbol ? `${s.symbol}.webp` : undefined,
          officialCount: s.cardCount?.official ?? 0,
          totalCount: s.cardCount?.total ?? s.cardCount?.official ?? 0,
        }));

      registerDynamicSetCodes(mapped);
      this.memoryAllSets = mapped;
      this.writeTtlCache(SETS_CACHE_KEY, mapped);
      return mapped;
    } catch {
      return [];
    }
  }

  private async tryLoadBundledSetsCatalog(): Promise<CatalogSetSummary[] | null> {
    this.staticCatalogAttempted = true;
    try {
      const res = await fetch('sets-catalog.json');
      if (!res.ok) return null;
      const json = (await res.json()) as StaticSetsCatalogFile;
      if (!json || !Array.isArray(json.sets) || json.sets.length === 0) return null;

      const physical = json.sets
        .filter((s) => Boolean(s?.id && s?.name) && s.seriesId !== 'tcgp')
        .map((s) => ({
          ...s,
          code: (s.code || getDisplaySetCode(s.id, s.name)).toUpperCase(),
        }));

      registerDynamicSetCodes(physical);
      return physical;
    } catch {
      return null;
    }
  }

  /**
   * Laadt alle kaarten van 1 set in 1 enkele request (zero per-kaart calls -> geen throttling!).
   * Volledige details & Cardmarket prijzen worden pas on-demand opgehaald bij aanklikken.
   */
  async getSetCards(setId: string): Promise<CatalogSetDetail | null> {
    const cleanId = setId.trim();
    if (!cleanId) return null;

    const mem = this.memorySetDetails.get(cleanId.toLowerCase());
    if (mem) return mem;

    const cacheKey = `${SET_DETAIL_CACHE_PREFIX}${cleanId.toLowerCase()}`;
    const stored = this.readTtlCache<CatalogSetDetail>(cacheKey);
    if (stored) {
      if (stored.code) registerDynamicSetCodes([{ id: stored.id, code: stored.code }]);
      this.memorySetDetails.set(cleanId.toLowerCase(), stored);
      return stored;
    }

    try {
      const response = await fetch(`${TCGDEX_API_BASE}/sets/${encodeURIComponent(cleanId)}`);
      if (!response.ok) return null;
      const raw = (await response.json()) as TcgdexSetDetailResponse;
      if (!raw || !raw.id) return null;

      const resolvedCode = (
        raw.abbreviation?.official ||
        raw.tcgOnline ||
        getDisplaySetCode(raw.id, raw.name)
      ).toUpperCase();
      registerDynamicSetCodes([{ id: raw.id, code: resolvedCode }]);

      const cards: CatalogCardSummary[] = (raw.cards ?? []).map((item) => ({
        id: item.id,
        localId: item.localId,
        name: item.name,
        imageBase: item.image,
        imageUrl: resolveCardArtworkUrl(item.id, item.image, 'low'),
      }));

      const detail: CatalogSetDetail = {
        id: raw.id,
        code: resolvedCode,
        name: raw.name,
        series: raw.serie?.name ?? '',
        seriesId: raw.serie?.id ?? '',
        seriesName: raw.serie?.name ?? '',
        logoUrl: raw.logo ? `${raw.logo}.webp` : undefined,
        symbolUrl: raw.symbol ? `${raw.symbol}.webp` : undefined,
        officialCount: raw.cardCount?.official ?? cards.length,
        totalCount: raw.cardCount?.total ?? cards.length,
        cards,
      };

      this.memorySetDetails.set(cleanId.toLowerCase(), detail);
      this.writeTtlCache(cacheKey, detail);
      return detail;
    } catch {
      return null;
    }
  }

  private readTtlCache<T>(key: string): T | null {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { savedAt: number; data: T };
      if (!parsed || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  private writeTtlCache(key: string, data: unknown): void {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
      }
    } catch {
      // Quota vol: geen probleem, in-memory cache blijft actief
    }
  }

  rememberArtwork(cardId: string, url: string): void {
    const key = cardId.trim().toLowerCase();
    if (!key || !url) return;
    if (this.artworkMap[key] !== url) {
      this.artworkMap[key] = url;
      this.cache.saveArtworkCache(this.artworkMap);
    }
  }

  rememberCardmarketProductId(cardId: string, productId: number): void {
    const key = cardId.trim().toLowerCase();
    const id = Math.floor(productId);
    if (!key || !Number.isFinite(id) || id <= 0) return;
    if (this.cardmarketIdMap[key] !== id) {
      this.cardmarketIdMap[key] = id;
      this.cache.saveCardmarketIdCache(this.cardmarketIdMap);
    }
  }

  private mapFullCard(raw: TcgdexCardResponse): CatalogCard {
    const official = raw.set?.cardCount?.official ?? 0;
    const total = raw.set?.cardCount?.total ?? official;
    const cardNumber = official ? `${raw.localId}/${official}` : raw.localId;

    const imageBase = raw.image;
    const imageUrl = resolveCardArtworkUrl(raw.id, imageBase, 'high');
    const lowImageUrl = resolveCardArtworkUrl(raw.id, imageBase, 'low');

    const { marketPriceEur, lowPriceEur, highPriceEur, trendPercent } = this.extractCardmarketPrices(raw);
    const rawProductId = this.positiveNumber(raw.pricing?.cardmarket?.idProduct);
    const cardmarketProductId = rawProductId > 0 ? Math.floor(rawProductId) : undefined;

    return {
      id: raw.id,
      localId: raw.localId,
      name: raw.name,
      setId: raw.set?.id ?? raw.id.split('-')[0] ?? '',
      setName: raw.set?.name ?? '',
      seriesName: raw.set?.serie?.name ?? '',
      officialCardCount: official,
      totalCardCount: total,
      cardNumber,
      type: this.extractType(raw),
      rarity: this.normalizeRarity(raw.rarity),
      imageBase,
      imageUrl,
      lowImageUrl,
      marketPriceEur,
      cardmarketProductId,
      lowPriceEur,
      highPriceEur,
      trendPercent,
      dexIds: raw.dexId,
    };
  }

  private extractCardmarketPrices(raw: TcgdexCardResponse): {
    marketPriceEur: number;
    lowPriceEur?: number;
    highPriceEur?: number;
    trendPercent?: number;
  } {
    const cm = raw.pricing?.cardmarket;
    if (!cm) return { marketPriceEur: 0 };

    const trend = this.positiveNumber(cm.trend);
    const avg7 = this.positiveNumber(cm.avg7);
    const avg30 = this.positiveNumber(cm.avg30);
    const avg = this.positiveNumber(cm.avg);
    const low = this.positiveNumber(cm.low);
    const trendHolo = this.positiveNumber(cm['trend-holo']);

    const best = trend || avg7 || avg30 || avg || trendHolo || low || 0;
    let trendPercent: number | undefined;
    if (trend > 0 && avg30 > 0) {
      trendPercent = roundOneDecimal(((trend - avg30) / avg30) * 100);
    }

    return {
      marketPriceEur: roundCurrency(best),
      lowPriceEur: low > 0 ? roundCurrency(low) : undefined,
      highPriceEur: avg > 0 && avg > best ? roundCurrency(avg * 1.15) : best > 0 ? roundCurrency(best * 1.2) : undefined,
      trendPercent,
    };
  }

  private extractType(raw: TcgdexCardResponse): string {
    if (raw.types && raw.types.length > 0) return raw.types[0];
    if (raw.category === 'Trainer') return 'Trainer';
    if (raw.category === 'Energy') return 'Energy';
    return 'Colorless';
  }

  private normalizeRarity(rarity?: string): string {
    if (!rarity) return 'Rare';
    const key = rarity.trim().toLowerCase();
    return RARITY_NORMALIZATION[key] ?? rarity.trim();
  }

  private positiveNumber(val: number | null | undefined): number {
    return typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : 0;
  }
}
