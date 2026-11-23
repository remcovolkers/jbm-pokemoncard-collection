export type BinderSlotsPerPage = 4 | 9 | 12 | 16;

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
  source: 'github' | 'sheets' | 'local';
  externalUrl?: string;
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
}

export interface AppSnapshot {
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
  lowPriceEur?: number;
  highPriceEur?: number;
  trendPercent?: number;
  dexIds?: number[];
}

export interface CatalogCardSummary {
  id: string;
  localId: string;
  name: string;
  imageBase?: string;
  imageUrl: string;
  setName?: string;
}

export interface AppConnectionConfig {
  webAppUrl: string;
  apiToken: string;
  demoMode: boolean;
  monthlyBudget: number;
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
    | 'logTrade'
    | 'addFeedback'
    | 'updateFeedback'
    | 'deleteFeedback';
  payload: Record<string, unknown>;
  createdAt: string;
  description: string;
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
  languages: ['EN', 'NL', 'JP', 'DE', 'FR', 'KR'],
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
};
