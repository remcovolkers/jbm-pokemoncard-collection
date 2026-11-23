import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSnapshot, CatalogCard } from '../domain/models';
import { CARD_CATALOG_PORT, CardCatalogPort } from '../ports/card-catalog.port';
import { COLLECTION_REPOSITORY, CollectionRepository } from '../ports/collection-repository.port';
import { createDemoSnapshot } from '../adapters/demo-data';
import { CollectionStore } from './collection.store';

function createMockRepo(snapshot: AppSnapshot): CollectionRepository {
  return {
    testConnection: vi.fn(async () => ({ ok: true, spreadsheetName: 'Tracker' })),
    bootstrap: vi.fn(async () => snapshot),
    addCard: vi.fn(async () => snapshot),
    updateCard: vi.fn(async () => snapshot),
    deleteCard: vi.fn(async () => snapshot),
    updatePokedexSlot: vi.fn(async () => snapshot),
    addWishlist: vi.fn(async () => snapshot),
    markWishlistFound: vi.fn(async () => snapshot),
    logTrade: vi.fn(async () => snapshot),
    refreshPrices: vi.fn(async () => ({ updated: 4, total: 4, snapshot })),
  };
}

function createMockCatalog(): CardCatalogPort {
  const sample: CatalogCard = {
    id: 'sv03.5-199',
    localId: '199',
    name: 'Charizard ex',
    setId: 'sv03.5',
    setName: '151',
    seriesName: 'Scarlet & Violet',
    officialCardCount: 165,
    totalCardCount: 207,
    cardNumber: '199/165',
    type: 'Fire',
    rarity: 'Special Illustration Rare',
    imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/199/high.webp',
    lowImageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp',
    marketPriceEur: 222.5,
    trendPercent: 9.5,
  };
  return {
    lookupByCardId: vi.fn(async () => sample),
    searchByName: vi.fn(async () => []),
    getCardByExactId: vi.fn(async () => sample),
    getCachedArtworkUrl: vi.fn((id) => `https://assets.tcgdex.net/en/sv/${id}/high.webp`),
  };
}

describe('CollectionStore (Signals, Optimistic UI & Offline Queue)', () => {
  let store: CollectionStore;
  let mockRepo: CollectionRepository;
  let mockCatalog: CardCatalogPort;

  beforeEach(() => {
    window.localStorage.clear();
    mockRepo = createMockRepo(createDemoSnapshot());
    mockCatalog = createMockCatalog();

    TestBed.configureTestingModule({
      providers: [
        { provide: COLLECTION_REPOSITORY, useValue: mockRepo },
        { provide: CARD_CATALOG_PORT, useValue: mockCatalog },
      ],
    });
    store = TestBed.inject(CollectionStore);
  });

  it('leidt syncStatus correct af over alle 6 staten (demo, unconfigured, offline, syncing, error, synced)', async () => {
    expect(store.syncStatus()).toBe('demo');
    expect(store.collection().length).toBeGreaterThan(0);

    // Demo-modus uit ZONDER gekoppelde spreadsheet -> 'unconfigured' met lege collectie (0 kaarten, 0 in binder!)
    store.updateConfig({ demoMode: false, webAppUrl: '', apiToken: '' });
    expect(store.syncStatus()).toBe('unconfigured');
    expect(store.collection().length).toBe(0);
    expect(store.setProgress().length).toBe(0);
    expect(store.wishlist().length).toBe(0);
    expect(store.pokedexStats().inBinder).toBe(0);
    expect(store.syncedAt()).toBe('');

    // Overschakelen naar live-modus met geldige config triggert direct een sync
    store.updateConfig({ demoMode: true });
    store.updateConfig({ demoMode: false, webAppUrl: 'https://example.com/exec', apiToken: 'tok' });
    expect(store.syncStatus()).toBe('syncing');

    // Na afronden van de sync wordt status 'synced'
    await store.syncFromRemote(true);
    expect(store.syncStatus()).toBe('synced');

    store.lastError.set('Timeout');
    expect(store.syncStatus()).toBe('error');

    store.isOnline.set(false);
    expect(store.syncStatus()).toBe('offline');

    store.isSyncing.set(true);
    expect(store.syncStatus()).toBe('syncing');
  });

  it('voert CRUD-mutaties optimistisch uit en synct Pokédex + Set Voortgang in Demo-modus', async () => {
    const startCount = store.collection().length;
    await store.addCard({
      cardId: 'sv08-238',
      name: 'Pikachu ex',
      setName: 'Surging Sparks',
      cardNumber: '238/191',
      quantity: 1,
      purchasePrice: 200,
      marketPrice: 320,
      setTotalCards: 191,
      seriesName: 'Scarlet & Violet',
    });

    expect(store.collection().length).toBe(startCount + 1);
    const added = store.collection().find((c) => c.cardId === 'sv08-238')!;
    expect(added).toBeDefined();
    expect(store.setProgress().some((s) => s.setName === 'Surging Sparks')).toBe(true);

    // Increment & delete
    await store.incrementExistingCard(added, 2);
    expect(store.collection().find((c) => c.cardId === 'sv08-238')?.quantity).toBe(3);

    await store.deleteCard(store.collection().find((c) => c.cardId === 'sv08-238')!);
    expect(store.collection().some((c) => c.cardId === 'sv08-238')).toBe(false);
    expect(mockRepo.addCard).not.toHaveBeenCalled(); // Demo-modus doet geen remote calls
  });

  it('plaatst offline mutaties in de wachtrij en speelt ze betrouwbaar af bij herstel van verbinding', async () => {
    store.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/test/exec',
      apiToken: 'tok',
    });
    vi.clearAllMocks();

    // Ga offline en voer verschillende mutaties uit
    store.isOnline.set(false);

    await store.addCard({ cardId: 'sv03-125', name: 'Charizard ex', setName: 'Obsidian Flames', quantity: 1 });
    await store.updatePokedexSlot({ dexNumber: 148, inBinder: true });
    await store.logTrade({
      date: '2026-11-23',
      cardName: 'Mew ex',
      setName: '151',
      type: 'Verkoop',
      purchasePrice: 8,
      saleValue: 15,
      platformFees: 1,
      counterparty: 'Cardmarket',
      notes: '',
    });

    expect(store.pendingQueue().length).toBe(3);
    expect(mockRepo.addCard).not.toHaveBeenCalled();

    // Kom weer online en flush wachtrij
    store.isOnline.set(true);
    await store.flushOfflineQueue();

    expect(mockRepo.addCard).toHaveBeenCalledTimes(1);
    expect(mockRepo.updatePokedexSlot).toHaveBeenCalledTimes(1);
    expect(mockRepo.logTrade).toHaveBeenCalledTimes(1);
    expect(store.pendingQueue().length).toBe(0);
  });

  it('behoudt mislukte mutaties in de offline wachtrij wanneer remote faalt', async () => {
    store.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/test/exec',
      apiToken: 'tok',
    });
    vi.mocked(mockRepo.addCard).mockRejectedValueOnce(new Error('503 Unavailable'));

    await store.addCard({ cardId: 'sv03-125', name: 'Charizard ex', setName: 'Obsidian Flames', quantity: 1 });

    expect(store.pendingQueue().length).toBe(1);
    expect(store.pendingQueue()[0].action).toBe('addCard');
    expect(store.lastError()).toContain('503');
  });

  it('ververst prijzen in Demo-modus via TCGdex en in Live-modus via Apps Script', async () => {
    await store.refreshPrices();
    expect(mockCatalog.getCardByExactId).toHaveBeenCalled();
    expect(store.collection()[0].marketPrice).toBe(222.5);

    store.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/test/exec',
      apiToken: 'tok',
    });
    vi.clearAllMocks();
    await store.refreshPrices();
    expect(mockRepo.refreshPrices).toHaveBeenCalledTimes(1);
  });

  it('begrenst toast-meldingen tot max 3 en staat handmatig sluiten toe', () => {
    store.showToast('Bericht 1', 'info');
    store.showToast('Bericht 2', 'success');
    store.showToast('Bericht 3', 'warning');
    store.showToast('Bericht 4', 'error');

    expect(store.toasts().length).toBe(3);
    expect(store.toasts()[0].text).toBe('Bericht 2');

    const firstId = store.toasts()[0].id;
    store.dismissToast(firstId);
    expect(store.toasts().length).toBe(2);
  });
});
