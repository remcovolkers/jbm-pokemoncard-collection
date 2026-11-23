import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDynamicSetCodesForTests } from '../domain/card-id.utils';
import { TcgdexAdapter } from './tcgdex.adapter';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('TcgdexAdapter', () => {
  let adapter: TcgdexAdapter;
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    window.localStorage.clear();
    resetDynamicSetCodesForTests();
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
    TestBed.configureTestingModule({});
    adapter = TestBed.inject(TcgdexAdapter);
  });

  afterEach(() => {
    resetDynamicSetCodesForTests();
    vi.unstubAllGlobals();
  });

  it('zoekt kaart via setcode-alias en valt terug van padded naar unpadded ID bij 404', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('Not found', { status: 404 })) // sv03.5-003 -> 404
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'sv03.5-3',
          localId: '3',
          name: 'Venusaur ex',
          image: 'https://assets.tcgdex.net/en/sv/sv03.5/003',
          rarity: 'Double rare',
          types: ['Grass'],
          dexId: [3],
          set: {
            id: 'sv03.5',
            name: '151',
            serie: { id: 'sv', name: 'Scarlet & Violet' },
            cardCount: { official: 165, total: 207 },
          },
          pricing: {
            cardmarket: { idProduct: 733794, trend: 4.5, avg30: 4.0, low: 2.5, avg: 5.0 },
          },
        })
      );

    const card = await adapter.lookupByCardId('MEW 3');
    expect(card).not.toBeNull();
    expect(card?.name).toBe('Venusaur ex');
    expect(card?.rarity).toBe('Double Rare');
    expect(card?.cardNumber).toBe('3/165');
    expect(card?.imageUrl).toBe('https://assets.tcgdex.net/en/sv/sv03.5/003/high.webp');
    expect(card?.marketPriceEur).toBe(4.5);
    expect(card?.cardmarketProductId).toBe(733794);
    expect(card?.trendPercent).toBe(12.5);
    expect(adapter.getCachedCardmarketProductId('sv03.5-3')).toBe(733794);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Tweede aanroep gebruikt in-memory cache (geen extra fetch!) en idProduct blijft bewaard in localStorage
    const cached = await adapter.getCardByExactId('sv03.5-3');
    expect(cached?.id).toBe('sv03.5-3');
    expect(cached?.cardmarketProductId).toBe(733794);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(adapter.getCachedArtworkUrl('sv03.5-3')).toBe(
      'https://assets.tcgdex.net/en/sv/sv03.5/003/high.webp'
    );
  });

  it('gebruikt Cardmarket prijs-cascade (avg7 / low) en normaliseert Trainer/Energy categorieën', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        id: 'sv03-197',
        localId: '197',
        name: 'Geeta',
        category: 'Trainer',
        rarity: 'Special illustration rare',
        set: { id: 'sv03', name: 'Obsidian Flames', cardCount: { official: 197, total: 230 } },
        pricing: {
          cardmarket: { trend: 0, avg7: 6.75, low: 4.2 },
        },
      })
    );

    const card = await adapter.getCardByExactId('sv03-197');
    expect(card?.type).toBe('Trainer');
    expect(card?.rarity).toBe('Special Illustration Rare');
    expect(card?.marketPriceEur).toBe(6.75);
    expect(card?.lowPriceEur).toBe(4.2);
  });

  it('prioriteert zoekresultaten met artwork in searchByName en handelt netwerkfouten netjes af', async () => {
    expect(await adapter.searchByName('a')).toEqual([]); // < 2 tekens

    fetchSpy.mockResolvedValueOnce(
      jsonResponse([
        { id: 'old-1', localId: '1', name: 'Pikachu' },
        { id: 'sv03.5-173', localId: '173', name: 'Pikachu', image: 'https://assets.tcgdex.net/en/sv/sv03.5/173' },
      ])
    );

    const results = await adapter.searchByName('Pikachu', 5);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('sv03.5-173');
    expect(results[0].imageUrl).toBe('https://assets.tcgdex.net/en/sv/sv03.5/173/low.webp');
    expect(adapter.getCachedArtworkUrl('sv03.5-173')).toBe(
      'https://assets.tcgdex.net/en/sv/sv03.5/173/high.webp'
    );

    fetchSpy.mockRejectedValueOnce(new Error('Offline'));
    expect(await adapter.searchByName('Mew')).toEqual([]);
  });

  it('laadt fysieke TCG-sets uit gebundelde sets-catalog.json, filtert TCG Pocket weg en cachet 24 uur', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        generatedAt: '2026-11-23T14:00:00Z',
        sets: [
          { id: 'me06', code: 'DLR', name: 'Delta Reign', series: 'Mega Evolution', seriesId: 'me', officialCount: 103, totalCount: 141 },
          { id: 'A1', code: 'A1', name: 'Genetic Apex', series: 'Pokémon TCG Pocket', seriesId: 'tcgp', officialCount: 226, totalCount: 286 },
          { id: 'sv03.5', code: 'MEW', name: '151', series: 'Scarlet & Violet', seriesId: 'sv', officialCount: 165, totalCount: 207 },
        ],
      })
    );

    const sets = await adapter.listAllSets();
    expect(sets.length).toBe(2);
    expect(sets[0].id).toBe('me06');
    expect(sets[0].code).toBe('DLR');
    expect(sets.some((s) => s.id === 'A1')).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Tweede aanroep komt direct uit cache (0 extra requests!)
    const cachedSets = await adapter.listAllSets();
    expect(cachedSets.length).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Kaarten van 1 set ophalen in 1 enkele request
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        id: 'me06',
        name: 'Delta Reign',
        abbreviation: { official: 'DLR' },
        serie: { id: 'me', name: 'Mega Evolution' },
        cardCount: { official: 103, total: 141 },
        cards: [
          { id: 'me06-011', localId: '011', name: 'Zorua', image: 'https://assets.tcgdex.net/en/me/me06/011' },
        ],
      })
    );

    const detail = await adapter.getSetCards('me06');
    expect(detail?.code).toBe('DLR');
    expect(detail?.cards.length).toBe(1);
    expect(detail?.cards[0].imageUrl).toContain('/low.webp');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Tweede aanroep voor dezelfde set gebruikt cache (geen extra fetch!)
    await adapter.getSetCards('me06');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('valt terug op TCGdex REST als sets-catalog.json ontbreekt en hydrateert onbekende setcodes automatisch', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 'base1', name: 'Base Set', cardCount: { official: 102, total: 102 } },
          { id: 'A1a', name: 'Mythical Island', cardCount: { official: 68, total: 86 } },
          { id: 'me06', name: 'Delta Reign', cardCount: { official: 103, total: 141 } },
        ])
      );

    const sets = await adapter.listAllSets();
    expect(sets.map((s) => s.id)).toEqual(['me06', 'base1']); // A1a TCG Pocket uitgefilterd!
    expect(sets[0].code).toBe('DLR');

    // Nieuwe adapter-instantie test automatische hydratie van splinternieuwe setcode FUT -> me07
    window.localStorage.clear();
    resetDynamicSetCodesForTests();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshAdapter = TestBed.inject(TcgdexAdapter);

    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse({
          sets: [{ id: 'me07', code: 'FUT', name: 'Future Set', series: 'Mega Evolution', seriesId: 'me', officialCount: 100, totalCount: 140 }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'me07-005',
          localId: '005',
          name: 'Zoroark ex',
          types: ['Darkness'],
          rarity: 'Double Rare',
          set: { id: 'me07', name: 'Future Set', cardCount: { official: 100, total: 140 } },
        })
      );

    const card = await freshAdapter.lookupByCardId('FUT 5');
    expect(card?.id).toBe('me07-005');
    expect(card?.name).toBe('Zoroark ex');
  });

  it('lost ontbrekende subset- en Trainer Kit-afbeeldingen automatisch op in getSetCards', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'swsh4.5sv',
          name: 'Shining Fates Shiny Vault',
          abbreviation: { official: 'SHF' },
          serie: { id: 'swsh', name: 'Sword & Shield' },
          cards: [{ id: 'swsh4.5sv-SV001', localId: 'SV001', name: 'Rowlet' }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'tk-ex-latia',
          name: 'EX trainer Kit (Latias)',
          tcgOnline: 'TK1A',
          serie: { id: 'tk', name: 'Trainer kits' },
          cards: [{ id: 'tk-ex-latia-4', localId: '4', name: 'Latias' }],
        })
      );

    const shinyVault = await adapter.getSetCards('swsh4.5sv');
    expect(shinyVault?.cards[0].imageUrl).toBe(
      'https://assets.tcgdex.net/en/swsh/swsh4.5/SV001/low.webp'
    );

    const trainerKit = await adapter.getSetCards('tk-ex-latia');
    expect(trainerKit?.cards[0].imageUrl).toBe('https://images.pokemontcg.io/tk1a/4.png');
  });
});
