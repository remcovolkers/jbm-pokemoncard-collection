import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outPath = path.join(root, 'public', 'sets-catalog.json');

const GRAPHQL_URL = 'https://api.tcgdex.net/v2/graphql';
const REST_BASE = 'https://api.tcgdex.net/v2/en';

// Fallback voor sets waar TCGdex nog geen abbreviation.official of tcgOnline heeft
const KNOWN_OFFICIAL_CODES = {
  sv01: 'SVI',
  sv02: 'PAL',
  sv03: 'OBF',
  'sv03.5': 'MEW',
  sv04: 'PAR',
  'sv04.5': 'PAF',
  sv05: 'TEF',
  sv06: 'TWM',
  'sv06.5': 'SFA',
  sv07: 'SCR',
  sv08: 'SSP',
  'sv08.5': 'PRE',
  sv09: 'JTG',
  sv10: 'DRI',
  'sv10.5w': 'WHT',
  'sv10.5b': 'BLK',
  svp: 'SVP',
  me01: 'MEG',
  me02: 'PFL',
  'me02.5': 'ASC',
  me03: 'POR',
  me04: 'CRI',
  me05: 'PBL',
  me06: 'DLR',
  '30th': '30C',
  '30th-c': '30C',
  mep: 'MEP',
  mee: 'MEE',
  cel25: 'CEL',
  base1: 'BS',
  base2: 'JU',
  base3: 'FO',
  base4: 'BS2',
  base5: 'TR',
  basep: 'PR',
};

async function fetchWithPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  console.log('Ophalen van alle fysieke Pokémon TCG-sets via TCGdex…');
  const gqlRes = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{
        sets {
          id
          name
          tcgOnline
          releaseDate
          logo
          symbol
          serie { id name }
          cardCount { official total }
        }
      }`,
    }),
  });

  if (!gqlRes.ok) {
    throw new Error(`TCGdex GraphQL HTTP ${gqlRes.status}`);
  }

  const gqlJson = await gqlRes.json();
  const rawSets = gqlJson?.data?.sets ?? [];
  if (!Array.isArray(rawSets) || rawSets.length === 0) {
    throw new Error('Geen sets ontvangen van TCGdex GraphQL.');
  }

  // Filter digitale Pokémon TCG Pocket sets weg (serie.id === 'tcgp')
  const physicalSets = rawSets.filter((s) => s?.id && s?.name && s?.serie?.id !== 'tcgp');

  // Voor sets zonder tcgOnline (vooral Mega Evolution & moderne SV-sets) halen we abbreviation.official op
  const needsDetail = physicalSets.filter(
    (s) =>
      !s.tcgOnline ||
      s.serie?.id === 'me' ||
      s.serie?.id === 'sv' ||
      /^30th/i.test(s.id)
  );

  const officialAbbrById = new Map();
  await fetchWithPool(needsDetail, 8, async (setItem) => {
    try {
      const res = await fetch(`${REST_BASE}/sets/${encodeURIComponent(setItem.id)}`);
      if (!res.ok) return;
      const detail = await res.json();
      const abbr = detail?.abbreviation?.official || detail?.tcgOnline || '';
      if (abbr) {
        officialAbbrById.set(setItem.id, String(abbr).trim().toUpperCase());
      }
    } catch {
      // Negeer losse timeout, val terug op KNOWN_OFFICIAL_CODES / tcgOnline
    }
  });

  // Nieuwste releases eerst
  const sorted = [...physicalSets].reverse();
  const mapped = sorted.map((s) => {
    const officialCode = (
      officialAbbrById.get(s.id) ||
      KNOWN_OFFICIAL_CODES[s.id] ||
      s.tcgOnline ||
      s.id
    )
      .trim()
      .toUpperCase();

    return {
      id: s.id,
      code: officialCode,
      name: s.name,
      series: s.serie?.name || '',
      seriesId: s.serie?.id || '',
      releaseDate: s.releaseDate || '',
      officialCount: s.cardCount?.official ?? 0,
      totalCount: s.cardCount?.total ?? s.cardCount?.official ?? 0,
      logoUrl: s.logo ? `${s.logo}.webp` : undefined,
      symbolUrl: s.symbol ? `${s.symbol}.webp` : undefined,
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    totalPhysicalSets: mapped.length,
    sets: mapped,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload) + '\n', 'utf8');
  console.log(
    `Geschreven: ${outPath} (${mapped.length} fysieke sets; ${rawSets.length - physicalSets.length} TCG Pocket-sets uitgefilterd).`
  );
}

main().catch((err) => {
  console.error('Fout bij sync-sets-catalog:', err);
  process.exit(1);
});
