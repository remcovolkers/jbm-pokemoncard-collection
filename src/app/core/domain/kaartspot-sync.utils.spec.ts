import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from '../adapters/demo-data';
import { extractArtworkUrlFromNotes } from './card-id.utils';
import {
  computeKaartspotSyncPlan,
  mapScrydexSetIdToTcgdex,
  parseKaartspotInput,
  parseKaartspotPublicPayload,
  selectDefaultBinderIds,
} from './kaartspot-sync.utils';
import { CatalogSetSummary } from './models';

const MOCK_SETS: CatalogSetSummary[] = [
  { id: 'sv07', code: 'SCR', name: 'Stellar Crown', series: 'Scarlet & Violet', officialCount: 142, totalCount: 175 },
  { id: 'base5', code: 'TR', name: 'Team Rocket', series: 'Base', officialCount: 82, totalCount: 83 },
  { id: 'sv06.5', code: 'SFA', name: 'Shrouded Fable', series: 'Scarlet & Violet', officialCount: 64, totalCount: 99 },
  { id: 'mep', code: 'MEP', name: 'MEP Black Star Promos', series: 'Mega Evolution', officialCount: 0, totalCount: 112 },
  { id: '30th', code: '30C', name: '30th Celebration', series: 'Mega Evolution', officialCount: 128, totalCount: 161 },
];

function createSampleKaartspotPayload(treeckoNogNodig: 0 | 1 = 1) {
  return {
    formaat: 2,
    berekendOp: '2026-11-25T10:39:57.268Z',
    eigenaar: {
      id: '39e87b2d-3d1c-47c2-bd55-55e1dd830f30',
      username: 'jellybeanmels',
    },
    binders: [
      {
        id: 'c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8',
        name: 'Pokedex',
        grid_size: 20,
      },
      {
        id: 'a8df6b01-9f25-471a-910c-6199f8a07933',
        name: 'Shrouded Fable Masterset',
        grid_size: 9,
      },
      {
        id: '88f71b2d-996f-4a8a-8b2e-dcf48d0b5e74',
        name: 'Sealed',
        grid_size: 20,
      },
    ],
    teksten: [
      'https://images.scrydex.com/pokemon/', // 0
      'Stellar Crown', // 1
      'Illustration Rare', // 2
      'NM', // 3
      'holofoil', // 4
      'EN', // 5
      'Team Rocket', // 6
      'Rare Holo', // 7
      'LP', // 8
      'Mega Evolution Black Star Promos', // 9
      'Promo', // 10
      'Shrouded Fable', // 11
      'Common', // 12
      'reverse_holofoil', // 13
      'https://images.pikaqian.com/originals/', // 14
      'Final Flame Dance', // 15
      'Rare Holo V', // 16
      'ZHT', // 17
    ],
    kolommen: [
      'id', 'binder', 'soort', 'spel', 'kaartId', 'naam', 'fotoBegin', 'fotoRest',
      'set', 'nummer', 'zeldzaamheid', 'conditie', 'druk', 'grader', 'cijfer',
      'blackLabel', 'taal', 'aantal', 'bod', 'nogNodig', 'volgorde', 'vakje',
      'waardeCents', 'eigenSoort', 'eigenWaarde',
    ],
    items: [
      // 1. Bulbasaur (#0001, vakje 0, nogNodig = 0 -> IN BEZIT)
      [
        '2c69167c-dd1a-476d-9eca-33c7cc4504b9', 0, 0, 0, 'card-bulba', 'Bulbasaur',
        0, 'sv7-143/small', 1, '143', 2, 3, 4, null, null, 0, 5, 1, 0, 0, 1, 0, 7499, null, 0,
      ],
      // 2. Dark Charizard (#0006, vakje 5, nogNodig = 0 -> IN BEZIT)
      [
        '7170083f-d229-4dec-9a76-64ea5ea5f409', 0, 0, 0, 'card-chari', 'Dark Charizard',
        0, 'base5-4/small', 6, '4', 7, 8, 4, null, null, 0, 5, 1, 0, 0, 6, 5, 63250, null, 0,
      ],
      // 3. Treecko (#0252, vakje 251, nogNodig = 1 -> GREYED OUT / NIET IN BEZIT!)
      [
        '5fec1c84-935a-40e6-bc82-bd644f6e0ede', 0, 0, 0, 'card-treecko', 'Treecko',
        0, 'mep-55/small', 9, '55', 10, 3, 4, null, null, 0, 5, 1, 0, treeckoNogNodig, 324, 251, 1102, null, 0,
      ],
      // 4. Chinese Dragonite V (#0149, vakje 148, ZHT taal, eigen CDN scan)
      [
        '99aa11bb-22cc-33dd-44ee-55ff66778899', 0, 0, 0, 'card-drago', 'Dragonite V',
        14, 'cs4.5c/dragonite-v.png', 15, '38', 16, 3, 4, null, null, 0, 17, 1, 0, 0, 149, 148, 450, null, 0,
      ],
      // 5. Meowth in Shrouded Fable Masterset (binder idx 1)
      [
        '01251e31-56ce-4dc2-a01f-eb27ea2e39ff', 1, 0, 0, 'card-meowth', 'Meowth',
        0, 'sv6pt5-48/small', 11, '48', 12, 3, 13, null, null, 0, 5, 1, 0, 0, 1, 47, 15, null, 0,
      ],
      // 6. Sealed boosterbox in Sealed binder (soort = 1 -> MOET OVERGESLAGEN WORDEN)
      [
        'sealed-001', 2, 1, 0, 'box-1', 'Stellar Crown Booster Box',
        0, 'sv7-box/small', 1, '', null, 3, null, null, null, 0, 5, 1, 0, 0, 1, 0, 14500, null, 0,
      ],
    ],
  };
}

describe('kaartspot-sync.utils', () => {
  it('parset wrapped-links, profiel-links en losse gebruikersnamen correct', () => {
    const wrapped = parseKaartspotInput(
      'https://kaartspot.nl/wrapped/jellybeanmels?cat=c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8'
    );
    expect(wrapped).toEqual({
      rawInput: 'https://kaartspot.nl/wrapped/jellybeanmels?cat=c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8',
      username: 'jellybeanmels',
      targetBinderId: 'c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8',
      apiUrl: 'https://kaartspot.nl/api/binder-publiek/jellybeanmels',
    });

    const profileLink = parseKaartspotInput(
      'https://kaartspot.nl/profiel/jellybeanmels?tab=binder&binder=a8df6b01-9f25-471a-910c-6199f8a07933'
    );
    expect(profileLink?.username).toBe('jellybeanmels');
    expect(profileLink?.targetBinderId).toBe('a8df6b01-9f25-471a-910c-6199f8a07933');

    const handleOnly = parseKaartspotInput('@jellybeanmels');
    expect(handleOnly?.username).toBe('jellybeanmels');
    expect(handleOnly?.targetBinderId).toBeNull();

    expect(parseKaartspotInput('https://evil.example.com/wrapped/test')).toBeNull();
  });

  it('vertaalt Scrydex set-IDs deterministisch naar TCGdex set-IDs', () => {
    expect(mapScrydexSetIdToTcgdex('sv7')).toBe('sv07');
    expect(mapScrydexSetIdToTcgdex('sv3pt5')).toBe('sv03.5');
    expect(mapScrydexSetIdToTcgdex('me2pt5')).toBe('me02.5');
    expect(mapScrydexSetIdToTcgdex('me55')).toBe('30th');
    expect(mapScrydexSetIdToTcgdex('base6')).toBe('lc');
    expect(mapScrydexSetIdToTcgdex('tk3b')).toBe('tk-dp-l');
    expect(mapScrydexSetIdToTcgdex('swsh12pt5')).toBe('swsh12.5');
  });

  it('scheidt verkregen kaarten (nogNodig=0) strikt van greyed-out kaarten (nogNodig=1 zoals Treecko)', () => {
    const profile = parseKaartspotPublicPayload(createSampleKaartspotPayload(1), MOCK_SETS);

    expect(profile.username).toBe('jellybeanmels');
    expect(profile.totalSealedSkipped).toBe(1);

    const dexBinder = profile.binders.find((b) => b.name === 'Pokedex')!;
    expect(dexBinder.ownedCardCount).toBe(3); // Bulbasaur, Dark Charizard, Dragonite V
    expect(dexBinder.wantedCardCount).toBe(1); // Treecko!
    expect(dexBinder.supportedSlotsPerPage).toBe(20);

    const defaultSelected = selectDefaultBinderIds(
      profile,
      'c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8'
    );
    expect(defaultSelected).toEqual(['c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8']);

    const emptySnap = createEmptySnapshot();
    const plan = computeKaartspotSyncPlan(
      profile,
      {
        selectedBinderIds: defaultSelected,
        wishlistWanted: true,
        syncLayout: true,
      },
      emptySnap
    );

    // 3 verkregen kaarten gaan naar Collectie & Pokédex Binder; Treecko NIET!
    expect(plan.cardsToAdd.map((c) => c.name)).toEqual([
      'Bulbasaur',
      'Dark Charizard',
      'Dragonite V',
    ]);
    expect(plan.cardsToAdd[0].cardId).toBe('sv07-143');
    expect(plan.cardsToAdd[0].cardNumber).toBe('143/142');
    expect(plan.cardsToAdd[0].marketPrice).toBe(74.99);
    expect(plan.cardsToAdd[1].cardId).toBe('base5-4');
    expect(plan.cardsToAdd[1].condition).toBe('Light Played (LP)');

    // Chinese ZHT kaart bewaart directe afbeelding-URL in notities
    expect(extractArtworkUrlFromNotes(plan.cardsToAdd[2].notes)).toBe(
      'https://images.pikaqian.com/originals/cs4.5c/dragonite-v.png'
    );

    // Echte Chinese setcode uit het Pikaqian-pad wordt bewaard (payload + notities)
    expect(plan.cardsToAdd[2].setCode).toBe('CS4.5C');
    expect(plan.cardsToAdd[2].notes).toContain('[SET:CS4.5C]');
    expect(plan.cardsToAdd[0].setCode).toBeUndefined();

    // Pokédex slots: #1 Bulbasaur, #6 Charizard, #149 Dragonite — GEEN #252 Treecko!
    expect(plan.pokedexUpdates.map((u) => u.dexNumber)).toEqual([1, 6, 149]);
    expect(plan.targetSlotsPerPage).toBe(20);

    // Treecko (nogNodig=1) belandt netjes op Verlanglijst
    expect(plan.wishlistToAdd).toHaveLength(1);
    expect(plan.wishlistToAdd[0].cardName).toBe('Treecko');
    expect(plan.wishlistToAdd[0].cardId).toBe('mep-055');
    expect(plan.wishlistToAdd[0].notes).toContain('Pokédex #0252');
  });

  it('is 100% idempotent bij her-sync en promoveert Treecko van Verlanglijst -> Collectie zodra nogNodig=0 wordt', () => {
    const initialProfile = parseKaartspotPublicPayload(createSampleKaartspotPayload(1), MOCK_SETS);
    const snap = createEmptySnapshot();

    const firstPlan = computeKaartspotSyncPlan(
      initialProfile,
      {
        selectedBinderIds: ['c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8'],
        wishlistWanted: true,
        syncLayout: true,
      },
      snap
    );

    // Simuleer dat firstPlan is toegepast op de snapshot
    const afterFirstSnap = {
      ...snap,
      binderSlotsPerPage: 20 as const,
      collection: firstPlan.cardsToAdd.map((c, i) => ({
        ...c,
        rowIndex: i + 2,
        purchaseDate: '2026-11-25',
      })),
      wishlist: firstPlan.wishlistToAdd.map((w, i) => ({
        ...w,
        rowIndex: i + 2,
        found: false,
      })),
      pokedex: snap.pokedex.map((slot) => {
        const upd = firstPlan.pokedexUpdates.find((u) => u.dexNumber === slot.dexNumber);
        return upd ? { ...slot, inBinder: true, selectedCard: upd.selectedCard } : slot;
      }),
    };

    // 1. Direct opnieuw syncen met exact dezelfde Kaartspot-data -> 0 wijzigingen / 0 duplicaten!
    const secondPlan = computeKaartspotSyncPlan(
      initialProfile,
      {
        selectedBinderIds: ['c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8'],
        wishlistWanted: true,
        syncLayout: true,
      },
      afterFirstSnap
    );
    expect(secondPlan.summary.hasAnyChanges).toBe(false);
    expect(secondPlan.cardsToAdd).toHaveLength(0);
    expect(secondPlan.wishlistToAdd).toHaveLength(0);
    expect(secondPlan.pokedexUpdates).toHaveLength(0);

    // 2. Mel vinkt Treecko op Kaartspot aan als verkregen (nogNodig: 1 -> 0)!
    const updatedProfile = parseKaartspotPublicPayload(createSampleKaartspotPayload(0), MOCK_SETS);
    const thirdPlan = computeKaartspotSyncPlan(
      updatedProfile,
      {
        selectedBinderIds: ['c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8'],
        wishlistWanted: true,
        syncLayout: true,
      },
      afterFirstSnap
    );

    expect(thirdPlan.cardsToAdd.map((c) => c.name)).toEqual(['Treecko']);
    expect(thirdPlan.wishlistRowsToMarkFound).toEqual([2]); // rij 2 op Verlanglijst wordt Gevonden!
    expect(thirdPlan.pokedexUpdates.map((u) => u.dexNumber)).toEqual([252]); // #0252 Treecko nu In Binder!
  });
});
