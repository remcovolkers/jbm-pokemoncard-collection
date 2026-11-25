import { afterEach, describe, expect, it } from 'vitest';
import {
  SET_CODE_ALIASES,
  buildCardmarketNameSearchUrl,
  buildCardmarketSearchUrl,
  buildPokemonTcgAssetUrl,
  buildTcgdexAssetUrl,
  extractCardmarketUrlFromNotes,
  getDisplaySetCode,
  hasKnownSetCode,
  inferCardIdFromSetAndNumber,
  inferTcgdexSeriesFolder,
  parseCardIdInput,
  registerDynamicSetCodes,
  resetDynamicSetCodesForTests,
  resolveCardArtworkUrl,
  extractSetCodeFromImagePath,
  extractSetCodeFromNotes,
  getCardSetCode,
  normalizeSetDisplayName,
  repairCorruptedCardNumber,
  toPokemonTcgCardId,
  resolveCardmarketUrl,
} from './card-id.utils';
import { withCardmarketLanguage } from './card-language.utils';

describe('card-id.utils', () => {
  afterEach(() => {
    resetDynamicSetCodesForTests();
  });

  describe('parseCardIdInput', () => {
    it('vertaalt bekende setcode-aliassen (incl. Mega Evolution & SV10.5) naar officiële TCGdex set-IDs', () => {
      expect(parseCardIdInput('DLR 11')?.normalizedId).toBe('me06-011');
      expect(parseCardIdInput('DLR 11')?.candidateIds).toEqual(['me06-011', 'me06-11']);
      expect(parseCardIdInput('PBL 5')?.normalizedId).toBe('me05-005');
      expect(parseCardIdInput('MEG 1/132')?.normalizedId).toBe('me01-001');
      expect(parseCardIdInput('WHT 12')?.normalizedId).toBe('sv10.5w-012');
      expect(parseCardIdInput('BLK 7')?.normalizedId).toBe('sv10.5b-007');
      expect(parseCardIdInput('MEW 181')?.normalizedId).toBe('sv03.5-181');
      expect(parseCardIdInput('151 199')?.normalizedId).toBe('sv03.5-199');
      expect(parseCardIdInput('OBF 199/197')?.normalizedId).toBe('sv03-199');
      expect(parseCardIdInput('SVI 1')?.normalizedId).toBe('sv01-001');
      expect(parseCardIdInput('PAL 203/193')?.normalizedId).toBe('sv02-203');
      expect(parseCardIdInput('EVS 215')?.normalizedId).toBe('swsh7-215');
      expect(parseCardIdInput('FST 271/264')?.normalizedId).toBe('swsh8-271');
      expect(parseCardIdInput('LOR 186/196')?.normalizedId).toBe('swsh11-186');
      expect(parseCardIdInput('BS 44')?.normalizedId).toBe('base1-44');
      expect(parseCardIdInput('EXP 13/165')?.normalizedId).toBe('ecard1-13');
    });

    it('ondersteunt gedeelde kaartcodes zoals 30C (30th Celebration én 30th Classic Collection) en koppelteken-IDs', () => {
      const thirty = parseCardIdInput('30C 15');
      expect(thirty?.normalizedId).toBe('30th-015');
      expect(thirty?.candidateIds).toEqual(['30th-015', '30th-15', '30th-c-015', '30th-c-15']);

      const directClassic = parseCardIdInput('30th-c-015');
      expect(directClassic?.tcgdexSetId).toBe('30th-c');
      expect(directClassic?.normalizedId).toBe('30th-c-015');
    });

    it('ondersteunt dynamisch geregistreerde toekomstige setcodes uit sets-catalog.json', () => {
      expect(hasKnownSetCode('FUT')).toBe(false);
      registerDynamicSetCodes([{ id: 'me07', code: 'FUT' }]);
      expect(hasKnownSetCode('FUT')).toBe(true);
      expect(parseCardIdInput('FUT 9')?.normalizedId).toBe('me07-009');
      expect(getDisplaySetCode('me07-009')).toBe('FUT');
      expect(getDisplaySetCode('me07')).toBe('FUT');
    });

    it('accepteert verschillende scheidingstekens (#, :, spatie, koppelteken) en case-insensitivity', () => {
      expect(parseCardIdInput('mew #181')?.normalizedId).toBe('sv03.5-181');
      expect(parseCardIdInput('mew:181/165')?.normalizedId).toBe('sv03.5-181');
      expect(parseCardIdInput('  MEW   003/165  ')?.normalizedId).toBe('sv03.5-003');
      expect(parseCardIdInput('sv03.5-181')?.normalizedId).toBe('sv03.5-181');
    });

    it('normaliseert voorloopnullen en zet kandidaat-volgorde optimaal per era', () => {
      // Scarlet & Violet prefereert 3-cijferig met voorloopnullen
      const svLow = parseCardIdInput('MEW 3');
      expect(svLow?.normalizedId).toBe('sv03.5-003');
      expect(svLow?.candidateIds).toEqual(['sv03.5-003', 'sv03.5-3']);

      // WOTC / SWSH prefereert ongevuld nummer eerst, met padded3 als fallback
      const baseCard = parseCardIdInput('BS 044/102');
      expect(baseCard?.normalizedId).toBe('base1-44');
      expect(baseCard?.candidateIds[0]).toBe('base1-44');
      expect(baseCard?.candidateIds).toContain('base1-044');
    });

    it('verwerkt subset-kaartnummers zoals GG70, TG05 en SV001 inclusief multi-set aliassen', () => {
      const crz = parseCardIdInput('CRZ GG70/GG70');
      expect(crz?.tcgdexSetId).toBe('swsh12.5');
      expect(crz?.localNumber).toBe('GG70');
      expect(crz?.normalizedId).toBe('swsh12.5-GG70');
      expect(crz?.candidateIds).toContain('swsh12.5gg-GG70');

      const lor = parseCardIdInput('LOR TG05/TG30');
      expect(lor?.normalizedId).toBe('swsh11-TG05');
      expect(lor?.candidateIds).toContain('swsh11tg-TG05');

      const shf = parseCardIdInput('SHF SV001');
      expect(shf?.candidateIds).toContain('swsh4.5-SV001');
      expect(shf?.candidateIds).toContain('swsh4.5sv-SV001');

      expect(parseCardIdInput('SVP 44')?.normalizedId).toBe('svp-044');
      expect(inferCardIdFromSetAndNumber('151', '181/165')).toBe('sv03.5-181');
      expect(inferCardIdFromSetAndNumber('SVP Black Star Promos', '44')).toBe('svp-044');
      expect(
        inferCardIdFromSetAndNumber('Stellar Crown', '142/142', [
          { id: 'sv07', code: 'SCR', name: 'Stellar Crown' },
        ])
      ).toBe('sv07-142');
    });

    it('behoudt onbekende setcodes in lowercase zonder te crashen', () => {
      const unknown = parseCardIdInput('XY7 98/98');
      expect(unknown?.tcgdexSetId).toBe('xy7');
      expect(unknown?.normalizedId).toBe('xy7-98');
    });

    it('retourneert null bij lege of ongeldige invoer', () => {
      expect(parseCardIdInput('')).toBeNull();
      expect(parseCardIdInput('   ')).toBeNull();
      expect(parseCardIdInput('Charizard')).toBeNull();
      expect(parseCardIdInput('MEW')).toBeNull();
    });

    it('bevat aliassen voor alle gevraagde basissets', () => {
      expect(SET_CODE_ALIASES['MEW']).toBe('sv03.5');
      expect(SET_CODE_ALIASES['OBF']).toBe('sv03');
      expect(SET_CODE_ALIASES['SVI']).toBe('sv01');
      expect(SET_CODE_ALIASES['EVS']).toBe('swsh7');
      expect(SET_CODE_ALIASES['BS']).toBe('base1');
    });
  });

  describe('inferTcgdexSeriesFolder & buildTcgdexAssetUrl', () => {
    it('leidt TCGdex serie-mappen af voor alle eras (incl. Mega Evolution & 30th)', () => {
      expect(inferTcgdexSeriesFolder('sv03.5')).toBe('sv');
      expect(inferTcgdexSeriesFolder('me06')).toBe('me');
      expect(inferTcgdexSeriesFolder('30th')).toBe('me');
      expect(inferTcgdexSeriesFolder('30th-c')).toBe('me');
      expect(inferTcgdexSeriesFolder('swsh7')).toBe('swsh');
      expect(inferTcgdexSeriesFolder('cel25')).toBe('swsh');
      expect(inferTcgdexSeriesFolder('sm12')).toBe('sm');
      expect(inferTcgdexSeriesFolder('det1')).toBe('sm');
      expect(inferTcgdexSeriesFolder('xy12')).toBe('xy');
      expect(inferTcgdexSeriesFolder('bw11')).toBe('bw');
      expect(inferTcgdexSeriesFolder('hgss4')).toBe('hgss');
      expect(inferTcgdexSeriesFolder('dp7')).toBe('dp');
      expect(inferTcgdexSeriesFolder('pl4')).toBe('pl');
      expect(inferTcgdexSeriesFolder('ex8')).toBe('ex');
      expect(inferTcgdexSeriesFolder('ecard1')).toBe('ecard');
      expect(inferTcgdexSeriesFolder('neo1')).toBe('neo');
      expect(inferTcgdexSeriesFolder('gym2')).toBe('gym');
      expect(inferTcgdexSeriesFolder('base1')).toBe('base');
    });

    it('bouwt hoge- en lage-resolutie TCGdex artwork URLs', () => {
      expect(buildTcgdexAssetUrl('https://assets.tcgdex.net/en/sv/sv03.5/199', 'high')).toBe(
        'https://assets.tcgdex.net/en/sv/sv03.5/199/high.webp'
      );
      expect(buildTcgdexAssetUrl('https://assets.tcgdex.net/en/sv/sv03.5/199/', 'low')).toBe(
        'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp'
      );
      expect(buildTcgdexAssetUrl('https://example.com/custom.png')).toBe('https://example.com/custom.png');
      expect(buildTcgdexAssetUrl('sv03.5-199', 'high')).toBe(
        'https://assets.tcgdex.net/en/sv/sv03.5/199/high.webp'
      );
      expect(buildTcgdexAssetUrl('base1-44', 'low')).toBe(
        'https://assets.tcgdex.net/en/base/base1/44/low.webp'
      );
      expect(buildTcgdexAssetUrl('me06-011', 'high')).toBe(
        'https://assets.tcgdex.net/en/me/me06/011/high.webp'
      );
      expect(buildTcgdexAssetUrl('30th-c-015', 'high')).toBe(
        'https://assets.tcgdex.net/en/me/30th-c/015/high.webp'
      );
      expect(buildTcgdexAssetUrl('swsh4.5sv-SV001', 'low')).toBe(
        'https://assets.tcgdex.net/en/swsh/swsh4.5/SV001/low.webp'
      );
      expect(buildTcgdexAssetUrl('swsh9tg-TG01', 'high')).toBe(
        'https://assets.tcgdex.net/en/swsh/swsh9/TG01/high.webp'
      );
      expect(buildTcgdexAssetUrl('')).toBe('');
      expect(buildTcgdexAssetUrl('invalidid')).toBe('');
    });

    it('bouwt PokemonTCG CDN fallback URLs en kiest slimme artwork-resolutie per set', () => {
      expect(buildPokemonTcgAssetUrl('tk-ex-latia-4', 'low')).toBe(
        'https://images.pokemontcg.io/tk1a/4.png'
      );
      expect(buildPokemonTcgAssetUrl('tk-ex-latia-4', 'high')).toBe(
        'https://images.pokemontcg.io/tk1a/4_hires.png'
      );
      expect(buildPokemonTcgAssetUrl('sm3.5-1', 'low')).toBe(
        'https://images.pokemontcg.io/sm35/1.png'
      );
      expect(buildPokemonTcgAssetUrl('svp-085', 'low')).toBe(
        'https://images.pokemontcg.io/svp/85.png'
      );
      expect(buildPokemonTcgAssetUrl('ecard3-H01', 'low')).toBe(
        'https://images.pokemontcg.io/ecard3/H1.png'
      );
      expect(buildPokemonTcgAssetUrl('me06-011', 'low')).toBe('');

      // resolveCardArtworkUrl: expliciete imageBase -> TCGdex parent subset -> PokemonTCG fallback
      expect(resolveCardArtworkUrl('sv03.5-199', 'https://assets.tcgdex.net/en/sv/sv03.5/199', 'low')).toBe(
        'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp'
      );
      expect(resolveCardArtworkUrl('swsh4.5sv-SV001', undefined, 'low')).toBe(
        'https://assets.tcgdex.net/en/swsh/swsh4.5/SV001/low.webp'
      );
      expect(resolveCardArtworkUrl('tk-ex-latia-1', undefined, 'low')).toBe(
        'https://images.pokemontcg.io/tk1a/1.png'
      );
    });
  });

  describe('getDisplaySetCode & buildCardmarketSearchUrl', () => {
    it('geeft herkenbare geprinte kaartcode terug of fallback op basis van setnaam', () => {
      expect(getDisplaySetCode('me06-011')).toBe('DLR');
      expect(getDisplaySetCode('me05-005')).toBe('PBL');
      expect(getDisplaySetCode('30th-015')).toBe('30C');
      expect(getDisplaySetCode('30th-c-015')).toBe('30C');
      expect(getDisplaySetCode('me06')).toBe('DLR');
      expect(getDisplaySetCode('sv10.5b')).toBe('BLK');
      expect(getDisplaySetCode('sv03.5-199')).toBe('MEW');
      expect(getDisplaySetCode('swsh7-215')).toBe('EVS');
      expect(getDisplaySetCode('base1-44')).toBe('BS');
      expect(getDisplaySetCode('xy12-108')).toBe('XY12');
      expect(getDisplaySetCode('custom', 'Scarlet Violet Promo')).toBe('SVP');
      expect(getDisplaySetCode('custom')).toBe('TCG');
    });

    it('bouwt geldige gecodeerde Cardmarket Singles zoek-URLs zonder breekbare setnaam of voorloopnullen', () => {
      const url = buildCardmarketSearchUrl('Charizard ex', '151', '199/165');
      expect(url).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=Charizard%20ex%20199');
      const paddedUrl = buildCardmarketSearchUrl('Zorua', 'Delta Reign', '011/103');
      expect(paddedUrl).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=Zorua%2011');
      expect(buildCardmarketSearchUrl('Mew', 'Crown Zenith', 'GG10/GG70')).toBe(
        'https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=Mew%20GG10'
      );
      expect(buildCardmarketSearchUrl('Pikachu')).toBe(
        'https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=Pikachu'
      );
    });

    it('gebruikt nooit de kale idProduct-link (401) maar de kanonieke slug uit notities of de zoeklink', () => {
      // Oude Products?idProduct=-links in notities worden genegeerd (geven regelmatig een 401)
      expect(
        extractCardmarketUrlFromNotes('Sleeve: Dragon Shield · https://www.cardmarket.com/en/Pokemon/Products?idProduct=274057')
      ).toBeNull();

      expect(
        extractCardmarketUrlFromNotes('https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Dark-Charizard-TR4')
      ).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Dark-Charizard-TR4');

      // Oude generieke zoeklinks mogen NIET worden opgepikt als directe productlink
      expect(
        extractCardmarketUrlFromNotes('https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Charizard')
      ).toBeNull();
      expect(
        extractCardmarketUrlFromNotes('https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=Charizard')
      ).toBeNull();

      // Prioriteit: 1) kanonieke slug in notes -> 2) Singles-zoeklink (naam + nummer)
      expect(
        resolveCardmarketUrl({
          name: 'Dark Charizard',
          setName: 'Team Rocket',
          cardNumber: '4/82',
          notes: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Dark-Charizard-TR4',
        })
      ).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Dark-Charizard-TR4');

      const withIdProductNote = resolveCardmarketUrl({
        name: 'Dark Charizard',
        setName: 'Team Rocket',
        cardNumber: '4/82',
        notes: 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=274057',
      });
      expect(withIdProductNote).not.toContain('idProduct');
      expect(withIdProductNote).toBe(
        'https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=Dark%20Charizard%204'
      );
    });
  });
});

describe('Taal, Cardmarket & titel-herstel (feedback-ronde)', () => {
  it('geeft Cardmarket-links de juiste language-filter mee en laat Engels ongemoeid', () => {
    const base = { name: 'Dracaufeu', cardNumber: '4/102' };
    expect(resolveCardmarketUrl({ ...base, language: 'FR' })).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=Dracaufeu%204&language=2'
    );
    expect(resolveCardmarketUrl({ ...base, language: 'CHS' })).toContain('language=6');
    expect(resolveCardmarketUrl({ ...base, language: 'NL' })).toContain('language=12');
    expect(resolveCardmarketUrl({ ...base, language: 'EN' })).not.toContain('language=');
    const search = resolveCardmarketUrl({ name: 'Charizard', cardNumber: '4/102', language: 'DE' });
    expect(search).toContain('searchString=Charizard%204');
    expect(search.endsWith('&language=3')).toBe(true);
  });

  it('vervangt een bestaand language-filter in plaats van het te dupliceren', () => {
    expect(withCardmarketLanguage('https://x.test/p?idProduct=1&language=2', 'JP')).toBe(
      'https://x.test/p?idProduct=1&language=7'
    );
  });

  it('herstelt kaartnummers die Google Sheets als datum opsloeg (5/11 -> 5 november)', () => {
    expect(repairCorruptedCardNumber('Thu Nov 05 2026 00:00:00 GMT+0100 (Central European Standard Time)', 'tk-dp-l-5')).toBe('5/11');
    // Maand/dag omgedraaid (US-locale): "5/11" werd 11 mei -> kaartnummer uit ID bepaalt de volgorde
    expect(repairCorruptedCardNumber('Mon May 11 2026 00:00:00 GMT+0200 (Central European Summer Time)', 'tk-dp-l-5')).toBe('5/11');
    expect(repairCorruptedCardNumber('4/102', 'base1-4')).toBe('4/102');
    expect(repairCorruptedCardNumber('', 'base1-4')).toBe('');
  });

  it('toont nooit een lang custom set-slug als setcode-pil', () => {
    expect(getDisplaySetCode('zht-final-flame-dance-38', 'Final Flame Dance')).toBe('FFD');
    expect(getDisplaySetCode('chs-gem-pack-vol-3-12')).toBe('GPV3');
  });

  it('corrigeert "DP trainer Kit" naar "DP Trainer Kit"', () => {
    expect(normalizeSetDisplayName('DP trainer Kit (Lucario)')).toBe('DP Trainer Kit (Lucario)');
    expect(normalizeSetDisplayName('Jungle')).toBe('Jungle');
  });
});

describe('Echte setcode uit notities (Chinese sets)', () => {
  it('leest [SET:CS4.5C] uit notities en prefereert die boven een afgeleide code', () => {
    expect(extractSetCodeFromNotes('Kaartspot sync [SET:cs4.5c] [IMG:https://x.test/a.png]')).toBe('CS4.5C');
    expect(extractSetCodeFromNotes('geen tag')).toBeNull();
    expect(
      getCardSetCode({ cardId: 'zht-final-flame-dance-38', setName: 'Final Flame Dance', notes: '[SET:CS4.5C]' })
    ).toBe('CS4.5C');
    expect(getCardSetCode({ cardId: 'zht-final-flame-dance-38', setName: 'Final Flame Dance' })).toBe('FFD');
  });

  it('leidt de setcode af uit een Pikaqian-pad', () => {
    expect(extractSetCodeFromImagePath('cs4.5c/dragonite-v.png')).toBe('CS4.5C');
    expect(extractSetCodeFromImagePath('cs3ac/x.png')).toBe('CS3AC');
    expect(extractSetCodeFromImagePath('promo/x.png')).toBeNull();
    expect(extractSetCodeFromImagePath('')).toBeNull();
  });
});

describe('Exacte Cardmarket-links', () => {
  it('prefereert een server-side opgezochte productlink boven de zoeklink en voegt de taal toe', () => {
    const resolved = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Charizard-ex-V3-MEW199';
    expect(resolveCardmarketUrl({ name: 'Charizard ex', cardNumber: '199/165', resolvedUrl: resolved })).toBe(resolved);
    expect(resolveCardmarketUrl({ name: 'Charizard ex', cardNumber: '199/165', resolvedUrl: resolved, language: 'FR' })).toBe(
      `${resolved}?language=2`
    );
    // Een handmatig geplakte slug in de notities wint van de opgezochte link
    const manual = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Other/Manual-Link';
    expect(resolveCardmarketUrl({ name: 'X', notes: manual, resolvedUrl: resolved })).toBe(manual);
    // Een ongeldige opgezochte link wordt genegeerd -> zoeklink
    expect(resolveCardmarketUrl({ name: 'Charizard ex', cardNumber: '199', resolvedUrl: 'https://evil.test/x' })).toContain(
      'searchString=Charizard%20ex%20199'
    );
  });

  it('bouwt een algemene zoeklink op alleen een naam, met optioneel taalfilter', () => {
    expect(buildCardmarketNameSearchUrl('Bulbasaur')).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=Bulbasaur'
    );
    expect(buildCardmarketNameSearchUrl(' Mr. Mime ', 'DE')).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=Mr.%20Mime&language=3'
    );
  });

  it('leidt het Pokémon TCG API-ID af uit een TCGdex kaart-ID', () => {
    expect(toPokemonTcgCardId('sv03.5-199')).toBe('sv3pt5-199');
    expect(toPokemonTcgCardId('swsh7-215')).toBe('swsh7-215');
    expect(toPokemonTcgCardId('base5-4')).toBe('base5-4');
    expect(toPokemonTcgCardId('me02-011')).toBe(''); // niet in de Pokémon TCG API
  });
});

