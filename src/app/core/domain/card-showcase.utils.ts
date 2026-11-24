import { CollectionCard, WishlistItem } from './models';

export const OFFICIAL_POKEMON_CARD_BACK_URL =
  'https://tcg.pokemon.com/assets/img/global/tcg-card-back-2x.jpg';

export type ShowcaseHoloStyle = 'gloss' | 'reverse' | 'holo' | 'cosmos' | 'gold';

export interface ShowcaseCardViewModel {
  key: string;
  cardId: string;
  name: string;
  setName: string;
  cardNumber: string;
  imageUrl?: string;
  rarity?: string;
  variant: string;
  grading?: string;
  grade?: string;
  isGrail: boolean;
  holoStyle: ShowcaseHoloStyle;
}

/**
 * Alleen de "saaie aanvullers" (standaard Commons / Uncommons / Basis-energie) krijgen géén 3D Showcase,
 * tenzij ze een speciale uitvoering (Full Art, Alt Art, Holo, First Edition, Stamped/Promo) of Grading hebben.
 * Alle andere zeldzaamheden (incl. Rare, Illustration Rare, One Star ★, Two/Three Star, Crown, Shiny, Promo, enz.)
 * krijgen overal in de app de Special 3D Showcase!
 */
const BORING_FILLER_RARITIES = new Set([
  'common',
  'uncommon',
  'one diamond',
  'two diamond',
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

const SPECIAL_NAME_PATTERN =
  /\b(ex|gx|v|vmax|vstar|prime|legend|break|sir|sar|ir|hr|holo|radiant|shining|shiny|promo|full\s*art|alt\s*art|gold\s*star)\b|lv\.?\s*x|[★☆]/i;

/**
 * Beoordeelt een bekende `rarity`-string:
 * - `false` voor standaard aanvullers (`Common`, `Uncommon`, `One Diamond`, `Two Diamond`, `Energy`, `None`)
 * - `true` voor álle bijzondere/binder-waardige zeldzaamheden (`Rare`, `Illustration Rare`, `One Star`, `Two Star`, `Three Star`, `Crown`, `One Shiny`, `Promo`, enz.)
 * - `null` als `rarity` leeg/onbekend is
 */
export function evaluateRarityShowcaseEligibility(
  rarity: string | null | undefined
): boolean | null {
  const clean = (rarity ?? '').trim().toLowerCase();
  if (!clean) return null;
  if (BORING_FILLER_RARITIES.has(clean)) return false;
  return true;
}

/**
 * Herkent Secret / Illustration Rare kaartnummers (bijv. "166/165", "202/165" waarbij nummer > set-totaal, of "GG44", "TG15", "SV107").
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
 * Bepaalt of een collectiekaart de fullscreen 3D Showcase krijgt:
 * - Altijd JA bij speciale variant (Full Art, Alt Art, Holo, First Edition, Stamped / Promo), Graded Slab of Secret kaartnummer (> set-totaal).
 * - Anders op basis van zeldzaamheid: alles behalve saaie Commons / Uncommons krijgt de Showcase (inclusief One Star ★, Illustration Rare, Rare, Promo, etc.).
 */
export function isCollectionCardShowcaseEligible(
  card:
    | Pick<CollectionCard, 'rarity' | 'variant' | 'cardNumber' | 'name'>
    | (Pick<CollectionCard, 'rarity' | 'variant' | 'cardNumber' | 'name'> & { grading?: string })
    | null
    | undefined
): boolean {
  if (!card) return false;

  const variantClean = (card.variant ?? '').trim().toLowerCase();
  if (SPECIAL_VARIANTS.has(variantClean)) return true;

  const gradingClean = ('grading' in card ? (card.grading ?? '') : '').trim();
  if (gradingClean && gradingClean !== 'Raw') return true;

  if (isSecretOrGalleryCardNumber(card.cardNumber)) return true;
  if (SPECIAL_NAME_PATTERN.test(card.name ?? '')) return true;

  const byRarity = evaluateRarityShowcaseEligibility(card.rarity);
  if (byRarity !== null) return byRarity;

  return false;
}

/**
 * Bepaalt of een Verlanglijst-kaart de fullscreen 3D Showcase krijgt.
 */
export function isWishlistItemShowcaseEligible(
  item: WishlistItem | null | undefined,
  resolvedRarity?: string | null
): boolean {
  if (!item) return false;

  const variantClean = (item.desiredVariant ?? '').trim().toLowerCase();
  if (SPECIAL_VARIANTS.has(variantClean)) return true;
  if ((item.priority ?? '').trim().toLowerCase() === 'grail') return true;
  if (isSecretOrGalleryCardNumber(item.cardNumber)) return true;
  if (SPECIAL_NAME_PATTERN.test(item.cardName ?? '')) return true;

  const byRarity = evaluateRarityShowcaseEligibility(resolvedRarity);
  if (byRarity !== null) return byRarity;

  return false;
}

export function resolveShowcaseHoloStyle(
  rarity?: string,
  variant?: string,
  isGrail = false
): ShowcaseHoloStyle {
  const r = (rarity ?? '').trim().toLowerCase();
  const v = (variant ?? '').trim().toLowerCase();

  if (
    r === 'hyper rare' ||
    r === 'crown' ||
    r.includes('hyper') ||
    (isGrail && (v === 'alt art' || v === 'full art' || v === 'holo'))
  ) {
    return 'gold';
  }
  if (
    r === 'special illustration rare' ||
    r === 'illustration rare' ||
    r === 'ultra rare' ||
    r.includes('star') ||
    r.includes('shiny') ||
    r.includes('illustration') ||
    r === 'full art trainer' ||
    r === 'classic collection' ||
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
    r === 'four diamond' ||
    r === 'three diamond' ||
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

  return {
    key: `wish:${item.rowIndex}:${item.cardId || item.cardName}`,
    cardId: item.cardId ?? '',
    name: item.cardName,
    setName: item.setName,
    cardNumber: item.cardNumber,
    imageUrl: item.imageUrl,
    rarity: cleanRarity,
    variant: item.desiredVariant || 'Normal',
    isGrail,
    holoStyle: resolveShowcaseHoloStyle(cleanRarity, item.desiredVariant, isGrail),
  };
}

export function buildShowcaseFromCollectionCard(card: CollectionCard): ShowcaseCardViewModel {
  const r = (card.rarity ?? '').trim();
  const rLower = r.toLowerCase();
  const isGrail =
    rLower === 'special illustration rare' ||
    rLower === 'hyper rare' ||
    rLower === 'crown' ||
    rLower === 'three star' ||
    (card.grading !== 'Raw' && card.grade === '10') ||
    (Number(card.marketPrice) || 0) >= 150;

  return {
    key: `col:${card.rowIndex}:${card.cardId}`,
    cardId: card.cardId,
    name: card.name,
    setName: card.setName,
    cardNumber: card.cardNumber,
    imageUrl: card.imageUrl,
    rarity: r || undefined,
    variant: card.variant || 'Normal',
    grading: card.grading,
    grade: card.grade,
    isGrail,
    holoStyle: resolveShowcaseHoloStyle(r, card.variant, isGrail),
  };
}
