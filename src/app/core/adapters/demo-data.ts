import { extractSetCodeFromNotes } from '../domain/card-id.utils';
import { buildTcgdexAssetUrl } from '../domain/card-id.utils';
import { calculateBinderPosition, roundCurrency, roundOneDecimal } from '../domain/card-math.utils';
import {
  AppSnapshot,
  BinderSlotsPerPage,
  CollectionCard,
  DEFAULT_DROPDOWN_SETTINGS,
  PokedexSlot,
  SetProgress,
  TradeEntry,
  WishlistItem,
} from '../domain/models';
import { NATIONAL_DEX_NAMES } from '../domain/national-dex.data';
import { doesCardMatchPokemon, formatBinderChoice, getGenerationForDex } from '../domain/pokedex-matching.utils';

function card(partial: Omit<CollectionCard, 'imageUrl'> & { imageUrl?: string }): CollectionCard {
  return {
    ...partial,
    imageUrl: partial.imageUrl ?? buildTcgdexAssetUrl(partial.cardId, 'high'),
  };
}

export function createDemoSnapshot(): AppSnapshot {
  const collection: CollectionCard[] = [
    card({
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
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'VaultX 9-pocket · Pagina 1',
      purchaseDate: '2025-01-12',
      purchasePrice: 128.0,
      marketPrice: 196.5,
      trendPercent: 6.4,
      forTrade: false,
      notes: 'Zelf gepulled uit 151 Booster Bundle — strakke centering.',
    }),
    card({
      rowIndex: 3,
      cardId: 'sv03.5-198',
      name: 'Venusaur ex',
      setName: '151',
      cardNumber: '198/165',
      language: 'EN',
      type: 'Grass',
      rarity: 'Special Illustration Rare',
      variant: 'Alt Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 2,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'VaultX 9-pocket · Pagina 1',
      purchaseDate: '2025-01-18',
      purchasePrice: 42.0,
      marketPrice: 64.5,
      trendPercent: 5.1,
      forTrade: true,
      notes: 'Sleeve + VaultX · 1x beschikbaar voor ruil',
    }),
    card({
      rowIndex: 4,
      cardId: 'sv03.5-003',
      name: 'Venusaur ex',
      setName: '151',
      cardNumber: '003/165',
      language: 'EN',
      type: 'Grass',
      rarity: 'Double Rare',
      variant: 'Holo',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Trade Binder',
      binderDetail: 'Ruilmap SV',
      purchaseDate: '2025-01-05',
      purchasePrice: 2.5,
      marketPrice: 4.2,
      trendPercent: 1.2,
      forTrade: true,
      notes: 'Double Rare versie uit 151',
    }),
    card({
      rowIndex: 5,
      cardId: 'base1-15',
      name: 'Venusaur',
      setName: 'Base Set',
      cardNumber: '15/102',
      language: 'EN',
      type: 'Grass',
      rarity: 'Vintage Holo',
      variant: 'Holo',
      condition: 'Excellent (EX)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Toploader Binder',
      binderDetail: 'Vintage WOTC Map',
      purchaseDate: '2024-09-14',
      purchasePrice: 55.0,
      marketPrice: 75.0,
      trendPercent: 3.8,
      forTrade: false,
      notes: 'Originele 1999 Base Set Holo met lichte holo-swirl.',
    }),
    card({
      rowIndex: 6,
      cardId: 'sv03.5-200',
      name: 'Blastoise ex',
      setName: '151',
      cardNumber: '200/165',
      language: 'EN',
      type: 'Water',
      rarity: 'Special Illustration Rare',
      variant: 'Alt Art',
      condition: 'Mint (MT)',
      grading: 'PSA',
      grade: '10',
      quantity: 1,
      storageLocation: 'Display / Kast',
      binderDetail: 'Acryl Slab Standaard',
      purchaseDate: '2025-02-01',
      purchasePrice: 135.0,
      marketPrice: 185.0,
      trendPercent: 14.2,
      forTrade: false,
      notes: 'PSA 10 Gem Mint slab.',
    }),
    card({
      rowIndex: 7,
      cardId: 'sv03.5-166',
      name: 'Bulbasaur',
      setName: '151',
      cardNumber: '166/165',
      language: 'EN',
      type: 'Grass',
      rarity: 'Illustration Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'VaultX 9-pocket · Pagina 1',
      purchaseDate: '2025-01-12',
      purchasePrice: 24.0,
      marketPrice: 36.5,
      trendPercent: 7.4,
      forTrade: false,
      notes: '',
    }),
    card({
      rowIndex: 8,
      cardId: 'sv03.5-167',
      name: 'Ivysaur',
      setName: '151',
      cardNumber: '167/165',
      language: 'EN',
      type: 'Grass',
      rarity: 'Illustration Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'VaultX 9-pocket · Pagina 1',
      purchaseDate: '2025-01-12',
      purchasePrice: 20.0,
      marketPrice: 29.0,
      trendPercent: 4.0,
      forTrade: false,
      notes: '',
    }),
    card({
      rowIndex: 9,
      cardId: 'sv03.5-168',
      name: 'Charmander',
      setName: '151',
      cardNumber: '168/165',
      language: 'EN',
      type: 'Fire',
      rarity: 'Illustration Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'VaultX 9-pocket · Pagina 1',
      purchaseDate: '2025-01-19',
      purchasePrice: 32.0,
      marketPrice: 44.5,
      trendPercent: 6.2,
      forTrade: false,
      notes: '',
    }),
    card({
      rowIndex: 10,
      cardId: 'sv03.5-169',
      name: 'Charmeleon',
      setName: '151',
      cardNumber: '169/165',
      language: 'EN',
      type: 'Fire',
      rarity: 'Illustration Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'VaultX 9-pocket · Pagina 1',
      purchaseDate: '2025-01-19',
      purchasePrice: 22.0,
      marketPrice: 31.0,
      trendPercent: 2.8,
      forTrade: false,
      notes: '',
    }),
    card({
      rowIndex: 11,
      cardId: 'sv03.5-170',
      name: 'Squirtle',
      setName: '151',
      cardNumber: '170/165',
      language: 'EN',
      type: 'Water',
      rarity: 'Illustration Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'VaultX 9-pocket · Pagina 1',
      purchaseDate: '2025-01-22',
      purchasePrice: 28.0,
      marketPrice: 41.0,
      trendPercent: 5.5,
      forTrade: false,
      notes: '',
    }),
    card({
      rowIndex: 12,
      cardId: 'sv03.5-171',
      name: 'Wartortle',
      setName: '151',
      cardNumber: '171/165',
      language: 'EN',
      type: 'Water',
      rarity: 'Illustration Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'VaultX 9-pocket · Pagina 1',
      purchaseDate: '2025-01-22',
      purchasePrice: 19.0,
      marketPrice: 27.5,
      trendPercent: 3.1,
      forTrade: false,
      notes: '',
    }),
    card({
      rowIndex: 13,
      cardId: 'sv03.5-173',
      name: 'Pikachu',
      setName: '151',
      cardNumber: '173/165',
      language: 'EN',
      type: 'Lightning',
      rarity: 'Illustration Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 3,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'VaultX 9-pocket · Pagina 3',
      purchaseDate: '2025-01-29',
      purchasePrice: 18.0,
      marketPrice: 28.0,
      trendPercent: 1.8,
      forTrade: true,
      notes: '2 extra exemplaren voor ruilavond.',
    }),
    card({
      rowIndex: 14,
      cardId: 'sv03.5-183',
      name: 'Charizard ex',
      setName: '151',
      cardNumber: '183/165',
      language: 'EN',
      type: 'Fire',
      rarity: 'Ultra Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Trade Binder',
      binderDetail: 'Ruilmap Full Arts',
      purchaseDate: '2025-02-04',
      purchasePrice: 36.0,
      marketPrice: 43.87,
      trendPercent: 8.4,
      forTrade: true,
      notes: 'Strakke Full Art dubbel gepulled.',
    }),
    card({
      rowIndex: 15,
      cardId: 'sv03.5-151',
      name: 'Mew ex',
      setName: '151',
      cardNumber: '151/165',
      language: 'EN',
      type: 'Psychic',
      rarity: 'Double Rare',
      variant: 'Holo',
      condition: 'Excellent (EX)',
      grading: 'Raw',
      grade: '',
      quantity: 4,
      storageLocation: 'Trade Binder',
      binderDetail: 'Ruilmap Playables',
      purchaseDate: '2025-01-10',
      purchasePrice: 7.5,
      marketPrice: 9.5,
      trendPercent: -2.3,
      forTrade: true,
      notes: 'Populaire speelbare kaart voor decks.',
    }),
    card({
      rowIndex: 16,
      cardId: 'sv03.5-181',
      name: 'Dragonair',
      setName: '151',
      cardNumber: '181/165',
      language: 'EN',
      type: 'Dragon',
      rarity: 'Illustration Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Toploader Binder',
      binderDetail: 'Nieuwe pulls',
      purchaseDate: '2025-03-01',
      purchasePrice: 17.0,
      marketPrice: 23.5,
      trendPercent: 9.1,
      forTrade: false,
      notes: 'Nog over te zetten naar Pokédex Binder #0148.',
    }),
    card({
      rowIndex: 17,
      cardId: 'sv03.5-175',
      name: 'Psyduck',
      setName: '151',
      cardNumber: '175/165',
      language: 'EN',
      type: 'Water',
      rarity: 'Illustration Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Toploader Binder',
      binderDetail: 'Nieuwe pulls',
      purchaseDate: '2025-03-02',
      purchasePrice: 11.5,
      marketPrice: 16.0,
      trendPercent: 4.6,
      forTrade: false,
      notes: 'Klaar om in Pokédex Binder #0054 te plaatsen.',
    }),
    card({
      rowIndex: 18,
      cardId: 'sv03.5-176',
      name: 'Poliwhirl',
      setName: '151',
      cardNumber: '176/165',
      language: 'EN',
      type: 'Water',
      rarity: 'Illustration Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Toploader Binder',
      binderDetail: 'Nieuwe pulls',
      purchaseDate: '2025-03-02',
      purchasePrice: 12.0,
      marketPrice: 17.25,
      trendPercent: 3.9,
      forTrade: false,
      notes: 'Klaar om in Pokédex Binder #0061 te plaatsen.',
    }),
    card({
      rowIndex: 19,
      cardId: 'swsh7-215',
      name: 'Umbreon VMAX',
      setName: 'Evolving Skies',
      cardNumber: '215/203',
      language: 'EN',
      type: 'Darkness',
      rarity: 'Special Illustration Rare',
      variant: 'Alt Art',
      condition: 'Mint (MT)',
      grading: 'BGS',
      grade: '9.5',
      quantity: 1,
      storageLocation: 'Display / Kast',
      binderDetail: 'Vitrine Bovenste Plank',
      purchaseDate: '2024-06-15',
      purchasePrice: 540.0,
      marketPrice: 680.0,
      trendPercent: 3.4,
      forTrade: false,
      notes: 'Moonbreon — pronkstuk van de collectie.',
    }),
    card({
      rowIndex: 20,
      cardId: 'swsh7-218',
      name: 'Rayquaza VMAX',
      setName: 'Evolving Skies',
      cardNumber: '218/203',
      language: 'EN',
      type: 'Dragon',
      rarity: 'Special Illustration Rare',
      variant: 'Alt Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'Toploader Grail Sectie',
      purchaseDate: '2024-08-20',
      purchasePrice: 265.0,
      marketPrice: 310.0,
      trendPercent: 1.8,
      forTrade: false,
      notes: '',
    }),
    card({
      rowIndex: 21,
      cardId: 'swsh11-186',
      name: 'Giratina V',
      setName: 'Lost Origin',
      cardNumber: '186/196',
      language: 'EN',
      type: 'Dragon',
      rarity: 'Special Illustration Rare',
      variant: 'Alt Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Toploader Binder',
      binderDetail: 'SWSH Alt Arts',
      purchaseDate: '2024-11-03',
      purchasePrice: 230.0,
      marketPrice: 285.0,
      trendPercent: 12.5,
      forTrade: false,
      notes: 'Shinji Kanda artwork.',
    }),
    card({
      rowIndex: 22,
      cardId: 'swsh8-271',
      name: 'Gengar VMAX',
      setName: 'Fusion Strike',
      cardNumber: '271/264',
      language: 'EN',
      type: 'Darkness',
      rarity: 'Special Illustration Rare',
      variant: 'Alt Art',
      condition: 'Mint (MT)',
      grading: 'PSA',
      grade: '9',
      quantity: 1,
      storageLocation: 'Display / Kast',
      binderDetail: 'Acryl Slab Standaard',
      purchaseDate: '2024-10-11',
      purchasePrice: 178.0,
      marketPrice: 215.0,
      trendPercent: 8.1,
      forTrade: false,
      notes: 'PSA 9 Mint.',
    }),
    card({
      rowIndex: 23,
      cardId: 'swsh7-192',
      name: 'Dragonite V',
      setName: 'Evolving Skies',
      cardNumber: '192/203',
      language: 'EN',
      type: 'Dragon',
      rarity: 'Ultra Rare',
      variant: 'Alt Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'SWSH Alt Arts',
      purchaseDate: '2024-07-08',
      purchasePrice: 98.0,
      marketPrice: 135.0,
      trendPercent: 22.0,
      forTrade: false,
      notes: '',
    }),
    card({
      rowIndex: 24,
      cardId: 'sv02-203',
      name: 'Magikarp',
      setName: 'Paldea Evolved',
      cardNumber: '203/193',
      language: 'EN',
      type: 'Water',
      rarity: 'Illustration Rare',
      variant: 'Full Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Toploader Binder',
      binderDetail: 'SV Grails',
      purchaseDate: '2024-12-04',
      purchasePrice: 92.0,
      marketPrice: 138.0,
      trendPercent: 11.4,
      forTrade: false,
      notes: 'Shinji Kanda artwork.',
    }),
    card({
      rowIndex: 25,
      cardId: 'sv03-223',
      name: 'Charizard ex',
      setName: 'Obsidian Flames',
      cardNumber: '223/197',
      language: 'EN',
      type: 'Darkness',
      rarity: 'Special Illustration Rare',
      variant: 'Alt Art',
      condition: 'Near Mint (NM)',
      grading: 'Raw',
      grade: '',
      quantity: 1,
      storageLocation: 'Hoofdbinder',
      binderDetail: 'Obsidian Flames Map',
      purchaseDate: '2024-10-22',
      purchasePrice: 44.0,
      marketPrice: 54.0,
      trendPercent: 4.8,
      forTrade: false,
      notes: '',
    }),
    card({
      rowIndex: 26,
      cardId: 'base1-44',
      name: 'Bulbasaur',
      setName: 'Base Set',
      cardNumber: '44/102',
      language: 'EN',
      type: 'Grass',
      rarity: 'Common',
      variant: 'First Edition',
      condition: 'Excellent (EX)',
      grading: 'Raw',
      grade: '',
      quantity: 2,
      storageLocation: 'Toploader Binder',
      binderDetail: 'Vintage WOTC Map',
      purchaseDate: '2024-05-02',
      purchasePrice: 12.0,
      marketPrice: 18.5,
      trendPercent: 2.1,
      forTrade: true,
      notes: 'Base Set klassieker.',
    }),
  ];

  // Bewust nog NIET in de binder gezet zodat het Dashboard "3 kaarten klaar voor binder" toont!
  const unplacedDemoDex = new Set([148, 54, 61]);
  const slotsPerPage: BinderSlotsPerPage = 9;
  const pokedex = buildPokedexFromCollection(collection, slotsPerPage, {
    unplacedDexNumbers: unplacedDemoDex,
    upgradeDexNumbers: new Set([3, 25, 151]),
  });

  const setProgress = buildSetProgressFromCollection(collection, [
    { setName: '151', setCode: 'MEW', series: 'Scarlet & Violet', totalCards: 165 },
    { setName: 'Paldea Evolved', setCode: 'PAL', series: 'Scarlet & Violet', totalCards: 193 },
    { setName: 'Obsidian Flames', setCode: 'OBF', series: 'Scarlet & Violet', totalCards: 197 },
    { setName: 'Evolving Skies', setCode: 'EVS', series: 'Sword & Shield', totalCards: 203 },
    { setName: 'Fusion Strike', setCode: 'FST', series: 'Sword & Shield', totalCards: 264 },
    { setName: 'Lost Origin', setCode: 'LOR', series: 'Sword & Shield', totalCards: 196 },
    { setName: 'Base Set', setCode: 'BS', series: 'Original / WOTC', totalCards: 102 },
  ]);

  const wishlist: WishlistItem[] = [
    {
      rowIndex: 2,
      cardId: 'ecard1-13',
      cardName: 'Gengar Holo',
      setName: 'Expedition Base Set',
      cardNumber: '13/165',
      desiredVariant: 'Holo',
      minCondition: 'Excellent (EX)',
      priority: 'Hoog',
      maxBudget: 95.0,
      marketPrice: 88.0,
      notes: 'Zoek naar een schone holo zonder krassen op het gezicht.',
      found: false,
      imageUrl: buildTcgdexAssetUrl('ecard1-13', 'high'),
    },
    {
      rowIndex: 3,
      cardId: 'sv03.5-202',
      cardName: 'Zapdos ex SIR',
      setName: '151',
      cardNumber: '202/165',
      desiredVariant: 'Alt Art',
      minCondition: 'Near Mint (NM)',
      priority: 'Hoog',
      maxBudget: 52.0,
      marketPrice: 48.5,
      notes: 'Laatste legendarische vogel voor de 151 Master Set.',
      found: false,
      imageUrl: buildTcgdexAssetUrl('sv03.5-202', 'high'),
    },
    {
      rowIndex: 4,
      cardId: 'ex8-107',
      cardName: 'Rayquaza ★',
      setName: 'EX Deoxys',
      cardNumber: '107/107',
      desiredVariant: 'Holo',
      minCondition: 'Good (GD)',
      priority: 'Grail',
      maxBudget: 600.0,
      marketPrice: 1250.0,
      notes: 'Lange termijn grail — prijsalert actief op Cardmarket.',
      found: false,
      imageUrl: buildTcgdexAssetUrl('ex8-107', 'high'),
    },
    {
      rowIndex: 5,
      cardId: 'sv03.5-188',
      cardName: 'Alakazam ex',
      setName: '151',
      cardNumber: '188/165',
      desiredVariant: 'Full Art',
      minCondition: 'Near Mint (NM)',
      priority: 'Gemiddeld',
      maxBudget: 15.0,
      marketPrice: 11.2,
      notes: 'Ontbreekt nog in #0065 National Dex slot.',
      found: false,
      imageUrl: buildTcgdexAssetUrl('sv03.5-188', 'high'),
    },
    {
      rowIndex: 6,
      cardId: 'swsh12-186',
      cardName: 'Lugia V',
      setName: 'Silver Tempest',
      cardNumber: '186/195',
      desiredVariant: 'Alt Art',
      minCondition: 'Near Mint (NM)',
      priority: 'Hoog',
      maxBudget: 165.0,
      marketPrice: 158.0,
      notes: 'Iconisch Gen 2 slot voor Pokédex Binder #0249.',
      found: false,
      imageUrl: buildTcgdexAssetUrl('swsh12-186', 'high'),
    },
  ];

  const trades: TradeEntry[] = [
    {
      rowIndex: 22,
      date: '2025-02-24',
      cardName: 'Charizard ex (183/165)',
      setName: '151',
      type: 'Verkoop',
      purchasePrice: 28.0,
      saleValue: 44.5,
      platformFees: 2.25,
      netResult: 14.25,
      counterparty: 'Cardmarket (NL)',
      notes: 'Dubbel exemplaar verkocht via trustee.',
    },
    {
      rowIndex: 23,
      date: '2025-02-15',
      cardName: 'Pikachu IR (173/165)',
      setName: '151',
      type: 'Ruil',
      purchasePrice: 18.0,
      saleValue: 27.0,
      platformFees: 0,
      netResult: 9.0,
      counterparty: 'Ruilavond Utrecht',
      notes: 'Geruild tegen Squirtle IR + bijbetaling.',
    },
    {
      rowIndex: 24,
      date: '2025-01-30',
      cardName: 'Mewtwo VSTAR (GG44)',
      setName: 'Crown Zenith',
      type: 'Verkoop',
      purchasePrice: 46.0,
      saleValue: 74.0,
      platformFees: 3.7,
      netResult: 24.3,
      counterparty: 'Cardmarket (DE)',
      notes: 'Verzonden in toploader + bubble mailer.',
    },
  ];

  return {
    collection,
    setProgress,
    pokedex,
    binderSlotsPerPage: slotsPerPage,
    wishlist,
    trades,
    settings: { ...DEFAULT_DROPDOWN_SETTINGS },
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Lege snapshot voor wanneer Demo-modus uit staat en er nog geen Google Sheet gekoppeld is.
 * Bevat 0 kaarten, 0 sets, 0 wensen en 0 transacties, met de lege National Pokédex (#0001-#1025).
 */
export function createEmptySnapshot(): AppSnapshot {
  const slotsPerPage: BinderSlotsPerPage = 9;
  return {
    collection: [],
    setProgress: [],
    pokedex: buildPokedexFromCollection([], slotsPerPage),
    binderSlotsPerPage: slotsPerPage,
    wishlist: [],
    trades: [],
    feedback: [],
    settings: { ...DEFAULT_DROPDOWN_SETTINGS },
    syncedAt: '',
  };
}

/**
 * Bouwt of synchroniseert de 1.025 National Pokédex slots vanuit de huidige collectie.
 */
export function buildPokedexFromCollection(
  collection: CollectionCard[],
  slotsPerPage: BinderSlotsPerPage,
  options?: {
    existingSlots?: PokedexSlot[];
    unplacedDexNumbers?: Set<number>;
    upgradeDexNumbers?: Set<number>;
  }
): PokedexSlot[] {
  const existingMap = new Map<number, PokedexSlot>();
  if (options?.existingSlots) {
    for (const s of options.existingSlots) {
      existingMap.set(s.dexNumber, s);
    }
  }

  return NATIONAL_DEX_NAMES.map((pokemonName, idx) => {
    const dexNumber = idx + 1;
    const gen = getGenerationForDex(dexNumber);
    const pos = calculateBinderPosition(dexNumber, slotsPerPage);
    const prev = existingMap.get(dexNumber);

    const matchingCards = collection.filter((c) => doesCardMatchPokemon(c.name, pokemonName));
    const inCollectionCount = matchingCards.reduce((sum, c) => sum + Math.max(1, c.quantity || 1), 0);

    let selectedCard = prev?.selectedCard ?? '';
    const choiceOptions = matchingCards.map((c) => formatBinderChoice(c));

    if (matchingCards.length === 1) {
      selectedCard = choiceOptions[0];
    } else if (matchingCards.length >= 2) {
      if (!selectedCard || !choiceOptions.includes(selectedCard)) {
        selectedCard = choiceOptions[0];
      }
    }

    let inBinder = prev ? prev.inBinder : matchingCards.length > 0;
    if (!prev && options?.unplacedDexNumbers?.has(dexNumber)) {
      inBinder = false;
    } else if (prev && prev.inCollectionCount === 0 && matchingCards.length > 0) {
      // Nieuw gevonden kaart automatisch in binder zetten (zoals Apps Script sync)
      inBinder = true;
    }

    const upgradeWanted = prev ? prev.upgradeWanted : Boolean(options?.upgradeDexNumbers?.has(dexNumber));

    let status = 'Ontbrekend';
    if (inBinder && upgradeWanted) {
      status = 'Upgrade gewenst';
    } else if (inBinder) {
      status = 'In Binder';
    } else if (matchingCards.length > 0) {
      status = 'In Collectie';
    }

    return {
      rowIndex: 7 + dexNumber,
      generation: gen.shortLabel,
      dexNumber,
      pokemonName,
      inBinder,
      inCollectionCount,
      status,
      page: pos.page,
      position: pos.label,
      selectedCard,
      upgradeWanted,
    };
  });
}

/**
 * Herrekent Set Voortgang live op basis van de collectie + bekende setdefinities.
 */
export function buildSetProgressFromCollection(
  collection: CollectionCard[],
  seedSets: Array<{ setName: string; setCode?: string; series: string; totalCards: number }>
): SetProgress[] {
  const bySet = new Map<string, { setName: string; setCode?: string; series: string; totalCards: number }>();

  for (const s of seedSets) {
    bySet.set(s.setName.toLowerCase(), { ...s });
  }

  for (const c of collection) {
    const key = c.setName.trim().toLowerCase();
    if (!key) continue;
    if (!bySet.has(key)) {
      const denom = parseInt((c.cardNumber.split('/')[1] || '0').replace(/\D/g, ''), 10) || 100;
      bySet.set(key, {
        setName: c.setName.trim(),
        series: 'Pokémon TCG',
        totalCards: denom,
      });
    }
  }

  const results: SetProgress[] = [];
  for (const def of bySet.values()) {
    const cardsInSet = collection.filter((c) => c.setName.trim().toLowerCase() === def.setName.toLowerCase());
    const uniqueIds = new Set(cardsInSet.map((c) => (c.cardId || `${c.name}-${c.cardNumber}`).toLowerCase()));
    const ownedUnique = uniqueIds.size;
    const totalCards = Math.max(def.totalCards, ownedUnique);
    const remaining = Math.max(0, totalCards - ownedUnique);
    const progressPercent = totalCards > 0 ? roundOneDecimal((ownedUnique / totalCards) * 100) : 0;
    const totalSetValue = roundCurrency(
      cardsInSet.reduce((sum, c) => sum + (c.marketPrice || 0) * Math.max(1, c.quantity || 1), 0)
    );

    results.push({
      setName: def.setName,
      setCode: def.setCode ?? extractSetCodeFromNotes(cardsInSet.find((c) => extractSetCodeFromNotes(c.notes))?.notes) ?? undefined,
      series: def.series,
      totalCards,
      ownedUnique,
      remaining,
      progressPercent,
      totalSetValue,
    });
  }

  return results.sort((a, b) => b.progressPercent - a.progressPercent || b.totalSetValue - a.totalSetValue);
}
