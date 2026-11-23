import { Injectable } from '@angular/core';
import { AppConnectionConfig, AppSnapshot, BinderSlotsPerPage, PendingMutation } from '../domain/models';

const STORAGE_KEYS = {
  SNAPSHOT: 'pokebinder_snapshot_v1',
  DEMO_SNAPSHOT: 'pokebinder_demo_snapshot_v1',
  CONFIG: 'pokebinder_config_v1',
  OFFLINE_QUEUE: 'pokebinder_offline_queue_v1',
  ARTWORK_CACHE: 'pokebinder_artwork_cache_v1',
  CARDMARKET_ID_CACHE: 'pokebinder_cm_product_ids_v1',
  PACK_DEFAULTS: 'pokebinder_pack_defaults_v1',
  BINDER_LAYOUT: 'pokebinder_binder_layout_v1',
} as const;

export interface BinderLayoutPreference {
  slotsPerPage: BinderSlotsPerPage;
  remoteAtSave?: number;
}

export interface PackOpeningDefaults {
  enabled: boolean;
  setCode: string;
  condition: string;
  storageLocation: string;
  language: string;
}

const DEFAULT_CONFIG: AppConnectionConfig = {
  webAppUrl: '',
  apiToken: '',
  demoMode: true,
  monthlyBudget: 150,
};

const DEFAULT_PACK: PackOpeningDefaults = {
  enabled: false,
  setCode: 'MEW',
  condition: 'Near Mint (NM)',
  storageLocation: 'Hoofdbinder',
  language: 'EN',
};

@Injectable({ providedIn: 'root' })
export class LocalCacheAdapter {
  private get storage(): Storage | null {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  }

  private snapshotStorageKey(profileId?: string): string {
    const clean = profileId?.trim();
    return clean ? `${STORAGE_KEYS.SNAPSHOT}_${clean}` : STORAGE_KEYS.SNAPSHOT;
  }

  loadSnapshot(profileId?: string): AppSnapshot | null {
    return this.readJson<AppSnapshot>(this.snapshotStorageKey(profileId));
  }

  saveSnapshot(snapshot: AppSnapshot, profileId?: string): void {
    this.writeJson(this.snapshotStorageKey(profileId), snapshot);
  }

  removeProfileSnapshot(profileId: string): void {
    const s = this.storage;
    if (!s || !profileId?.trim()) return;
    try {
      s.removeItem(this.snapshotStorageKey(profileId));
    } catch {
      // Negeer opslagfout
    }
  }

  loadDemoSnapshot(): AppSnapshot | null {
    return this.readJson<AppSnapshot>(STORAGE_KEYS.DEMO_SNAPSHOT);
  }

  saveDemoSnapshot(snapshot: AppSnapshot): void {
    this.writeJson(STORAGE_KEYS.DEMO_SNAPSHOT, snapshot);
  }

  loadConfig(): AppConnectionConfig {
    const saved = this.readJson<Partial<AppConnectionConfig>>(STORAGE_KEYS.CONFIG);
    return { ...DEFAULT_CONFIG, ...(saved ?? {}) };
  }

  saveConfig(config: AppConnectionConfig): void {
    this.writeJson(STORAGE_KEYS.CONFIG, config);
  }

  loadOfflineQueue(): PendingMutation[] {
    return this.readJson<PendingMutation[]>(STORAGE_KEYS.OFFLINE_QUEUE) ?? [];
  }

  saveOfflineQueue(queue: PendingMutation[]): void {
    this.writeJson(STORAGE_KEYS.OFFLINE_QUEUE, queue);
  }

  loadArtworkCache(): Record<string, string> {
    return this.readJson<Record<string, string>>(STORAGE_KEYS.ARTWORK_CACHE) ?? {};
  }

  saveArtworkCache(map: Record<string, string>): void {
    this.writeJson(STORAGE_KEYS.ARTWORK_CACHE, map);
  }

  loadCardmarketIdCache(): Record<string, number> {
    return this.readJson<Record<string, number>>(STORAGE_KEYS.CARDMARKET_ID_CACHE) ?? {};
  }

  saveCardmarketIdCache(map: Record<string, number>): void {
    this.writeJson(STORAGE_KEYS.CARDMARKET_ID_CACHE, map);
  }

  loadPackDefaults(): PackOpeningDefaults {
    const saved = this.readJson<Partial<PackOpeningDefaults>>(STORAGE_KEYS.PACK_DEFAULTS);
    return { ...DEFAULT_PACK, ...(saved ?? {}) };
  }

  savePackDefaults(defaults: PackOpeningDefaults): void {
    this.writeJson(STORAGE_KEYS.PACK_DEFAULTS, defaults);
  }

  loadBinderLayoutPreference(): BinderLayoutPreference | null {
    const saved = this.readJson<Partial<BinderLayoutPreference>>(STORAGE_KEYS.BINDER_LAYOUT);
    const spp = saved?.slotsPerPage;
    if (spp === 4 || spp === 9 || spp === 12 || spp === 16 || spp === 20) {
      return {
        slotsPerPage: spp,
        remoteAtSave: typeof saved?.remoteAtSave === 'number' ? saved.remoteAtSave : undefined,
      };
    }
    return null;
  }

  saveBinderLayoutPreference(pref: BinderLayoutPreference | null): void {
    const s = this.storage;
    if (!s) return;
    if (!pref) {
      try {
        s.removeItem(STORAGE_KEYS.BINDER_LAYOUT);
      } catch {
        // Negeer opslagfout
      }
      return;
    }
    this.writeJson(STORAGE_KEYS.BINDER_LAYOUT, pref);
  }

  clearDataCaches(): void {
    const s = this.storage;
    if (!s) return;
    s.removeItem(STORAGE_KEYS.SNAPSHOT);
    s.removeItem(STORAGE_KEYS.DEMO_SNAPSHOT);
    s.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    s.removeItem(STORAGE_KEYS.ARTWORK_CACHE);
    s.removeItem(STORAGE_KEYS.CARDMARKET_ID_CACHE);

    // Ruim ook alle per-profiel snapshots (pokebinder_snapshot_v1_<id>) op
    const toRemove: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(`${STORAGE_KEYS.SNAPSHOT}_`)) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      s.removeItem(k);
    }
  }

  getEstimatedCacheSizeKb(): number {
    const s = this.storage;
    if (!s) return 0;
    const baseKeys = new Set<string>(Object.values(STORAGE_KEYS));
    let bytes = 0;
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k) continue;
      if (baseKeys.has(k) || k.startsWith(`${STORAGE_KEYS.SNAPSHOT}_`)) {
        const item = s.getItem(k);
        if (item) bytes += item.length * 2;
      }
    }
    return Math.round((bytes / 1024) * 10) / 10;
  }

  private readJson<T>(key: string): T | null {
    const s = this.storage;
    if (!s) return null;
    try {
      const raw = s.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private writeJson(key: string, value: unknown): void {
    const s = this.storage;
    if (!s) return;
    try {
      s.setItem(key, JSON.stringify(value));
    } catch {
      // Quota overschreden: negeer stil zodat de app bruikbaar blijft
    }
  }
}
