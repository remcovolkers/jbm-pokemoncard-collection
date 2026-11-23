import { InjectionToken } from '@angular/core';
import {
  AppConnectionConfig,
  AppSnapshot,
  BinderSlotsPerPage,
  CollectionCard,
  FeedbackItem,
  FeedbackStatus,
  TradeEntry,
  WishlistItem,
} from '../domain/models';

export interface ConnectionTestResult {
  ok: boolean;
  spreadsheetName?: string;
  syncedAt?: string;
  error?: string;
}

export interface AddCardPayload extends Partial<CollectionCard> {
  seriesName?: string;
  setTotalCards?: number;
}

export interface UpdatePokedexSlotPayload {
  dexNumber?: number;
  inBinder?: boolean;
  selectedCard?: string;
  upgradeWanted?: boolean;
  slotsPerPage?: BinderSlotsPerPage;
}

export interface MarkWishlistFoundPayload {
  rowIndex: number;
  cardName?: string;
  addToCollection?: boolean;
  cardPayload?: AddCardPayload;
}

export interface RefreshPricesResult {
  updated: number;
  total: number;
  snapshot: AppSnapshot;
}

/**
 * Hexagonale port voor het lezen en schrijven van de volledige collectiestatus (Google Sheets / Demo / Cache).
 */
export interface CollectionRepository {
  testConnection(config: AppConnectionConfig): Promise<ConnectionTestResult>;
  bootstrap(config: AppConnectionConfig): Promise<AppSnapshot>;
  addCard(config: AppConnectionConfig, payload: AddCardPayload): Promise<AppSnapshot>;
  updateCard(config: AppConnectionConfig, payload: Partial<CollectionCard> & { rowIndex?: number; cardId?: string }): Promise<AppSnapshot>;
  deleteCard(config: AppConnectionConfig, payload: { rowIndex?: number; cardId?: string }): Promise<AppSnapshot>;
  updatePokedexSlot(config: AppConnectionConfig, payload: UpdatePokedexSlotPayload): Promise<AppSnapshot>;
  addWishlist(config: AppConnectionConfig, payload: Omit<WishlistItem, 'rowIndex' | 'found'>): Promise<AppSnapshot>;
  markWishlistFound(config: AppConnectionConfig, payload: MarkWishlistFoundPayload): Promise<AppSnapshot>;
  logTrade(config: AppConnectionConfig, payload: Omit<TradeEntry, 'rowIndex' | 'netResult'>): Promise<AppSnapshot>;
  addFeedback?(config: AppConnectionConfig, payload: Omit<FeedbackItem, 'source' | 'rowIndex'>): Promise<AppSnapshot>;
  updateFeedback?(
    config: AppConnectionConfig,
    payload: { id: string; status?: FeedbackStatus; votes?: number }
  ): Promise<AppSnapshot>;
  deleteFeedback?(config: AppConnectionConfig, payload: { id: string }): Promise<AppSnapshot>;
  refreshPrices(config: AppConnectionConfig): Promise<RefreshPricesResult>;
}

export const COLLECTION_REPOSITORY = new InjectionToken<CollectionRepository>('COLLECTION_REPOSITORY');
