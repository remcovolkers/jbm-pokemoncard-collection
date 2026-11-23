import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cardUtilsSource = fs.readFileSync(
  path.join(root, 'src', 'app', 'core', 'domain', 'card-id.utils.ts'),
  'utf8'
);

function extractKnownNoScanSetIds() {
  const match = cardUtilsSource.match(/KNOWN_NO_SCAN_SET_IDS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!match) throw new Error('Kon KNOWN_NO_SCAN_SET_IDS niet lezen uit card-id.utils.ts');
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

const UNSUPPORTED_PTCG = new Set([
  'mep',
  'mee',
  'mfb',
  'xya',
  'ex5.5',
  'miscp',
  'cel25cc',
  '2014xy',
  '2015xy',
  '2017sm',
  '2018sm',
  '2023sv',
  '2024sv',
]);

function inferSeries(setId) {
  const id = setId.toLowerCase();
  if (id.startsWith('sv')) return 'sv';
  if (id.startsWith('me') || id.startsWith('30th')) return 'me';
  if (id.startsWith('swsh') || id === 'cel25') return 'swsh';
  if (id.startsWith('sm') || id === 'det1') return 'sm';
  if (id.startsWith('xy')) return 'xy';
  if (id.startsWith('bw')) return 'bw';
  if (id.startsWith('hgss')) return 'hgss';
  if (id.startsWith('dp')) return 'dp';
  if (id.startsWith('pl')) return 'pl';
  if (id.startsWith('ex')) return 'ex';
  if (id.startsWith('ecard')) return 'ecard';
  if (id.startsWith('neo')) return 'neo';
  if (id.startsWith('gym')) return 'gym';
  if (id.startsWith('base')) return 'base';
  return id.replace(/\d.*$/, '') || 'sv';
}

function resolveFallbackUrl(card) {
  if (card.image) return `${card.image}/low.webp`;
  const dash = card.id.lastIndexOf('-');
  const setId = card.id.slice(0, dash).toLowerCase();
  const localId = card.id.slice(dash + 1);

  if (TCGDEX_OVERRIDES[setId]) {
    const o = TCGDEX_OVERRIDES[setId];
    return `https://assets.tcgdex.net/en/${o.series}/${o.setId}/${localId}/low.webp`;
  }
  if (setId === 'mep') {
    return `https://assets.tcgdex.net/en/me/mep/${localId}/low.webp`;
  }
  if (setId === 'mee' && /^\d+$/.test(localId)) {
    const p3 = String(parseInt(localId, 10)).padStart(3, '0');
    return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEE/MEE_${p3}_R_EN_SM.png`;
  }
  if (!UNSUPPORTED_PTCG.has(setId) && !/^me\d|^30th|^tk-(?:dp|hs|bw|xy|sm)-|^sv10\.5[wb]$/i.test(setId)) {
    let ptcg = PTCG_MAP[setId];
    if (!ptcg) {
      const m = setId.match(/^sv0(\d)$/i);
      ptcg = m ? `sv${m[1]}` : setId;
    }
    let num = localId;
    if (/^\d+$/.test(num)) num = String(parseInt(num, 10));
    else if (/^H0+(\d+)$/i.test(num)) num = `H${Number(num.slice(1))}`;
    return `https://images.pokemontcg.io/${ptcg}/${num}.png`;
  }
  return `https://assets.tcgdex.net/en/${inferSeries(setId)}/${setId}/${localId}/low.webp`;
}

async function main() {
  console.log('Live artwork-audit via TCGdex GraphQL + fallback-CDNs…');
  const res = await fetch('https://api.tcgdex.net/v2/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '{ sets { id name serie { id name } cards { id localId image } } }',
    }),
  });
  if (!res.ok) throw new Error(`TCGdex GraphQL HTTP ${res.status}`);
  const json = await res.json();
  const sets = (json.data?.sets ?? []).filter((s) => s?.id && s?.name && s.serie?.id !== 'tcgp');

  const nativeFull = sets.filter((s) => (s.cards ?? []).length > 0 && s.cards.every((c) => Boolean(c.image)));
  const toProbe = [
    ...sets.filter((s) => (s.cards ?? []).some((c) => !c.image)),
    ...nativeFull.slice(0, 5),
  ];

  const unexpectedFailures = [];
  const staleNoScanEntries = [];
  const partialSets = [];
  let idx = 0;

  async function worker() {
    while (idx < toProbe.length) {
      const s = toProbe[idx++];
      const cards = s.cards ?? [];
      const withImg = cards.filter((c) => Boolean(c.image)).length;
      const missingCards = cards.filter((c) => !c.image);
      const sample = missingCards[0] ?? cards[0];
      const url = resolveFallbackUrl(sample);

      let ok = false;
      try {
        const head = await fetch(url, { method: 'HEAD' });
        ok = head.status === 200;
      } catch {
        ok = false;
      }

      const idLower = s.id.toLowerCase();
      const inNoScanList = KNOWN_NO_SCAN_SET_IDS.has(idLower);

      if (withImg > 0 && !ok) {
        partialSets.push(`${s.id} (${withImg}/${cards.length})`);
      } else if (withImg === 0 && !ok && !inNoScanList) {
        unexpectedFailures.push(`${s.id} (${s.name}) -> ${url}`);
      } else if (ok && inNoScanList) {
        staleNoScanEntries.push(`${s.id} (${s.name}) -> ${url}`);
      }
    }
  }

  await Promise.all(Array.from({ length: 12 }, () => worker()));

  const workingSets = sets.length - KNOWN_NO_SCAN_SET_IDS.size;
  console.log(`Fysieke sets: ${sets.length} | Werkende artwork: ${workingSets} | Zonder scans (bekend): ${KNOWN_NO_SCAN_SET_IDS.size}`);
  if (partialSets.length > 0) {
    console.log(`Gedeeltelijke scans: ${partialSets.join(', ')}`);
  }

  if (unexpectedFailures.length > 0) {
    console.error('FOUT — onverwacht ontbrekende artwork bij sets:', unexpectedFailures);
    process.exit(1);
  }
  if (staleNoScanEntries.length > 0) {
    console.error('UPDATE NODIG — deze sets hebben inmiddels wél scans (verwijder uit KNOWN_NO_SCAN_SET_IDS):', staleNoScanEntries);
    process.exit(1);
  }
  console.log('Live artwork-audit geslaagd (0 regressies).');
}

main().catch((err) => {
  console.error('Fout bij live artwork-audit:', err);
  process.exit(1);
});
