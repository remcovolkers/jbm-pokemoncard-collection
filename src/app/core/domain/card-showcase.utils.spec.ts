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
  notes: '',
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

describe('card-showcase.utils ("Alle binder-waardige kaarten special treatment, alleen saaie aanvullers niet")', () => {
  it('geeft One Star (★), Two/Three Star, Crown, Shiny, Illustration Rare, Rare en Full Art wél de Showcase en sluit standaard Commons/Uncommons uit', () => {
    expect(evaluateRarityShowcaseEligibility('Common')).toBe(false);
    expect(evaluateRarityShowcaseEligibility('Uncommon')).toBe(false);
    expect(evaluateRarityShowcaseEligibility('One Diamond')).toBe(false);
    expect(evaluateRarityShowcaseEligibility('Two Diamond')).toBe(false);
    expect(evaluateRarityShowcaseEligibility('Basic Energy')).toBe(false);

    expect(evaluateRarityShowcaseEligibility('One Star')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Two Star')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Three Star')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Crown')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('One Shiny')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Double Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Illustration Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Special Illustration Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Ultra Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Hyper Rare')).toBe(true);
    expect(evaluateRarityShowcaseEligibility('Promo')).toBe(true);

    // One Star Bulbasaur én Full Art Bulbasaur krijgen allebei de 3D Showcase met cosmos-holo
    expect(
      isCollectionCardShowcaseEligible({
        ...baseCard,
        name: 'Bulbasaur',
        cardNumber: '227',
        rarity: 'One Star',
        variant: 'Normal',
        grading: 'Raw',
      })
    ).toBe(true);
    expect(resolveShowcaseHoloStyle('One Star', 'Normal', false)).toBe('cosmos');

    expect(
      isCollectionCardShowcaseEligible({
        ...baseCard,
        name: 'Bulbasaur',
        cardNumber: '166/165',
        rarity: 'Common',
        variant: 'Full Art',
        grading: 'Raw',
      })
    ).toBe(true);

    // Standaard Common / Uncommon aanvullers blijven rustig zonder 3D Showcase
    expect(
      isCollectionCardShowcaseEligible({
        ...baseCard,
        name: 'Caterpie',
        cardNumber: '010/165',
        rarity: 'Common',
        variant: 'Normal',
        grading: 'Raw',
      })
    ).toBe(false);
    expect(
      isCollectionCardShowcaseEligible({
        ...baseCard,
        name: 'Metapod',
        cardNumber: '011/165',
        rarity: 'Uncommon',
        variant: 'Reverse Holo',
        grading: 'Raw',
      })
    ).toBe(false);
  });

  it('bepaalt Verlanglijst showcase-geschiktheid met One Star / catalogus-rarity én offline fallback', () => {
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
          cardName: 'Bulbasaur',
          cardNumber: '227',
          desiredVariant: 'Normal',
          priority: 'Gemiddeld',
        },
        'One Star'
      )
    ).toBe(true);

    expect(isSecretOrGalleryCardNumber('202/165')).toBe(true);
    expect(isSecretOrGalleryCardNumber('GG44')).toBe(true);
    expect(isSecretOrGalleryCardNumber('016/165')).toBe(false);
    expect(isWishlistItemShowcaseEligible(baseWish)).toBe(true);
  });

  it('bouwt schone fullscreen ShowcaseViewModels met juiste holoStyle, Graded Slab en officiële achterkant', () => {
    expect(OFFICIAL_POKEMON_CARD_BACK_URL).toContain('tcg.pokemon.com');
    expect(resolveShowcaseHoloStyle('Crown', 'Normal', false)).toBe('gold');
    expect(resolveShowcaseHoloStyle('Illustration Rare', 'Normal', false)).toBe('cosmos');
    expect(resolveShowcaseHoloStyle('Rare', 'Reverse Holo', false)).toBe('reverse');
    expect(resolveShowcaseHoloStyle('Rare', 'Normal', false)).toBe('gloss');

    const colVm = buildShowcaseFromCollectionCard(baseCard);
    expect(colVm.isGrail).toBe(true);
    expect(colVm.grading).toBe('PSA');
    expect(colVm.grade).toBe('10');

    const wishVm = buildShowcaseFromWishlist(baseWish, 'One Star');
    expect(wishVm.holoStyle).toBe('gold');
  });
});
