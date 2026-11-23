import { Injectable, inject } from '@angular/core';
import { buildTcgdexAssetUrl, parseCardIdInput } from '../domain/card-id.utils';
import { roundCurrency, roundOneDecimal } from '../domain/card-math.utils';
import { CatalogCard, CatalogCardSummary } from '../domain/models';
import { CardCatalogPort } from '../ports/card-catalog.port';
import { LocalCacheAdapter } from './local-cache.adapter';

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
  private readonly artworkMap: Record<string, string>;

  constructor() {
    this.artworkMap = this.cache.loadArtworkCache();
  }

  async lookupByCardId(rawInput: string): Promise<CatalogCard | null> {
    const parsed = parseCardIdInput(rawInput);
    if (!parsed) return null;

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
        const imageUrl = item.image ? `${item.image}/low.webp` : buildTcgdexAssetUrl(item.id, 'low');
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

  rememberArtwork(cardId: string, url: string): void {
    const key = cardId.trim().toLowerCase();
    if (!key || !url) return;
    if (this.artworkMap[key] !== url) {
      this.artworkMap[key] = url;
      this.cache.saveArtworkCache(this.artworkMap);
    }
  }

  private mapFullCard(raw: TcgdexCardResponse): CatalogCard {
    const official = raw.set?.cardCount?.official ?? 0;
    const total = raw.set?.cardCount?.total ?? official;
    const cardNumber = official ? `${raw.localId}/${official}` : raw.localId;

    const imageBase = raw.image;
    const imageUrl = imageBase ? `${imageBase}/high.webp` : buildTcgdexAssetUrl(raw.id, 'high');
    const lowImageUrl = imageBase ? `${imageBase}/low.webp` : buildTcgdexAssetUrl(raw.id, 'low');

    const { marketPriceEur, lowPriceEur, highPriceEur, trendPercent } = this.extractCardmarketPrices(raw);

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
