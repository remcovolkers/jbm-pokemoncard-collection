import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  buildTcgdexAssetUrl,
  extractArtworkUrlFromNotes,
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
  KaartspotProfileData,
  KaartspotSyncPlan,
  ParsedKaartspotInput,
  parseKaartspotInput,
  parseKaartspotPublicPayload,
} from '../domain/kaartspot-sync.utils';
import {
  AppConnectionConfig,
  AppSnapshot,
  BinderSlotsPerPage,
  CatalogSetSummary,
  CollectionCard,
  DEFAULT_DROPDOWN_SETTINGS,
  KaartspotProfileSyncState,
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
  BatchMutationItem,
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
import { compareSemver } from '../platform/version.utils';
import {
  coalesceOutboxMutation,
  computeMinTempRowCounter,
  remapTempRowInQueue,
  remapTempRowInSnapshot,
} from './outbox.utils';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'demo' | 'unconfigured' | 'error';

export interface BatchCardCommitItem {
  payload: AddCardPayload;
  duplicateStrategy?: 'increment' | 'separate';
}

export interface BatchCardCommitResult {
  addedCount: number;
  incrementedCount: number;
  totalCopies: number;
}

const WISHLIST_ARTWORK_CACHE_KEY = 'pokebinder_wishlist_artwork_v1';

@Injectable({ providedIn: 'root' })
export class CollectionStore {
  private readonly repo = inject(COLLECTION_REPOSITORY);
  private readonly catalog = inject(CARD_CATALOG_PORT);
  private readonly cache = inject(LocalCacheAdapter);

  private deviceBinderLayout: BinderSlotsPerPage | null = this.cache.loadBinderLayoutPreference();
  private localRevision = 0;
  private mutationChain: Promise<void> = Promise.resolve();
  private activeDrainPromise: Promise<void> | null = null;
  private lastDrainFailed = false;
  private inFlightIds = new Set<string>();
  private batchUnsupportedUrls = new Set<string>();
  private hasShownOutboxErrorToast = false;
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
  readonly pendingCount = computed(() => this.pendingQueue().length);
  readonly legacyAppsScriptDetected = signal<boolean>(false);
  readonly connectedScriptVersion = signal<string | null>(null);

  // Navigatie-hulpsignal voor doorklikken vanuit Set Voortgang & Dashboard
  readonly requestedSetFilter = signal<string | null>(null);
  readonly requestedPokedexFilter = signal<'all' | 'missing' | 'in_collection' | 'in_binder' | 'upgrade' | null>(null);
  readonly requestedPokedexGen = signal<number | null>(null);
  readonly requestedQuickAddSearch = signal<{ mode: 'code' | 'name' | 'sets'; query: string } | null>(null);

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

  readonly activeKaartspotConfig = computed<KaartspotProfileSyncState | null>(() => {
    const prof = this.activeProfile();
    if (!this.config().demoMode && prof) {
      return prof.kaartspot ?? null;
    }
    return this.config().kaartspot ?? null;
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
    this.tempRowCounter = computeMinTempRowCounter(this.snapshot(), this.pendingQueue());
    this.connectedScriptVersion.set(this.snapshot().scriptVersion?.trim() || null);

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
      window.addEventListener('beforeunload', (event) => {
        const currentCfg = this.config();
        if (
          !currentCfg.demoMode &&
          Boolean(currentCfg.webAppUrl?.trim() && currentCfg.apiToken?.trim()) &&
          (this.pendingQueue().length > 0 || this.isSyncing())
        ) {
          event.preventDefault();
          event.returnValue = '';
        }
      });
    }

    // Als live Google Sheets geconfigureerd is en demo-modus uit staat, werk eerst wachtrij leeg en haal verse data op
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
          extractArtworkUrlFromNotes(c.notes) ||
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
          extractArtworkUrlFromNotes(w.notes) ||
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
    this.legacyAppsScriptDetected.set(this.batchUnsupportedUrls.has(next.webAppUrl?.trim() ?? ''));

    if (partial.demoMode === true && !prev.demoMode) {
      this.bumpLocalRevision();
      const demoCached = this.cache.loadDemoSnapshot();
      const nextSnap = demoCached
        ? this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(demoCached)))
        : this.applyDeviceBinderLayout(createDemoSnapshot());
      this.snapshot.set(nextSnap);
      this.connectedScriptVersion.set(null);
      this.lastError.set(null);
      this.showToast('Demo-modus ingeschakeld met voorbeeldcollectie.', 'info');
    } else if (!next.demoMode && !hasSheet) {
      this.bumpLocalRevision();
      // Geen spreadsheet gekoppeld -> geen demodata tonen, maar schone lege staat
      this.snapshot.set(this.applyDeviceBinderLayout(createEmptySnapshot()));
      this.connectedScriptVersion.set(null);
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
      const nextSnap = liveCached
        ? this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(liveCached)))
        : this.applyDeviceBinderLayout(createEmptySnapshot());
      this.snapshot.set(nextSnap);
      this.connectedScriptVersion.set(nextSnap.scriptVersion?.trim() || null);
      this.tempRowCounter = computeMinTempRowCounter(this.snapshot(), this.pendingQueue());
      void this.syncFromRemote();
    } else if (
      !next.demoMode &&
      partial.webAppUrl !== undefined &&
      partial.webAppUrl.trim() !== prev.webAppUrl.trim()
    ) {
      this.connectedScriptVersion.set(null);
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
    const existingIdx = list.findIndex((p) => p.id === cleanId);
    const existingKaartspot = existingIdx >= 0 ? list[existingIdx].kaartspot : undefined;
    const profile: SheetProfile = {
      id: cleanId,
      name: input.name.trim() || (input.role === 'test' ? 'Test Spreadsheet' : 'Live Spreadsheet'),
      role: input.role,
      webAppUrl: input.webAppUrl.trim(),
      apiToken: input.apiToken.trim(),
      monthlyBudget: input.monthlyBudget ?? prev.monthlyBudget,
      ...(input.kaartspot !== undefined
        ? { kaartspot: input.kaartspot }
        : existingKaartspot
          ? { kaartspot: existingKaartspot }
          : {}),
    };

    if (existingIdx >= 0) {
      list[existingIdx] = profile;
    } else {
      list.push(profile);
    }

    const activate = options.activate !== false;
    if (activate) {
      const switched = prev.activeProfileId !== profile.id;
      const urlChanged = prev.webAppUrl.trim() !== profile.webAppUrl.trim();
      if (switched) {
        this.bumpLocalRevision();
        this.inFlightIds.clear();
        this.hasShownOutboxErrorToast = false;
        this.pendingQueue.set([]);
      }
      this.lastError.set(null);
      this.legacyAppsScriptDetected.set(this.batchUnsupportedUrls.has(profile.webAppUrl));

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
        const nextSnap = cached
          ? this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(cached)))
          : this.applyDeviceBinderLayout(createEmptySnapshot());
        this.snapshot.set(nextSnap);
        this.connectedScriptVersion.set(nextSnap.scriptVersion?.trim() || null);
      } else if (urlChanged) {
        this.connectedScriptVersion.set(null);
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
    this.hasShownOutboxErrorToast = false;
    this.legacyAppsScriptDetected.set(this.batchUnsupportedUrls.has(profile.webAppUrl));
    if (changedProfile) {
      this.bumpLocalRevision();
      this.inFlightIds.clear();
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
    const nextSnap = cached
      ? this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(cached)))
      : this.applyDeviceBinderLayout(createEmptySnapshot());
    this.snapshot.set(nextSnap);
    this.connectedScriptVersion.set(nextSnap.scriptVersion?.trim() || null);

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
      this.inFlightIds.clear();
      this.hasShownOutboxErrorToast = false;
      this.pendingQueue.set([]);
      this.lastError.set(null);

      const fallback = remaining[0];
      this.legacyAppsScriptDetected.set(
        fallback ? this.batchUnsupportedUrls.has(fallback.webAppUrl) : false
      );
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
          const nextSnap = cached
            ? this.reconcileSetProgress(this.applyDeviceBinderLayout(this.hydrateArtwork(cached)))
            : this.applyDeviceBinderLayout(createEmptySnapshot());
          this.snapshot.set(nextSnap);
          this.connectedScriptVersion.set(nextSnap.scriptVersion?.trim() || null);
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
          this.connectedScriptVersion.set(null);
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

  private applyDetectedScriptVersion(
    webAppUrl: string,
    rawVersion: string | null | undefined,
    persistSnapshot = false
  ): void {
    const cleanUrl = webAppUrl.trim();
    const cleanVer = (rawVersion ?? '').trim();
    this.connectedScriptVersion.set(cleanVer);

    if (cleanVer && compareSemver(cleanVer, '2.0.0') >= 0) {
      if (cleanUrl) {
        this.batchUnsupportedUrls.delete(cleanUrl);
      }
      this.legacyAppsScriptDetected.set(false);
    }

    if (persistSnapshot && (this.snapshot().scriptVersion ?? '') !== cleanVer) {
      this.snapshot.update((s) => ({ ...s, scriptVersion: cleanVer || undefined }));
      this.persistStateImmediately();
    }
  }

  async testConnection(overrideConfig?: AppConnectionConfig): Promise<ConnectionTestResult> {
    const cfg = overrideConfig ?? this.config();
    const res = await this.repo.testConnection(cfg);
    if (
      res.ok &&
      !this.config().demoMode &&
      cfg.webAppUrl.trim() &&
      cfg.webAppUrl.trim() === this.config().webAppUrl.trim()
    ) {
      this.applyDetectedScriptVersion(cfg.webAppUrl, res.scriptVersion, true);
    }
    return res;
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
    if (!silent) {
      this.lastError.set(null);
    }
    try {
      await this.waitForPendingSync();
      if (this.pendingQueue().length > 0 && (!silent || !this.lastError())) {
        await this.drainOutbox(true);
      }
      if (this.pendingQueue().length > 0) {
        const blockedMsg =
          this.lastError() || 'Wachtende lokale wijzigingen konden nog niet naar Sheets worden verstuurd.';
        this.lastError.set(blockedMsg);
        if (!silent) this.showToast(blockedMsg, 'warning');
        return false;
      }
      this.lastError.set(null);

      const revBefore = this.localRevision;
      const remote = await this.repo.bootstrap(cfg);
      this.applyDetectedScriptVersion(cfg.webAppUrl, remote.scriptVersion);
      if (this.canApplyRemoteSnapshot(revBefore)) {
        this.snapshot.set(this.reconcileRemoteSnapshot(remote));
        this.persistStateImmediately();
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

      await this.waitForPendingSync();
      if (this.pendingQueue().length > 0) {
        await this.drainOutboxLoop(true);
      }
      const revBefore = this.localRevision;
      const result = await this.repo.refreshPrices(cfg);
      if (result.snapshot) {
        this.applyDetectedScriptVersion(cfg.webAppUrl, result.snapshot.scriptVersion);
      }
      if (this.canApplyRemoteSnapshot(revBefore)) {
        this.snapshot.set(this.reconcileRemoteSnapshot(result.snapshot));
        this.persistStateImmediately();
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
    this.inFlightIds.clear();
    this.tempRowCounter = 0;
    this.lastError.set(null);
    this.hasShownOutboxErrorToast = false;
    this.cache.clearDataCaches();
    this.pendingQueue.set([]);
    if (this.config().demoMode) {
      this.snapshot.set(this.applyDeviceBinderLayout(createDemoSnapshot()));
    } else if (!this.isSheetConfigured()) {
      this.snapshot.set(this.applyDeviceBinderLayout(createEmptySnapshot()));
    }
    this.connectedScriptVersion.set(null);
    this.showToast('Offline-cache geleegd.', 'info');
  }

  getEstimatedCacheKb(): number {
    return this.cache.getEstimatedCacheSizeKb();
  }

  // ==========================================================================
  // KAARTSPOT BINDER SYNC (PER-PROFIEL CONFIG + SERVER-SIDE FETCH & BULK SYNC)
  // ==========================================================================

  saveKaartspotConfig(state: KaartspotProfileSyncState | undefined): void {
    const prev = this.config();
    if (!prev.demoMode && prev.activeProfileId) {
      const updatedProfiles = (prev.profiles ?? []).map((p) =>
        p.id === prev.activeProfileId ? { ...p, kaartspot: state } : p
      );
      this.config.set({
        ...prev,
        profiles: updatedProfiles,
      });
    } else {
      this.config.set({
        ...prev,
        kaartspot: state,
      });
    }
  }

  private async ensureSetsCatalogLoaded(): Promise<CatalogSetSummary[]> {
    if (this.setsCatalogCache.length > 0) {
      return this.setsCatalogCache;
    }
    try {
      const sets = this.catalog.listAllSets ? await this.catalog.listAllSets() : [];
      if (Array.isArray(sets) && sets.length > 0) {
        this.setsCatalogCache = sets;
      }
    } catch {
      // Gebruik ingebouwde aliassen als de catalogus offline niet geladen kan worden
    }
    return this.setsCatalogCache;
  }

  async fetchKaartspotProfileData(
    rawInput: string,
    pastedJsonText?: string
  ): Promise<{ input: ParsedKaartspotInput; profile: KaartspotProfileData }> {
    const parsedInput = parseKaartspotInput(rawInput);
    if (!parsedInput) {
      throw new Error(
        'Voer een geldige Kaartspot-link (bijv. kaartspot.nl/wrapped/...) of gebruikersnaam in.'
      );
    }

    const setsCatalog = await this.ensureSetsCatalogLoaded();
    const cleanPaste = (pastedJsonText || '').trim();

    if (cleanPaste) {
      let rawJson: unknown;
      try {
        rawJson = JSON.parse(cleanPaste);
      } catch {
        throw new Error(
          'De geplakte tekst is geen geldige JSON. Kopieer alles vanaf "{" t/m "}" uit de geopende Kaartspot-data.'
        );
      }
      const profile = parseKaartspotPublicPayload(rawJson, setsCatalog);
      return { input: parsedInput, profile };
    }

    const cfg = this.config();
    if (!cfg.demoMode && this.isSheetConfigured() && this.repo.fetchKaartspotProfile) {
      if (!this.isOnline()) {
        throw new Error('Offline: maak verbinding met internet om je Kaartspot-binder op te halen.');
      }
      try {
        const rawJson = await this.repo.fetchKaartspotProfile(cfg, parsedInput.username);
        const profile = parseKaartspotPublicPayload(rawJson, setsCatalog);
        return { input: parsedInput, profile };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/Onbekende POST-actie:\s*fetchKaartspotProfile/i.test(msg)) {
          throw new Error(
            'SCRIPT_UPDATE_REQUIRED: Werk eerst eenmalig Code.gs bij naar v2.2.0 (zie "Eigen Google Sheet & Script-updates" hierboven) zodat Google Sheets je Kaartspot-link rechtstreeks kan ophalen — of plak de JSON handmatig hieronder.'
          );
        }
        throw err instanceof Error ? err : new Error(msg);
      }
    }

    // In Demo-modus (of zonder gekoppelde Google Sheet): probeer directe fetch en geef anders heldere JSON-instructie
    try {
      const directRes = await fetch(parsedInput.apiUrl, { cache: 'no-store' });
      if (directRes.ok) {
        const rawJson = (await directRes.json()) as unknown;
        const profile = parseKaartspotPublicPayload(rawJson, setsCatalog);
        return { input: parsedInput, profile };
      }
    } catch {
      // Browser blokkeert cross-origin fetch zonder gekoppeld Apps Script
    }

    throw new Error(
      'CORS_PASTE_NEEDED: In Demo-modus (zonder gekoppelde Google Sheet) blokkeert de browser directe toegang tot kaartspot.nl. Klik hieronder op "1. Open Kaartspot-data" en plak de JSON, óf koppel eerst je Google Sheet voor directe 1-klik sync.'
    );
  }

  async executeKaartspotSync(
    plan: KaartspotSyncPlan,
    syncState: Omit<KaartspotProfileSyncState, 'lastSyncedAt'>
  ): Promise<boolean> {
    const savedState: KaartspotProfileSyncState = {
      ...syncState,
      lastSyncedAt: new Date().toISOString(),
    };
    this.saveKaartspotConfig(savedState);

    // Bewaar eventuele niet-TCGdex afbeeldingen (bijv. Chinese ZHT of Trainer Kits) direct in lokale artwork-cache
    if (plan.artworkCacheEntries.length > 0) {
      const existingMap = this.cache.loadArtworkCache();
      let changed = false;
      for (const entry of plan.artworkCacheEntries) {
        if (entry.cardId && entry.imageUrl && existingMap[entry.cardId] !== entry.imageUrl) {
          existingMap[entry.cardId] = entry.imageUrl;
          changed = true;
        }
      }
      if (changed) {
        this.cache.saveArtworkCache(existingMap);
      }
    }

    for (const w of plan.wishlistToAdd) {
      this.rememberWishlistArtwork({
        cardName: w.cardName,
        setName: w.setName,
        cardNumber: w.cardNumber,
        cardId: w.cardId,
        imageUrl: w.imageUrl,
      });
    }

    if (!plan.summary.hasAnyChanges) {
      this.showToast(
        `Alles is al synchroon met @${plan.username} — geen nieuwe of gewijzigde kaarten gevonden.`,
        'info'
      );
      return true;
    }

    if (plan.targetSlotsPerPage !== null) {
      this.deviceBinderLayout = plan.targetSlotsPerPage;
      this.cache.saveBinderLayoutPreference(plan.targetSlotsPerPage);
    }

    const cfg = this.config();
    const isLive = !cfg.demoMode && this.isSheetConfigured();

    if (!isLive) {
      this.applyKaartspotPlanLocally(plan);
      this.showToast(this.formatKaartspotToast(plan), 'success');
      return true;
    }

    if (!this.isOnline()) {
      this.showToast(
        'Offline: maak eerst verbinding met internet om Kaartspot naar Google Sheets te synchroniseren.',
        'warning'
      );
      return false;
    }

    this.beginSync();
    this.lastError.set(null);
    try {
      await this.waitForPendingSync();
      if (this.pendingQueue().length > 0) {
        await this.drainOutboxLoop(true);
      }

      const revBefore = this.localRevision;
      if (this.repo.applyKaartspotSync) {
        try {
          const remoteRes = await this.repo.applyKaartspotSync(cfg, {
            cardsToAdd: plan.cardsToAdd,
            wishlistToAdd: plan.wishlistToAdd,
            wishlistRowsToMarkFound: plan.wishlistRowsToMarkFound,
            pokedexUpdates: plan.pokedexUpdates,
            slotsPerPage: plan.targetSlotsPerPage,
          });
          this.applyDetectedScriptVersion(cfg.webAppUrl, remoteRes.snapshot.scriptVersion);
          if (this.canApplyRemoteSnapshot(revBefore)) {
            this.snapshot.set(this.reconcileRemoteSnapshot(remoteRes.snapshot));
            this.persistStateImmediately();
          }
          this.showToast(this.formatKaartspotToast(plan), 'success');
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/Onbekende POST-actie:\s*applyKaartspotSync/i.test(msg) || !this.repo.batchMutations) {
            throw err;
          }
          // Fallback voor oudere v2.1.0 scripts wanneer JSON handmatig is geplakt
        }
      }

      if (this.repo.batchMutations) {
        const allItems: BatchMutationItem[] = [];
        let seq = 0;
        if (plan.targetSlotsPerPage !== null) {
          allItems.push({
            id: `ks-spp-${++seq}`,
            action: 'updatePokedexSlot',
            payload: { slotsPerPage: plan.targetSlotsPerPage },
          });
        }
        for (const rowIdx of plan.wishlistRowsToMarkFound) {
          allItems.push({
            id: `ks-found-${++seq}`,
            action: 'markWishlistFound',
            payload: { rowIndex: rowIdx, addToCollection: false },
          });
        }
        for (const c of plan.cardsToAdd) {
          allItems.push({
            id: `ks-card-${++seq}`,
            action: 'addCard',
            payload: c as unknown as Record<string, unknown>,
          });
        }
        for (const w of plan.wishlistToAdd) {
          allItems.push({
            id: `ks-wl-${++seq}`,
            action: 'addWishlist',
            payload: w as unknown as Record<string, unknown>,
          });
        }
        for (const p of plan.pokedexUpdates) {
          allItems.push({
            id: `ks-dex-${++seq}`,
            action: 'updatePokedexSlot',
            payload: {
              dexNumber: p.dexNumber,
              inBinder: true,
              selectedCard: p.selectedCard,
            },
          });
        }

        const CHUNK_SIZE = 100;
        let finalSnap: AppSnapshot | undefined;
        for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
          const slice = allItems.slice(i, i + CHUNK_SIZE);
          const isLast = i + CHUNK_SIZE >= allItems.length;
          const chunkRes = await this.repo.batchMutations(cfg, slice, { skipBootstrap: !isLast });
          if (chunkRes.snapshot) {
            finalSnap = chunkRes.snapshot;
          }
        }
        if (finalSnap && this.canApplyRemoteSnapshot(revBefore)) {
          this.applyDetectedScriptVersion(cfg.webAppUrl, finalSnap.scriptVersion);
          this.snapshot.set(this.reconcileRemoteSnapshot(finalSnap));
          this.persistStateImmediately();
        }
        this.showToast(this.formatKaartspotToast(plan), 'success');
        return true;
      }

      throw new Error('Werk eerst je Google Sheet Code.gs bij naar v2.2.0 om te synchroniseren.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaartspot-synchronisatie mislukt.';
      this.lastError.set(msg);
      this.showToast(msg, 'error');
      return false;
    } finally {
      this.endSync();
    }
  }

  private applyKaartspotPlanLocally(plan: KaartspotSyncPlan): void {
    const today = new Date().toISOString().slice(0, 10);
    const current = this.snapshot();
    const nextSpp = plan.targetSlotsPerPage ?? current.binderSlotsPerPage;

    let nextColRow = this.getNextLocalRowIndex(
      current.collection.map((c) => c.rowIndex),
      2
    );
    const addedCards: CollectionCard[] = plan.cardsToAdd.map((c) => ({
      rowIndex: nextColRow++,
      cardId: c.cardId,
      name: c.name,
      setName: c.setName,
      cardNumber: c.cardNumber,
      language: c.language,
      type: c.type || 'Colorless',
      rarity: c.rarity,
      variant: c.variant,
      condition: c.condition,
      grading: c.grading,
      grade: c.grade,
      quantity: c.quantity,
      storageLocation: c.storageLocation,
      binderDetail: c.binderDetail,
      purchaseDate: today,
      purchasePrice: c.purchasePrice,
      marketPrice: c.marketPrice,
      imageUrl:
        c.imageUrl ||
        extractArtworkUrlFromNotes(c.notes) ||
        resolveCardArtworkUrl(c.cardId, undefined, 'high'),
      forTrade: c.forTrade,
      acquisitionMethod: c.acquisitionMethod,
      notes: c.notes,
    }));

    const nextCollection = [...addedCards, ...current.collection];

    const foundSet = new Set(plan.wishlistRowsToMarkFound);
    let nextWlRow = this.getNextLocalRowIndex(
      current.wishlist.map((w) => w.rowIndex),
      2
    );
    const updatedExistingWishlist = current.wishlist.map((w) =>
      foundSet.has(w.rowIndex) ? { ...w, found: true } : w
    );
    const addedWishlist: WishlistItem[] = plan.wishlistToAdd.map((w) => ({
      rowIndex: nextWlRow++,
      cardId: w.cardId,
      cardName: w.cardName,
      setName: w.setName,
      cardNumber: w.cardNumber,
      desiredVariant: w.desiredVariant,
      minCondition: w.minCondition,
      priority: w.priority,
      maxBudget: w.maxBudget,
      marketPrice: w.marketPrice,
      notes: w.notes,
      found: false,
      imageUrl:
        w.imageUrl ||
        extractArtworkUrlFromNotes(w.notes) ||
        resolveCardArtworkUrl(w.cardId, undefined, 'high'),
    }));
    const nextWishlist = [...addedWishlist, ...updatedExistingWishlist];

    const setSeeds = current.setProgress.map((s) => ({
      setName: s.setName,
      setCode: s.setCode,
      series: s.series,
      totalCards: s.totalCards,
    }));
    for (const c of plan.cardsToAdd) {
      if (
        c.setName &&
        c.setTotalCards > 0 &&
        !setSeeds.some((s) => s.setName.toLowerCase() === c.setName.toLowerCase())
      ) {
        setSeeds.push({
          setName: c.setName,
          setCode: undefined,
          series: c.seriesName || 'Pokémon TCG',
          totalCards: c.setTotalCards,
        });
      }
    }

    const nextSetProgress = buildSetProgressFromCollection(nextCollection, setSeeds);
    const basePokedex = buildPokedexFromCollection(nextCollection, nextSpp, {
      existingSlots: current.pokedex,
    });
    const dexUpdateByNum = new Map(plan.pokedexUpdates.map((u) => [u.dexNumber, u]));
    const nextPokedex = basePokedex.map((slot) => {
      const upd = dexUpdateByNum.get(slot.dexNumber);
      if (!upd) return slot;
      return {
        ...slot,
        inBinder: true,
        status: 'In Binder',
        selectedCard: upd.selectedCard,
      };
    });

    this.bumpLocalRevision();
    this.snapshot.set({
      ...current,
      binderSlotsPerPage: nextSpp,
      collection: nextCollection,
      wishlist: nextWishlist,
      setProgress: nextSetProgress,
      pokedex: nextPokedex,
      syncedAt: new Date().toISOString(),
    });
    this.persistStateImmediately();
  }

  private formatKaartspotToast(plan: KaartspotSyncPlan): string {
    const parts: string[] = [];
    if (plan.summary.newCollectionCount > 0) {
      parts.push(`+${plan.summary.newCollectionCount} in Collectie`);
    }
    if (plan.summary.pokedexSlotsUpdatedCount > 0) {
      parts.push(`${plan.summary.pokedexSlotsUpdatedCount} Pokédex-vakjes gekoppeld`);
    }
    if (plan.summary.newWishlistCount > 0) {
      parts.push(`+${plan.summary.newWishlistCount} op Verlanglijst`);
    }
    if (plan.summary.promotedFromWishlistCount > 0) {
      parts.push(`${plan.summary.promotedFromWishlistCount} wens(en) afgevinkt`);
    }
    if (parts.length === 0 && plan.targetSlotsPerPage !== null) {
      parts.push(`Binder-indeling bijgewerkt naar ${plan.targetSlotsPerPage} vakjes`);
    }
    return `Kaartspot gesynchroniseerd: ${parts.join(' · ')}!`;
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

    const queueStatus = this.enqueueAndSync(
      'addCard',
      payload as Record<string, unknown>,
      `Kaart toevoegen: ${newCard.name}`,
      { tempRowIndex: nextRowIndex < 0 ? nextRowIndex : undefined }
    );

    if (queueStatus === 'queued') {
      this.showToast(`${newCard.name} opgeslagen — wordt naar Google Sheets gesynct.`, 'success');
    } else if (queueStatus === 'offline') {
      this.showToast(`${newCard.name} opgeslagen in wachtrij (offline).`, 'warning');
    } else {
      this.showToast(`${newCard.name} opgeslagen & Pokédex gesynct!`, 'success');
    }
  }

  /**
   * Voegt meerdere geselecteerde kaarten in één atomische lokale update + één batch-sync toe.
   */
  async addCardsBatch(items: BatchCardCommitItem[]): Promise<BatchCardCommitResult> {
    if (!items || items.length === 0) {
      return { addedCount: 0, incrementedCount: 0, totalCopies: 0 };
    }

    const today = new Date().toISOString().slice(0, 10);
    const cfg = this.config();
    const isLiveConfigured = !cfg.demoMode && Boolean(cfg.webAppUrl?.trim() && cfg.apiToken?.trim());
    let workingCollection = [...this.collection()];
    const addedSetMetas: Array<{ setName: string; series: string; totalCards: number }> = [];
    const newMutations: PendingMutation[] = [];

    let addedCount = 0;
    let incrementedCount = 0;
    let totalCopies = 0;

    for (let idx = 0; idx < items.length; idx++) {
      const { payload, duplicateStrategy = 'increment' } = items[idx];
      const cleanCardId = (payload.cardId ?? '').trim();
      const cleanVariant = (payload.variant ?? 'Normal').trim() || 'Normal';
      const qty = Math.max(1, Math.floor(Number(payload.quantity) || 1));
      totalCopies += qty;

      const matchIndex =
        duplicateStrategy === 'increment' && cleanCardId
          ? workingCollection.findIndex(
              (c) =>
                c.cardId.trim().toLowerCase() === cleanCardId.toLowerCase() &&
                c.variant.trim().toLowerCase() === cleanVariant.toLowerCase()
            )
          : -1;

      if (matchIndex >= 0) {
        const existing = workingCollection[matchIndex];
        const nextQty = Math.max(1, existing.quantity + qty);
        workingCollection[matchIndex] = { ...existing, quantity: nextQty };
        incrementedCount++;

        if (isLiveConfigured) {
          newMutations.push({
            id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            action: 'updateCard',
            payload: {
              rowIndex: existing.rowIndex,
              cardId: existing.cardId,
              quantity: nextQty,
            },
            description: `Kaart bijwerken: ${existing.name}`,
            createdAt: new Date().toISOString(),
            ...(cfg.activeProfileId ? { profileId: cfg.activeProfileId } : {}),
            attempts: 0,
          });
        }
        continue;
      }

      const nextRowIndex = this.allocateLocalRowIndex(workingCollection.map((c) => c.rowIndex));
      const newCard: CollectionCard = {
        rowIndex: nextRowIndex,
        cardId: cleanCardId,
        name: (payload.name ?? '').trim(),
        setName: (payload.setName ?? '').trim(),
        cardNumber: (payload.cardNumber ?? '').trim(),
        language: payload.language ?? 'EN',
        type: payload.type ?? 'Colorless',
        rarity: payload.rarity ?? 'Rare',
        variant: cleanVariant,
        condition: payload.condition ?? 'Near Mint (NM)',
        grading: payload.grading ?? 'Raw',
        grade: payload.grade ?? '',
        quantity: qty,
        storageLocation: payload.storageLocation ?? 'Hoofdbinder',
        binderDetail: payload.binderDetail ?? '',
        purchaseDate: payload.purchaseDate ?? today,
        purchasePrice: roundCurrency(Math.max(0, Number(payload.purchasePrice) || 0)),
        marketPrice: roundCurrency(payload.marketPrice ?? 0),
        imageUrl: payload.imageUrl || resolveCardArtworkUrl(cleanCardId, undefined, 'high'),
        trendPercent: payload.trendPercent,
        forTrade: Boolean(payload.forTrade),
        acquisitionMethod: (payload.acquisitionMethod ?? '').trim(),
        notes: payload.notes ?? '',
      };

      workingCollection = [newCard, ...workingCollection];
      addedCount++;

      if (newCard.setName && payload.setTotalCards) {
        addedSetMetas.push({
          setName: newCard.setName,
          series: payload.seriesName || 'Pokémon TCG',
          totalCards: payload.setTotalCards,
        });
      }

      if (isLiveConfigured) {
        newMutations.push({
          id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          action: 'addCard',
          payload: {
            ...payload,
            cardId: cleanCardId,
            variant: cleanVariant,
            quantity: qty,
          } as Record<string, unknown>,
          description: `Kaart toevoegen: ${newCard.name}`,
          createdAt: new Date().toISOString(),
          ...(nextRowIndex < 0 ? { tempRowIndex: nextRowIndex } : {}),
          ...(cfg.activeProfileId ? { profileId: cfg.activeProfileId } : {}),
          attempts: 0,
        });
      }
    }

    this.bumpLocalRevision();
    this.applyLocalSnapshotUpdate({
      collection: workingCollection,
      addedSetMetas,
    });

    let queueStatus: 'skipped' | 'offline' | 'queued' = 'skipped';
    if (isLiveConfigured && newMutations.length > 0) {
      this.pendingQueue.update((q) => {
        let next = q;
        for (const mut of newMutations) {
          next = coalesceOutboxMutation(next, mut, this.inFlightIds);
        }
        return next;
      });
      this.lastError.set(null);
      this.hasShownOutboxErrorToast = false;
      this.persistStateImmediately();
      if (this.isOnline()) {
        void this.drainOutbox(true);
        queueStatus = 'queued';
      } else {
        queueStatus = 'offline';
      }
    } else {
      this.persistStateImmediately();
    }

    const copiesLabel = totalCopies > addedCount + incrementedCount ? ` (${totalCopies}×)` : '';
    let summaryText: string;
    if (addedCount > 0 && incrementedCount > 0) {
      summaryText = `${addedCount} nieuw en ${incrementedCount} bij bestaande${copiesLabel}`;
    } else if (incrementedCount > 0) {
      summaryText = `${incrementedCount} bestaande ${incrementedCount === 1 ? 'kaart' : 'kaarten'} bijgewerkt (+${totalCopies}×)`;
    } else {
      summaryText = `${addedCount} ${addedCount === 1 ? 'kaart' : 'kaarten'}${copiesLabel}`;
    }

    if (queueStatus === 'queued') {
      this.showToast(`${summaryText} opgeslagen — wordt naar Google Sheets gesynct.`, 'success');
    } else if (queueStatus === 'offline') {
      this.showToast(`${summaryText} opgeslagen in wachtrij (offline).`, 'warning');
    } else {
      this.showToast(`${summaryText} toegevoegd!`, 'success');
    }

    return { addedCount, incrementedCount, totalCopies };
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
    this.enqueueAndSync(
      'updateCard',
      payload as Record<string, unknown>,
      `Kaart bijwerken: ${cardId}`
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
    this.enqueueAndSync(
      'deleteCard',
      payload,
      `Kaart verwijderen: ${card.name}`
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
    this.persistStateImmediately();

    if (payload.dexNumber !== undefined) {
      this.enqueueAndSync(
        'updatePokedexSlot',
        payload as Record<string, unknown>,
        `Pokédex #${payload.dexNumber} bijwerken`
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

    this.enqueueAndSync(
      'addWishlist',
      { ...item, cardId: inferredCardId } as Record<string, unknown>,
      `Verlanglijst: ${item.cardName}`,
      { tempRowIndex: nextRow < 0 ? nextRow : undefined }
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
    let addedCardTempRow: number | undefined;
    if (cardPayload) {
      addedCardTempRow = this.allocateLocalRowIndex(this.collection().map((c) => c.rowIndex));
      const nextCollection: CollectionCard[] = [
        {
          rowIndex: addedCardTempRow,
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

    this.enqueueAndSync(
      'markWishlistFound',
      payload as unknown as Record<string, unknown>,
      `Gevonden: ${item.cardName}`,
      { tempRowIndex: addedCardTempRow !== undefined && addedCardTempRow < 0 ? addedCardTempRow : undefined }
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

    if (this.repo.updateWishlist || typeof this.repo.batchMutations === 'function') {
      this.enqueueAndSync(
        'updateWishlist',
        payload as unknown as Record<string, unknown>,
        `Bijwerken wens: ${merged.cardName}`
      );
    } else {
      this.persistStateImmediately();
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
    if (this.repo.deleteWishlist || typeof this.repo.batchMutations === 'function') {
      this.enqueueAndSync(
        'deleteWishlist',
        payload as Record<string, unknown>,
        `Verwijderd van verlanglijst: ${item.cardName}`
      );
    } else {
      this.persistStateImmediately();
    }
    this.showToast(`${item.cardName} verwijderd van Verlanglijst.`, 'info');
  }

  async logTrade(entry: Omit<TradeEntry, 'rowIndex' | 'netResult'>): Promise<void> {
    const netResult = roundCurrency(entry.saleValue - entry.purchasePrice - entry.platformFees);
    const nextTradeRow = this.allocateLocalRowIndex(this.trades().map((t) => t.rowIndex), 22);
    const newEntry: TradeEntry = {
      ...entry,
      rowIndex: nextTradeRow,
      netResult,
    };

    this.bumpLocalRevision();
    this.snapshot.update((snap) => ({
      ...snap,
      trades: [newEntry, ...snap.trades],
      syncedAt: new Date().toISOString(),
    }));

    this.enqueueAndSync(
      'logTrade',
      entry as Record<string, unknown>,
      `Transactie: ${entry.cardName}`,
      { tempRowIndex: nextTradeRow < 0 ? nextTradeRow : undefined }
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
  // OFFLINE OUTBOX & ACHTERGROND-SYNC
  // ==========================================================================

  async waitForPendingSync(): Promise<void> {
    while (this.activeDrainPromise) {
      await this.activeDrainPromise.catch(() => undefined);
    }
    await this.mutationChain.catch(() => undefined);
  }

  async flushOfflineQueue(silent = false): Promise<void> {
    this.lastError.set(null);
    this.hasShownOutboxErrorToast = false;
    await this.drainOutbox(silent);
  }

  private drainOutbox(silent = true): Promise<void> {
    if (this.activeDrainPromise) {
      // Wacht op de lopende run en start daarna zo nodig een vervolg-run voor nieuw binnengekomen items
      // (niet na een mislukte run: dan blijven items bewust in de wachtrij tot handmatig/online-retry)
      return this.activeDrainPromise.then(() =>
        this.canStartDrain() && !this.lastDrainFailed ? this.drainOutbox(silent) : undefined
      );
    }

    const run = async (): Promise<void> => {
      try {
        await this.drainOutboxLoop(silent);
      } finally {
        this.lastDrainFailed = Boolean(this.lastError());
        this.activeDrainPromise = null;
      }
    };

    this.activeDrainPromise = run();
    return this.activeDrainPromise;
  }

  private canStartDrain(): boolean {
    const cfg = this.config();
    if (cfg.demoMode || !cfg.webAppUrl?.trim() || !cfg.apiToken?.trim() || !this.isOnline()) {
      return false;
    }
    const activeProfileId = cfg.activeProfileId;
    return this.pendingQueue().some(
      (m) =>
        !this.inFlightIds.has(m.id) &&
        (!m.profileId || !activeProfileId || m.profileId === activeProfileId)
    );
  }

  private async drainOutboxLoop(silent: boolean): Promise<void> {
    let syncedCount = 0;

    while (true) {
      const cfg = this.config();
      const url = cfg.webAppUrl?.trim() ?? '';
      if (cfg.demoMode || !this.isOnline() || !url || !cfg.apiToken?.trim()) {
        break;
      }

      const activeProfileId = cfg.activeProfileId;
      const batch = this.pendingQueue().filter(
        (m) => !m.profileId || !activeProfileId || m.profileId === activeProfileId
      );
      if (batch.length === 0) {
        break;
      }

      this.beginSync();
      this.lastError.set(null);
      const revBefore = this.localRevision;
      const batchIds = batch.map((m) => m.id);
      for (const id of batchIds) {
        this.inFlightIds.add(id);
      }

      try {
        const canUseBatch =
          typeof this.repo.batchMutations === 'function' && !this.batchUnsupportedUrls.has(url);

        if (canUseBatch) {
          try {
            const payloadItems: BatchMutationItem[] = batch.map((m) => ({
              id: m.id,
              action: m.action,
              payload: m.payload,
              ...(m.tempRowIndex !== undefined ? { tempRowIndex: m.tempRowIndex } : {}),
            }));
            const needsBootstrap = batch.some(
              (m) =>
                (m.action === 'addCard' &&
                  (!String(m.payload['name'] ?? '').trim() ||
                    !String(m.payload['setName'] ?? '').trim())) ||
                m.action === 'addFeedback' ||
                m.action === 'updateFeedback' ||
                m.action === 'deleteFeedback'
            );

            const res = await this.repo.batchMutations!(cfg, payloadItems, {
              skipBootstrap: !needsBootstrap,
            });

            if (this.didTargetProfileChange(cfg)) {
              break;
            }

            const resultMap = new Map(res.results.map((r) => [r.id, r]));
            const succeededIds = new Set<string>();
            let firstError: string | null = null;

            for (const item of batch) {
              const itemRes = resultMap.get(item.id);
              if (!itemRes || !itemRes.ok) {
                if (!firstError) {
                  firstError = itemRes?.error || `Synchronisatie mislukt voor "${item.description}".`;
                }
                continue;
              }
              succeededIds.add(item.id);
              syncedCount++;

              if (
                item.action === 'addCard' &&
                item.tempRowIndex !== undefined &&
                item.tempRowIndex < 0 &&
                itemRes.result?.rowIndex &&
                itemRes.result.rowIndex >= 2
              ) {
                this.remapTempRow('collection', item.tempRowIndex, itemRes.result.rowIndex);
              } else if (
                item.action === 'addWishlist' &&
                item.tempRowIndex !== undefined &&
                item.tempRowIndex < 0 &&
                itemRes.result?.rowIndex &&
                itemRes.result.rowIndex >= 2
              ) {
                this.remapTempRow('wishlist', item.tempRowIndex, itemRes.result.rowIndex);
              } else if (
                item.action === 'logTrade' &&
                item.tempRowIndex !== undefined &&
                item.tempRowIndex < 0 &&
                itemRes.result?.rowIndex &&
                itemRes.result.rowIndex >= 2
              ) {
                this.snapshot.update((snap) =>
                  remapTempRowInSnapshot(snap, 'trades', item.tempRowIndex!, itemRes.result!.rowIndex!)
                );
              } else if (
                item.action === 'markWishlistFound' &&
                item.tempRowIndex !== undefined &&
                item.tempRowIndex < 0 &&
                itemRes.result?.addedCardRowIndex &&
                itemRes.result.addedCardRowIndex >= 2
              ) {
                this.remapTempRow('collection', item.tempRowIndex, itemRes.result.addedCardRowIndex);
              }
            }

            this.pendingQueue.update((q) =>
              q
                .filter((m) => !succeededIds.has(m.id))
                .map((m) =>
                  batchIds.includes(m.id) ? { ...m, attempts: (m.attempts ?? 0) + 1 } : m
                )
            );
            for (const id of batchIds) {
              this.inFlightIds.delete(id);
            }

            if (res.snapshot) {
              this.applyDetectedScriptVersion(url, res.snapshot.scriptVersion);
              if (this.canApplyRemoteSnapshot(revBefore)) {
                this.snapshot.set(this.reconcileRemoteSnapshot(res.snapshot));
              }
            }
            this.persistStateImmediately();

            if (firstError) {
              this.lastError.set(firstError);
              if (!this.hasShownOutboxErrorToast) {
                this.hasShownOutboxErrorToast = true;
                this.showToast('Lokaal bijgewerkt; opgeslagen in sync-wachtrij.', 'warning');
              }
              break;
            }
            this.hasShownOutboxErrorToast = false;
            continue;
          } catch (batchErr) {
            const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
            if (/Onbekende POST-actie:\s*batchMutations/i.test(msg)) {
              // Oudere Google Apps Script URL: onthoud dit voor deze URL en val terug op losse calls
              this.batchUnsupportedUrls.add(url);
              this.legacyAppsScriptDetected.set(true);
            } else {
              this.pendingQueue.update((q) =>
                q.map((m) =>
                  batchIds.includes(m.id) ? { ...m, attempts: (m.attempts ?? 0) + 1 } : m
                )
              );
              this.lastError.set(msg || 'Kon wijziging niet direct naar Sheets sturen.');
              this.persistStateImmediately();
              if (!this.hasShownOutboxErrorToast) {
                this.hasShownOutboxErrorToast = true;
                this.showToast('Lokaal bijgewerkt; opgeslagen in sync-wachtrij.', 'warning');
              }
              break;
            }
          }
        }

        const seqOutcome = await this.flushBatchSequentially(cfg, batchIds, revBefore);
        syncedCount += seqOutcome.syncedCount;
        if (seqOutcome.failedMessage) {
          this.lastError.set(seqOutcome.failedMessage);
          this.persistStateImmediately();
          if (!this.hasShownOutboxErrorToast) {
            this.hasShownOutboxErrorToast = true;
            this.showToast('Lokaal bijgewerkt; opgeslagen in sync-wachtrij.', 'warning');
          }
          break;
        }
        this.hasShownOutboxErrorToast = false;
      } finally {
        for (const id of batchIds) {
          this.inFlightIds.delete(id);
        }
        this.endSync();
      }
    }

    if (!silent && syncedCount > 0 && this.pendingQueue().length === 0) {
      this.showToast(`${syncedCount} offline wijziging(en) gesynchroniseerd met Google Sheets!`, 'success');
    }
  }

  private async flushBatchSequentially(
    cfg: AppConnectionConfig,
    batchIds: readonly string[],
    revBefore: number
  ): Promise<{ syncedCount: number; failedMessage: string | null }> {
    let lastUpdatedSnap: AppSnapshot | null = null;
    let syncedCount = 0;

    for (const id of batchIds) {
      const item = this.pendingQueue().find((q) => q.id === id);
      if (!item) continue;

      const prevSnap = this.snapshot();
      try {
        let returnedSnap: AppSnapshot | null = null;
        switch (item.action) {
          case 'addCard':
            returnedSnap = await this.repo.addCard(cfg, item.payload as AddCardPayload);
            break;
          case 'updateCard':
            returnedSnap = await this.repo.updateCard(cfg, item.payload as Partial<CollectionCard>);
            break;
          case 'deleteCard':
            returnedSnap = await this.repo.deleteCard(
              cfg,
              item.payload as { rowIndex?: number; cardId?: string }
            );
            break;
          case 'updatePokedexSlot':
            returnedSnap = await this.repo.updatePokedexSlot(
              cfg,
              item.payload as UpdatePokedexSlotPayload
            );
            break;
          case 'addWishlist':
            returnedSnap = await this.repo.addWishlist(
              cfg,
              item.payload as unknown as Omit<WishlistItem, 'rowIndex' | 'found'>
            );
            break;
          case 'markWishlistFound':
            returnedSnap = await this.repo.markWishlistFound(
              cfg,
              item.payload as unknown as MarkWishlistFoundPayload
            );
            break;
          case 'updateWishlist':
            if (this.repo.updateWishlist) {
              returnedSnap = await this.repo.updateWishlist(
                cfg,
                item.payload as unknown as UpdateWishlistPayload
              );
            }
            break;
          case 'deleteWishlist':
            if (this.repo.deleteWishlist) {
              returnedSnap = await this.repo.deleteWishlist(
                cfg,
                item.payload as { rowIndex: number; cardName?: string }
              );
            }
            break;
          case 'logTrade':
            returnedSnap = await this.repo.logTrade(
              cfg,
              item.payload as unknown as Omit<TradeEntry, 'rowIndex' | 'netResult'>
            );
            break;
        }

        if (this.didTargetProfileChange(cfg)) {
          return { syncedCount, failedMessage: null };
        }

        syncedCount++;
        this.pendingQueue.update((q) => q.filter((m) => m.id !== item.id));
        this.inFlightIds.delete(item.id);

        if (returnedSnap) {
          lastUpdatedSnap = returnedSnap;
          if (item.tempRowIndex !== undefined && item.tempRowIndex < 0) {
            if (item.action === 'addCard' || item.action === 'markWishlistFound') {
              const targetCardId =
                item.action === 'addCard'
                  ? String(item.payload['cardId'] ?? '')
                  : String((item.payload['cardPayload'] as AddCardPayload | undefined)?.cardId ?? '');
              const realRow = this.findAddedCollectionRowIndex(returnedSnap, prevSnap, targetCardId);
              if (realRow >= 2) {
                this.remapTempRow('collection', item.tempRowIndex, realRow);
              }
            } else if (item.action === 'addWishlist') {
              const realRow = this.findAddedWishlistRowIndex(
                returnedSnap,
                prevSnap,
                String(item.payload['cardName'] ?? '')
              );
              if (realRow >= 2) {
                this.remapTempRow('wishlist', item.tempRowIndex, realRow);
              }
            }
          }
        }
        this.persistStateImmediately();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Kon wijziging niet direct naar Sheets sturen.';
        this.pendingQueue.update((q) =>
          q.map((m) => (m.id === item.id ? { ...m, attempts: (m.attempts ?? 0) + 1 } : m))
        );
        return { syncedCount, failedMessage: msg };
      }
    }

    if (lastUpdatedSnap) {
      this.applyDetectedScriptVersion(cfg.webAppUrl, lastUpdatedSnap.scriptVersion);
      if (this.canApplyRemoteSnapshot(revBefore)) {
        this.snapshot.set(this.reconcileRemoteSnapshot(lastUpdatedSnap));
        this.persistStateImmediately();
      }
    }

    return { syncedCount, failedMessage: null };
  }

  private findAddedCollectionRowIndex(
    remote: AppSnapshot,
    previous: AppSnapshot,
    cardId: string
  ): number {
    const cleanId = cardId.trim().toLowerCase();
    if (!cleanId) return -1;
    const knownRows = new Set(previous.collection.filter((c) => c.rowIndex >= 2).map((c) => c.rowIndex));
    const newMatch = remote.collection.find(
      (c) => c.rowIndex >= 2 && c.cardId.trim().toLowerCase() === cleanId && !knownRows.has(c.rowIndex)
    );
    return newMatch ? newMatch.rowIndex : -1;
  }

  private findAddedWishlistRowIndex(
    remote: AppSnapshot,
    previous: AppSnapshot,
    cardName: string
  ): number {
    const cleanName = cardName.trim().toLowerCase();
    if (!cleanName) return -1;
    const knownRows = new Set(previous.wishlist.filter((w) => w.rowIndex >= 2).map((w) => w.rowIndex));
    const newMatch = remote.wishlist.find(
      (w) => w.rowIndex >= 2 && w.cardName.trim().toLowerCase() === cleanName && !knownRows.has(w.rowIndex)
    );
    return newMatch ? newMatch.rowIndex : -1;
  }

  private remapTempRow(entity: 'collection' | 'wishlist', tempRowIndex: number, realRowIndex: number): void {
    this.snapshot.update((snap) => remapTempRowInSnapshot(snap, entity, tempRowIndex, realRowIndex));
    this.pendingQueue.update((q) => remapTempRowInQueue(q, entity, tempRowIndex, realRowIndex));
  }

  private didTargetProfileChange(startedWith: AppConnectionConfig): boolean {
    const now = this.config();
    return (
      now.demoMode !== startedWith.demoMode ||
      now.webAppUrl.trim() !== startedWith.webAppUrl.trim() ||
      now.apiToken.trim() !== startedWith.apiToken.trim() ||
      now.activeProfileId !== startedWith.activeProfileId
    );
  }

  private persistStateImmediately(): void {
    const cfg = this.config();
    const snap = this.snapshot();
    if (cfg.demoMode) {
      this.cache.saveDemoSnapshot(snap);
    } else if (cfg.webAppUrl?.trim() && cfg.apiToken?.trim()) {
      this.cache.saveSnapshot(snap, cfg.activeProfileId);
    }
    this.cache.saveOfflineQueue(this.pendingQueue());
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
    addedSetMetas?: Array<{ setName: string; series: string; totalCards: number }>;
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
    const metaList = [
      ...(changes.addedSetMeta ? [changes.addedSetMeta] : []),
      ...(changes.addedSetMetas ?? []),
    ];
    for (const meta of metaList) {
      const exists = existingSetSeeds.some(
        (s) => s.setName.toLowerCase() === meta.setName.toLowerCase()
      );
      if (!exists) {
        existingSetSeeds.push({ ...meta, setCode: undefined });
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

  private enqueueAndSync(
    action: PendingMutation['action'],
    payload: Record<string, unknown>,
    description: string,
    options?: { tempRowIndex?: number }
  ): 'skipped' | 'offline' | 'queued' {
    const cfg = this.config();
    if (cfg.demoMode || !cfg.webAppUrl?.trim() || !cfg.apiToken?.trim()) {
      this.persistStateImmediately();
      return 'skipped';
    }

    const mutation: PendingMutation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action,
      payload,
      description,
      createdAt: new Date().toISOString(),
      ...(options?.tempRowIndex !== undefined ? { tempRowIndex: options.tempRowIndex } : {}),
      ...(cfg.activeProfileId ? { profileId: cfg.activeProfileId } : {}),
      attempts: 0,
    };

    this.pendingQueue.update((q) => coalesceOutboxMutation(q, mutation, this.inFlightIds));
    this.lastError.set(null);
    this.hasShownOutboxErrorToast = false;
    this.persistStateImmediately();

    if (!this.isOnline()) {
      return 'offline';
    }

    void this.drainOutbox(true);
    return 'queued';
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
