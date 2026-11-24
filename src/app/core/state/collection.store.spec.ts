import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSnapshot, CatalogCard } from '../domain/models';
import { CARD_CATALOG_PORT, CardCatalogPort } from '../ports/card-catalog.port';
import {
  BatchMutationItem,
  BatchMutationResponse,
  COLLECTION_REPOSITORY,
  CollectionRepository,
} from '../ports/collection-repository.port';
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
    expect(store.pendingQueue()).toEqual([]);
  });

  it('behoudt mislukte mutaties in de offline wachtrij wanneer remote faalt', async () => {
    store.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/test/exec',
      apiToken: 'tok',
    });
    vi.mocked(mockRepo.addCard).mockRejectedValueOnce(new Error('503 Unavailable'));

    await store.addCard({ cardId: 'sv03-125', name: 'Charizard ex', setName: 'Obsidian Flames', quantity: 1 });
    await store.waitForPendingSync();

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

  it('onthoudt de gekozen binder-indeling per device over syncs, profielswitches, cache wissen en herstart heen', async () => {
    const baseSnap = createDemoSnapshot();
    baseSnap.binderSlotsPerPage = 16;

    vi.mocked(mockRepo.bootstrap).mockImplementation(async () => ({ ...baseSnap, binderSlotsPerPage: 16 }));
    vi.mocked(mockRepo.updatePokedexSlot).mockImplementation(async () => ({ ...baseSnap, binderSlotsPerPage: 16 }));

    store.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/test/exec',
      apiToken: 'tok',
    });
    await store.syncFromRemote(true);
    expect(store.binderSlotsPerPage()).toBe(16);

    // Gebruiker kiest 5x4 (20) -> opgeslagen op device zonder remote H4-write, dus twee devices overschrijven elkaar niet
    await store.updatePokedexSlot({ slotsPerPage: 20 });
    expect(store.binderSlotsPerPage()).toBe(20);
    expect(store.pokedex()[19]).toMatchObject({ page: 1, position: 'P1 · R4K5' });
    expect(store.pokedex()[20]).toMatchObject({ page: 2, position: 'P2 · R1K1' });
    expect(mockRepo.updatePokedexSlot).not.toHaveBeenCalled();

    // Zelfs als Google Sheets daarna 16 of 9 terugstuurt, behoudt dit device 5x4 (20)
    await store.syncFromRemote(true);
    expect(store.binderSlotsPerPage()).toBe(20);

    vi.mocked(mockRepo.bootstrap).mockResolvedValueOnce({ ...baseSnap, binderSlotsPerPage: 9 });
    await store.syncFromRemote(true);
    expect(store.binderSlotsPerPage()).toBe(20);

    // Wisselen van spreadsheet-profiel of legen van cache behoudt eveneens de device-voorkeur
    store.saveSheetProfile(
      { name: 'Test Sheet', role: 'test', webAppUrl: 'https://script.google.com/macros/s/test2/exec', apiToken: 'tok2' },
      { activate: true, disableDemo: true }
    );
    await store.syncFromRemote(true);
    expect(store.binderSlotsPerPage()).toBe(20);

    store.clearOfflineCache();
    expect(store.binderSlotsPerPage()).toBe(20);

    // Na app-update / herstart (nieuwe store-instantie) blijft 20 actief op dit device
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: COLLECTION_REPOSITORY, useValue: mockRepo },
        { provide: CARD_CATALOG_PORT, useValue: mockCatalog },
      ],
    });
    const restartedStore = TestBed.inject(CollectionStore);
    expect(restartedStore.binderSlotsPerPage()).toBe(20);
  });

  it('beheert meerdere spreadsheet-profielen (Test vs Live) met strikte snapshot-isolatie', async () => {
    const testSnap = createDemoSnapshot();
    testSnap.collection = [testSnap.collection[0]];
    const liveSnap = createDemoSnapshot();
    liveSnap.collection = liveSnap.collection.slice(0, 3);

    vi.mocked(mockRepo.bootstrap).mockImplementation(async (cfg) =>
      cfg.apiToken === 'tok-test' ? testSnap : liveSnap
    );

    const testProf = store.saveSheetProfile(
      {
        name: 'Remco (Test)',
        role: 'test',
        webAppUrl: 'https://script.google.com/macros/s/test/exec',
        apiToken: 'tok-test',
      },
      { activate: true, disableDemo: true }
    );
    await store.syncFromRemote(true);
    expect(store.collection().length).toBe(1);
    expect(store.activeProfile()?.role).toBe('test');

    const liveProf = store.saveSheetProfile(
      {
        name: 'Mel (Live)',
        role: 'live',
        webAppUrl: 'https://script.google.com/macros/s/mel/exec',
        apiToken: 'tok-mel',
      },
      { activate: true, disableDemo: true }
    );
    await store.syncFromRemote(true);
    expect(store.collection().length).toBe(3);
    expect(store.activeProfile()?.name).toBe('Mel (Live)');

    // Schakelen naar Remco (Test) laadt direct diens geïsoleerde cache (1 kaart) zonder Mel's kaarten te lekken
    await store.switchSheetProfile(testProf.id);
    expect(store.collection().length).toBe(1);
    expect(store.config().apiToken).toBe('tok-test');

    // Verwijderen van actieve test-profiel valt netjes terug op Mel (Live)
    store.deleteSheetProfile(testProf.id);
    expect(store.activeProfile()?.id).toBe(liveProf.id);
    expect(store.config().apiToken).toBe('tok-mel');
  });

  it('serialiseert snelle overlappende CRUD-mutaties zodat verwijderde of bewerkte items nooit terugkomen', async () => {
    const baseSnap = createDemoSnapshot();
    const cardA = baseSnap.collection[0];
    const cardB = baseSnap.collection[1];
    let serverCollection = [...baseSnap.collection];

    let resolveFirstDelete!: (snap: AppSnapshot) => void;
    const firstDeletePromise = new Promise<AppSnapshot>((resolve) => {
      resolveFirstDelete = resolve;
    });

    vi.mocked(mockRepo.bootstrap).mockResolvedValueOnce(baseSnap);
    vi.mocked(mockRepo.deleteCard)
      .mockImplementationOnce(() => firstDeletePromise)
      .mockImplementationOnce(async (_cfg, payload) => {
        serverCollection = serverCollection.filter((c) => c.cardId !== payload.cardId);
        return { ...baseSnap, collection: [...serverCollection] };
      });

    store.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/test/exec',
      apiToken: 'tok',
    });
    await store.syncFromRemote(true);

    // Start 2 deletes vlak achter elkaar terwijl de 1e nog in-flight is
    const p1 = store.deleteCard(cardA);
    const p2 = store.deleteCard(cardB);

    // Optimistisch zijn beide al weg
    expect(store.collection().some((c) => c.cardId === cardA.cardId)).toBe(false);
    expect(store.collection().some((c) => c.cardId === cardB.cardId)).toBe(false);

    // Oude snapshot van delete 1 bevat cardB nog -> mag cardB NIET terugzetten!
    await Promise.all([p1, p2]);
    serverCollection = serverCollection.filter((c) => c.cardId !== cardA.cardId);
    resolveFirstDelete({ ...baseSnap, collection: [...serverCollection] });

    await store.waitForPendingSync();
    expect(store.collection().some((c) => c.cardId === cardA.cardId)).toBe(false);
    expect(store.collection().some((c) => c.cardId === cardB.cardId)).toBe(false);
    expect(mockRepo.deleteCard).toHaveBeenCalledTimes(2);
  });

  it('negeert verouderde syncFromRemote-responses bij nieuwe CRUD-mutaties en verrekent Set Voortgang + Verlanglijst previews', async () => {
    const snap = createDemoSnapshot();
    snap.collection = [
      {
        ...snap.collection[0],
        rowIndex: 2,
        cardId: 'svp-044',
        name: 'Charmander',
        setName: 'SVP Black Star Promos',
        cardNumber: '044',
        quantity: 1,
        marketPrice: 46.21,
      },
    ];
    snap.setProgress = [
      {
        rowIndex: 2,
        setName: 'SVP Black Star Promos',
        series: 'Scarlet & Violet',
        totalCards: 226,
        ownedUnique: 1,
        remaining: 225,
        progressPercent: 0.4,
        totalSetValue: 0, // Bug uit screenshot: € 0,00 ondanks Charmander van € 46,21
      },
    ];
    snap.wishlist = [
      {
        rowIndex: 2,
        // Geen cardId of imageUrl uit Google Sheets (Bug 3: Dragonair 151 181/165)
        cardName: 'Dragonair',
        setName: '151',
        cardNumber: '181/165',
        desiredVariant: 'Full Art',
        minCondition: 'Near Mint (NM)',
        priority: 'Hoog',
        maxBudget: 47,
        marketPrice: 44.76,
        notes: '',
        found: false,
      },
    ];

    vi.mocked(mockRepo.bootstrap).mockResolvedValue(snap);
    store.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/test/exec',
      apiToken: 'tok',
    });
    await store.syncFromRemote(true);

    // Set Voortgang moet € 46,21 + setCode SVP tonen
    const svpProgress = store.setProgress().find((s) => s.setName === 'SVP Black Star Promos');
    expect(svpProgress?.totalSetValue).toBe(46.21);
    expect(svpProgress?.setCode).toBe('SVP');

    // Verlanglijst moet sv03.5-181 en artwork URL hebben afgeleid
    const dragonair = store.wishlist().find((w) => w.cardName === 'Dragonair');
    expect(dragonair?.cardId).toBe('sv03.5-181');
    expect(dragonair?.imageUrl).toContain('sv03.5-181');

    // Verouderde bootstrap tijdens een nieuwe CRUD-mutatie (bijv. delete) mag de nieuwere mutatie niet terugdraaien
    let resolveStaleBootstrap!: (s: AppSnapshot) => void;
    vi.mocked(mockRepo.bootstrap).mockImplementationOnce(
      () =>
        new Promise<AppSnapshot>((resolve) => {
          resolveStaleBootstrap = resolve;
        })
    );
    const staleSync = store.syncFromRemote(true);
    await new Promise((r) => setTimeout(r, 0));

    const charmander = store.collection()[0];
    vi.mocked(mockRepo.deleteCard).mockResolvedValueOnce({ ...snap, collection: [] });
    await store.deleteCard(charmander);
    expect(store.collection().length).toBe(0);

    resolveStaleBootstrap(snap);
    await staleSync;
    await store.waitForPendingSync();
    expect(store.collection().length).toBe(0);
  });

  it('voegt kaarten in 0 ms lokaal toe terwijl trage Google Sheets-sync op achtergrond draait', async () => {
    let resolveRemote!: (snap: AppSnapshot) => void;
    const remotePromise = new Promise<AppSnapshot>((resolve) => {
      resolveRemote = resolve;
    });
    vi.mocked(mockRepo.addCard).mockImplementationOnce(() => remotePromise);

    store.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/slow/exec',
      apiToken: 'tok',
    });
    await store.syncFromRemote(true);

    let settledBeforeRemote = false;
    await store.addCard({
      cardId: 'sv03.5-151',
      name: 'Mew ex',
      setName: '151',
      cardNumber: '151/165',
      quantity: 1,
    });
    settledBeforeRemote = true;

    expect(settledBeforeRemote).toBe(true);
    expect(store.collection().some((c) => c.cardId === 'sv03.5-151' && c.rowIndex < 0)).toBe(true);
    expect(store.pendingQueue().length).toBe(1);
    expect(store.syncStatus()).toBe('syncing');
    expect(window.localStorage.getItem('pokebinder_offline_queue_v1')).toContain('Mew ex');

    const remoteSnap = createDemoSnapshot();
    resolveRemote(remoteSnap);
    await store.waitForPendingSync();

    expect(store.pendingQueue().length).toBe(0);
    expect(store.syncStatus()).toBe('synced');
  });

  it('bundelt mutaties via batchMutations, past coalescing toe (in-flight veilig) en remapt tempRowIndex (-1 -> 42)', async () => {
    let resolveFirstBatch!: (res: BatchMutationResponse) => void;
    const batchCalls: BatchMutationItem[][] = [];

    const batchRepo: CollectionRepository = {
      ...mockRepo,
      batchMutations: vi.fn(async (_cfg, mutations: BatchMutationItem[]): Promise<BatchMutationResponse> => {
        batchCalls.push(mutations);
        if (batchCalls.length === 1) {
          return new Promise<BatchMutationResponse>((resolve) => {
            resolveFirstBatch = resolve;
          });
        }
        return {
          results: mutations.map((m) => ({
            id: m.id,
            action: m.action,
            ok: true,
            result: { rowIndex: Number(m.payload['rowIndex']) || 42 },
          })),
        };
      }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: COLLECTION_REPOSITORY, useValue: batchRepo },
        { provide: CARD_CATALOG_PORT, useValue: mockCatalog },
      ],
    });
    const batchStore = TestBed.inject(CollectionStore);
    batchStore.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/batch/exec',
      apiToken: 'tok',
    });
    await batchStore.syncFromRemote(true);

    // 1. Eerste kaart direct gestart als in-flight batch #1
    await batchStore.addCard({
      cardId: 'sv03-125',
      name: 'Charizard ex',
      setName: 'Obsidian Flames',
      cardNumber: '125/197',
      quantity: 1,
    });
    const charizardTemp = batchStore.collection().find((c) => c.cardId === 'sv03-125')!;
    expect(charizardTemp.rowIndex).toBeLessThan(0);

    // 2. Terwijl batch #1 in-flight is: bewerk Charizard 2x + voeg Pikachu toe en verwijder direct weer
    await batchStore.updateCard(charizardTemp.rowIndex, charizardTemp.cardId, { quantity: 2 });
    await batchStore.updateCard(charizardTemp.rowIndex, charizardTemp.cardId, { quantity: 4, notes: 'Pack Pull' });
    await batchStore.addCard({
      cardId: 'sv08-238',
      name: 'Pikachu ex',
      setName: 'Surging Sparks',
      cardNumber: '238/191',
      quantity: 1,
    });
    const pikachuTemp = batchStore.collection().find((c) => c.cardId === 'sv08-238')!;
    await batchStore.deleteCard(pikachuTemp);

    expect(batchStore.collection().some((c) => c.cardId === 'sv08-238')).toBe(false);

    // Sluit batch #1 af -> Charizard krijgt sheet-rij 42!
    resolveFirstBatch({
      results: [
        {
          id: batchCalls[0][0].id,
          action: 'addCard',
          ok: true,
          result: { rowIndex: 42, cardId: 'sv03-125' },
        },
      ],
    });
    await batchStore.waitForPendingSync();

    // Batch #2 bevat ALLEEN de gebundelde updateCard met geremapte rowIndex 42 (geen Pikachu!)
    expect(batchCalls.length).toBe(2);
    expect(batchCalls[1].length).toBe(1);
    expect(batchCalls[1][0].action).toBe('updateCard');
    expect(batchCalls[1][0].payload['rowIndex']).toBe(42);
    expect(batchCalls[1][0].payload['quantity']).toBe(4);
    expect(batchCalls[1][0].payload['notes']).toBe('Pack Pull');

    const finalCharizard = batchStore.collection().find((c) => c.cardId === 'sv03-125')!;
    expect(finalCharizard.rowIndex).toBe(42);
    expect(finalCharizard.quantity).toBe(4);
    expect(batchStore.pendingQueue().length).toBe(0);
  });

  it('behoudt lokale kaarten over herstart via localStorage en flusht outbox vóór bootstrap', async () => {
    const baseSnap = createDemoSnapshot();
    const unsyncedCard = {
      ...baseSnap.collection[0],
      rowIndex: -1,
      cardId: 'sv03.5-199',
      name: 'Charizard ex',
      setName: '151',
    };
    const cachedSnap: AppSnapshot = {
      ...baseSnap,
      collection: [unsyncedCard, ...baseSnap.collection],
    };

    window.localStorage.setItem(
      'pokebinder_config_v1',
      JSON.stringify({
        webAppUrl: 'https://script.google.com/macros/s/restart/exec',
        apiToken: 'tok-restart',
        demoMode: false,
        monthlyBudget: 150,
      })
    );
    window.localStorage.setItem('pokebinder_snapshot_v1', JSON.stringify(cachedSnap));
    window.localStorage.setItem(
      'pokebinder_offline_queue_v1',
      JSON.stringify([
        {
          id: 'persisted-1',
          action: 'addCard',
          payload: { cardId: 'sv03.5-199', name: 'Charizard ex', setName: '151', quantity: 1 },
          tempRowIndex: -1,
          description: 'Kaart toevoegen: Charizard ex',
          createdAt: '2026-11-24T12:00:00Z',
        },
      ])
    );

    const callOrder: string[] = [];
    let releaseBatches!: () => void;
    const batchGate = new Promise<void>((resolve) => {
      releaseBatches = resolve;
    });
    const syncedServerCards = [{ ...unsyncedCard, rowIndex: 19 }];
    const restartRepo: CollectionRepository = {
      ...mockRepo,
      bootstrap: vi.fn(async () => {
        callOrder.push('bootstrap');
        return { ...cachedSnap, collection: [...syncedServerCards, ...baseSnap.collection] };
      }),
      batchMutations: vi.fn(async (_cfg, muts: BatchMutationItem[]): Promise<BatchMutationResponse> => {
        callOrder.push(`batch:${muts.map((m) => m.action).join(',')}`);
        await batchGate;
        return {
          results: muts.map((m, idx) => {
            const cardId = String(m.payload['cardId'] ?? '');
            const assignedRow = cardId === 'sv03.5-199' ? 19 : 20 + idx;
            if (cardId && !syncedServerCards.some((c) => c.cardId === cardId)) {
              syncedServerCards.unshift({
                ...unsyncedCard,
                rowIndex: assignedRow,
                cardId,
                name: String(m.payload['name'] ?? ''),
                setName: String(m.payload['setName'] ?? ''),
              });
            }
            return {
              id: m.id,
              action: m.action,
              ok: true,
              result: { rowIndex: assignedRow, cardId },
            };
          }),
        };
      }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: COLLECTION_REPOSITORY, useValue: restartRepo },
        { provide: CARD_CATALOG_PORT, useValue: mockCatalog },
      ],
    });
    const restarted = TestBed.inject(CollectionStore);

    // Direct na opstarten (vóór netwerk) is lokaal opgeslagen kaart zichtbaar én krijgt volgende kaart -2
    expect(restarted.collection().some((c) => c.rowIndex === -1 && c.cardId === 'sv03.5-199')).toBe(true);
    await restarted.addCard({ cardId: 'sv08-238', name: 'Pikachu ex', setName: 'Surging Sparks', quantity: 1 });
    expect(restarted.collection()[0].rowIndex).toBe(-2);

    releaseBatches();
    await restarted.waitForPendingSync();
    expect(callOrder[0]).toContain('batch:');
    expect(restarted.pendingQueue().length).toBe(0);
    expect(restarted.collection().find((c) => c.cardId === 'sv08-238')?.rowIndex).toBeGreaterThanOrEqual(2);
  });

  it('valt automatisch terug op losse POST-calls wanneer oudere Apps Script geen batchMutations kent', async () => {
    const legacyRepo: CollectionRepository = {
      ...mockRepo,
      batchMutations: vi.fn(async () => {
        throw new Error('Onbekende POST-actie: batchMutations');
      }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: COLLECTION_REPOSITORY, useValue: legacyRepo },
        { provide: CARD_CATALOG_PORT, useValue: mockCatalog },
      ],
    });
    const legacyStore = TestBed.inject(CollectionStore);
    legacyStore.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/legacy/exec',
      apiToken: 'tok-legacy',
    });
    await legacyStore.syncFromRemote(true);

    await legacyStore.addCard({
      cardId: 'sv03-125',
      name: 'Charizard ex',
      setName: 'Obsidian Flames',
      quantity: 1,
    });
    await legacyStore.waitForPendingSync();

    expect(legacyStore.legacyAppsScriptDetected()).toBe(true);
    expect(legacyRepo.addCard).toHaveBeenCalledTimes(1);
    expect(legacyStore.pendingQueue().length).toBe(0);
    expect(legacyStore.lastError()).toBeNull();
  });

  it('voegt meerdere kaarten atomisch toe via addCardsBatch met duplicaat-increment en aparte varianten in 1 batch', async () => {
    const batchCalls: BatchMutationItem[][] = [];
    const batchRepo: CollectionRepository = {
      ...mockRepo,
      bootstrap: vi.fn(async () => ({ ...createDemoSnapshot(), scriptVersion: '2.1.0' })),
      batchMutations: vi.fn(async (_cfg, mutations: BatchMutationItem[]): Promise<BatchMutationResponse> => {
        batchCalls.push(mutations);
        return {
          results: mutations.map((m, idx) => ({
            id: m.id,
            action: m.action,
            ok: true,
            result: { rowIndex: 40 + idx, cardId: String(m.payload['cardId'] ?? '') },
          })),
        };
      }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: COLLECTION_REPOSITORY, useValue: batchRepo },
        { provide: CARD_CATALOG_PORT, useValue: mockCatalog },
      ],
    });
    const batchStore = TestBed.inject(CollectionStore);
    batchStore.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/batch2/exec',
      apiToken: 'tok-batch2',
    });
    await batchStore.syncFromRemote(true);
    expect(batchStore.connectedScriptVersion()).toBe('2.1.0');

    const existingBefore = batchStore.collection().find((c) => c.cardId === 'sv03.5-181')!;
    const countBefore = batchStore.collection().length;

    const result = await batchStore.addCardsBatch([
      {
        duplicateStrategy: 'increment',
        payload: {
          cardId: existingBefore.cardId,
          name: existingBefore.name,
          setName: existingBefore.setName,
          cardNumber: existingBefore.cardNumber,
          variant: existingBefore.variant,
          quantity: 2,
        },
      },
      {
        duplicateStrategy: 'increment',
        payload: {
          cardId: 'sv03.5-001',
          name: 'Bulbasaur',
          setName: '151',
          cardNumber: '001/165',
          variant: 'Reverse Holo',
          quantity: 1,
          setTotalCards: 165,
        },
      },
      {
        duplicateStrategy: 'separate',
        payload: {
          cardId: existingBefore.cardId,
          name: existingBefore.name,
          setName: existingBefore.setName,
          cardNumber: existingBefore.cardNumber,
          variant: existingBefore.variant,
          quantity: 1,
        },
      },
    ]);

    expect(result).toEqual({ addedCount: 2, incrementedCount: 1, totalCopies: 4 });
    expect(batchStore.collection().length).toBe(countBefore + 2);
    expect(
      batchStore
        .collection()
        .find((c) => c.rowIndex === existingBefore.rowIndex && c.cardId === existingBefore.cardId)?.quantity
    ).toBe(existingBefore.quantity + 2);
    expect(batchStore.collection().some((c) => c.cardId === 'sv03.5-001' && c.variant === 'Reverse Holo')).toBe(true);

    await batchStore.waitForPendingSync();
    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0].map((m) => m.action)).toEqual(['updateCard', 'addCard', 'addCard']);
    expect(batchStore.pendingQueue().length).toBe(0);
  });
});
