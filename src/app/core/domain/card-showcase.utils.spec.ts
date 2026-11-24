import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_POKEMON_CARD_BACK_URL,
  buildShowcaseFromCollectionCard,
  buildShowcaseFromWishlist,
  evaluateRarityShowcaseEligibility,
  isCollectionCardShowcaseEligible,
  isSecretOrGalleryCardNumber,
  isWishlistItemShowcaseEligible,
  resolveShowcaseHoloStyle,
} from './card-showcase.utils';
import { CollectionCard, WishlistItem } from './models';

const baseCard: CollectionCard = {
  rowIndex: 2,
  cardId: 'sv03.5-199',
  name: 'Charizard ex',
  setName: '151',
  cardNumber: '199/165',
  language: 'EN',
  type: 'Fire',
  rarity: 'Special Illustration Rare',
  variant: 'Alt Art',
  condition: 'Near Mint (NM)',
  grading: 'PSA',
  grade: '10',
  quantity: 1,
  storageLocation: 'Hoofdbinder',
  binderDetail: '',
  purchaseDate: '2026-11-24',
  purchasePrice: 120,
  marketPrice: 195,
  forTrade: false,
  notes: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Charizard-ex-V3',
};

const baseWish: WishlistItem = {
  rowIndex: 2,
  cardId: 'swsh12-186',
  cardName: 'Lugia V',
  setName: 'Silver Tempest',
  cardNumber: '186/195',
  desiredVariant: 'Alt Art',
  minCondition: 'Near Mint (NM)',
  priority: 'Grail',
  maxBudget: 165,
  marketPrice: 158,
  notes: '',
  found: false,
};

describe('card-showcase.utils ("Bijzondere kaart = bijzondere view")', () => {
  it('sluit alle Commons en Uncommons strikt uit en laat Rares / Illustration Rares / SIR / Promo toe', () => {
    expect(evaluateRarityShowcaseEligibility('Common')).toBe(false);
    expect(evaluateRarityShowcaseEligibility('Uncommon')).toBe(false);
    expect(evaluateRarityShowcaseEligibility('Basic Energy')).toBe(false);

    expect(evaluateRarityShowcaseEligibility('Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Double Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Illustration Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Special Illustration Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Ultra Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Hyper Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Vintage Holo')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Promo')).toBe(true);

    // Zelfs een Reverse Holo Common of Uncommon blijft uitgesloten
    expect(
      isCollectionCardShowcaseEligible({
        ...baseCard,
        name: 'Caterpie',
        cardNumber: '010/165',
        rarity: 'Common',
        variant: 'Reverse Holo',
      })
    ).toBe(false);
    expect(
      isCollectionCardShowcaseEligible({
        ...baseCard,
        name: 'Metapod',
        cardNumber: '011/165',
        rarity: 'Uncommon',
        variant: 'Reverse Holo',
      })
    ).toBe(false);

    // Illustration Rare met Normal variant krijgt wél de 3D Showcase
    expect(
      isCollectionCardShowcaseEligible({
        ...baseCard,
        name: 'Bulbasaur',
        cardNumber: '166/165',
        rarity: 'Illustration Rare',
        variant: 'Normal',
      })
    ).toBe(true);
  });

  it('bepaalt Verlanglijst showcase-geschiktheid met catalogus-rarity én offline fallback', () => {
    // Met bekende catalogus-rarity wint de echte zeldzaamheid altijd
    expect(
      isWishlistItemShowcaseEligible(
        {
          ...baseWish,
          cardName: 'Pidgey',
          cardNumber: '016/165',
          desiredVariant: 'Normal',
          priority: 'Hoog',
        },
        'Common'
      )
    ).toBe(false);

    expect(
      isWishlistItemShowcaseEligible(
        {
          ...baseWish,
          cardName: 'Dragonair',
          cardNumber: '181/165',
          desiredVariant: 'Normal',
          priority: 'Gemiddeld',
        },
        'Illustration Rare'
      )
    ).toBe(true);

    // Zonder bekende catalogus-rarity vallen secret cardnummers, Holo/Alt Art en Grail netjes binnen de showcase
    expect(isSecretOrGalleryCardNumber('202/165')).toBe(true);
    expect(isSecretOrGalleryCardNumber('GG44')).toBe(true);
    expect(isSecretOrGalleryCardNumber('016/165')).toBe(false);

    expect(
      isWishlistItemShowcaseEligible({
        ...baseWish,
        cardName: 'Caterpie',
        cardNumber: '010/165',
        desiredVariant: 'Normal',
        priority: 'Laag',
      })
    ).toBe(false);

    expect(isWishlistItemShowcaseEligible(baseWish)).toBe(true);
  });

  it('bouwt rijke ShowcaseViewModels met juiste holoStyle, Cardmarket URL en officiële achterkant', () => {
    expect(OFFICIAL_POKEMON_CARD_BACK_URL).toContain('tcg.pokemon.com');
    expect(resolveShowcaseHoloStyle('Hyper Rare', 'Full Art', true)).toBe('gold');
    expect(resolveShowcaseHoloStyle('Illustration Rare', 'Normal', false)).toBe('cosmos');
    expect(resolveShowcaseHoloStyle('Rare', 'Reverse Holo', false)).toBe('reverse');
    expect(resolveShowcaseHoloStyle('Rare', 'Normal', false)).toBe('gloss');

    const colVm = buildShowcaseFromCollectionCard(baseCard);
    expect(colVm.isGrail).toBe(true);
    expect(colVm.grading).toBe('PSA');
    expect(colVm.grade).toBe('10');
    expect(colVm.cardmarketUrl).toContain('Charizard-ex-V3');

    const wishVm = buildShowcaseFromWishlist(baseWish, 'Ultra Rare');
    expect(wishVm.targetBudget).toBe(165);
    expect(wishVm.marketPrice).toBe(158);
    expect(wishVm.cardmarketUrl).toContain('cardmarket.com');
  });
});
