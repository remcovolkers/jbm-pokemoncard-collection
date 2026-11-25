import { Injectable, inject } from '@angular/core';
import {
  buildTcgdexAssetUrl,
  getDisplaySetCode,
  normalizeSetDisplayName,
  hasKnownSetCode,
  parseCardIdInput,
  registerDynamicSetCodes,
  resolveCardArtworkUrl,
} from '../domain/card-id.utils';
import { getTcgdexLanguagePath, normalizeLanguageCode } from '../domain/card-language.utils';
import { roundCurrency, roundOneDecimal } from '../domain/card-math.utils';
import { NATIONAL_DEX_NAMES } from '../domain/national-dex.data';
import { doesCardMatchPokemon } from '../domain/pokedex-matching.utils';
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
      'avg-holo'?: number | null;
      'avg30-holo'?: number | null;
      'low-holo'?: number | null;
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
const TCGDEX_API_ROOT = 'https://api.tcgdex.net/v2';

/** Westerse talen delen set-/kaart-ID's met Engels (zelfde `base1-4`, andere scan). */
const WESTERN_TCGDEX_LANGS = new Set(['fr', 'de', 'nl', 'es', 'it', 'pt']);
const TCG_NAME_SUFFIX_RE = /\s?(ex|EX|GX|VMAX|VSTAR|V-UNION|V|BREAK|δ|☆)$/;

function apiBaseFor(language: string): string {
  const path = getTcgdexLanguagePath(language);
  return path === 'en' ? TCGDEX_API_BASE : `${TCGDEX_API_ROOT}/${path}`;
}

const RARITY_NORMALIZATION: Record<string, string> = {
  common: 'Common',
  'one diamond': 'Common',
  uncommon: 'Uncommon',
  'two diamond': 'Uncommon',
  rare: 'Rare',
  'three diamond': 'Rare',
  'rare holo': 'Rare',
  'double rare': 'Double Rare',
  'four diamond': 'Double Rare',
  'illustration rare': 'Illustration Rare',
  'one star': 'Illustration Rare',
  'one shiny': 'Illustration Rare',
  'ultra rare': 'Ultra Rare',
  'two star': 'Ultra Rare',
  'full art trainer': 'Ultra Rare',
  'classic collection': 'Ultra Rare',
  'special illustration rare': 'Special Illustration Rare',
  'three star': 'Special Illustration Rare',
  'two shiny': 'Special Illustration Rare',
  'hyper rare': 'Hyper Rare',
  crown: 'Hyper Rare',
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
  private readonly languageSetIds = new Map<string, Set<string>>();
  private staticCatalogAttempted = false;
  private readonly artworkMap: Record<string, string>;
  private readonly cardmarketIdMap: Record<string, number>;

  constructor() {
    this.artworkMap = this.cache.loadArtworkCache();
    this.cardmarketIdMap = this.cache.loadCardmarketIdCache();
  }

  async lookupByCardId(rawInput: string, language = 'EN'): Promise<CatalogCard | null> {
    let parsed = parseCardIdInput(rawInput);
    if (!parsed) return null;

    // Als de ingetypte setcode (bijv. een splinternieuwe set) nog niet bekend is, laad 1x de gebundelde setcatalogus
    if (!hasKnownSetCode(parsed.inputSetCode) && !this.staticCatalogAttempted) {
      await this.tryLoadBundledSetsCatalog();
      parsed = parseCardIdInput(rawInput);
      if (!parsed) return null;
    }

    for (const candidateId of parsed.candidateIds) {
      const card = await this.getCardByExactId(candidateId, language);
      if (card) return card;
    }
    return null;
  }

  async getCardByExactId(cardId: string, language = 'EN'): Promise<CatalogCard | null> {
    const cleanId = cardId.trim();
    if (!cleanId) return null;

    const lang = normalizeLanguageCode(language);
    if (getTcgdexLanguagePath(lang) !== 'en') {
      const localized = await this.getLocalizedCardByExactId(cleanId, lang);
      if (localized) return localized;
      // Fallback: kaart bestaat niet in deze taal -> Engelse gegevens
    }

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

  /**
   * Haalt een kaart op in de gekozen taal (echte anderstalige scan, eigen set-naam).
   * Kaartnaam blijft Engels: bij westerse talen via de Engelse kaart, bij Aziatische talen via dexId.
   */
  private async getLocalizedCardByExactId(cardId: string, lang: string): Promise<CatalogCard | null> {
    const memKey = `${lang}:${cardId.toLowerCase()}`;
    const cached = this.memoryCards.get(memKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${apiBaseFor(lang)}/cards/${encodeURIComponent(cardId)}`);
      if (!response.ok) return null;
      const raw = (await response.json()) as TcgdexCardResponse;
      if (!raw || !raw.id) return null;

      const mapped = this.mapFullCard(raw);
      let englishName: string | undefined;
      if (WESTERN_TCGDEX_LANGS.has(getTcgdexLanguagePath(lang))) {
        const en = await this.getCardByExactId(raw.id, 'EN');
        englishName = en?.name;
        if (en && !mapped.marketPriceEur) {
          mapped.marketPriceEur = en.marketPriceEur;
          mapped.lowPriceEur = en.lowPriceEur;
          mapped.highPriceEur = en.highPriceEur;
          mapped.trendPercent = en.trendPercent;
        }
        mapped.cardmarketProductId = mapped.cardmarketProductId ?? en?.cardmarketProductId;
      } else {
        englishName = this.englishNameFromDex(raw.name, raw.dexId);
      }

      const result: CatalogCard = {
        ...mapped,
        name: englishName || mapped.name,
        localizedName: englishName && englishName !== raw.name ? raw.name : undefined,
        language: lang,
      };
      this.memoryCards.set(memKey, result);
      return result;
    } catch {
      return null;
    }
  }

  /** Leidt de Engelse Pokémon-naam af uit dexId + TCG-suffix (ex/GX/V…) van een Aziatische kaartnaam. */
  private englishNameFromDex(localName: string, dexIds?: number[]): string | undefined {
    const names = (dexIds ?? [])
      .map((n) => NATIONAL_DEX_NAMES[n - 1])
      .filter((n): n is string => Boolean(n));
    if (names.length === 0) return undefined;
    const suffix = localName.match(TCG_NAME_SUFFIX_RE);
    const base = names.join(' & ');
    return suffix ? `${base} ${suffix[1]}` : base;
  }

  private async fetchLanguageSetIds(lang: string): Promise<Set<string> | null> {
    const cached = this.languageSetIds.get(lang);
    if (cached) return cached;
    try {
      const response = await fetch(`${apiBaseFor(lang)}/sets`);
      if (!response.ok) return null;
      const raw = (await response.json()) as Array<{ id?: string }>;
      if (!Array.isArray(raw)) return null;
      const ids = new Set(raw.map((x) => (x.id ?? '').toLowerCase()).filter(Boolean));
      this.languageSetIds.set(lang, ids);
      return ids;
    } catch {
      return null;
    }
  }

  private async searchLocalizedByName(
    clean: string,
    limit: number,
    lang: string
  ): Promise<CatalogCardSummary[]> {
    const langPath = getTcgdexLanguagePath(lang);

    if (WESTERN_TCGDEX_LANGS.has(langPath)) {
      // Zoek op Engelse naam en toon alleen kaarten uit sets die er in deze taal bestaan, met anderstalige scan
      const english = await this.searchByName(clean, 60, 'EN');
      const setIds = await this.fetchLanguageSetIds(lang);
      const filtered = setIds
        ? english.filter((item) => setIds.has(item.id.slice(0, item.id.lastIndexOf('-')).toLowerCase()))
        : english;
      return filtered.slice(0, limit).map((item) => {
        const imageBase = item.imageBase?.replace('/en/', `/${langPath}/`);
        return {
          ...item,
          imageBase,
          imageUrl: imageBase ? `${imageBase}/low.webp` : item.imageUrl,
        };
      });
    }

    // Aziatische talen: koppel via Pokédex-nummer (Engelse naam) of zoek direct op de lokale naam
    const dexIndex = NATIONAL_DEX_NAMES.findIndex((n) => doesCardMatchPokemon(clean, n));
    const url =
      dexIndex >= 0
        ? `${apiBaseFor(lang)}/cards?dexId=eq:${dexIndex + 1}`
        : `${apiBaseFor(lang)}/cards?name=${encodeURIComponent(clean)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const items = (await response.json()) as TcgdexBriefResponse[];
      if (!Array.isArray(items)) return [];
      const withArt = items.filter((item) => Boolean(item.image));
      const withoutArt = items.filter((item) => !item.image);
      return [...withArt.reverse(), ...withoutArt].slice(0, limit).map((item) => {
        const englishBase = dexIndex >= 0 ? NATIONAL_DEX_NAMES[dexIndex] : undefined;
        const suffix = item.name.match(TCG_NAME_SUFFIX_RE);
        return {
          id: item.id,
          localId: item.localId,
          name: englishBase ? `${englishBase}${suffix ? ` ${suffix[1]}` : ''}` : item.name,
          localizedName: englishBase ? item.name : undefined,
          imageBase: item.image,
          imageUrl: item.image ? `${item.image}/low.webp` : '',
        };
      });
    } catch {
      return [];
    }
  }

  async searchByName(query: string, limit = 18, language = 'EN'): Promise<CatalogCardSummary[]> {
    const clean = query.trim();
    if (clean.length < 2) return [];

    const lang = normalizeLanguageCode(language);
    if (getTcgdexLanguagePath(lang) !== 'en') {
      const localized = await this.searchLocalizedByName(clean, limit, lang);
      if (localized.length > 0) return localized;
      // Niets gevonden in deze taal: toon Engelse resultaten i.p.v. een lege lijst
    }

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
          name: normalizeSetDisplayName(s.name),
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
          name: normalizeSetDisplayName(s.name),
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
        name: normalizeSetDisplayName(raw.name),
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
      setName: normalizeSetDisplayName(raw.set?.name),
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
    const avg1 = this.positiveNumber(cm.avg1);
    const low = this.positiveNumber(cm.low);
    const trendHolo = this.positiveNumber(cm['trend-holo']);
    const avg7Holo = this.positiveNumber(cm['avg7-holo']);
    const avg30Holo = this.positiveNumber(cm['avg30-holo']);
    const avgHolo = this.positiveNumber(cm['avg-holo']);
    const lowHolo = this.positiveNumber(cm['low-holo']);

    const best =
      trend ||
      avg7 ||
      avg30 ||
      avg ||
      avg1 ||
      trendHolo ||
      avg7Holo ||
      avg30Holo ||
      avgHolo ||
      low ||
      lowHolo ||
      0;
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
