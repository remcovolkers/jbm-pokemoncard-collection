/**
 * Mapping van geprinte Pokémon TCG kaartcodes / veelgebruikte afkortingen naar TCGdex API set-ID's.
 * Verzamelaars gebruiken de geprinte kaartcode linksonder op de kaart (zoals DLR, PBL, 30C, MEW, OBF).
 */
export const SET_CODE_ALIASES: Record<string, string> = {
  // Mega Evolution & 30th Anniversary
  MEG: 'me01',
  ME1: 'me01',
  ME01: 'me01',
  PFL: 'me02',
  ME2: 'me02',
  ME02: 'me02',
  ASC: 'me02.5',
  'ME02.5': 'me02.5',
  POR: 'me03',
  ME3: 'me03',
  ME03: 'me03',
  CRI: 'me04',
  ME4: 'me04',
  ME04: 'me04',
  PBL: 'me05',
  ME5: 'me05',
  ME05: 'me05',
  DLR: 'me06',
  ME6: 'me06',
  ME06: 'me06',
  '30C': '30th',
  '30CC': '30th-c',
  MEP: 'mep',
  MEE: 'mee',

  // Scarlet & Violet
  SVI: 'sv01',
  SV1: 'sv01',
  SV01: 'sv01',
  PAL: 'sv02',
  SV2: 'sv02',
  SV02: 'sv02',
  OBF: 'sv03',
  SV3: 'sv03',
  SV03: 'sv03',
  MEW: 'sv03.5',
  '151': 'sv03.5',
  'SV03.5': 'sv03.5',
  PAR: 'sv04',
  SV4: 'sv04',
  SV04: 'sv04',
  PAF: 'sv04.5',
  'SV04.5': 'sv04.5',
  TEF: 'sv05',
  SV5: 'sv05',
  SV05: 'sv05',
  TWM: 'sv06',
  SV6: 'sv06',
  SV06: 'sv06',
  SFA: 'sv06.5',
  'SV06.5': 'sv06.5',
  SCR: 'sv07',
  SV7: 'sv07',
  SV07: 'sv07',
  SSP: 'sv08',
  SV8: 'sv08',
  SV08: 'sv08',
  PRE: 'sv08.5',
  'SV08.5': 'sv08.5',
  JTG: 'sv09',
  SV9: 'sv09',
  SV09: 'sv09',
  DRI: 'sv10',
  SV10: 'sv10',
  WHT: 'sv10.5w',
  'SV10.5W': 'sv10.5w',
  BLK: 'sv10.5b',
  'SV10.5B': 'sv10.5b',
  SVP: 'svp',

  // Sword & Shield
  SSH: 'swsh1',
  RCL: 'swsh2',
  DAA: 'swsh3',
  CPA: 'swsh3.5',
  VIV: 'swsh4',
  SHF: 'swsh4.5',
  BST: 'swsh5',
  CRE: 'swsh6',
  EVS: 'swsh7',
  CEL: 'cel25',
  FST: 'swsh8',
  BRS: 'swsh9',
  ASR: 'swsh10',
  PGO: 'swsh10.5',
  LOR: 'swsh11',
  SIT: 'swsh12',
  CRZ: 'swsh12.5',
  SWSHP: 'swshp',

  // Sun & Moon
  SUM: 'sm1',
  GRI: 'sm2',
  BUS: 'sm3',
  SLG: 'sm3.5',
  CIN: 'sm4',
  UPR: 'sm5',
  FLI: 'sm6',
  CES: 'sm7',
  DRM: 'sm7.5',
  LOT: 'sm8',
  TEU: 'sm9',
  DET: 'det1',
  UNB: 'sm10',
  UNM: 'sm11',
  HIF: 'sm11.5',
  CEC: 'sm12',

  // Classic / WOTC / e-Card / EX
  BS: 'base1',
  BASE: 'base1',
  JU: 'base2',
  FO: 'base3',
  BS2: 'base4',
  TR: 'base5',
  PR: 'basep',
  G1: 'gym1',
  G2: 'gym2',
  N1: 'neo1',
  N2: 'neo2',
  N3: 'neo3',
  N4: 'neo4',
  EXP: 'ecard1',
  AQ: 'ecard2',
  SK: 'ecard3',
  DX: 'ex8',
  WOTC: 'basep',
};

/**
 * Kaartcodes die op meerdere officiële TCGdex-sets van toepassing zijn
 * (bijv. 30C wordt gedeeld door 30th Celebration én 30th Classic Collection).
 */
export const SET_CODE_MULTI_ALIASES: Record<string, readonly string[]> = {
  '30C': ['30th', '30th-c'],
  SHF: ['swsh4.5', 'swsh4.5sv'],
  BRS: ['swsh9', 'swsh9tg'],
  ASR: ['swsh10', 'swsh10tg'],
  LOR: ['swsh11', 'swsh11tg'],
  SIT: ['swsh12', 'swsh12tg'],
  CRZ: ['swsh12.5', 'swsh12.5gg'],
  CEL: ['cel25', 'cel25cc'],
  HIF: ['sm11.5', 'sma'],
};

const REVERSE_DISPLAY_CODE: Record<string, string> = {
  // Mega Evolution & 30th Anniversary
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

  // Scarlet & Violet
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

  // Sword & Shield
  swsh1: 'SSH',
  swsh2: 'RCL',
  swsh3: 'DAA',
  'swsh3.5': 'CPA',
  swsh4: 'VIV',
  'swsh4.5': 'SHF',
  'swsh4.5sv': 'SHF',
  swsh5: 'BST',
  swsh6: 'CRE',
  swsh7: 'EVS',
  cel25: 'CEL',
  cel25cc: 'CEL',
  swsh8: 'FST',
  swsh9: 'BRS',
  swsh9tg: 'BRS',
  swsh10: 'ASR',
  swsh10tg: 'ASR',
  'swsh10.5': 'PGO',
  swsh11: 'LOR',
  swsh11tg: 'LOR',
  swsh12: 'SIT',
  swsh12tg: 'SIT',
  'swsh12.5': 'CRZ',
  'swsh12.5gg': 'CRZ',
  swshp: 'SWSHP',

  // Sun & Moon
  sm1: 'SUM',
  sm2: 'GRI',
  sm3: 'BUS',
  'sm3.5': 'SLG',
  sm4: 'CIN',
  sm5: 'UPR',
  sm6: 'FLI',
  sm7: 'CES',
  'sm7.5': 'DRM',
  sm8: 'LOT',
  sm9: 'TEU',
  det1: 'DET',
  sm10: 'UNB',
  sm11: 'UNM',
  'sm11.5': 'HIF',
  sma: 'HIF',
  sm12: 'CEC',

  // Classic / WOTC / e-Card / EX
  base1: 'BS',
  base2: 'JU',
  base3: 'FO',
  base4: 'BS2',
  base5: 'TR',
  basep: 'PR',
  gym1: 'G1',
  gym2: 'G2',
  neo1: 'N1',
  neo2: 'N2',
  neo3: 'N3',
  neo4: 'N4',
  ecard1: 'EXP',
  ecard2: 'AQ',
  ecard3: 'SK',
  ex8: 'DX',
};

const dynamicAliasToSetIds = new Map<string, string[]>();
const dynamicDisplayCodeBySetId = new Map<string, string>();

/**
 * Registreert dynamisch geladen setcodes (uit public/sets-catalog.json of live TCGdex responses)
 * zodat nieuwe sets (zoals me07+) direct herkend worden op zowel invoer als weergave.
 */
export function registerDynamicSetCodes(
  sets: ReadonlyArray<{ id: string; code?: string | null }>
): void {
  for (const item of sets) {
    const setId = item.id?.trim().toLowerCase();
    const code = item.code?.trim().toUpperCase();
    if (!setId || !code) continue;

    if (!dynamicDisplayCodeBySetId.has(setId)) {
      dynamicDisplayCodeBySetId.set(setId, code);
    }

    const existing = dynamicAliasToSetIds.get(code) ?? [];
    if (!existing.includes(setId)) {
      dynamicAliasToSetIds.set(code, [...existing, setId]);
    }
  }
}

/**
 * Controleert of een ingetypte setcode (kaartcode of API-code) al bekend is in statische of dynamische mappen.
 */
export function hasKnownSetCode(rawCode: string): boolean {
  const upper = rawCode.trim().toUpperCase();
  if (!upper) return false;
  const lower = upper.toLowerCase();
  return Boolean(
    SET_CODE_ALIASES[upper] ||
      SET_CODE_MULTI_ALIASES[upper] ||
      dynamicAliasToSetIds.has(upper) ||
      REVERSE_DISPLAY_CODE[lower] ||
      dynamicDisplayCodeBySetId.has(lower)
  );
}

/**
 * Resets alleen dynamisch geregistreerde setcodes (handig voor geïsoleerde unit tests).
 */
export function resetDynamicSetCodesForTests(): void {
  dynamicAliasToSetIds.clear();
  dynamicDisplayCodeBySetId.clear();
}

export interface ParsedCardId {
  rawInput: string;
  inputSetCode: string;
  tcgdexSetId: string;
  localNumber: string;
  normalizedId: string;
  /** TCGdex API probeer-volgorde (bijv. eerst me06-011 en dan me06-11, of bij 30C zowel 30th als 30th-c) */
  candidateIds: string[];
}

function resolveCandidateSetIds(rawSetUpper: string): string[] {
  const out: string[] = [];
  const push = (id: string) => {
    const norm = id.trim().toLowerCase();
    if (norm && !out.includes(norm)) out.push(norm);
  };

  if (SET_CODE_MULTI_ALIASES[rawSetUpper]) {
    for (const id of SET_CODE_MULTI_ALIASES[rawSetUpper]) push(id);
  }
  if (SET_CODE_ALIASES[rawSetUpper]) {
    push(SET_CODE_ALIASES[rawSetUpper]);
  }
  const dynamicIds = dynamicAliasToSetIds.get(rawSetUpper);
  if (dynamicIds) {
    for (const id of dynamicIds) push(id);
  }
  if (out.length === 0) {
    push(rawSetUpper.toLowerCase());
  }
  return out;
}

/**
 * Parset gebruikersinvoer zoals "DLR 11", "MEW 181", "30C 15", "OBF 199/197", "BS 44", "me06-011", "30th-c-015"
 * naar een genormaliseerde TCGdex Kaart-ID met kandidaat-varianten voor voorloopnullen en gedeelde setcodes.
 */
export function parseCardIdInput(rawInput: string): ParsedCardId | null {
  const cleaned = rawInput.trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;

  // Accepteert: "DLR 11", "MEW 181", "OBF 199/197", "30th-c-015", "sv03.5-181", "BS #044", "CRZ GG70/GG70"
  const match = cleaned.match(
    /^([a-z0-9.]+(?:-[a-z]+)?)\s*[-\s#:]+\s*#?([a-z]*\d+[a-z]?)(?:\/[a-z]*\d+)?$/i
  );
  if (!match) return null;

  const rawSet = match[1].toUpperCase();
  const targetSetIds = resolveCandidateSetIds(rawSet);
  const tcgdexSetId = targetSetIds[0];
  const rawNum = match[2].trim();

  const isPureDigits = /^\d+$/.test(rawNum);
  const unpaddedNum = isPureDigits ? String(parseInt(rawNum, 10)) : rawNum.toUpperCase();
  const padded3 = isPureDigits ? unpaddedNum.padStart(3, '0') : unpaddedNum;

  // Scarlet & Violet, Mega Evolution en 30th sets gebruiken in TCGdex standaard 3-cijferige voorloopnullen (me06-001, svp-044)
  const prefersPaddedPrimary = /^(?:sv|me)\d|^30th|^(?:svp|sve|mep|mee)$/i.test(tcgdexSetId);
  const primaryNum = prefersPaddedPrimary ? padded3 : unpaddedNum;
  const normalizedId = `${tcgdexSetId}-${primaryNum}`;

  const candidates: string[] = [];
  const pushUnique = (id: string) => {
    if (!candidates.includes(id)) candidates.push(id);
  };

  for (const setId of targetSetIds) {
    const prefersPadded = /^(?:sv|me)\d|^30th|^(?:svp|sve|mep|mee)$/i.test(setId);
    if (prefersPadded) {
      pushUnique(`${setId}-${padded3}`);
      pushUnique(`${setId}-${unpaddedNum}`);
    } else {
      pushUnique(`${setId}-${unpaddedNum}`);
      pushUnique(`${setId}-${padded3}`);
    }
    // Behoud ook de originele input-notatie als fallback (bijv. 2-cijferige voorloopnul zoals basep-04)
    if (rawNum !== (prefersPadded ? padded3 : unpaddedNum)) {
      pushUnique(`${setId}-${rawNum}`);
    }
  }

  return {
    rawInput,
    inputSetCode: rawSet,
    tcgdexSetId,
    localNumber: unpaddedNum,
    normalizedId,
    candidateIds: candidates,
  };
}

/**
 * Geeft de herkenbare geprinte kaartcode terug voor kaartbadges & overzichten
 * (bijv. me06-011 -> DLR, me05-005 -> PBL, sv03.5-199 -> MEW, swsh7-215 -> EVS).
 */
export function getDisplaySetCode(cardIdOrSetId: string, fallbackSetName?: string): string {
  const clean = cardIdOrSetId.trim();
  const lower = clean.toLowerCase();

  // Directe match op een bekende API set-ID (bijv. "me06", "sv03.5", "30th-c")
  if (dynamicDisplayCodeBySetId.has(lower)) return dynamicDisplayCodeBySetId.get(lower)!;
  if (REVERSE_DISPLAY_CODE[lower]) return REVERSE_DISPLAY_CODE[lower];

  const dashIdx = clean.lastIndexOf('-');
  if (dashIdx > 0) {
    const setId = clean.slice(0, dashIdx).toLowerCase();
    if (dynamicDisplayCodeBySetId.has(setId)) return dynamicDisplayCodeBySetId.get(setId)!;
    if (REVERSE_DISPLAY_CODE[setId]) return REVERSE_DISPLAY_CODE[setId];
    return setId.toUpperCase();
  }

  if (fallbackSetName) {
    return fallbackSetName
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 4)
      .toUpperCase();
  }
  return 'TCG';
}

/**
 * Leidt de TCGdex serie-map af uit een set-ID (voor directe assets.tcgdex.net URL-opbouw).
 */
export function inferTcgdexSeriesFolder(setId: string): string {
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

const TCGDEX_ASSET_SET_OVERRIDES: Record<string, { series: string; setId: string }> = {
  'swsh4.5sv': { series: 'swsh', setId: 'swsh4.5' },
  swsh9tg: { series: 'swsh', setId: 'swsh9' },
  swsh10tg: { series: 'swsh', setId: 'swsh10' },
  swsh11tg: { series: 'swsh', setId: 'swsh11' },
  swsh12tg: { series: 'swsh', setId: 'swsh12' },
  'swsh12.5gg': { series: 'swsh', setId: 'swsh12.5' },
};

const TCGDEX_TO_PTCG_SET_ID: Record<string, string> = {
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
  '2011bw': 'mcd11',
  '2012bw': 'mcd12',
  '2016xy': 'mcd16',
  '2019sm': 'mcd19',
  '2021swsh': 'mcd21',
  '2022swsh': 'mcd22',
};

const UNSUPPORTED_PTCG_EXACT_SETS = new Set([
  'mep',
  'mee',
  'mfb',
  'exu',
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

function splitCardIdParts(cardId: string): { setId: string; localId: string } | null {
  const val = cardId.trim();
  if (!val || val.startsWith('http://') || val.startsWith('https://')) return null;
  const dashIdx = val.lastIndexOf('-');
  if (dashIdx <= 0 || dashIdx >= val.length - 1) return null;
  return {
    setId: val.slice(0, dashIdx).toLowerCase(),
    localId: val.slice(dashIdx + 1),
  };
}

/**
 * Bouwt de directe hoge-resolutie TCGdex artwork URL op.
 */
export function buildTcgdexAssetUrl(
  imageBaseOrCardId: string,
  quality: 'high' | 'low' = 'high'
): string {
  const val = imageBaseOrCardId.trim();
  if (!val) return '';
  if (val.startsWith('http://') || val.startsWith('https://')) {
    if (/\.(webp|png|jpg|jpeg)$/i.test(val)) return val;
    return `${val.replace(/\/$/, '')}/${quality}.webp`;
  }
  const parts = splitCardIdParts(val);
  if (!parts) return '';
  const override = TCGDEX_ASSET_SET_OVERRIDES[parts.setId];
  const series = override?.series ?? inferTcgdexSeriesFolder(parts.setId);
  const assetSetId = override?.setId ?? parts.setId;
  return `https://assets.tcgdex.net/en/${series}/${assetSetId}/${parts.localId}/${quality}.webp`;
}

/**
 * Bouwt een fallback artwork URL via het PokemonTCG.io CDN voor sets waar TCGdex geen afbeelding heeft.
 */
export function buildPokemonTcgAssetUrl(
  cardId: string,
  quality: 'high' | 'low' = 'low'
): string {
  const parts = splitCardIdParts(cardId);
  if (!parts) return '';
  const { setId, localId } = parts;

  if (
    UNSUPPORTED_PTCG_EXACT_SETS.has(setId) ||
    /^me\d/i.test(setId) ||
    /^30th/i.test(setId) ||
    /^tk-(?:dp|hs|bw|xy|sm)-/i.test(setId) ||
    /^sv10\.5[wb]$/i.test(setId)
  ) {
    return '';
  }

  let ptcgSetId = TCGDEX_TO_PTCG_SET_ID[setId];
  if (!ptcgSetId) {
    const svMatch = setId.match(/^sv0(\d)$/i);
    ptcgSetId = svMatch ? `sv${svMatch[1]}` : setId;
  }

  let normalizedLocalId = localId;
  if (/^\d+$/.test(localId)) {
    normalizedLocalId = String(parseInt(localId, 10));
  } else {
    const holoMatch = localId.match(/^H0+(\d+)$/i);
    if (holoMatch) {
      normalizedLocalId = `H${Number(holoMatch[1])}`;
    }
  }

  const suffix = quality === 'high' ? '_hires.png' : '.png';
  return `https://images.pokemontcg.io/${ptcgSetId}/${normalizedLocalId}${suffix}`;
}

/**
 * Kiest de beste beschikbare artwork URL voor een TCGdex-kaart (met subset- & PokemonTCG-fallback).
 */
export function resolveCardArtworkUrl(
  cardId: string,
  imageBase: string | undefined,
  quality: 'high' | 'low'
): string {
  const cleanBase = imageBase?.trim();
  if (cleanBase) {
    return `${cleanBase.replace(/\/$/, '')}/${quality}.webp`;
  }

  const parts = splitCardIdParts(cardId);
  if (parts && (TCGDEX_ASSET_SET_OVERRIDES[parts.setId] || parts.setId === 'mep')) {
    return buildTcgdexAssetUrl(cardId, quality);
  }

  const ptcgUrl = buildPokemonTcgAssetUrl(cardId, quality);
  if (ptcgUrl) return ptcgUrl;

  return buildTcgdexAssetUrl(cardId, quality);
}

export function buildCardmarketProductUrl(productId: number): string {
  return `https://www.cardmarket.com/en/Pokemon/Products?idProduct=${Math.floor(productId)}`;
}

/**
 * Haalt een eventueel al opgeslagen directe Cardmarket-productlink uit de kaartnotities
 * (negeert oude generieke /Search?searchString= of /Singles?searchString= links).
 */
export function extractCardmarketUrlFromNotes(notes?: string): string | null {
  if (!notes) return null;
  const idMatch = notes.match(/https:\/\/(?:www\.)?cardmarket\.com\/[a-z]{2}\/Pokemon\/Products\?idProduct=\d+/i);
  if (idMatch) return idMatch[0];
  const slugMatch = notes.match(/https:\/\/(?:www\.)?cardmarket\.com\/[a-z]{2}\/Pokemon\/Products\/Singles\/[^\s?#]+/i);
  return slugMatch ? slugMatch[0] : null;
}

export function resolveCardmarketUrl(opts: {
  name: string;
  setName?: string;
  cardNumber?: string;
  cardmarketProductId?: number;
  notes?: string;
}): string {
  if (opts.cardmarketProductId && Number.isFinite(opts.cardmarketProductId) && opts.cardmarketProductId > 0) {
    return buildCardmarketProductUrl(opts.cardmarketProductId);
  }
  const stored = extractCardmarketUrlFromNotes(opts.notes);
  if (stored) return stored;
  return buildCardmarketSearchUrl(opts.name, opts.setName, opts.cardNumber);
}

const KNOWN_SET_NAME_TO_ID: Record<string, string> = {
  '151': 'sv03.5',
  'scarlet & violet': 'sv01',
  'paldea evolved': 'sv02',
  'obsidian flames': 'sv03',
  'paradox rift': 'sv04',
  'paldean fates': 'sv04.5',
  'temporal forces': 'sv05',
  'twilight masquerade': 'sv06',
  'shrouded fable': 'sv06.5',
  'stellar crown': 'sv07',
  'surging sparks': 'sv08',
  'prismatic evolutions': 'sv08.5',
  'journey together': 'sv09',
  'destined rivals': 'sv10',
  'black bolt': 'sv10.5b',
  'white flare': 'sv10.5w',
  'svp black star promos': 'svp',
  'evolving skies': 'swsh7',
  'fusion strike': 'swsh8',
  'brilliant stars': 'swsh9',
  'astral radiance': 'swsh10',
  'lost origin': 'swsh11',
  'silver tempest': 'swsh12',
  'crown zenith': 'swsh12.5',
  'shining fates': 'swsh4.5',
  'shining fates shiny vault': 'swsh4.5sv',
  'base set': 'base1',
  jungle: 'base2',
  fossil: 'base3',
  'base set 2': 'base4',
  'team rocket': 'base5',
  'expedition base set': 'ecard1',
  expedition: 'ecard1',
  aquapolis: 'ecard2',
  skyridge: 'ecard3',
  'mega evolution': 'me01',
  'phantasmal flames': 'me02',
  'ascended heroes': 'me02.5',
  'perfect order': 'me03',
  'chaos rising': 'me04',
  'pitch black': 'me05',
  'delta reign': 'me06',
};

/**
 * Leidt een TCGdex kaart-ID af op basis van een setnaam (of setcode) en kaartnummer (bijv. "151" + "181/165" -> "sv03.5-181").
 */
export function inferCardIdFromSetAndNumber(
  setName: string,
  cardNumber: string,
  setsCatalog?: ReadonlyArray<{ id: string; code?: string; name: string }>
): string | null {
  const localNum = (cardNumber || '').trim().split('/')[0].replace(/^#/, '').trim();
  const setKey = (setName || '').trim().toLowerCase();
  if (!localNum || !setKey) return null;

  let setId: string | undefined;
  if (setsCatalog && setsCatalog.length > 0) {
    const match = setsCatalog.find(
      (s) =>
        s.name.trim().toLowerCase() === setKey ||
        (s.code ?? '').trim().toLowerCase() === setKey ||
        s.id.trim().toLowerCase() === setKey
    );
    if (match) {
      setId = match.id;
    }
  }

  if (!setId) {
    setId = KNOWN_SET_NAME_TO_ID[setKey];
  }

  if (!setId) {
    const upper = setName.trim().toUpperCase();
    setId = SET_CODE_ALIASES[upper] || SET_CODE_MULTI_ALIASES[upper]?.[0];
  }

  if (!setId) return null;

  const parsed = parseCardIdInput(`${setId} ${localNum}`);
  return parsed?.normalizedId ?? `${setId}-${localNum}`;
}

export function buildCardmarketSearchUrl(cardName: string, _setName?: string, cardNumber?: string): string {
  const cleanName = (cardName || '').trim();
  const rawNum = (cardNumber || '').split('/')[0].trim();
  // Cardmarket Singles gebruikt kaartnaam + nummer zonder voorloopnullen (geen volledige setnaam)
  const cleanNum = /^\d+$/.test(rawNum) ? String(parseInt(rawNum, 10)) : rawNum;
  const query = [cleanName, cleanNum].filter(Boolean).join(' ').trim();
  return `https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=${encodeURIComponent(query)}`;
}
