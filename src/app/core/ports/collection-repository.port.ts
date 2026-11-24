import { InjectionToken } from '@angular/core';
import {
  AppConnectionConfig,
  AppSnapshot,
  BinderSlotsPerPage,
  CollectionCard,
  FeedbackCategory,
  FeedbackItem,
  FeedbackPage,
  FeedbackStatus,
  PendingMutation,
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

export interface UpdateWishlistPayload extends Partial<Omit<WishlistItem, 'rowIndex'>> {
  rowIndex: number;
  originalCardName?: string;
}

export interface DeleteWishlistPayload {
  rowIndex: number;
  cardName?: string;
}

export interface RefreshPricesResult {
  updated: number;
  total: number;
  snapshot: AppSnapshot;
}

export interface UpdateFeedbackPayload {
  id: string;
  page?: FeedbackPage | string;
  category?: FeedbackCategory | string;
  title?: string;
  description?: string;
  author?: string;
  status?: FeedbackStatus;
  votes?: number;
}

export interface MutationWriteOptions {
  skipBootstrap?: boolean;
}

export interface BatchMutationItem {
  id: string;
  action: PendingMutation['action'];
  payload: Record<string, unknown>;
  tempRowIndex?: number;
}

export interface BatchMutationItemResult {
  id: string;
  action: string;
  ok: boolean;
  result?: {
    rowIndex?: number;
    cardId?: string;
    name?: string;
    deletedRowIndex?: number;
    addedCardRowIndex?: number;
    addedCardName?: string;
    updated?: boolean;
    deleted?: boolean;
    found?: boolean;
  };
  error?: string;
}

export interface BatchMutationResponse {
  results: BatchMutationItemResult[];
  snapshot?: AppSnapshot;
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
  updateWishlist?(config: AppConnectionConfig, payload: UpdateWishlistPayload): Promise<AppSnapshot>;
  deleteWishlist?(config: AppConnectionConfig, payload: DeleteWishlistPayload): Promise<AppSnapshot>;
  logTrade(config: AppConnectionConfig, payload: Omit<TradeEntry, 'rowIndex' | 'netResult'>): Promise<AppSnapshot>;
  addFeedback?(config: AppConnectionConfig, payload: Omit<FeedbackItem, 'source' | 'rowIndex'>): Promise<AppSnapshot>;
  updateFeedback?(config: AppConnectionConfig, payload: UpdateFeedbackPayload): Promise<AppSnapshot>;
  deleteFeedback?(config: AppConnectionConfig, payload: { id: string }): Promise<AppSnapshot>;
  batchMutations?(
    config: AppConnectionConfig,
    mutations: BatchMutationItem[],
    options?: MutationWriteOptions
  ): Promise<BatchMutationResponse>;
  refreshPrices(config: AppConnectionConfig): Promise<RefreshPricesResult>;
}

export const COLLECTION_REPOSITORY = new InjectionToken<CollectionRepository>('COLLECTION_REPOSITORY');
