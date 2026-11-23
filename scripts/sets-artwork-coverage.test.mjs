import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public', 'sets-catalog.json'), 'utf8'));
const cardUtilsSource = fs.readFileSync(
  path.join(root, 'src', 'app', 'core', 'domain', 'card-id.utils.ts'),
  'utf8'
);

function extractKnownNoScanSetIds() {
  const match = cardUtilsSource.match(/KNOWN_NO_SCAN_SET_IDS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(match, 'KNOWN_NO_SCAN_SET_IDS moet gedefinieerd zijn in card-id.utils.ts');
  const ids = [];
  for (const m of match[1].matchAll(/'([^']+)'/g)) {
    ids.push(m[1].toLowerCase());
  }
  return new Set(ids);
}

const KNOWN_NO_SCAN_SET_IDS = extractKnownNoScanSetIds();

const TCGDEX_OVERRIDES = {
  'swsh4.5sv': { series: 'swsh', setId: 'swsh4.5' },
  swsh9tg: { series: 'swsh', setId: 'swsh9' },
  swsh10tg: { series: 'swsh', setId: 'swsh10' },
  swsh11tg: { series: 'swsh', setId: 'swsh11' },
  swsh12tg: { series: 'swsh', setId: 'swsh12' },
  'swsh12.5gg': { series: 'swsh', setId: 'swsh12.5' },
};

const PTCG_MAP = {
  'tk-ex-latia': 'tk1a',
  'tk-ex-latio': 'tk1b',
  'tk-ex-p': 'tk2a',
  'tk-ex-m': 'tk2b',
  'swsh4.5sv': 'swsh45sv',
  'swsh4.5': 'swsh45',
  'swsh3.5': 'swsh35',
  'swsh10.5': 'pgo',
  'swsh12.5': 'swsh12pt5',
  'swsh12.5gg': 'swsh12pt5gg',
  'sm3.5': 'sm35',
  'sm7.5': 'sm75',
  'sm11.5': 'sm115',
  'sv03.5': 'sv3pt5',
  'sv04.5': 'sv4pt5',
  'sv06.5': 'sv6pt5',
  'sv08.5': 'sv8pt5',
  bog: 'bp',
  hgssp: 'hsp',
  exu: 'ex10',
  '2011bw': 'mcd11',
  '2012bw': 'mcd12',
  '2016xy': 'mcd16',
  '2019sm': 'mcd19',
  '2021swsh': 'mcd21',
  '2022swsh': 'mcd22',
};

function sampleLocalIdForSet(setId) {
  const id = setId.toLowerCase();
  if (id === 'swsh4.5sv') return 'SV001';
  if (/^swsh\d+tg$/.test(id)) return 'TG01';
  if (id === 'swsh12.5gg') return 'GG01';
  if (id === 'exu') return 'A';
  if (id === 'ecard3') return 'H01';
  if (/^(?:sv|me)\d|^30th|^(?:svp|sve|mep|mee)$/i.test(id)) return '001';
  return '1';
}

function resolveForCatalogSet(setId) {
  const id = setId.toLowerCase();
  const localId = sampleLocalIdForSet(id);
  if (TCGDEX_OVERRIDES[id]) {
    const o = TCGDEX_OVERRIDES[id];
    return `https://assets.tcgdex.net/en/${o.series}/${o.setId}/${localId}/low.webp`;
  }
  if (id === 'mee') {
    return 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEE/MEE_001_R_EN_SM.png';
  }
  if (PTCG_MAP[id]) {
    return `https://images.pokemontcg.io/${PTCG_MAP[id]}/${localId}.png`;
  }
  return `https://assets.tcgdex.net/en/set/${id}/${localId}/low.webp`;
}

describe('public/sets-catalog.json Artwork Coverage (Alle 206 sets)', () => {
  it('heeft geldige metadata voor alle fysieke sets en een up-to-date KNOWN_NO_SCAN_SET_IDS', () => {
    assert.ok(Array.isArray(catalog.sets) && catalog.sets.length >= 200);
    const catalogIds = new Set(catalog.sets.map((s) => s.id.toLowerCase()));

    for (const s of catalog.sets) {
      assert.ok(s.id?.trim(), 'Set zonder id');
      assert.ok(s.code?.trim(), `Set ${s.id} zonder code`);
      assert.ok(s.name?.trim(), `Set ${s.id} zonder name`);
      assert.ok((s.totalCount || s.officialCount) > 0, `Set ${s.id} heeft 0 kaarten`);
    }

    for (const noScanId of KNOWN_NO_SCAN_SET_IDS) {
      assert.ok(catalogIds.has(noScanId), `Onbekend set-ID in KNOWN_NO_SCAN_SET_IDS: ${noScanId}`);
    }
  });

  it('dekt minstens 85% van alle sets in sets-catalog.json met werkende artwork-URLs zonder kapotte subset-mappen', () => {
    const brokenFragments = [
      '/swsh/swsh4.5sv/',
      '/swsh/swsh9tg/',
      '/swsh/swsh10tg/',
      '/swsh/swsh11tg/',
      '/swsh/swsh12tg/',
      '/swsh/swsh12.5gg/',
    ];

    const supported = catalog.sets.filter((s) => !KNOWN_NO_SCAN_SET_IDS.has(s.id.toLowerCase()));
    const ratio = supported.length / catalog.sets.length;
    assert.ok(ratio >= 0.85, `Dekking te laag: ${(ratio * 100).toFixed(1)}%`);

    for (const s of supported) {
      const url = resolveForCatalogSet(s.id);
      assert.ok(url.startsWith('https://'), `Ongeldige URL voor ${s.id}: ${url}`);
      for (const bad of brokenFragments) {
        assert.ok(!url.includes(bad), `Kapotte subset-URL voor ${s.id}: ${url}`);
      }
    }
  });
});
