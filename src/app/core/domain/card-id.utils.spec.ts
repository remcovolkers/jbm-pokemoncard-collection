import { describe, expect, it } from 'vitest';
import {
  SET_CODE_ALIASES,
  buildCardmarketSearchUrl,
  buildTcgdexAssetUrl,
  getDisplaySetCode,
  inferTcgdexSeriesFolder,
  parseCardIdInput,
} from './card-id.utils';

describe('card-id.utils', () => {
  describe('parseCardIdInput', () => {
    it('vertaalt bekende setcode-aliassen naar officiële TCGdex set-IDs', () => {
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
    it('leidt TCGdex serie-mappen af voor alle eras', () => {
      expect(inferTcgdexSeriesFolder('sv03.5')).toBe('sv');
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
      expect(buildTcgdexAssetUrl('')).toBe('');
      expect(buildTcgdexAssetUrl('invalidid')).toBe('');
    });
  });

  describe('getDisplaySetCode & buildCardmarketSearchUrl', () => {
    it('geeft korte setcode terug of fallback op basis van setnaam', () => {
      expect(getDisplaySetCode('sv03.5-199')).toBe('MEW');
      expect(getDisplaySetCode('swsh7-215')).toBe('EVS');
      expect(getDisplaySetCode('base1-44')).toBe('BS');
      expect(getDisplaySetCode('xy12-108')).toBe('XY12');
      expect(getDisplaySetCode('custom', 'Scarlet Violet Promo')).toBe('SVP');
      expect(getDisplaySetCode('custom')).toBe('TCG');
    });

    it('bouwt geldige gecodeerde Cardmarket zoek-URLs', () => {
      const url = buildCardmarketSearchUrl('Charizard ex', '151', '199/165');
      expect(url).toBe('https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Charizard%20ex%20151%20199');
    });
  });
});
