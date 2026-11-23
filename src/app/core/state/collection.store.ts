import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { buildTcgdexAssetUrl } from '../domain/card-id.utils';
import {
  calculateBinderPosition,
  calculatePortfolioSummary,
  roundCurrency,
} from '../domain/card-math.utils';
import {
  AppConnectionConfig,
  AppSnapshot,
  BinderSlotsPerPage,
  CollectionCard,
  DEFAULT_DROPDOWN_SETTINGS,
  PendingMutation,
  PokedexSlot,
  ToastMessage,
  TradeEntry,
  WishlistItem,
} from '../domain/models';
import { doesCardMatchPokemon, formatBinderChoice } from '../domain/pokedex-matching.utils';
import { CARD_CATALOG_PORT } from '../ports/card-catalog.port';
import {
  AddCardPayload,
  COLLECTION_REPOSITORY,
  ConnectionTestResult,
  MarkWishlistFoundPayload,
  UpdatePokedexSlotPayload,
} from '../ports/collection-repository.port';
import {
  buildPokedexFromCollection,
  buildSetProgressFromCollection,
  createDemoSnapshot,
  createEmptySnapshot,
} from '../adapters/demo-data';
import { BinderLayoutPreference, LocalCacheAdapter, PackOpeningDefaults } from '../adapters/local-cache.adapter';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'demo' | 'unconfigured' | 'error';

@Injectable({ providedIn: 'root' })
export class CollectionStore {
  private readonly repo = inject(COLLECTION_REPOSITORY);
  private readonly catalog = inject(CARD_CATALOG_PORT);
  private readonly cache = inject(LocalCacheAdapter);

  private binderLayoutPref: BinderLayoutPreference | null = this.cache.loadBinderLayoutPreference();

  // Core Reactive Signals
  readonly config = signal<AppConnectionConfig>(this.cache.loadConfig());
  readonly snapshot = signal<AppSnapshot>(this.loadInitialSnapshot());
  readonly packDefaults = signal<PackOpeningDefaults>(this.cache.loadPackDefaults());
  readonly pendingQueue = signal<PendingMutation[]>(this.cache.loadOfflineQueue());
  readonly isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  readonly isSyncing = signal<boolean>(false);
  readonly lastError = signal<string | null>(null);
  readonly toasts = signal<ToastMessage[]>([]);

  // Navigatie-hulpsignal voor doorklikken vanuit Set Voortgang naar Collectie
  readonly requestedSetFilter = signal<string | null>(null);
  readonly requestedPokedexFilter = signal<'all' | 'missing' | 'in_collection' | 'in_binder' | 'upgrade' | null>(null);

  // Derived Computed Signals
  readonly collection = computed(() => this.snapshot().collection);
  readonly setProgress = computed(() => this.snapshot().setProgress);
  readonly activeSets = computed(() => this.setProgress().filter((s) => s.ownedUnique > 0));
  readonly pokedex = computed(() => this.snapshot().pokedex);
  readonly binderSlotsPerPage = computed(() => this.snapshot().binderSlotsPerPage);
  readonly wishlist = computed(() => this.snapshot().wishlist);
  readonly trades = computed(() => this.snapshot().trades);
  readonly settings = computed(() => this.snapshot().settings ?? DEFAULT_DROPDOWN_SETTINGS);
  readonly syncedAt = computed(() => this.snapshot().syncedAt);

  readonly portfolio = computed(() =>
    calculatePortfolioSummary(this.collection(), this.wishlist(), this.trades())
  );

  readonly pokedexStats = computed(() => {
    const all = this.pokedex();
    const total = all.length || 1025;
    const inBinder = all.filter((s) => s.inBinder).length;
    const readyForBinder = all.filter((s) => !s.inBinder && s.inCollectionCount > 0).length;
    const upgradeCount = all.filter((s) => s.upgradeWanted).length;
    const percent = Math.round((inBinder / total) * 1000) / 10;
    return { total, inBinder, readyForBinder, upgradeCount, percent };
  });

  readonly topValuableCards = computed(() => {
    return [...this.collection()]
      .sort((a, b) => b.marketPrice - a.marketPrice)
      .slice(0, 5);
  });

  readonly tradeBinderCards = computed(() => {
    return this.collection()
      .filter((c) => c.forTrade || c.quantity > 1)
      .sort((a, b) => b.marketPrice - a.marketPrice);
  });

  readonly isSheetConfigured = computed(() => {
    const cfg = this.config();
    return Boolean(cfg.webAppUrl?.trim() && cfg.apiToken?.trim());
  });

  readonly syncStatus = computed<SyncStatus>(() => {
    if (this.isSyncing()) return 'syncing';
    if (this.config().demoMode) return 'demo';
    if (!this.isSheetConfigured()) return 'unconfigured';
    if (!this.isOnline()) return 'offline';
    if (this.lastError()) return 'error';
    return 'synced';
  });

  private toastCounter = 0;

  constructor() {
    // Persist snapshot & config gescheiden per modus zodat demo-data nooit lekt naar live-modus
    effect(() => {
      const cfg = this.config();
      const snap = this.snapshot();
      if (cfg.demoMode) {
        this.cache.saveDemoSnapshot(snap);
      } else if (cfg.webAppUrl?.trim() && cfg.apiToken?.trim()) {
        this.cache.saveSnapshot(snap);
      }
    });

    effect(() => {
      this.cache.saveConfig(this.config());
    });

    effect(() => {
      this.cache.saveOfflineQueue(this.pendingQueue());
    });

    effect(() => {
      this.cache.savePackDefaults(this.packDefaults());
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline.set(true);
        this.showToast('Weer online — synchronisatie gecontroleerd.', 'info');
        void this.flushOfflineQueue();
      });
      window.addEventListener('offline', () => {
        this.isOnline.set(false);
        this.showToast('Offline-modus actief. Lokale cache blijft volledig beschikbaar.', 'warning');
      });
    }

    // Als live Google Sheets geconfigureerd is en demo-modus uit staat, haal direct verse data op
    const cfg = this.config();
    if (!cfg.demoMode && cfg.webAppUrl?.trim() && cfg.apiToken?.trim() && this.isOnline()) {
      void this.syncFromRemote(true);
    }
  }

  private loadInitialSnapshot(): AppSnapshot {
    const cfg = this.config();
    if (cfg.demoMode) {
      const demoCached = this.cache.loadDemoSnapshot();
      if (
        demoCached &&
        Array.isArray(demoCached.collection) &&
        Array.isArray(demoCached.pokedex) &&
        demoCached.pokedex.length > 0
      ) {
        return this.hydrateArtwork(demoCached);
      }
      return createDemoSnapshot();
    }

    if (!cfg.webAppUrl?.trim() || !cfg.apiToken?.trim()) {
      return createEmptySnapshot();
    }

    const liveCached = this.cache.loadSnapshot();
    if (
      liveCached &&
      Array.isArray(liveCached.collection) &&
      Array.isArray(liveCached.pokedex) &&
      liveCached.pokedex.length > 0
    ) {
      return this.applyBinderLayoutPrefIfNeeded(this.hydrateArtwork(liveCached));
    }
    return createEmptySnapshot();
  }

  private applyBinderLayoutPrefIfNeeded(snap: AppSnapshot): AppSnapshot {
    const pref = this.binderLayoutPref;
    if (!pref || snap.binderSlotsPerPage === pref.slotsPerPage) {
      return snap;
    }
    return {
      ...snap,
      binderSlotsPerPage: pref.slotsPerPage,
      pokedex: snap.pokedex.map((slot) => {
        const pos = calculateBinderPosition(slot.dexNumber, pref.slotsPerPage);
        return { ...slot, page: pos.page, position: pos.label };
      }),
    };
  }

  private reconcileRemoteSnapshot(remote: AppSnapshot): AppSnapshot {
    const hydrated = this.hydrateArtwork(remote);
    const pref = this.binderLayoutPref;
    if (!pref) return hydrated;

    const remoteSpp = hydrated.binderSlotsPerPage;

    // Geval A: Google Sheets heeft de nieuwe voorkeur nu ook doorgevoerd
    if (remoteSpp === pref.slotsPerPage) {
      if (pref.remoteAtSave !== remoteSpp) {
        this.binderLayoutPref = { ...pref, remoteAtSave: remoteSpp };
        this.cache.saveBinderLayoutPreference(this.binderLayoutPref);
      }
      return hydrated;
    }

    // Geval B: Iemand heeft cel H4 rechtstreeks in Google Sheets gewijzigd -> neem Sheet-waarde over
    if (pref.remoteAtSave !== undefined && remoteSpp !== pref.remoteAtSave) {
      this.binderLayoutPref = null;
      this.cache.saveBinderLayoutPreference(null);
      return hydrated;
    }

    // Geval C: Oud Apps Script / H4-validatie negeerde de nieuwe indeling en stuurde oude waarde terug -> behoud lokale keuze
    return this.applyBinderLayoutPrefIfNeeded(hydrated);
  }

  private hydrateArtwork(snap: AppSnapshot): AppSnapshot {
    return {
      ...snap,
      collection: snap.collection.map((c) => ({
        ...c,
        imageUrl: c.imageUrl || this.catalog.getCachedArtworkUrl(c.cardId) || buildTcgdexAssetUrl(c.cardId, 'high'),
      })),
      wishlist: snap.wishlist.map((w) => ({
        ...w,
        imageUrl:
          w.imageUrl ||
          (w.cardId ? this.catalog.getCachedArtworkUrl(w.cardId) || buildTcgdexAssetUrl(w.cardId, 'high') : undefined),
      })),
    };
  }

  // ==========================================================================
  // CONFIGURATIE & SYNCHRONISATIE
  // ==========================================================================

  updateConfig(partial: Partial<AppConnectionConfig>): void {
    const prev = this.config();
    const next = { ...prev, ...partial };
    const hasSheet = Boolean(next.webAppUrl?.trim() && next.apiToken?.trim());
    this.config.set(next);

    if (partial.demoMode === true && !prev.demoMode) {
      const demoCached = this.cache.loadDemoSnapshot();
      this.snapshot.set(demoCached ? this.hydrateArtwork(demoCached) : createDemoSnapshot());
      this.lastError.set(null);
      this.showToast('Demo-modus ingeschakeld met voorbeeldcollectie.', 'info');
    } else if (!next.demoMode && !hasSheet) {
      // Geen spreadsheet gekoppeld -> geen demodata tonen, maar schone lege staat
      this.snapshot.set(createEmptySnapshot());
      this.lastError.set(null);
      if (partial.demoMode === false && prev.demoMode) {
        this.showToast(
          'Demo-modus uitgeschakeld. Koppel hieronder je Google Sheet om je eigen collectie te laden.',
          'info'
        );
      }
    } else if (partial.demoMode === false && prev.demoMode && hasSheet) {
      const liveCached = this.cache.loadSnapshot();
      this.snapshot.set(liveCached ? this.hydrateArtwork(liveCached) : createEmptySnapshot());
      void this.syncFromRemote();
    }
  }

  updatePackDefaults(partial: Partial<PackOpeningDefaults>): void {
    this.packDefaults.update((prev) => ({ ...prev, ...partial }));
  }

  async testConnection(overrideConfig?: AppConnectionConfig): Promise<ConnectionTestResult> {
    const cfg = overrideConfig ?? this.config();
    return this.repo.testConnection(cfg);
  }

  async syncFromRemote(silent = false): Promise<boolean> {
    const cfg = this.config();
    if (cfg.demoMode) {
      this.snapshot.update((s) => ({ ...s, syncedAt: new Date().toISOString() }));
      if (!silent) this.showToast('Demo-snapshot bijgewerkt.', 'info');
      return true;
    }

    if (!cfg.webAppUrl || !cfg.apiToken) {
      if (!silent) this.showToast('Vul eerst je Web App URL en API-token in bij Instellingen.', 'warning');
      return false;
    }

    if (!this.isOnline()) {
      if (!silent) this.showToast('Offline: kan nu niet verbinden met Google Sheets.', 'warning');
      return false;
    }

    this.isSyncing.set(true);
    this.lastError.set(null);
    try {
      await this.flushOfflineQueue(true);
      const remote = await this.repo.bootstrap(cfg);
      this.snapshot.set(this.reconcileRemoteSnapshot(remote));
      if (!silent) this.showToast('Google Sheets succesvol gesynchroniseerd!', 'success');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Synchronisatie mislukt.';
      this.lastError.set(msg);
      if (!silent) this.showToast(msg, 'error');
      return false;
    } finally {
      this.isSyncing.set(false);
    }
  }

  async refreshPrices(): Promise<void> {
    const cfg = this.config();
    this.isSyncing.set(true);
    try {
      if (cfg.demoMode) {
        // In demo-modus verversen we direct live EUR-prijzen via TCGdex voor maximaal 12 kaarten!
        const cards = this.collection();
        let updated = 0;
        const nextCollection = [...cards];
        for (let i = 0; i < Math.min(cards.length, 12); i++) {
          const card = cards[i];
          const live = await this.catalog.getCardByExactId(card.cardId);
          if (live && live.marketPriceEur > 0) {
            nextCollection[i] = {
              ...card,
              marketPrice: live.marketPriceEur,
              trendPercent: live.trendPercent ?? card.trendPercent,
              imageUrl: live.imageUrl || card.imageUrl,
            };
            updated++;
          }
        }
        this.applyLocalSnapshotUpdate({ collection: nextCollection });
        this.showToast(`Cardmarket prijzen ververst (${updated} kaarten via TCGdex).`, 'success');
        return;
      }

      if (!this.isOnline()) {
        this.showToast('Offline: prijzen verversen vereist een internetverbinding.', 'warning');
        return;
      }

      const result = await this.repo.refreshPrices(cfg);
      this.snapshot.set(this.reconcileRemoteSnapshot(result.snapshot));
      this.showToast(`${result.updated} van ${result.total} kaartprijzen bijgewerkt in Google Sheets.`, 'success');
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : 'Prijzen verversen mislukt.', 'error');
    } finally {
      this.isSyncing.set(false);
    }
  }

  clearOfflineCache(): void {
    this.cache.clearDataCaches();
    this.pendingQueue.set([]);
    if (this.config().demoMode) {
      this.snapshot.set(createDemoSnapshot());
    } else if (!this.isSheetConfigured()) {
      this.snapshot.set(createEmptySnapshot());
    }
    this.showToast('Offline-cache geleegd.', 'info');
  }

  getEstimatedCacheKb(): number {
    return this.cache.getEstimatedCacheSizeKb();
  }

  // ==========================================================================
  // COLLECTIE MUTATIES (OPTIMISTISCHE UI + OFFLINE QUEUE)
  // ==========================================================================

  async addCard(payload: AddCardPayload): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const nextRowIndex = this.getNextLocalRowIndex(this.collection().map((c) => c.rowIndex));
    const newCard: CollectionCard = {
      rowIndex: nextRowIndex,
      cardId: (payload.cardId ?? '').trim(),
      name: (payload.name ?? '').trim(),
      setName: (payload.setName ?? '').trim(),
      cardNumber: (payload.cardNumber ?? '').trim(),
      language: payload.language ?? 'EN',
      type: payload.type ?? 'Colorless',
      rarity: payload.rarity ?? 'Rare',
      variant: payload.variant ?? 'Normal',
      condition: payload.condition ?? 'Near Mint (NM)',
      grading: payload.grading ?? 'Raw',
      grade: payload.grade ?? '',
      quantity: Math.max(1, payload.quantity ?? 1),
      storageLocation: payload.storageLocation ?? 'Hoofdbinder',
      binderDetail: payload.binderDetail ?? '',
      purchaseDate: payload.purchaseDate ?? today,
      purchasePrice: roundCurrency(payload.purchasePrice ?? 0),
      marketPrice: roundCurrency(payload.marketPrice ?? 0),
      imageUrl: payload.imageUrl || buildTcgdexAssetUrl(payload.cardId ?? '', 'high'),
      trendPercent: payload.trendPercent,
      forTrade: Boolean(payload.forTrade),
      notes: payload.notes ?? '',
    };

    const nextCollection = [newCard, ...this.collection()];
    this.applyLocalSnapshotUpdate({
      collection: nextCollection,
      addedSetMeta:
        newCard.setName && payload.setTotalCards
          ? {
              setName: newCard.setName,
              series: payload.seriesName || 'Pokémon TCG',
              totalCards: payload.setTotalCards,
            }
          : undefined,
    });

    await this.dispatchRemoteMutation(
      'addCard',
      payload as Record<string, unknown>,
      `Kaart toevoegen: ${newCard.name}`,
      () => this.repo.addCard(this.config(), payload)
    );

    this.showToast(`${newCard.name} opgeslagen & Pokédex gesynct!`, 'success');
  }

  async updateCard(
    rowIndex: number,
    cardId: string,
    patch: Partial<CollectionCard>
  ): Promise<void> {
    const nextCollection = this.collection().map((card) =>
      card.rowIndex === rowIndex && card.cardId === cardId ? { ...card, ...patch } : card
    );
    this.applyLocalSnapshotUpdate({ collection: nextCollection });

    const payload = { rowIndex, cardId, ...patch };
    await this.dispatchRemoteMutation(
      'updateCard',
      payload as Record<string, unknown>,
      `Kaart bijwerken: ${cardId}`,
      () => this.repo.updateCard(this.config(), payload)
    );
  }

  async incrementExistingCard(card: CollectionCard, delta = 1): Promise<void> {
    const nextQty = Math.max(1, card.quantity + delta);
    await this.updateCard(card.rowIndex, card.cardId, { quantity: nextQty });
    this.showToast(`${card.name} bijgewerkt naar ${nextQty}×.`, 'success');
  }

  async deleteCard(card: CollectionCard): Promise<void> {
    const nextCollection = this.collection().filter(
      (c) => !(c.rowIndex === card.rowIndex && c.cardId === card.cardId)
    );
    this.applyLocalSnapshotUpdate({ collection: nextCollection });

    const payload = { rowIndex: card.rowIndex, cardId: card.cardId };
    await this.dispatchRemoteMutation(
      'deleteCard',
      payload,
      `Kaart verwijderen: ${card.name}`,
      () => this.repo.deleteCard(this.config(), payload)
    );
    this.showToast(`${card.name} verwijderd uit collectie.`, 'info');
  }

  // ==========================================================================
  // POKÉDEX BINDER MUTATIES
  // ==========================================================================

  async updatePokedexSlot(payload: UpdatePokedexSlotPayload): Promise<void> {
    const current = this.snapshot();
    const nextSpp: BinderSlotsPerPage = payload.slotsPerPage ?? current.binderSlotsPerPage;

    if (payload.slotsPerPage !== undefined && !this.config().demoMode) {
      const lastKnownRemote =
        this.binderLayoutPref?.remoteAtSave !== undefined
          ? this.binderLayoutPref.remoteAtSave
          : current.binderSlotsPerPage;
      this.binderLayoutPref = {
        slotsPerPage: payload.slotsPerPage,
        remoteAtSave: lastKnownRemote,
      };
      this.cache.saveBinderLayoutPreference(this.binderLayoutPref);
    }

    const nextPokedex: PokedexSlot[] = current.pokedex.map((slot) => {
      const pos = calculateBinderPosition(slot.dexNumber, nextSpp);
      const isTarget = payload.dexNumber !== undefined && slot.dexNumber === payload.dexNumber;
      const inBinder = isTarget && payload.inBinder !== undefined ? payload.inBinder : slot.inBinder;
      const selectedCard = isTarget && payload.selectedCard !== undefined ? payload.selectedCard : slot.selectedCard;
      const upgradeWanted =
        isTarget && payload.upgradeWanted !== undefined ? payload.upgradeWanted : slot.upgradeWanted;

      let status = 'Ontbrekend';
      if (inBinder && upgradeWanted) status = 'Upgrade gewenst';
      else if (inBinder) status = 'In Binder';
      else if (slot.inCollectionCount > 0) status = 'In Collectie';

      return {
        ...slot,
        inBinder,
        selectedCard,
        upgradeWanted,
        status,
        page: pos.page,
        position: pos.label,
      };
    });

    this.snapshot.set({
      ...current,
      binderSlotsPerPage: nextSpp,
      pokedex: nextPokedex,
      syncedAt: new Date().toISOString(),
    });

    await this.dispatchRemoteMutation(
      'updatePokedexSlot',
      payload as Record<string, unknown>,
      payload.dexNumber ? `Pokédex #${payload.dexNumber} bijwerken` : `Binder layout: ${nextSpp} vakjes`,
      () => this.repo.updatePokedexSlot(this.config(), payload)
    );
  }

  getCardsForPokemon(pokemonName: string): CollectionCard[] {
    return this.collection().filter((c) => doesCardMatchPokemon(c.name, pokemonName));
  }

  // ==========================================================================
  // VERLANGLIJST & RUIL/VERKOOP MUTATIES
  // ==========================================================================

  async addWishlistItem(item: Omit<WishlistItem, 'rowIndex' | 'found'>): Promise<void> {
    const nextRow = this.getNextLocalRowIndex(this.wishlist().map((w) => w.rowIndex));
    const newItem: WishlistItem = {
      ...item,
      rowIndex: nextRow,
      found: false,
      imageUrl: item.imageUrl || (item.cardId ? buildTcgdexAssetUrl(item.cardId, 'high') : undefined),
    };

    this.snapshot.update((snap) => ({
      ...snap,
      wishlist: [newItem, ...snap.wishlist],
      syncedAt: new Date().toISOString(),
    }));

    await this.dispatchRemoteMutation(
      'addWishlist',
      item as Record<string, unknown>,
      `Verlanglijst: ${item.cardName}`,
      () => this.repo.addWishlist(this.config(), item)
    );
    this.showToast(`${item.cardName} toegevoegd aan Verlanglijst.`, 'success');
  }

  async markWishlistFound(item: WishlistItem, addToCollection: boolean, purchasePrice?: number): Promise<void> {
    const nextWishlist = this.wishlist().map((w) =>
      w.rowIndex === item.rowIndex && w.cardName === item.cardName ? { ...w, found: true } : w
    );

    const cardPayload: AddCardPayload | undefined = addToCollection
      ? {
          cardId: item.cardId || `custom-${Date.now()}`,
          name: item.cardName,
          setName: item.setName,
          cardNumber: item.cardNumber,
          language: 'EN',
          type: 'Colorless',
          rarity: 'Rare',
          variant: item.desiredVariant || 'Normal',
          condition: item.minCondition || 'Near Mint (NM)',
          grading: 'Raw',
          grade: '',
          quantity: 1,
          storageLocation: 'Hoofdbinder',
          binderDetail: 'Vanuit Verlanglijst',
          purchasePrice: purchasePrice ?? item.marketPrice,
          marketPrice: item.marketPrice,
          imageUrl: item.imageUrl,
          forTrade: false,
          notes: item.notes,
        }
      : undefined;

    if (cardPayload) {
      const nextCollection: CollectionCard[] = [
        {
          rowIndex: this.getNextLocalRowIndex(this.collection().map((c) => c.rowIndex)),
          cardId: cardPayload.cardId!,
          name: cardPayload.name!,
          setName: cardPayload.setName!,
          cardNumber: cardPayload.cardNumber!,
          language: cardPayload.language!,
          type: cardPayload.type!,
          rarity: cardPayload.rarity!,
          variant: cardPayload.variant!,
          condition: cardPayload.condition!,
          grading: cardPayload.grading!,
          grade: '',
          quantity: 1,
          storageLocation: cardPayload.storageLocation!,
          binderDetail: cardPayload.binderDetail!,
          purchaseDate: new Date().toISOString().slice(0, 10),
          purchasePrice: cardPayload.purchasePrice ?? 0,
          marketPrice: cardPayload.marketPrice ?? 0,
          imageUrl: cardPayload.imageUrl,
          forTrade: false,
          notes: cardPayload.notes ?? '',
        },
        ...this.collection(),
      ];
      this.applyLocalSnapshotUpdate({ collection: nextCollection, wishlist: nextWishlist });
    } else {
      this.snapshot.update((s) => ({ ...s, wishlist: nextWishlist, syncedAt: new Date().toISOString() }));
    }

    const payload: MarkWishlistFoundPayload = {
      rowIndex: item.rowIndex,
      cardName: item.cardName,
      addToCollection,
      cardPayload,
    };

    await this.dispatchRemoteMutation(
      'markWishlistFound',
      payload as unknown as Record<string, unknown>,
      `Gevonden: ${item.cardName}`,
      () => this.repo.markWishlistFound(this.config(), payload)
    );

    this.showToast(
      addToCollection
        ? `${item.cardName} gemarkeerd als gevonden én toegevoegd aan je Collectie!`
        : `${item.cardName} afgevinkt op Verlanglijst.`,
      'success'
    );
  }

  async logTrade(entry: Omit<TradeEntry, 'rowIndex' | 'netResult'>): Promise<void> {
    const netResult = roundCurrency(entry.saleValue - entry.purchasePrice - entry.platformFees);
    const newEntry: TradeEntry = {
      ...entry,
      rowIndex: this.getNextLocalRowIndex(this.trades().map((t) => t.rowIndex), 22),
      netResult,
    };

    this.snapshot.update((snap) => ({
      ...snap,
      trades: [newEntry, ...snap.trades],
      syncedAt: new Date().toISOString(),
    }));

    await this.dispatchRemoteMutation(
      'logTrade',
      entry as Record<string, unknown>,
      `Transactie: ${entry.cardName}`,
      () => this.repo.logTrade(this.config(), entry)
    );
    this.showToast(`Transactie voor ${entry.cardName} gelogd.`, 'success');
  }

  // ==========================================================================
  // OFFLINE QUEUE & TOASTS
  // ==========================================================================

  async flushOfflineQueue(silent = false): Promise<void> {
    const cfg = this.config();
    if (cfg.demoMode || !this.isOnline() || !cfg.webAppUrl || !cfg.apiToken) return;
    const queue = this.pendingQueue();
    if (!queue.length) return;

    const remaining: PendingMutation[] = [];
    for (const item of queue) {
      try {
        let updatedSnap: AppSnapshot | null = null;
        switch (item.action) {
          case 'addCard':
            updatedSnap = await this.repo.addCard(cfg, item.payload as AddCardPayload);
            break;
          case 'updateCard':
            updatedSnap = await this.repo.updateCard(cfg, item.payload as Partial<CollectionCard>);
            break;
          case 'deleteCard':
            updatedSnap = await this.repo.deleteCard(cfg, item.payload as { rowIndex?: number; cardId?: string });
            break;
          case 'updatePokedexSlot':
            updatedSnap = await this.repo.updatePokedexSlot(cfg, item.payload as UpdatePokedexSlotPayload);
            break;
          case 'addWishlist':
            updatedSnap = await this.repo.addWishlist(
              cfg,
              item.payload as unknown as Omit<WishlistItem, 'rowIndex' | 'found'>
            );
            break;
          case 'markWishlistFound':
            updatedSnap = await this.repo.markWishlistFound(
              cfg,
              item.payload as unknown as MarkWishlistFoundPayload
            );
            break;
          case 'logTrade':
            updatedSnap = await this.repo.logTrade(
              cfg,
              item.payload as unknown as Omit<TradeEntry, 'rowIndex' | 'netResult'>
            );
            break;
        }
        if (updatedSnap) {
          this.snapshot.set(this.reconcileRemoteSnapshot(updatedSnap));
        }
      } catch {
        remaining.push(item);
      }
    }

    this.pendingQueue.set(remaining);
    if (!silent && remaining.length === 0) {
      this.showToast(`${queue.length} offline wijziging(en) gesynchroniseerd met Google Sheets!`, 'success');
    }
  }

  showToast(text: string, tone: ToastMessage['tone'] = 'info'): void {
    const id = ++this.toastCounter;
    this.toasts.update((list) => [...list.slice(-2), { id, text, tone }]);
    setTimeout(() => {
      this.toasts.update((list) => list.filter((t) => t.id !== id));
    }, 3400);
  }

  dismissToast(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  // ==========================================================================
  // INTERNE HELPERS
  // ==========================================================================

  private applyLocalSnapshotUpdate(changes: {
    collection?: CollectionCard[];
    wishlist?: WishlistItem[];
    addedSetMeta?: { setName: string; series: string; totalCards: number };
  }): void {
    const current = this.snapshot();
    const nextCollection = changes.collection ?? current.collection;
    const nextWishlist = changes.wishlist ?? current.wishlist;

    const existingSetSeeds = current.setProgress.map((s) => ({
      setName: s.setName,
      setCode: s.setCode,
      series: s.series,
      totalCards: s.totalCards,
    }));
    if (changes.addedSetMeta) {
      const exists = existingSetSeeds.some(
        (s) => s.setName.toLowerCase() === changes.addedSetMeta!.setName.toLowerCase()
      );
      if (!exists) {
        existingSetSeeds.push({ ...changes.addedSetMeta, setCode: undefined });
      }
    }

    const nextSetProgress = buildSetProgressFromCollection(nextCollection, existingSetSeeds);
    const nextPokedex = buildPokedexFromCollection(nextCollection, current.binderSlotsPerPage, {
      existingSlots: current.pokedex,
    });

    this.snapshot.set({
      ...current,
      collection: nextCollection,
      wishlist: nextWishlist,
      setProgress: nextSetProgress,
      pokedex: nextPokedex,
      syncedAt: new Date().toISOString(),
    });
  }

  private async dispatchRemoteMutation(
    action: PendingMutation['action'],
    payload: Record<string, unknown>,
    description: string,
    remoteCall: () => Promise<AppSnapshot>
  ): Promise<void> {
    const cfg = this.config();
    if (cfg.demoMode) return;

    if (!cfg.webAppUrl || !cfg.apiToken) return;

    if (!this.isOnline()) {
      this.enqueueMutation(action, payload, description);
      this.showToast('Offline opgeslagen in wachtrij — wordt gesynct zodra je online bent.', 'warning');
      return;
    }

    this.isSyncing.set(true);
    this.lastError.set(null);
    try {
      const updated = await remoteCall();
      this.snapshot.set(this.reconcileRemoteSnapshot(updated));
    } catch (err) {
      this.enqueueMutation(action, payload, description);
      const msg = err instanceof Error ? err.message : 'Kon wijziging niet direct naar Sheets sturen.';
      this.lastError.set(msg);
      this.showToast('Lokaal bijgewerkt; opgeslagen in sync-wachtrij.', 'warning');
    } finally {
      this.isSyncing.set(false);
    }
  }

  private enqueueMutation(
    action: PendingMutation['action'],
    payload: Record<string, unknown>,
    description: string
  ): void {
    this.pendingQueue.update((q) => [
      ...q,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        action,
        payload,
        description,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  private getNextLocalRowIndex(existing: number[], startAt = 2): number {
    return existing.length ? Math.max(...existing, startAt - 1) + 1 : startAt;
  }

  formatChoiceForCard(card: CollectionCard): string {
    return formatBinderChoice(card);
  }
}
