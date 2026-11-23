import { InjectionToken } from '@angular/core';
import {
  CatalogCard,
  CatalogCardSummary,
  CatalogSetDetail,
  CatalogSetSummary,
} from '../domain/models';

/**
 * Hexagonale port voor kaartcatalogus-opzoekingen en artwork (TCGdex).
 */
export interface CardCatalogPort {
  /** Zoekt één specifieke kaart op via invoer zoals "MEW 181", "OBF 199/197", "BS 44" of "sv03.5-181". */
  lookupByCardId(rawInput: string): Promise<CatalogCard | null>;

  /** Zoekt kaarten op Pokémon- of kaartnaam voor visuele resultatenlijst. */
  searchByName(query: string, limit?: number): Promise<CatalogCardSummary[]>;

  /** Haalt volledige kaartdetails op voor een bekend TCGdex kaart-ID (bijv. na klikken op een zoekresultaat). */
  getCardByExactId(cardId: string): Promise<CatalogCard | null>;

  /** Retourneert gecachte of afgeleide high-res artwork URL voor een kaart-ID. */
  getCachedArtworkUrl(cardId: string): string;

  /** Retourneert het gecachte Cardmarket product-ID (idProduct) voor een kaart-ID, indien bekend. */
  getCachedCardmarketProductId?(cardId: string): number | undefined;

  /** Haalt het overzicht van alle officiële TCG-sets op (1 lichte request, 24u gecacht). */
  listAllSets?(): Promise<CatalogSetSummary[]>;

  /** Haalt alle kaarten van één set in 1 enkele request op (lokaal gecacht, geen per-kaart throttling). */
  getSetCards?(setId: string): Promise<CatalogSetDetail | null>;
}

export const CARD_CATALOG_PORT = new InjectionToken<CardCatalogPort>('CARD_CATALOG_PORT');
