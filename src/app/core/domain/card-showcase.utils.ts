import { getDisplaySetCode, resolveCardmarketUrl } from './card-id.utils';
import { CollectionCard, WishlistItem } from './models';

export const OFFICIAL_POKEMON_CARD_BACK_URL =
  'https://tcg.pokemon.com/assets/img/global/tcg-card-back-2x.jpg';

export type ShowcaseHoloStyle = 'gloss' | 'reverse' | 'holo' | 'cosmos' | 'gold';

export interface ShowcaseCardViewModel {
  key: string;
  cardId: string;
  name: string;
  setName: string;
  setCode?: string;
  cardNumber: string;
  imageUrl?: string;
  rarity?: string;
  variant: string;
  condition?: string;
  grading?: string;
  grade?: string;
  priority?: string;
  isGrail: boolean;
  holoStyle: ShowcaseHoloStyle;
  marketPrice: number;
  targetBudget?: number;
  purchasePrice?: number;
  notes?: string;
  found?: boolean;
  cardmarketUrl: string;
}

const NON_SHOWCASE_RARITIES = new Set([
  'common',
  'uncommon',
  'none',
  'basic energy',
  'energy',
]);

const SPECIAL_VARIANTS = new Set([
  'holo',
  'full art',
  'alt art',
  'first edition',
  'stamped / promo',
]);

const RARE_RARITY_PATTERN =
  /\b(rare|holo|sir|sar|ir|hr|ultra|hyper|illustration|secret|promo|amazing|radiant|shining|shiny|ace\s*spec|legend|prime|break|vmax|vstar|gx|ex|gold\s*star)\b|lv\.?\s*x|[★☆]/i;

const RARE_NAME_PATTERN =
  /\b(ex|gx|v|vmax|vstar|prime|legend|break|sir|sar|ir|hr|holo|radiant|shining|shiny|promo|gold\s*star)\b|lv\.?\s*x|[★☆]/i;

/**
 * Beoordeelt op basis van een bekende `rarity`-string of een kaart een Rare+ (inclusief Illustration Rare, SIR, Promo, etc.) is.
 * Geeft `false` voor alle Commons en Uncommons, `true` voor Rares+, en `null` wanneer de zeldzaamheid onbekend/leeg is.
 */
export function evaluateRarityShowcaseEligibility(
  rarity: string | null | undefined
): boolean | null {
  const clean = (rarity ?? '').trim().toLowerCase();
  if (!clean) return null;
  if (NON_SHOWCASE_RARITIES.has(clean)) return false;
  if (RARE_RARITY_PATTERN.test(clean)) return true;
  return false;
}

/**
 * Herkent Secret / Illustration Rare kaartnummers (bijv. "202/165" waarbij 202 > 165, of "GG44", "TG15", "SV107").
 */
export function isSecretOrGalleryCardNumber(cardNumber: string | null | undefined): boolean {
  const clean = (cardNumber ?? '').trim();
  if (!clean) return false;
  if (/^(?:GG|TG|SV|SH|RC)\s*\d+/i.test(clean)) return true;

  const fraction = clean.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const num = parseInt(fraction[1], 10);
    const total = parseInt(fraction[2], 10);
    if (Number.isFinite(num) && Number.isFinite(total) && total > 0 && num > total) {
      return true;
    }
  }
  return false;
}

/**
 * "Bijzondere kaart = bijzondere view":
 * Alleen Rare-kaarten (inclusief Illustration Rare, SIR, Double/Ultra/Hyper Rare, Vintage Holo, Promo)
 * krijgen door de hele app de 3D Showcase; Commons en Uncommons nooit.
 */
export function isCollectionCardShowcaseEligible(
  card: Pick<CollectionCard, 'rarity' | 'variant' | 'cardNumber' | 'name'> | null | undefined
): boolean {
  if (!card) return false;
  const byRarity = evaluateRarityShowcaseEligibility(card.rarity);
  if (byRarity !== null) return byRarity;

  // Alleen als een handmatige rij geen ingevulde rarity heeft: val terug op variant/nummer/naam
  if (isSecretOrGalleryCardNumber(card.cardNumber)) return true;
  if (SPECIAL_VARIANTS.has((card.variant ?? '').trim().toLowerCase())) return true;
  if (RARE_NAME_PATTERN.test(card.name ?? '')) return true;
  return false;
}

/**
 * Bepaalt of een Verlanglijst-kaart in aanmerking komt voor de 3D Showcase.
 * Gebruikt de exacte zeldzaamheid uit TCGdex/Collectie wanneer bekend, en anders slimme kaartkenmerken.
 */
export function isWishlistItemShowcaseEligible(
  item: WishlistItem | null | undefined,
  resolvedRarity?: string | null
): boolean {
  if (!item) return false;
  const byRarity = evaluateRarityShowcaseEligibility(resolvedRarity);
  if (byRarity !== null) return byRarity;

  if (isSecretOrGalleryCardNumber(item.cardNumber)) return true;
  if (SPECIAL_VARIANTS.has((item.desiredVariant ?? '').trim().toLowerCase())) return true;
  if ((item.priority ?? '').trim().toLowerCase() === 'grail') return true;
  if (RARE_NAME_PATTERN.test(item.cardName ?? '')) return true;
  return false;
}

export function resolveShowcaseHoloStyle(
  rarity?: string,
  variant?: string,
  isGrail = false
): ShowcaseHoloStyle {
  const r = (rarity ?? '').trim().toLowerCase();
  const v = (variant ?? '').trim().toLowerCase();

  if (r === 'hyper rare' || (isGrail && (v === 'alt art' || v === 'full art' || v === 'holo'))) {
    return 'gold';
  }
  if (
    r === 'special illustration rare' ||
    r === 'illustration rare' ||
    r === 'ultra rare' ||
    v === 'alt art' ||
    v === 'full art'
  ) {
    return 'cosmos';
  }
  if (v === 'reverse holo') {
    return 'reverse';
  }
  if (
    v === 'holo' ||
    v === 'first edition' ||
    v === 'stamped / promo' ||
    r.includes('holo') ||
    r === 'double rare' ||
    r === 'promo'
  ) {
    return 'holo';
  }
  return 'gloss';
}

export function buildShowcaseFromWishlist(
  item: WishlistItem,
  resolvedRarity?: string | null
): ShowcaseCardViewModel {
  const isGrail = (item.priority ?? '').trim().toLowerCase() === 'grail';
  const cleanRarity = (resolvedRarity ?? '').trim() || undefined;
  const setCode = item.cardId ? getDisplaySetCode(item.cardId, item.setName) : undefined;

  return {
    key: `wish:${item.rowIndex}:${item.cardId || item.cardName}`,
    cardId: item.cardId ?? '',
    name: item.cardName,
    setName: item.setName,
    setCode: setCode || undefined,
    cardNumber: item.cardNumber,
    imageUrl: item.imageUrl,
    rarity: cleanRarity,
    variant: item.desiredVariant || 'Normal',
    condition: item.minCondition,
    priority: item.priority,
    isGrail,
    holoStyle: resolveShowcaseHoloStyle(cleanRarity, item.desiredVariant, isGrail),
    marketPrice: Number(item.marketPrice) || 0,
    targetBudget: Number(item.maxBudget) || 0,
    notes: item.notes || undefined,
    found: item.found,
    cardmarketUrl: resolveCardmarketUrl({
      name: item.cardName,
      setName: item.setName,
      cardNumber: item.cardNumber,
      notes: item.notes,
    }),
  };
}

export function buildShowcaseFromCollectionCard(
  card: CollectionCard,
  cardmarketProductId?: number
): ShowcaseCardViewModel {
  const r = (card.rarity ?? '').trim();
  const isGrail =
    r === 'Special Illustration Rare' ||
    r === 'Hyper Rare' ||
    (card.grading !== 'Raw' && card.grade === '10') ||
    (Number(card.marketPrice) || 0) >= 150;

  return {
    key: `col:${card.rowIndex}:${card.cardId}`,
    cardId: card.cardId,
    name: card.name,
    setName: card.setName,
    setCode: getDisplaySetCode(card.cardId, card.setName) || undefined,
    cardNumber: card.cardNumber,
    imageUrl: card.imageUrl,
    rarity: r || undefined,
    variant: card.variant || 'Normal',
    condition: card.condition,
    grading: card.grading,
    grade: card.grade,
    isGrail,
    holoStyle: resolveShowcaseHoloStyle(r, card.variant, isGrail),
    marketPrice: Number(card.marketPrice) || 0,
    purchasePrice: Number(card.purchasePrice) || 0,
    notes: card.notes || undefined,
    cardmarketUrl: resolveCardmarketUrl({
      name: card.name,
      setName: card.setName,
      cardNumber: card.cardNumber,
      cardmarketProductId,
      notes: card.notes,
    }),
  };
}
