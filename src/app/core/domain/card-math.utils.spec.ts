import { describe, expect, it } from 'vitest';
import {
  calculateBinderPosition,
  calculateCardMetrics,
  calculatePortfolioSummary,
  compareCardNumbers,
  formatDexNumber,
  formatEur,
  formatInteger,
  formatPercent,
  normalizeRarityLabel,
  normalizeRarityOptions,
  parseCardNumberParts,
} from './card-math.utils';
import { CollectionCard, TradeEntry, WishlistItem } from './models';

describe('card-math.utils', () => {
  describe('calculateBinderPosition', () => {
    it('berekent pagina, vakje, rij en kolom voor 4, 9, 12 en 16 vakjes per pagina', () => {
      expect(calculateBinderPosition(1, 9)).toEqual({
        page: 1,
        slotInPage: 1,
        row: 1,
        column: 1,
        columnsPerPage: 3,
        rowsPerPage: 3,
        label: 'P1 · R1K1',
      });
      expect(calculateBinderPosition(3, 9)).toMatchObject({ page: 1, slotInPage: 3, row: 1, column: 3 });
      expect(calculateBinderPosition(9, 9)).toMatchObject({ page: 1, slotInPage: 9, row: 3, column: 3 });
      expect(calculateBinderPosition(10, 9)).toMatchObject({ page: 2, slotInPage: 1, row: 1, column: 1 });
      expect(calculateBinderPosition(148, 9)).toMatchObject({ page: 17, slotInPage: 4, row: 2, column: 1 });

      // 2x2 (4 vakjes)
      expect(calculateBinderPosition(4, 4)).toMatchObject({ page: 1, row: 2, column: 2, label: 'P1 · R2K2' });
      expect(calculateBinderPosition(5, 4)).toMatchObject({ page: 2, row: 1, column: 1, label: 'P2 · R1K1' });

      // 4x3 (12 vakjes)
      expect(calculateBinderPosition(12, 12)).toMatchObject({ page: 1, row: 3, column: 4, label: 'P1 · R3K4' });
      expect(calculateBinderPosition(13, 12)).toMatchObject({ page: 2, row: 1, column: 1, label: 'P2 · R1K1' });

      // 4x4 (16 vakjes)
      expect(calculateBinderPosition(16, 16)).toMatchObject({ page: 1, row: 4, column: 4 });
      expect(calculateBinderPosition(1025, 16)).toMatchObject({ page: 65, slotInPage: 1, row: 1, column: 1 });

      // 5x4 (20 vakjes)
      expect(calculateBinderPosition(20, 20)).toEqual({
        page: 1,
        slotInPage: 20,
        row: 4,
        column: 5,
        columnsPerPage: 5,
        rowsPerPage: 4,
        label: 'P1 · R4K5',
      });
      expect(calculateBinderPosition(21, 20)).toMatchObject({ page: 2, slotInPage: 1, row: 1, column: 1, label: 'P2 · R1K1' });
      expect(calculateBinderPosition(1025, 20)).toMatchObject({ page: 52, slotInPage: 5, row: 1, column: 5, label: 'P52 · R1K5' });
    });

    it('klamt ongeldige of lage dex-nummers veilig naar 1', () => {
      expect(calculateBinderPosition(0, 9)).toMatchObject({ page: 1, slotInPage: 1 });
      expect(calculateBinderPosition(-5, 9)).toMatchObject({ page: 1, slotInPage: 1 });
    });
  });

  describe('parseCardNumberParts & compareCardNumbers', () => {
    it('sorteert kaartnummers numeriek (44/102 vóór 166/165, 3/165 vóór 15/165)', () => {
      const unsorted = ['166/165', '44/102', 'TG05/TG30', '003/165', '15/102', 'GG01/GG70', '199/165'];
      const sorted = [...unsorted].sort(compareCardNumbers);
      expect(sorted).toEqual(['003/165', '15/102', '44/102', '166/165', '199/165', 'GG01/GG70', 'TG05/TG30']);
      expect(compareCardNumbers('44/102', '166/165')).toBeLessThan(0);
    });

    it('sorteert kaartnummers met lettersuffix en verschillende noemers deterministisch', () => {
      expect(compareCardNumbers('15/102', '15a/102')).toBeLessThan(0);
      expect(compareCardNumbers('15/102', '15/165')).toBeLessThan(0);
      expect(compareCardNumbers('SWSH050', 'SWSH120')).toBeLessThan(0);
      expect(parseCardNumberParts('PROMO').numeric).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('calculateCardMetrics & calculatePortfolioSummary', () => {
    it('berekent positieve, negatieve en 0-aankoopprijs ROI nauwkeurig', () => {
      expect(calculateCardMetrics({ quantity: 2, purchasePrice: 40, marketPrice: 55 })).toEqual({
        totalCost: 80,
        totalValue: 110,
        profitLoss: 30,
        roiPercent: 37.5,
      });

      expect(calculateCardMetrics({ quantity: 1, purchasePrice: 100, marketPrice: 75 })).toEqual({
        totalCost: 100,
        totalValue: 75,
        profitLoss: -25,
        roiPercent: -25,
      });

      expect(calculateCardMetrics({ quantity: 1, purchasePrice: 0, marketPrice: 25 })).toEqual({
        totalCost: 0,
        totalValue: 25,
        profitLoss: 25,
        roiPercent: 0,
      });

      expect(calculateCardMetrics({ quantity: 0, purchasePrice: 50, marketPrice: 60 })).toEqual({
        totalCost: 0,
        totalValue: 0,
        profitLoss: 0,
        roiPercent: 0,
      });
    });

    it('aggregeert portfolio KPIs inclusief ruilbare dubbels, open verlanglijst en transacties', () => {
      const cards: CollectionCard[] = [
        {
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
          quantity: 2,
          storageLocation: 'Hoofdbinder',
          binderDetail: '',
          purchaseDate: '2025-01-01',
          purchasePrice: 100,
          marketPrice: 150,
          forTrade: false, // 1 dubbel exemplaar automatisch ruilbaar
          notes: '',
        },
        {
          rowIndex: 3,
          cardId: 'sv03.5-151',
          name: 'Mew ex',
          setName: '151',
          cardNumber: '151/165',
          language: 'EN',
          type: 'Psychic',
          rarity: 'Double Rare',
          variant: 'Holo',
          condition: 'Near Mint (NM)',
          grading: 'Raw',
          grade: '',
          quantity: 3,
          storageLocation: 'Trade Binder',
          binderDetail: '',
          purchaseDate: '2025-01-02',
          purchasePrice: 10,
          marketPrice: 12,
          forTrade: true, // alle 3 exemplaren ruilbaar
          notes: '',
        },
      ];
      const wishlist: WishlistItem[] = [
        {
          rowIndex: 2,
          cardName: 'Gengar Holo',
          setName: 'Expedition',
          cardNumber: '13/165',
          desiredVariant: 'Holo',
          minCondition: 'Excellent (EX)',
          priority: 'Hoog',
          maxBudget: 95,
          marketPrice: 88,
          notes: '',
          found: false,
        },
        {
          rowIndex: 3,
          cardName: 'Al gevonden',
          setName: '151',
          cardNumber: '1/165',
          desiredVariant: 'Normal',
          minCondition: 'Near Mint (NM)',
          priority: 'Laag',
          maxBudget: 10,
          marketPrice: 5,
          notes: '',
          found: true,
        },
      ];
      const trades: TradeEntry[] = [
        {
          rowIndex: 22,
          date: '2025-02-01',
          cardName: 'Pikachu',
          setName: '151',
          type: 'Verkoop',
          purchasePrice: 15,
          saleValue: 30,
          platformFees: 2.5,
          netResult: 12.5,
          counterparty: 'Cardmarket',
          notes: '',
        },
      ];

      const summary = calculatePortfolioSummary(cards, wishlist, trades);
      expect(summary.uniqueCards).toBe(2);
      expect(summary.totalCopies).toBe(5);
      expect(summary.purchaseValue).toBe(230);
      expect(summary.marketValue).toBe(336);
      expect(summary.unrealizedProfit).toBe(106);
      expect(summary.realizedProfit).toBe(12.5);
      expect(summary.openWishlistBudget).toBe(95);
      expect(summary.openWishlistMarketTotal).toBe(88);
      expect(summary.openWishlistCount).toBe(1);
      expect(summary.tradeCount).toBe(4); // 1 extra Charizard + 3 Mew forTrade
      expect(summary.tradeValue).toBe(186); // 150 + 3*12
    });
  });

  describe('NL formatters', () => {
    it('formatteert eurobedragen met non-breaking space, percentages en dex-nummers', () => {
      expect(formatEur(1428.5)).toBe('€\u00A01.428,50');
      expect(formatEur(25, true)).toBe('+€\u00A025,00');
      expect(formatEur(-12.4)).toBe('-€\u00A012,40');
      expect(formatEur(0)).toBe('€\u00A00,00');

      expect(formatPercent(20.8)).toBe('+20,8%');
      expect(formatPercent(20.8, false)).toBe('20,8%');
      expect(formatPercent(-3.1)).toBe('-3,1%');

      expect(formatDexNumber(3)).toBe('#0003');
      expect(formatDexNumber(1025)).toBe('#1025');
      expect(formatInteger(1219)).toBe('1.219');
    });
  });
});

describe('normalizeRarityLabel (Holo Rare i.p.v. Vintage Holo)', () => {
  it('brengt Vintage Holo / Rare Holo terug op het Cardmarket-label "Holo Rare"', () => {
    expect(normalizeRarityLabel('Vintage Holo')).toBe('Holo Rare');
    expect(normalizeRarityLabel('rare holo')).toBe('Holo Rare');
    expect(normalizeRarityLabel('Holo Rare')).toBe('Holo Rare');
    expect(normalizeRarityLabel('Ultra Rare')).toBe('Ultra Rare');
    expect(normalizeRarityLabel(undefined)).toBe('');
  });

  it('vervangt oude dropdownwaarde zonder dubbelen en voegt "Holo Rare" toe', () => {
    expect(normalizeRarityOptions(['Common', 'Vintage Holo', 'Holo Rare'])).toEqual(['Common', 'Holo Rare']);
    expect(normalizeRarityOptions(['Common'])).toEqual(['Common', 'Holo Rare']);
  });
});

