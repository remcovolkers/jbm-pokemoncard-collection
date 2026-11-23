import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
    TestBed.configureTestingModule({});
    adapter = TestBed.inject(TcgdexAdapter);
  });

  afterEach(() => {
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
            cardmarket: { trend: 4.5, avg30: 4.0, low: 2.5, avg: 5.0 },
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
    expect(card?.trendPercent).toBe(12.5);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Tweede aanroep gebruikt in-memory cache (geen extra fetch!)
    const cached = await adapter.getCardByExactId('sv03.5-3');
    expect(cached?.id).toBe('sv03.5-3');
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

  it('laadt alle TCG-sets en set-kaarten in 1 request per aanroep met 24-uurs cache (geen throttling)', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse([
        { id: 'base1', name: 'Base Set', cardCount: { official: 102, total: 102 } },
        { id: 'sv03.5', name: '151', cardCount: { official: 165, total: 207 } },
      ])
    );

    const sets = await adapter.listAllSets();
    expect(sets.length).toBe(2);
    expect(sets[0].id).toBe('sv03.5'); // Nieuwste set eerst!
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Tweede aanroep komt direct uit cache (0 extra requests!)
    const cachedSets = await adapter.listAllSets();
    expect(cachedSets.length).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Kaarten van 1 set ophalen in 1 enkele request
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        id: 'sv03.5',
        name: '151',
        serie: { name: 'Scarlet & Violet' },
        cardCount: { official: 165, total: 207 },
        cards: [
          { id: 'sv03.5-001', localId: '001', name: 'Bulbasaur', image: 'https://assets.tcgdex.net/en/sv/sv03.5/001' },
        ],
      })
    );

    const detail = await adapter.getSetCards('sv03.5');
    expect(detail?.cards.length).toBe(1);
    expect(detail?.cards[0].imageUrl).toContain('/low.webp');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Tweede aanroep voor dezelfde set gebruikt cache (geen extra fetch!)
    await adapter.getSetCards('sv03.5');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
