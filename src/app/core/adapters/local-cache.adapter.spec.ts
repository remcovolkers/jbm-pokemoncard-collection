import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoSnapshot } from './demo-data';
import { LocalCacheAdapter } from './local-cache.adapter';

describe('LocalCacheAdapter', () => {
  let adapter: LocalCacheAdapter;

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({});
    adapter = TestBed.inject(LocalCacheAdapter);
  });

  it('geeft veilige standaardwaarden terug wanneer localStorage leeg is', () => {
    expect(adapter.loadSnapshot()).toBeNull();
    expect(adapter.loadOfflineQueue()).toEqual([]);
    expect(adapter.loadArtworkCache()).toEqual({});
    expect(adapter.loadConfig()).toEqual({
      webAppUrl: '',
      apiToken: '',
      demoMode: true,
      monthlyBudget: 150,
    });
    expect(adapter.loadPackDefaults().enabled).toBe(false);
  });

  it('slaat snapshot, config, offline wachtrij, artwork en pack defaults betrouwbaar op', () => {
    const snap = createDemoSnapshot();
    adapter.saveSnapshot(snap);
    adapter.saveConfig({ webAppUrl: 'https://script.google.com/macros/s/test/exec', apiToken: 'tok123', demoMode: false, monthlyBudget: 200 });
    adapter.saveOfflineQueue([
      { id: 'm1', action: 'addCard', payload: { cardId: 'sv03-125' }, createdAt: '2026-01-01T00:00:00Z', description: 'Test' },
    ]);
    adapter.saveArtworkCache({ 'sv03-125': 'https://assets.tcgdex.net/en/sv/sv03/125/high.webp' });
    adapter.savePackDefaults({
      enabled: true,
      setCode: 'OBF',
      condition: 'Mint (MT)',
      storageLocation: 'Toploader Binder',
      language: 'JP',
    });

    expect(adapter.loadSnapshot()?.collection.length).toBe(snap.collection.length);
    expect(adapter.loadConfig().apiToken).toBe('tok123');
    expect(adapter.loadOfflineQueue().length).toBe(1);
    expect(adapter.loadArtworkCache()['sv03-125']).toContain('/high.webp');
    expect(adapter.loadPackDefaults().setCode).toBe('OBF');
    expect(adapter.getEstimatedCacheSizeKb()).toBeGreaterThan(1);
  });

  it('herstelt zonder crash bij corrupte JSON in localStorage', () => {
    window.localStorage.setItem('pokebinder_snapshot_v1', '{INVALID JSON');
    window.localStorage.setItem('pokebinder_offline_queue_v1', 'not-json');
    expect(adapter.loadSnapshot()).toBeNull();
    expect(adapter.loadOfflineQueue()).toEqual([]);
  });

  it('wist bij clearDataCaches wel snapshot/wachtrij/artwork maar behoudt de gebruikersconfiguratie', () => {
    adapter.saveSnapshot(createDemoSnapshot());
    adapter.saveConfig({ webAppUrl: 'https://example.com/exec', apiToken: 'secret', demoMode: false, monthlyBudget: 175 });
    adapter.saveOfflineQueue([
      { id: 'm1', action: 'deleteCard', payload: {}, createdAt: '2026-01-01T00:00:00Z', description: 'Del' },
    ]);
    adapter.saveArtworkCache({ 'base1-4': 'https://assets.tcgdex.net/en/base/base1/4/high.webp' });

    adapter.clearDataCaches();

    expect(adapter.loadSnapshot()).toBeNull();
    expect(adapter.loadOfflineQueue()).toEqual([]);
    expect(adapter.loadArtworkCache()).toEqual({});
    expect(adapter.loadConfig().apiToken).toBe('secret');
    expect(adapter.loadConfig().webAppUrl).toBe('https://example.com/exec');
  });
});
