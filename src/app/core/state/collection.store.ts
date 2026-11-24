import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  buildTcgdexAssetUrl,
  getDisplaySetCode,
  inferCardIdFromSetAndNumber,
  resolveCardArtworkUrl,
} from '../domain/card-id.utils';
import {
  calculateBinderPosition,
  calculatePortfolioSummary,
  roundCurrency,
} from '../domain/card-math.utils';
import {
  AppConnectionConfig,
  AppSnapshot,
  BinderSlotsPerPage,
  CatalogSetSummary,
  CollectionCard,
  DEFAULT_DROPDOWN_SETTINGS,
  PendingMutation,
  PokedexSlot,
  SetProgress,
  SheetProfile,
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
  UpdateWishlistPayload,
} from '../ports/collection-repository.port';
import {
  buildPokedexFromCollection,
  buildSetProgressFromCollection,
  createDemoSnapshot,
  createEmptySnapshot,
} from '../adapters/demo-data';
import { LocalCacheAdapter, PackOpeningDefaults } from '../adapters/local-cache.adapter';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'demo' | 'unconfigured' | 'error';

const WISHLIST_ARTWORK_CACHE_KEY = 'pokebinder_wishlist_artwork_v1';

@Injectable({ providedIn: 'root' })
export class CollectionStore {
  private readonly repo = inject(COLLECTION_REPOSITORY);
  private readonly catalog = inject(CARD_CATALOG_PORT);
  private readonly cache = inject(LocalCacheAdapter);

  private deviceBinderLayout: BinderSlotsPerPage | null = this.cache.loadBinderLayoutPreference();
  private localRevision = 0;
  private mutationChain: Promise<void> = Promise.resolve();
  private activeSyncCount = 0;
  private tempRowCounter = 0;
  private setsCatalogCache: CatalogSetSummary[] = [];
  private wishlistArtworkCache: Record<string, { cardId?: string; imageUrl?: string }> =
    this.loadWishlistArtworkCache();
  private wishlistLookupAttempted = new Set<string>();
  private isHydratingWishlist = false;

  // Core Reactive Signals
  readonly config = signal<AppConnectionConfig>(this.cache.loadConfig());
  readonly snapshot = signal<AppSnapshot>(this.loadInitialSnapshot());
  readonly packDefaults = signal<PackOpeningDefaults>(this.cache.loadPackDefaults());
  readonly pendingQueue = signal<PendingMutation[]>(this.cache.loadOfflineQueue());
  readonly isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  readonly isSyncing = signal<boolean>(false);
  readonly lastError = signal<string | null>(null);
  readonly toasts = signal<ToastMessage[]>([]);

  // Navigatie-hulpsignal voor doorklikken vanuit Set Voortgang & Dashboard
  readonly requestedSetFilter = signal<string | null>(null);
  readonly requestedPokedexFilter = signal<'all' | 'missing' | 'in_collection' | 'in_binder' | 'upgrade' | null>(null);
  readonly requestedPokedexGen = signal<number | null>(null);
  readonly requestedQuickAddSearch = signal<{ mode: 'code' | 'name'; query: string } | null>(null);

  // Derived Computed Signals
  readonly collection = computed(() => this.snapshot().collection);
  readonly setProgress = computed(() => this.snapshot().setProgress);
  readonly activeSets = computed(() => this.setProgress().filter((s) => s.ownedUnique > 0));
  readonly pokedex = computed(() => this.snapshot().pokedex);
  readonly binderSlotsPerPage = computed(() => this.snapshot().binderSlotsPerPage);
  readonly wishlist = computed(() => this.snapshot().wishlist);
  readonly trades = computed(() => this.snapshot().trades);
  readonly settings = computed(() => {
    const remote = this.snapshot().settings;
    return {
      ...DEFAULT_DROPDOWN_SETTINGS,
      ...remote,
      acquisitionMethods:
        remote?.acquisitionMethods && remote.acquisitionMethods.length > 0
          ? remote.acquisitionMethods
          : DEFAULT_DROPDOWN_SETTINGS.acquisitionMethods,
    };
  });
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

  readonly sheetProfiles = computed<SheetProfile[]>(() => this.config().profiles ?? []);

  readonly activeProfile = computed<SheetProfile | null>(() => {
    const id = this.config().activeProfileId;
    if (!id) return null;
    return this.sheetProfiles().find((p) => p.id === id) ?? null;
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
    // Persist snapshot & config gescheiden per modus én per profiel zodat test/live nooit door elkaar lekken
    effect(() => {
      const cfg = this.config();
      const snap = this.snapshot();
      if (cfg.demoMode) {
        this.cache.saveDemoSnapshot(snap);
      } else if (cfg.webAppUrl?.trim() && cfg.apiToken?.trim()) {
        this.cache.saveSnapshot(snap, cfg.activeProfileId);
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
        return this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(demoCached)));
      }
      return this.applyDeviceBinderLayout(createDemoSnapshot());
    }

    if (!cfg.webAppUrl?.trim() || !cfg.apiToken?.trim()) {
      return this.applyDeviceBinderLayout(createEmptySnapshot());
    }

    const liveCached = this.cache.loadSnapshot(cfg.activeProfileId);
    if (
      liveCached &&
      Array.isArray(liveCached.collection) &&
      Array.isArray(liveCached.pokedex) &&
      liveCached.pokedex.length > 0
    ) {
      return this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(liveCached)));
    }
    return this.applyDeviceBinderLayout(createEmptySnapshot());
  }

  private applyDeviceBinderLayout(snap: AppSnapshot): AppSnapshot {
    const spp = this.deviceBinderLayout;
    if (!spp || snap.binderSlotsPerPage === spp) {
      return snap;
    }
    return {
      ...snap,
      binderSlotsPerPage: spp,
      pokedex: snap.pokedex.map((slot) => {
        const pos = calculateBinderPosition(slot.dexNumber, spp);
        return { ...slot, page: pos.page, position: pos.label };
      }),
    };
  }

  private reconcileRemoteSnapshot(remote: AppSnapshot): AppSnapshot {
    const currentWishlist = this.snapshot?.()?.wishlist;
    return this.reconcileSetProgress(
      this.applyDeviceBinderLayout(this.hydrateArtwork(remote, currentWishlist))
    );
  }

  private hydrateArtwork(snap: AppSnapshot, previousWishlist?: WishlistItem[]): AppSnapshot {
    return {
      ...snap,
      collection: snap.collection.map((c) => ({
        ...c,
        imageUrl:
          c.imageUrl ||
          (c.cardId ? this.catalog.getCachedArtworkUrl(c.cardId) || resolveCardArtworkUrl(c.cardId, undefined, 'high') : undefined),
      })),
      wishlist: snap.wishlist.map((w) => {
        const key = this.wishlistCacheKey(w);
        const prevMatch = previousWishlist?.find(
          (p) => (w.rowIndex >= 2 && p.rowIndex === w.rowIndex) || this.wishlistCacheKey(p) === key
        );
        const cached = this.wishlistArtworkCache[key];

        const resolvedCardId =
          w.cardId?.trim() ||
          prevMatch?.cardId?.trim() ||
          cached?.cardId ||
          inferCardIdFromSetAndNumber(w.setName, w.cardNumber, this.setsCatalogCache) ||
          undefined;

        const resolvedImageUrl =
          w.imageUrl?.trim() ||
          prevMatch?.imageUrl?.trim() ||
          cached?.imageUrl ||
          (resolvedCardId
            ? this.catalog.getCachedArtworkUrl(resolvedCardId) || resolveCardArtworkUrl(resolvedCardId, undefined, 'high')
            : undefined);

        return {
          ...w,
          cardId: resolvedCardId,
          imageUrl: resolvedImageUrl,
        };
      }),
    };
  }

  private reconcileSetProgress(snap: AppSnapshot): AppSnapshot {
    const collectionBySet = new Map<string, CollectionCard[]>();
    for (const c of snap.collection) {
      const key = c.setName.trim().toLowerCase();
      if (!key) continue;
      const bucket = collectionBySet.get(key);
      if (bucket) bucket.push(c);
      else collectionBySet.set(key, [c]);
    }

    const seenKeys = new Set<string>();
    const reconciled: SetProgress[] = snap.setProgress.map((s) => {
      const key = s.setName.trim().toLowerCase();
      seenKeys.add(key);
      const cardsInSet = collectionBySet.get(key) ?? [];
      const setCode =
        s.setCode ||
        (cardsInSet[0]?.cardId ? getDisplaySetCode(cardsInSet[0].cardId, s.setName) : undefined);

      if (cardsInSet.length === 0) {
        return { ...s, setCode };
      }

      const uniqueIds = new Set(
        cardsInSet.map((c) => (c.cardId || `${c.name}-${c.cardNumber}`).toLowerCase())
      );
      const computedOwned = uniqueIds.size;
      const computedValue = roundCurrency(
        cardsInSet.reduce((sum, c) => sum + (c.marketPrice || 0) * Math.max(1, c.quantity || 1), 0)
      );

      const ownedUnique = s.ownedUnique > 0 ? s.ownedUnique : computedOwned;
      const totalCards = Math.max(s.totalCards, ownedUnique);
      const remaining = Math.max(0, totalCards - ownedUnique);
      const progressPercent =
        s.ownedUnique > 0 && s.progressPercent > 0
          ? s.progressPercent
          : totalCards > 0
            ? Math.round((ownedUnique / totalCards) * 1000) / 10
            : 0;
      const totalSetValue = computedValue > 0 ? computedValue : s.totalSetValue;

      return {
        ...s,
        setCode,
        ownedUnique,
        totalCards,
        remaining,
        progressPercent,
        totalSetValue,
      };
    });

    for (const [key, cardsInSet] of collectionBySet.entries()) {
      if (seenKeys.has(key) || cardsInSet.length === 0) continue;
      const sample = cardsInSet[0];
      const uniqueIds = new Set(
        cardsInSet.map((c) => (c.cardId || `${c.name}-${c.cardNumber}`).toLowerCase())
      );
      const ownedUnique = uniqueIds.size;
      const denom = parseInt((sample.cardNumber.split('/')[1] || '0').replace(/\D/g, ''), 10) || 100;
      const totalCards = Math.max(denom, ownedUnique);
      const totalSetValue = roundCurrency(
        cardsInSet.reduce((sum, c) => sum + (c.marketPrice || 0) * Math.max(1, c.quantity || 1), 0)
      );
      reconciled.push({
        setName: sample.setName.trim(),
        setCode: sample.cardId ? getDisplaySetCode(sample.cardId, sample.setName) : undefined,
        series: 'Pokémon TCG',
        totalCards,
        ownedUnique,
        remaining: Math.max(0, totalCards - ownedUnique),
        progressPercent: totalCards > 0 ? Math.round((ownedUnique / totalCards) * 1000) / 10 : 0,
        totalSetValue,
      });
    }

    return {
      ...snap,
      setProgress: reconciled,
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
      this.bumpLocalRevision();
      const demoCached = this.cache.loadDemoSnapshot();
      this.snapshot.set(
        demoCached
          ? this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(demoCached)))
          : this.applyDeviceBinderLayout(createDemoSnapshot())
      );
      this.lastError.set(null);
      this.showToast('Demo-modus ingeschakeld met voorbeeldcollectie.', 'info');
    } else if (!next.demoMode && !hasSheet) {
      this.bumpLocalRevision();
      // Geen spreadsheet gekoppeld -> geen demodata tonen, maar schone lege staat
      this.snapshot.set(this.applyDeviceBinderLayout(createEmptySnapshot()));
      this.lastError.set(null);
      if (partial.demoMode === false && prev.demoMode) {
        this.showToast(
          'Demo-modus uitgeschakeld. Koppel hieronder je Google Sheet om je eigen collectie te laden.',
          'info'
        );
      }
    } else if (partial.demoMode === false && prev.demoMode && hasSheet) {
      this.bumpLocalRevision();
      const liveCached = this.cache.loadSnapshot(next.activeProfileId);
      this.snapshot.set(
        liveCached
          ? this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(liveCached)))
          : this.applyDeviceBinderLayout(createEmptySnapshot())
      );
      void this.syncFromRemote();
    }
  }

  /**
   * Slaat een spreadsheet-profiel op (nieuw of bestaand) met eigen cache-isolatie (bijv. Remco Test vs Mel Live).
   */
  saveSheetProfile(
    input: Omit<SheetProfile, 'id'> & { id?: string },
    options: { activate?: boolean; disableDemo?: boolean } = {}
  ): SheetProfile {
    const prev = this.config();
    const list = [...(prev.profiles ?? [])];
    const cleanId = input.id?.trim() || `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const profile: SheetProfile = {
      id: cleanId,
      name: input.name.trim() || (input.role === 'test' ? 'Test Spreadsheet' : 'Live Spreadsheet'),
      role: input.role,
      webAppUrl: input.webAppUrl.trim(),
      apiToken: input.apiToken.trim(),
      monthlyBudget: input.monthlyBudget ?? prev.monthlyBudget,
    };

    const existingIdx = list.findIndex((p) => p.id === profile.id);
    if (existingIdx >= 0) {
      list[existingIdx] = profile;
    } else {
      list.push(profile);
    }

    const activate = options.activate !== false;
    if (activate) {
      const switched = prev.activeProfileId !== profile.id;
      if (switched) {
        this.bumpLocalRevision();
        this.pendingQueue.set([]);
      }
      this.lastError.set(null);

      const nextDemo = options.disableDemo ? false : prev.demoMode;
      this.config.set({
        ...prev,
        profiles: list,
        activeProfileId: profile.id,
        webAppUrl: profile.webAppUrl,
        apiToken: profile.apiToken,
        monthlyBudget: profile.monthlyBudget ?? prev.monthlyBudget,
        demoMode: nextDemo,
      });

      if (switched && !nextDemo) {
        const cached = this.cache.loadSnapshot(profile.id);
        this.snapshot.set(
          cached
            ? this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(cached)))
            : this.applyDeviceBinderLayout(createEmptySnapshot())
        );
      }
    } else {
      this.config.set({
        ...prev,
        profiles: list,
      });
    }

    return profile;
  }

  /**
   * Schakelt direct over naar een opgeslagen spreadsheet-profiel (bijv. van Test naar Mel Live)
   * zonder dat oude testdata of wachtrij-items meelekken.
   */
  async switchSheetProfile(profileId: string): Promise<boolean> {
    const prev = this.config();
    const profile = (prev.profiles ?? []).find((p) => p.id === profileId);
    if (!profile) return false;

    const changedProfile = prev.activeProfileId !== profile.id;
    this.lastError.set(null);
    if (changedProfile) {
      this.bumpLocalRevision();
      this.pendingQueue.set([]);
    }

    this.config.set({
      ...prev,
      activeProfileId: profile.id,
      webAppUrl: profile.webAppUrl,
      apiToken: profile.apiToken,
      monthlyBudget: profile.monthlyBudget ?? prev.monthlyBudget,
      demoMode: false,
    });

    const cached = this.cache.loadSnapshot(profile.id);
    this.snapshot.set(
      cached
        ? this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(cached)))
        : this.applyDeviceBinderLayout(createEmptySnapshot())
    );

    this.showToast(
      `Overgeschakeld naar ${profile.name} (${profile.role === 'test' ? 'Test' : 'Live'}).`,
      'info'
    );
    return this.syncFromRemote(true);
  }

  /**
   * Verwijdert een spreadsheet-profiel inclusief diens eigen snapshot-cache.
   */
  deleteSheetProfile(profileId: string): void {
    const prev = this.config();
    const remaining = (prev.profiles ?? []).filter((p) => p.id !== profileId);
    this.cache.removeProfileSnapshot(profileId);

    if (prev.activeProfileId === profileId) {
      this.bumpLocalRevision();
      this.pendingQueue.set([]);
      this.lastError.set(null);

      const fallback = remaining[0];
      if (fallback) {
        this.config.set({
          ...prev,
          profiles: remaining,
          activeProfileId: fallback.id,
          webAppUrl: fallback.webAppUrl,
          apiToken: fallback.apiToken,
          monthlyBudget: fallback.monthlyBudget ?? prev.monthlyBudget,
        });
        if (!prev.demoMode) {
          const cached = this.cache.loadSnapshot(fallback.id);
          this.snapshot.set(
            cached
              ? this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(cached)))
              : this.applyDeviceBinderLayout(createEmptySnapshot())
          );
          void this.syncFromRemote(true);
        }
      } else {
        this.config.set({
          ...prev,
          profiles: remaining,
          activeProfileId: undefined,
          webAppUrl: '',
          apiToken: '',
        });
        if (!prev.demoMode) {
          this.snapshot.set(this.applyDeviceBinderLayout(createEmptySnapshot()));
        }
      }
    } else {
      this.config.set({
        ...prev,
        profiles: remaining,
      });
    }
  }

  updatePackDefaults(partial: Partial<PackOpeningDefaults>): void {
    this.packDefaults.update((prev) => ({ ...prev, ...partial }));
  }

  updateMonthlyBudget(rawBudget: number): number {
    const normalized = Math.max(1, roundCurrency(Number(rawBudget) || 150));
    const prev = this.config();
    const updatedProfiles = prev.activeProfileId
      ? (prev.profiles ?? []).map((p) =>
          p.id === prev.activeProfileId ? { ...p, monthlyBudget: normalized } : p
        )
      : prev.profiles;

    this.config.set({
      ...prev,
      monthlyBudget: normalized,
      ...(updatedProfiles ? { profiles: updatedProfiles } : {}),
    });
    this.showToast(`Maandbudget bijgewerkt naar ${roundCurrency(normalized).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}.`, 'success');
    return normalized;
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

    this.beginSync();
    this.lastError.set(null);
    try {
      await this.mutationChain.catch(() => undefined);
      await this.flushOfflineQueueInternal(true);
      const revBefore = this.localRevision;
      const remote = await this.repo.bootstrap(cfg);
      if (this.canApplyRemoteSnapshot(revBefore)) {
        this.snapshot.set(this.reconcileRemoteSnapshot(remote));
      }
      if (!silent) this.showToast('Google Sheets succesvol gesynchroniseerd!', 'success');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Synchronisatie mislukt.';
      this.lastError.set(msg);
      if (!silent) this.showToast(msg, 'error');
      return false;
    } finally {
      this.endSync();
    }
  }

  async refreshPrices(): Promise<void> {
    const cfg = this.config();
    this.beginSync();
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

      await this.mutationChain.catch(() => undefined);
      const revBefore = this.localRevision;
      const result = await this.repo.refreshPrices(cfg);
      if (this.canApplyRemoteSnapshot(revBefore)) {
        this.snapshot.set(this.reconcileRemoteSnapshot(result.snapshot));
      }
      this.showToast(`${result.updated} van ${result.total} kaartprijzen bijgewerkt in Google Sheets.`, 'success');
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : 'Prijzen verversen mislukt.', 'error');
    } finally {
      this.endSync();
    }
  }

  clearOfflineCache(): void {
    this.bumpLocalRevision();
    this.cache.clearDataCaches();
    this.pendingQueue.set([]);
    if (this.config().demoMode) {
      this.snapshot.set(this.applyDeviceBinderLayout(createDemoSnapshot()));
    } else if (!this.isSheetConfigured()) {
      this.snapshot.set(this.applyDeviceBinderLayout(createEmptySnapshot()));
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
    const nextRowIndex = this.allocateLocalRowIndex(this.collection().map((c) => c.rowIndex));
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
      purchasePrice: roundCurrency(Math.max(0, Number(payload.purchasePrice) || 0)),
      marketPrice: roundCurrency(payload.marketPrice ?? 0),
      imageUrl: payload.imageUrl || resolveCardArtworkUrl(payload.cardId ?? '', undefined, 'high'),
      trendPercent: payload.trendPercent,
      forTrade: Boolean(payload.forTrade),
      acquisitionMethod: (payload.acquisitionMethod ?? '').trim(),
      notes: payload.notes ?? '',
    };

    const nextCollection = [newCard, ...this.collection()];
    this.bumpLocalRevision();
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
    const normalizedPatch: Partial<CollectionCard> =
      patch.purchasePrice !== undefined
        ? { ...patch, purchasePrice: roundCurrency(Math.max(0, Number(patch.purchasePrice) || 0)) }
        : patch;
    const nextCollection = this.collection().map((card) =>
      card.rowIndex === rowIndex && card.cardId === cardId ? { ...card, ...normalizedPatch } : card
    );
    this.bumpLocalRevision();
    this.applyLocalSnapshotUpdate({ collection: nextCollection });

    const payload = { rowIndex, cardId, ...normalizedPatch };
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
    this.bumpLocalRevision();
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

    if (payload.slotsPerPage !== undefined) {
      this.deviceBinderLayout = payload.slotsPerPage;
      this.cache.saveBinderLayoutPreference(payload.slotsPerPage);
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

    this.bumpLocalRevision();
    this.snapshot.set({
      ...current,
      binderSlotsPerPage: nextSpp,
      pokedex: nextPokedex,
      syncedAt: new Date().toISOString(),
    });

    if (payload.dexNumber !== undefined) {
      await this.dispatchRemoteMutation(
        'updatePokedexSlot',
        payload as Record<string, unknown>,
        `Pokédex #${payload.dexNumber} bijwerken`,
        () => this.repo.updatePokedexSlot(this.config(), payload)
      );
    }
  }

  getCardsForPokemon(pokemonName: string): CollectionCard[] {
    return this.collection().filter((c) => doesCardMatchPokemon(c.name, pokemonName));
  }

  // ==========================================================================
  // VERLANGLIJST & RUIL/VERKOOP MUTATIES
  // ==========================================================================

  async addWishlistItem(item: Omit<WishlistItem, 'rowIndex' | 'found'>): Promise<void> {
    const nextRow = this.allocateLocalRowIndex(this.wishlist().map((w) => w.rowIndex));
    const inferredCardId =
      item.cardId?.trim() ||
      inferCardIdFromSetAndNumber(item.setName, item.cardNumber, this.setsCatalogCache) ||
      undefined;
    const resolvedImageUrl =
      item.imageUrl ||
      (inferredCardId
        ? this.catalog.getCachedArtworkUrl(inferredCardId) || resolveCardArtworkUrl(inferredCardId, undefined, 'high')
        : undefined);

    const newItem: WishlistItem = {
      ...item,
      cardId: inferredCardId,
      rowIndex: nextRow,
      found: false,
      imageUrl: resolvedImageUrl,
    };

    this.rememberWishlistArtwork(newItem);
    this.bumpLocalRevision();
    this.snapshot.update((snap) => ({
      ...snap,
      wishlist: [newItem, ...snap.wishlist],
      syncedAt: new Date().toISOString(),
    }));

    await this.dispatchRemoteMutation(
      'addWishlist',
      { ...item, cardId: inferredCardId } as Record<string, unknown>,
      `Verlanglijst: ${item.cardName}`,
      () => this.repo.addWishlist(this.config(), { ...item, cardId: inferredCardId })
    );
    this.showToast(`${item.cardName} toegevoegd aan Verlanglijst.`, 'success');
  }

  async markWishlistFound(item: WishlistItem, addToCollection: boolean, purchasePrice?: number): Promise<void> {
    const normalizedPurchasePrice = roundCurrency(Math.max(0, Number(purchasePrice) || 0));
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
          purchasePrice: normalizedPurchasePrice,
          marketPrice: item.marketPrice,
          imageUrl: item.imageUrl,
          forTrade: false,
          notes: item.notes,
        }
      : undefined;

    this.bumpLocalRevision();
    if (cardPayload) {
      const nextCollection: CollectionCard[] = [
        {
          rowIndex: this.allocateLocalRowIndex(this.collection().map((c) => c.rowIndex)),
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
          purchasePrice: normalizedPurchasePrice,
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

  async updateWishlistItem(
    original: WishlistItem,
    changes: Partial<Omit<WishlistItem, 'rowIndex'>>
  ): Promise<void> {
    const merged: WishlistItem = {
      ...original,
      ...changes,
      cardId: changes.cardId?.trim() || original.cardId,
      cardName: (changes.cardName ?? original.cardName).trim(),
      setName: (changes.setName ?? original.setName).trim(),
      cardNumber: (changes.cardNumber ?? original.cardNumber).trim(),
      desiredVariant: (changes.desiredVariant ?? original.desiredVariant).trim() || 'Normal',
      minCondition: (changes.minCondition ?? original.minCondition).trim() || 'Near Mint (NM)',
      priority: (changes.priority ?? original.priority).trim() || 'Gemiddeld',
      maxBudget: Math.max(0, Number(changes.maxBudget ?? original.maxBudget) || 0),
      marketPrice: Math.max(0, Number(changes.marketPrice ?? original.marketPrice) || 0),
      notes: (changes.notes ?? original.notes).trim(),
      imageUrl: changes.imageUrl ?? original.imageUrl,
    };

    const nextWishlist = this.wishlist().map((w) =>
      w.rowIndex === original.rowIndex && w.cardName === original.cardName ? merged : w
    );

    this.rememberWishlistArtwork(merged);
    this.bumpLocalRevision();
    this.snapshot.update((snap) => ({
      ...snap,
      wishlist: nextWishlist,
      syncedAt: new Date().toISOString(),
    }));

    const payload: UpdateWishlistPayload = {
      rowIndex: original.rowIndex,
      originalCardName: original.cardName,
      cardId: merged.cardId,
      cardName: merged.cardName,
      setName: merged.setName,
      cardNumber: merged.cardNumber,
      desiredVariant: merged.desiredVariant,
      minCondition: merged.minCondition,
      priority: merged.priority,
      maxBudget: merged.maxBudget,
      marketPrice: merged.marketPrice,
      notes: merged.notes,
      found: merged.found,
    };

    if (this.repo.updateWishlist) {
      await this.dispatchRemoteMutation(
        'updateWishlist',
        payload as unknown as Record<string, unknown>,
        `Bijwerken wens: ${merged.cardName}`,
        () => this.repo.updateWishlist!(this.config(), payload)
      );
    }
    this.showToast(`${merged.cardName} bijgewerkt op Verlanglijst.`, 'success');
  }

  async deleteWishlistItem(item: WishlistItem): Promise<void> {
    const nextWishlist = this.wishlist().filter(
      (w) => !(w.rowIndex === item.rowIndex && w.cardName === item.cardName)
    );

    this.bumpLocalRevision();
    this.snapshot.update((snap) => ({
      ...snap,
      wishlist: nextWishlist,
      syncedAt: new Date().toISOString(),
    }));

    const payload = { rowIndex: item.rowIndex, cardName: item.cardName };
    if (this.repo.deleteWishlist) {
      await this.dispatchRemoteMutation(
        'deleteWishlist',
        payload as Record<string, unknown>,
        `Verwijderd van verlanglijst: ${item.cardName}`,
        () => this.repo.deleteWishlist!(this.config(), payload)
      );
    }
    this.showToast(`${item.cardName} verwijderd van Verlanglijst.`, 'info');
  }

  async logTrade(entry: Omit<TradeEntry, 'rowIndex' | 'netResult'>): Promise<void> {
    const netResult = roundCurrency(entry.saleValue - entry.purchasePrice - entry.platformFees);
    const newEntry: TradeEntry = {
      ...entry,
      rowIndex: this.allocateLocalRowIndex(this.trades().map((t) => t.rowIndex), 22),
      netResult,
    };

    this.bumpLocalRevision();
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

  /**
   * Vult ontbrekende cardId/imageUrl op de verlanglijst aan vanuit sets-catalogus of naamzoekopdracht.
   */
  async hydrateWishlistArtworkFromCatalog(): Promise<void> {
    if (this.isHydratingWishlist) return;
    const currentWishlist = this.wishlist();
    if (!currentWishlist.some((w) => !w.imageUrl || !w.cardId)) return;

    this.isHydratingWishlist = true;
    try {
      if (this.setsCatalogCache.length === 0 && this.catalog.listAllSets) {
        this.setsCatalogCache = await this.catalog.listAllSets().catch(() => []);
      }

      let changed = false;
      const updated = await Promise.all(
        this.wishlist().map(async (w) => {
          const cacheKey = this.wishlistCacheKey(w);
          const cached = this.wishlistArtworkCache[cacheKey];

          let cardId =
            w.cardId?.trim() ||
            cached?.cardId ||
            inferCardIdFromSetAndNumber(w.setName, w.cardNumber, this.setsCatalogCache) ||
            undefined;
          let imageUrl =
            w.imageUrl?.trim() ||
            cached?.imageUrl ||
            (cardId
              ? this.catalog.getCachedArtworkUrl(cardId) || resolveCardArtworkUrl(cardId, undefined, 'high')
              : undefined);

          if (!imageUrl && w.cardName.trim().length >= 2 && !this.wishlistLookupAttempted.has(cacheKey)) {
            this.wishlistLookupAttempted.add(cacheKey);
            try {
              const results = await this.catalog.searchByName(w.cardName.trim(), 6);
              const wantedLocal = (w.cardNumber || '').trim().split('/')[0].replace(/^#/, '').trim();
              const wantedUnpadded = /^\d+$/.test(wantedLocal)
                ? String(parseInt(wantedLocal, 10))
                : wantedLocal.toLowerCase();

              const matched =
                (wantedLocal
                  ? results.find((r) => {
                      const rl = r.localId.trim().toLowerCase();
                      const ru = /^\d+$/.test(rl) ? String(parseInt(rl, 10)) : rl;
                      return rl === wantedLocal.toLowerCase() || ru === wantedUnpadded;
                    })
                  : undefined) ?? results.find((r) => Boolean(r.imageUrl)) ?? results[0];

              if (matched) {
                cardId = cardId || matched.id;
                imageUrl = resolveCardArtworkUrl(matched.id, matched.imageBase, 'high') || matched.imageUrl;
              }
            } catch {
              // Offline / lookup mislukt: behoud huidige state
            }
          }

          if (cardId || imageUrl) {
            this.rememberWishlistArtwork({ ...w, cardId, imageUrl });
          }

          if (cardId !== w.cardId || imageUrl !== w.imageUrl) {
            changed = true;
            return { ...w, cardId, imageUrl };
          }
          return w;
        })
      );

      if (changed) {
        this.snapshot.update((snap) => ({
          ...snap,
          wishlist: updated,
        }));
      }
    } finally {
      this.isHydratingWishlist = false;
    }
  }

  applyRemoteFeedbackSnapshot(remote: AppSnapshot): void {
    if (this.activeSyncCount === 0 && this.pendingQueue().length === 0) {
      this.snapshot.set(this.reconcileRemoteSnapshot(remote));
    } else if (remote.feedback) {
      this.snapshot.update((snap) => ({
        ...snap,
        feedback: remote.feedback,
      }));
    }
  }

  // ==========================================================================
  // OFFLINE QUEUE & TOASTS
  // ==========================================================================

  async flushOfflineQueue(silent = false): Promise<void> {
    const run = async (): Promise<void> => {
      await this.flushOfflineQueueInternal(silent);
    };
    const chained = this.mutationChain.then(run, run);
    this.mutationChain = chained.catch(() => undefined);
    await chained;
  }

  private async flushOfflineQueueInternal(silent = false): Promise<void> {
    const cfg = this.config();
    if (cfg.demoMode || !this.isOnline() || !cfg.webAppUrl || !cfg.apiToken) return;
    const queue = this.pendingQueue();
    if (!queue.length) return;

    this.beginSync();
    const revBefore = this.localRevision;
    const remaining: PendingMutation[] = [];
    let lastUpdatedSnap: AppSnapshot | null = null;
    try {
      for (const item of queue) {
        try {
          switch (item.action) {
            case 'addCard':
              lastUpdatedSnap = await this.repo.addCard(cfg, item.payload as AddCardPayload);
              break;
            case 'updateCard':
              lastUpdatedSnap = await this.repo.updateCard(cfg, item.payload as Partial<CollectionCard>);
              break;
            case 'deleteCard':
              lastUpdatedSnap = await this.repo.deleteCard(
                cfg,
                item.payload as { rowIndex?: number; cardId?: string }
              );
              break;
            case 'updatePokedexSlot':
              lastUpdatedSnap = await this.repo.updatePokedexSlot(
                cfg,
                item.payload as UpdatePokedexSlotPayload
              );
              break;
            case 'addWishlist':
              lastUpdatedSnap = await this.repo.addWishlist(
                cfg,
                item.payload as unknown as Omit<WishlistItem, 'rowIndex' | 'found'>
              );
              break;
            case 'markWishlistFound':
              lastUpdatedSnap = await this.repo.markWishlistFound(
                cfg,
                item.payload as unknown as MarkWishlistFoundPayload
              );
              break;
            case 'updateWishlist':
              if (this.repo.updateWishlist) {
                lastUpdatedSnap = await this.repo.updateWishlist(
                  cfg,
                  item.payload as unknown as UpdateWishlistPayload
                );
              }
              break;
            case 'deleteWishlist':
              if (this.repo.deleteWishlist) {
                lastUpdatedSnap = await this.repo.deleteWishlist(
                  cfg,
                  item.payload as { rowIndex: number; cardName?: string }
                );
              }
              break;
            case 'logTrade':
              lastUpdatedSnap = await this.repo.logTrade(
                cfg,
                item.payload as unknown as Omit<TradeEntry, 'rowIndex' | 'netResult'>
              );
              break;
          }
        } catch {
          remaining.push(item);
        }
      }

      this.pendingQueue.set(remaining);
      if (lastUpdatedSnap && remaining.length === 0 && this.localRevision === revBefore) {
        this.snapshot.set(this.reconcileRemoteSnapshot(lastUpdatedSnap));
      }
      if (!silent && remaining.length === 0) {
        this.showToast(`${queue.length} offline wijziging(en) gesynchroniseerd met Google Sheets!`, 'success');
      }
    } finally {
      this.endSync();
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

    const myRevision = this.localRevision;
    const run = async (): Promise<void> => {
      this.beginSync();
      this.lastError.set(null);
      try {
        if (this.pendingQueue().length > 0) {
          await this.flushOfflineQueueInternal(true);
        }
        if (this.pendingQueue().length > 0) {
          this.enqueueMutation(action, payload, description);
          return;
        }
        const updated = await remoteCall();
        if (this.canApplyRemoteSnapshot(myRevision)) {
          this.snapshot.set(this.reconcileRemoteSnapshot(updated));
        }
      } catch (err) {
        this.enqueueMutation(action, payload, description);
        const msg = err instanceof Error ? err.message : 'Kon wijziging niet direct naar Sheets sturen.';
        this.lastError.set(msg);
        this.showToast('Lokaal bijgewerkt; opgeslagen in sync-wachtrij.', 'warning');
      } finally {
        this.endSync();
      }
    };

    const chained = this.mutationChain.then(run, run);
    this.mutationChain = chained.catch(() => undefined);
    await chained;
  }

  private beginSync(): void {
    this.activeSyncCount++;
    this.isSyncing.set(this.activeSyncCount > 0);
  }

  private endSync(): void {
    this.activeSyncCount = Math.max(0, this.activeSyncCount - 1);
    this.isSyncing.set(this.activeSyncCount > 0);
  }

  private bumpLocalRevision(): number {
    return ++this.localRevision;
  }

  private canApplyRemoteSnapshot(expectedRevision: number): boolean {
    return this.localRevision === expectedRevision && this.pendingQueue().length === 0;
  }

  private allocateLocalRowIndex(existing: number[], startAt = 2): number {
    const cfg = this.config();
    if (!cfg.demoMode && this.isSheetConfigured()) {
      return --this.tempRowCounter;
    }
    return this.getNextLocalRowIndex(existing, startAt);
  }

  private wishlistCacheKey(w: Pick<WishlistItem, 'cardName' | 'setName' | 'cardNumber'>): string {
    return `${(w.setName || '').trim().toLowerCase()}|${(w.cardNumber || '').trim().toLowerCase()}|${(w.cardName || '').trim().toLowerCase()}`;
  }

  private rememberWishlistArtwork(
    w: Pick<WishlistItem, 'cardName' | 'setName' | 'cardNumber' | 'cardId' | 'imageUrl'>
  ): void {
    if (!w.cardId && !w.imageUrl) return;
    const key = this.wishlistCacheKey(w);
    const prev = this.wishlistArtworkCache[key];
    if (prev?.cardId === w.cardId && prev?.imageUrl === w.imageUrl) return;
    this.wishlistArtworkCache[key] = {
      cardId: w.cardId || prev?.cardId,
      imageUrl: w.imageUrl || prev?.imageUrl,
    };
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(WISHLIST_ARTWORK_CACHE_KEY, JSON.stringify(this.wishlistArtworkCache));
      }
    } catch {
      // negeer opslaglimiet
    }
  }

  private loadWishlistArtworkCache(): Record<string, { cardId?: string; imageUrl?: string }> {
    try {
      if (typeof window === 'undefined') return {};
      const raw = window.localStorage.getItem(WISHLIST_ARTWORK_CACHE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, { cardId?: string; imageUrl?: string }>) : {};
    } catch {
      return {};
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
