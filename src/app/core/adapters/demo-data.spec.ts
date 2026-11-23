import { describe, expect, it } from 'vitest';
import { CollectionCard } from '../domain/models';
import {
  buildPokedexFromCollection,
  buildSetProgressFromCollection,
  createDemoSnapshot,
} from './demo-data';

function makeCard(overrides: Partial<CollectionCard>): CollectionCard {
  return {
    rowIndex: 2,
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
    storageLocation: 'Hoofdbinder',
    binderDetail: '',
    purchaseDate: '2025-01-01',
    purchasePrice: 5,
    marketPrice: 10,
    forTrade: false,
    notes: '',
    ...overrides,
  };
}

describe('demo-data & snapshot builders', () => {
  it('genereert een complete Demo-snapshot met 1.025 National Dex slots en 3 klaar-voor-binder kaarten', () => {
    const snap = createDemoSnapshot();
    expect(snap.pokedex.length).toBe(1025);
    expect(snap.collection.length).toBeGreaterThanOrEqual(20);
    expect(snap.setProgress.length).toBeGreaterThanOrEqual(5);
    expect(snap.wishlist.length).toBeGreaterThanOrEqual(4);
    expect(snap.trades.length).toBeGreaterThanOrEqual(3);

    const ready = snap.pokedex.filter((s) => !s.inBinder && s.inCollectionCount > 0);
    expect(ready.map((s) => s.dexNumber).sort((a, b) => a - b)).toEqual([54, 61, 148]);
  });

  it('synct Pokédex slots: 1 kaart kiest automatisch, 2+ kaarten behoudt geldige bestaande keuze', () => {
    const cards = [
      makeCard({ rowIndex: 2, cardId: 'sv03.5-198', name: 'Venusaur ex', variant: 'Alt Art' }),
      makeCard({ rowIndex: 3, cardId: 'base1-15', name: 'Venusaur', setName: 'Base Set', variant: 'Holo' }),
      makeCard({ rowIndex: 4, cardId: 'sv03.5-151', name: 'Mew ex', variant: 'Holo' }),
    ];

    const initial = buildPokedexFromCollection(cards, 9);
    const venusaurInitial = initial.find((s) => s.dexNumber === 3)!;
    const mewInitial = initial.find((s) => s.dexNumber === 151)!;
    const mewtwoInitial = initial.find((s) => s.dexNumber === 150)!;

    expect(venusaurInitial.inBinder).toBe(true);
    expect(venusaurInitial.inCollectionCount).toBe(2);
    expect(venusaurInitial.selectedCard).toBe('sv03.5-198 | 151 (Alt Art)');

    expect(mewInitial.inBinder).toBe(true);
    expect(mewInitial.selectedCard).toBe('sv03.5-151 | 151 (Holo)');
    expect(mewtwoInitial.inBinder).toBe(false);
    expect(mewtwoInitial.inCollectionCount).toBe(0);

    // Gebruiker kiest handmatig Base Set Venusaur -> vervolgsync moet keuze behouden!
    venusaurInitial.selectedCard = 'base1-15 | Base Set (Holo)';
    venusaurInitial.upgradeWanted = true;

    const resynced = buildPokedexFromCollection(cards, 12, { existingSlots: initial });
    const venusaurAfter = resynced.find((s) => s.dexNumber === 3)!;
    expect(venusaurAfter.selectedCard).toBe('base1-15 | Base Set (Holo)');
    expect(venusaurAfter.status).toBe('Upgrade gewenst');
    expect(venusaurAfter.position).toBe('P1 · R1K3');
  });

  it('berekent Set Voortgang dynamisch inclusief nieuwe sets en ontdubbeling op kaart-ID', () => {
    const cards = [
      makeCard({ cardId: 'sv03.5-199', setName: '151', cardNumber: '199/165', quantity: 2, marketPrice: 100 }),
      makeCard({ cardId: 'sv03.5-199', setName: '151', cardNumber: '199/165', quantity: 1, marketPrice: 100 }), // zelfde ID!
      makeCard({ cardId: 'sv08-238', setName: 'Surging Sparks', cardNumber: '238/191', quantity: 1, marketPrice: 250 }),
    ];

    const progress = buildSetProgressFromCollection(cards, [
      { setName: '151', setCode: 'MEW', series: 'Scarlet & Violet', totalCards: 165 },
    ]);

    const set151 = progress.find((s) => s.setName === '151')!;
    expect(set151.ownedUnique).toBe(1);
    expect(set151.remaining).toBe(164);
    expect(set151.totalSetValue).toBe(300);

    const newSet = progress.find((s) => s.setName === 'Surging Sparks')!;
    expect(newSet).toBeDefined();
    expect(newSet.totalCards).toBe(191);
    expect(newSet.ownedUnique).toBe(1);
    expect(newSet.totalSetValue).toBe(250);
  });
});
