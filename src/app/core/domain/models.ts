export type BinderSlotsPerPage = 4 | 9 | 12 | 16 | 20;

export type FeedbackStatus = 'open' | 'in_progress' | 'done';
export type FeedbackCategory = 'Bug' | 'Idee' | 'Verbetering' | 'UI / Design';

export const FEEDBACK_PAGES = [
  'Algemeen / Hele app',
  'Dashboard',
  'Collectie',
  'Snel Toevoegen',
  'Pokédex Binder',
  'Set Voortgang',
  'Verlanglijst',
  'Ruil & Verkoop',
  'Instellingen',
  'Feedback Hub',
] as const;

export type FeedbackPage = (typeof FEEDBACK_PAGES)[number];

export interface FeedbackItem {
  id: string;
  rowIndex?: number;
  createdAt: string;
  page: FeedbackPage | string;
  category: FeedbackCategory | string;
  title: string;
  description: string;
  status: FeedbackStatus;
  votes: number;
  author: string;
  platform: string;
  source: 'hub' | 'github' | 'sheets' | 'local';
  externalUrl?: string;
  screenshotUrl?: string;
  screenshotFileId?: string;
}

export interface FeedbackScreenshotUpload {
  base64: string;
  mimeType: string;
  fileName: string;
  dataUrl: string;
  sizeKb: number;
}

export interface CollectionCard {
  /** Rijnummer in Google Sheet (vanaf 2). Voor lokaal aangemaakte kaarten tijdelijk negatief. */
  rowIndex: number;
  cardId: string;
  name: string;
  setName: string;
  cardNumber: string;
  language: string;
  type: string;
  rarity: string;
  variant: string;
  condition: string;
  grading: string;
  grade: string;
  quantity: number;
  storageLocation: string;
  binderDetail: string;
  purchaseDate: string;
  purchasePrice: number;
  marketPrice: number;
  /** Optionele gecachte hoge-resolutie afbeelding URL (TCGdex) */
  imageUrl?: string;
  /** Optionele trend % voor weergave */
  trendPercent?: number;
  forTrade: boolean;
  acquisitionMethod?: string;
  notes: string;
}

export interface CardFinancialMetrics {
  totalValue: number;
  totalCost: number;
  profitLoss: number;
  roiPercent: number;
}

export interface SetProgress {
  rowIndex?: number;
  setName: string;
  setCode?: string;
  series: string;
  totalCards: number;
  ownedUnique: number;
  remaining: number;
  progressPercent: number;
  totalSetValue: number;
}

export interface PokedexSlot {
  rowIndex?: number;
  generation: string;
  dexNumber: number;
  pokemonName: string;
  inBinder: boolean;
  inCollectionCount: number;
  status: string;
  page: number;
  position: string;
  selectedCard: string;
  upgradeWanted: boolean;
}

export interface WishlistItem {
  rowIndex: number;
  cardId?: string;
  cardName: string;
  setName: string;
  cardNumber: string;
  desiredVariant: string;
  minCondition: string;
  priority: string;
  maxBudget: number;
  marketPrice: number;
  notes: string;
  found: boolean;
  imageUrl?: string;
}

export interface TradeEntry {
  rowIndex: number;
  date: string;
  cardName: string;
  setName: string;
  type: 'Verkoop' | 'Ruil' | 'Inruil' | string;
  purchasePrice: number;
  saleValue: number;
  platformFees: number;
  netResult: number;
  counterparty: string;
  notes: string;
}

export interface DropdownSettings {
  languages: string[];
  types: string[];
  rarities: string[];
  variants: string[];
  conditions: string[];
  gradings: string[];
  storageLocations: string[];
  priorities: string[];
  tradeTypes: string[];
  acquisitionMethods?: string[];
}

export interface AppSnapshot {
  scriptVersion?: string;
  collection: CollectionCard[];
  setProgress: SetProgress[];
  pokedex: PokedexSlot[];
  binderSlotsPerPage: BinderSlotsPerPage;
  wishlist: WishlistItem[];
  trades: TradeEntry[];
  feedback?: FeedbackItem[];
  settings: DropdownSettings;
  syncedAt: string;
}

export interface CatalogCard {
  id: string;
  localId: string;
  name: string;
  setId: string;
  setName: string;
  seriesName: string;
  officialCardCount: number;
  totalCardCount: number;
  cardNumber: string;
  type: string;
  rarity: string;
  imageBase?: string;
  imageUrl: string;
  lowImageUrl: string;
  marketPriceEur: number;
  cardmarketProductId?: number;
  lowPriceEur?: number;
  highPriceEur?: number;
  trendPercent?: number;
  dexIds?: number[];
  /** Kaarttaal van deze gegevens/scan (EN weggelaten). */
  language?: string;
  /** Originele anderstalige naam (de `name` blijft Engels). */
  localizedName?: string;
}

export interface CatalogCardSummary {
  id: string;
  localId: string;
  name: string;
  /** Originele anderstalige kaartnaam wanneer `name` de Engelse naam is. */
  localizedName?: string;
  imageBase?: string;
  imageUrl: string;
  setName?: string;
}

export interface CatalogSetSummary {
  id: string;
  /** Officiële geprinte kaartcode op de kaart zelf (bijv. DLR, PBL, 30C, MEW) */
  code?: string;
  name: string;
  series?: string;
  seriesId?: string;
  releaseDate?: string;
  logoUrl?: string;
  symbolUrl?: string;
  officialCount: number;
  totalCount: number;
}

export interface CatalogSetDetail extends CatalogSetSummary {
  seriesName: string;
  cards: CatalogCardSummary[];
}

export type SheetProfileRole = 'live' | 'test';

export interface KaartspotProfileSyncState {
  sourceInput: string;
  username: string;
  selectedBinderIds: string[];
  wishlistWanted: boolean;
  syncLayout: boolean;
  lastSyncedAt?: string;
}

export interface SheetProfile {
  id: string;
  name: string;
  role: SheetProfileRole;
  webAppUrl: string;
  apiToken: string;
  monthlyBudget?: number;
  kaartspot?: KaartspotProfileSyncState;
}

export interface AppConnectionConfig {
  webAppUrl: string;
  apiToken: string;
  demoMode: boolean;
  monthlyBudget: number;
  activeProfileId?: string;
  profiles?: SheetProfile[];
  kaartspot?: KaartspotProfileSyncState;
}

export interface PendingMutation {
  id: string;
  action:
    | 'addCard'
    | 'updateCard'
    | 'deleteCard'
    | 'updatePokedexSlot'
    | 'addWishlist'
    | 'markWishlistFound'
    | 'updateWishlist'
    | 'deleteWishlist'
    | 'logTrade'
    | 'addFeedback'
    | 'updateFeedback'
    | 'deleteFeedback';
  payload: Record<string, unknown>;
  createdAt: string;
  description: string;
  tempRowIndex?: number;
  profileId?: string;
  attempts?: number;
}

export interface PortfolioSummary {
  uniqueCards: number;
  totalCopies: number;
  purchaseValue: number;
  marketValue: number;
  unrealizedProfit: number;
  roiPercent: number;
  realizedProfit: number;
  openWishlistBudget: number;
  openWishlistMarketTotal: number;
  openWishlistCount: number;
  tradeValue: number;
  tradeCount: number;
}

export interface GenerationInfo {
  id: number;
  label: string;
  shortLabel: string;
  region: string;
  start: number;
  end: number;
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'info' | 'warning' | 'error';
}

export const DEFAULT_DROPDOWN_SETTINGS: DropdownSettings = {
  languages: ['EN', 'NL', 'JP', 'DE', 'FR', 'KR', 'CHS', 'ZHT'],
  types: [
    'Fire',
    'Water',
    'Grass',
    'Lightning',
    'Psychic',
    'Fighting',
    'Darkness',
    'Metal',
    'Dragon',
    'Fairy',
    'Colorless',
    'Trainer',
    'Energy',
  ],
  rarities: [
    'Common',
    'Uncommon',
    'Rare',
    'Double Rare',
    'Illustration Rare',
    'Ultra Rare',
    'Special Illustration Rare',
    'Hyper Rare',
    'Promo',
    'Vintage Holo',
  ],
  variants: [
    'Normal',
    'Reverse Holo',
    'Holo',
    'Full Art',
    'Alt Art',
    'First Edition',
    'Stamped / Promo',
  ],
  conditions: [
    'Mint (MT)',
    'Near Mint (NM)',
    'Excellent (EX)',
    'Good (GD)',
    'Light Played (LP)',
    'Played (PL)',
    'Poor (PO)',
  ],
  gradings: ['Raw', 'PSA', 'BGS', 'CGC', 'TAG'],
  storageLocations: [
    'Hoofdbinder',
    'Toploader Binder',
    'Trade Binder',
    'Speeldeck',
    'Display / Kast',
    'Bulk Box',
  ],
  priorities: ['Hoog', 'Gemiddeld', 'Laag', 'Grail'],
  tradeTypes: ['Verkoop', 'Ruil', 'Inruil'],
  acquisitionMethods: [
    'Pack Pull',
    'Single gekocht',
    'Geruild (Trade)',
    'Promo / Sealed Box',
    'Cadeau',
    'Oude collectie',
  ],
};
