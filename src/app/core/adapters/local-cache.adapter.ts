import { Injectable } from '@angular/core';
import { AppConnectionConfig, AppSnapshot, PendingMutation } from '../domain/models';

const STORAGE_KEYS = {
  SNAPSHOT: 'pokebinder_snapshot_v1',
  CONFIG: 'pokebinder_config_v1',
  OFFLINE_QUEUE: 'pokebinder_offline_queue_v1',
  ARTWORK_CACHE: 'pokebinder_artwork_cache_v1',
  PACK_DEFAULTS: 'pokebinder_pack_defaults_v1',
} as const;

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

  loadSnapshot(): AppSnapshot | null {
    return this.readJson<AppSnapshot>(STORAGE_KEYS.SNAPSHOT);
  }

  saveSnapshot(snapshot: AppSnapshot): void {
    this.writeJson(STORAGE_KEYS.SNAPSHOT, snapshot);
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

  loadPackDefaults(): PackOpeningDefaults {
    const saved = this.readJson<Partial<PackOpeningDefaults>>(STORAGE_KEYS.PACK_DEFAULTS);
    return { ...DEFAULT_PACK, ...(saved ?? {}) };
  }

  savePackDefaults(defaults: PackOpeningDefaults): void {
    this.writeJson(STORAGE_KEYS.PACK_DEFAULTS, defaults);
  }

  clearDataCaches(): void {
    const s = this.storage;
    if (!s) return;
    s.removeItem(STORAGE_KEYS.SNAPSHOT);
    s.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    s.removeItem(STORAGE_KEYS.ARTWORK_CACHE);
  }

  getEstimatedCacheSizeKb(): number {
    const s = this.storage;
    if (!s) return 0;
    let bytes = 0;
    for (const key of Object.values(STORAGE_KEYS)) {
      const item = s.getItem(key);
      if (item) bytes += item.length * 2;
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
