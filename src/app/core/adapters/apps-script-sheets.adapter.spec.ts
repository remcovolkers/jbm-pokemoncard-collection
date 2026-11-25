import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppConnectionConfig } from '../domain/models';
import { AppsScriptSheetsAdapter } from './apps-script-sheets.adapter';
import { createDemoSnapshot } from './demo-data';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AppsScriptSheetsAdapter', () => {
  let adapter: AppsScriptSheetsAdapter;
  const fetchSpy = vi.fn<typeof fetch>();
  const validConfig: AppConnectionConfig = {
    webAppUrl: 'https://script.google.com/macros/s/demo123/exec',
    apiToken: 'my-secret-token',
    demoMode: false,
    monthlyBudget: 150,
  };

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
    TestBed.configureTestingModule({});
    adapter = TestBed.inject(AppsScriptSheetsAdapter);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('weigert aanroepen zonder geconfigureerde Web App URL of API-token', async () => {
    await expect(
      adapter.bootstrap({ ...validConfig, webAppUrl: '' })
    ).rejects.toThrow(/Web App URL/);

    await expect(
      adapter.bootstrap({ ...validConfig, apiToken: '' })
    ).rejects.toThrow(/API-token/);
  });

  it('test verbinding via GET ?action=ping&token=... en rapporteert zowel succes als fouten', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        spreadsheetName: 'Pokémon Kaartencollectie Tracker',
        scriptVersion: '2.1.0',
        syncedAt: '2026-11-23T10:00:00Z',
      })
    );

    const okRes = await adapter.testConnection(validConfig);
    expect(okRes.ok).toBe(true);
    expect(okRes.spreadsheetName).toBe('Pokémon Kaartencollectie Tracker');
    expect(okRes.scriptVersion).toBe('2.1.0');
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain('action=ping');
    expect(calledUrl).toContain('token=my-secret-token');

    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: false, error: 'Ongeldig token' }));
    const errRes = await adapter.testConnection(validConfig);
    expect(errRes.ok).toBe(false);
    expect(errRes.error).toContain('Ongeldig token');

    fetchSpy.mockRejectedValueOnce(new Error('Network down'));
    const netRes = await adapter.testConnection(validConfig);
    expect(netRes.ok).toBe(false);
    expect(netRes.error).toContain('Network down');
  });

  it('haalt volledige bootstrap snapshot op via GET ?action=bootstrap', async () => {
    const snap = createDemoSnapshot();
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true, data: snap }));

    const result = await adapter.bootstrap(validConfig);
    expect(result.collection.length).toBe(snap.collection.length);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('action=bootstrap');

    fetchSpy.mockResolvedValueOnce(new Response('Server error', { status: 500 }));
    await expect(adapter.bootstrap(validConfig)).rejects.toThrow(/HTTP 500/);
  });

  it('verstuurt alle POST-mutaties CORS-veilig met text/plain;charset=utf-8 en JSON-body', async () => {
    const snap = createDemoSnapshot();
    const cases: Array<{ name: string; run: () => Promise<unknown> }> = [
      { name: 'addCard', run: () => adapter.addCard(validConfig, { cardId: 'sv03-125', name: 'Charizard ex' }) },
      { name: 'updateCard', run: () => adapter.updateCard(validConfig, { rowIndex: 2, quantity: 3 }) },
      { name: 'deleteCard', run: () => adapter.deleteCard(validConfig, { rowIndex: 2 }) },
      { name: 'updatePokedexSlot', run: () => adapter.updatePokedexSlot(validConfig, { dexNumber: 3, inBinder: true }) },
      {
        name: 'addWishlist',
        run: () =>
          adapter.addWishlist(validConfig, {
            cardName: 'Lugia V',
            setName: 'Silver Tempest',
            cardNumber: '186/195',
            desiredVariant: 'Alt Art',
            minCondition: 'Near Mint (NM)',
            priority: 'Hoog',
            maxBudget: 160,
            marketPrice: 150,
            notes: '',
          }),
      },
      { name: 'markWishlistFound', run: () => adapter.markWishlistFound(validConfig, { rowIndex: 2, addToCollection: true }) },
      { name: 'updateWishlist', run: () => adapter.updateWishlist(validConfig, { rowIndex: 2, maxBudget: 175 }) },
      { name: 'deleteWishlist', run: () => adapter.deleteWishlist(validConfig, { rowIndex: 2, cardName: 'Lugia V' }) },
      {
        name: 'logTrade',
        run: () =>
          adapter.logTrade(validConfig, {
            date: '2026-11-23',
            cardName: 'Pikachu',
            setName: '151',
            type: 'Verkoop',
            purchasePrice: 15,
            saleValue: 28,
            platformFees: 1.5,
            counterparty: 'Cardmarket',
            notes: '',
          }),
      },
      { name: 'refreshPrices', run: () => adapter.refreshPrices(validConfig) },
    ];

    for (const tc of cases) {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ ok: true, data: snap, result: { updated: 5, total: 10 } })
      );
      await tc.run();

      const lastCall = fetchSpy.mock.calls.at(-1)!;
      const init = lastCall[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=utf-8');
      const parsedBody = JSON.parse(String(init.body));
      expect(parsedBody.token).toBe('my-secret-token');
      expect(parsedBody.action).toBe(tc.name);
    }
  });

  it('ondersteunt batchMutations met en zonder skipBootstrap en geeft legacy Apps Script fouten netjes door', async () => {
    const snap = createDemoSnapshot();

    // Met skipBootstrap: true hoeft response geen data (snapshot) te bevatten
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        result: {
          results: [{ id: 'm1', action: 'addCard', ok: true, result: { rowIndex: 12, cardId: 'sv03-125' } }],
        },
      })
    );

    const fastRes = await adapter.batchMutations(
      validConfig,
      [{ id: 'm1', action: 'addCard', payload: { cardId: 'sv03-125', name: 'Charizard ex' }, tempRowIndex: -1 }],
      { skipBootstrap: true }
    );
    expect(fastRes.snapshot).toBeUndefined();
    expect(fastRes.results).toHaveLength(1);
    expect(fastRes.results[0].result?.rowIndex).toBe(12);

    const fastBody = JSON.parse(String((fetchSpy.mock.calls.at(-1)![1] as RequestInit).body));
    expect(fastBody.action).toBe('batchMutations');
    expect(fastBody.skipBootstrap).toBe(true);
    expect(fastBody.payload.mutations).toHaveLength(1);

    // Zonder skipBootstrap vereist batchMutations wel data
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        result: { results: [{ id: 'm2', action: 'deleteCard', ok: true, result: { deletedRowIndex: 12 } }] },
        data: snap,
      })
    );
    const fullRes = await adapter.batchMutations(validConfig, [
      { id: 'm2', action: 'deleteCard', payload: { rowIndex: 12 } },
    ]);
    expect(fullRes.snapshot).toBeDefined();

    // Oudere Apps Script geeft "Onbekende POST-actie: batchMutations" terug
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: false, error: 'Onbekende POST-actie: batchMutations' }));
    await expect(
      adapter.batchMutations(validConfig, [{ id: 'm3', action: 'addCard', payload: {} }], { skipBootstrap: true })
    ).rejects.toThrow(/Onbekende POST-actie: batchMutations/);
  });

  it('resolveCardmarketUrls stuurt ptcg-ID’s zonder bootstrap en geeft de gevonden productlinks terug', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        result: {
          urls: { 'sv03.5-199': 'https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Charizard-ex-V3-MEW199' },
          notFound: ['zzz-1'],
        },
      })
    );
    const { urls, notFound } = await adapter.resolveCardmarketUrls(validConfig, [
      { cardId: 'sv03.5-199', ptcgId: 'sv3pt5-199' },
    ]);
    expect(urls['sv03.5-199']).toContain('/Singles/151/Charizard-ex-V3-MEW199');
    expect(notFound).toEqual(['zzz-1']);
    const body = JSON.parse(String((fetchSpy.mock.calls.at(-1)![1] as RequestInit).body));
    expect(body.action).toBe('resolveCardmarketUrls');
    expect(body.skipBootstrap).toBe(true);
    expect(body.payload.items[0]).toEqual({ cardId: 'sv03.5-199', ptcgId: 'sv3pt5-199' });
  });
});

