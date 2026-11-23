import { afterEach, describe, expect, it } from 'vitest';
import {
  SET_CODE_ALIASES,
  buildCardmarketSearchUrl,
  buildTcgdexAssetUrl,
  getDisplaySetCode,
  hasKnownSetCode,
  inferTcgdexSeriesFolder,
  parseCardIdInput,
  registerDynamicSetCodes,
  resetDynamicSetCodesForTests,
} from './card-id.utils';

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

    it('verwerkt subset-kaartnummers zoals GG70 en TG05', () => {
      const crz = parseCardIdInput('CRZ GG70/GG70');
      expect(crz?.tcgdexSetId).toBe('swsh12.5');
      expect(crz?.localNumber).toBe('GG70');
      expect(crz?.normalizedId).toBe('swsh12.5-GG70');

      const lor = parseCardIdInput('LOR TG05/TG30');
      expect(lor?.normalizedId).toBe('swsh11-TG05');
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
      expect(buildTcgdexAssetUrl('')).toBe('');
      expect(buildTcgdexAssetUrl('invalidid')).toBe('');
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

    it('bouwt geldige gecodeerde Cardmarket zoek-URLs zonder breekbare setnaam of voorloopnullen', () => {
      const url = buildCardmarketSearchUrl('Charizard ex', '151', '199/165');
      expect(url).toBe('https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Charizard%20ex%20199');
      const paddedUrl = buildCardmarketSearchUrl('Zorua', 'Delta Reign', '011/103');
      expect(paddedUrl).toBe('https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Zorua%2011');
    });
  });
});
