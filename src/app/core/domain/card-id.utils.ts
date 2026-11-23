/**
 * Mapping van veelgebruikte Pokémon TCG setcodes / afkortingen naar officiële TCGdex set-ID's.
 */
export const SET_CODE_ALIASES: Record<string, string> = {
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

const REVERSE_DISPLAY_CODE: Record<string, string> = {
  'sv01': 'SVI',
  'sv02': 'PAL',
  'sv03': 'OBF',
  'sv03.5': 'MEW',
  'sv04': 'PAR',
  'sv04.5': 'PAF',
  'sv05': 'TEF',
  'sv06': 'TWM',
  'sv06.5': 'SFA',
  'sv07': 'SCR',
  'sv08': 'SSP',
  'sv08.5': 'PRE',
  'sv09': 'JTG',
  'swsh7': 'EVS',
  'swsh8': 'FST',
  'swsh9': 'BRS',
  'swsh11': 'LOR',
  'swsh12.5': 'CRZ',
  'base1': 'BS',
  'base2': 'JU',
  'base3': 'FO',
  'ecard1': 'EXP',
  'ex8': 'DX',
};

export interface ParsedCardId {
  rawInput: string;
  inputSetCode: string;
  tcgdexSetId: string;
  localNumber: string;
  normalizedId: string;
  /** TCGdex API probeer-volgorde (bijv. eerst sv03.5-003 en dan sv03.5-3) */
  candidateIds: string[];
}

/**
 * Parset gebruikersinvoer zoals "MEW 181", "OBF 199/197", "BS 44", "sv03.5-181", "SVI #004"
 * naar een genormaliseerde TCGdex Kaart-ID met kandidaat-varianten voor voorloopnullen.
 */
export function parseCardIdInput(rawInput: string): ParsedCardId | null {
  const cleaned = rawInput.trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;

  // Accepteert: "MEW 181", "OBF 199/197", "sv03.5-181", "BS #044", "CRZ GG70/GG70"
  const match = cleaned.match(/^([a-z0-9.]+)\s*[-\s#:]+\s*#?([a-z]*\d+[a-z]?)(?:\/[a-z]*\d+)?$/i);
  if (!match) return null;

  const rawSet = match[1].toUpperCase();
  const tcgdexSetId = SET_CODE_ALIASES[rawSet] ?? rawSet.toLowerCase();
  const rawNum = match[2].trim();

  const isPureDigits = /^\d+$/.test(rawNum);
  const unpaddedNum = isPureDigits ? String(parseInt(rawNum, 10)) : rawNum.toUpperCase();
  const padded3 = isPureDigits ? unpaddedNum.padStart(3, '0') : unpaddedNum;

  // Scarlet & Violet sets gebruiken in TCGdex standaard 3-cijferige voorloopnullen (sv03.5-003)
  const prefersPadded = /^sv\d/i.test(tcgdexSetId);
  const primaryNum = prefersPadded ? padded3 : unpaddedNum;
  const normalizedId = `${tcgdexSetId}-${primaryNum}`;

  const candidates: string[] = [];
  const pushUnique = (id: string) => {
    if (!candidates.includes(id)) candidates.push(id);
  };

  if (prefersPadded) {
    pushUnique(`${tcgdexSetId}-${padded3}`);
    pushUnique(`${tcgdexSetId}-${unpaddedNum}`);
  } else {
    pushUnique(`${tcgdexSetId}-${unpaddedNum}`);
    pushUnique(`${tcgdexSetId}-${padded3}`);
  }

  // Behoud ook de originele input-notatie als fallback (bijv. 2-cijferige voorloopnul zoals basep-04)
  if (rawNum !== primaryNum) {
    pushUnique(`${tcgdexSetId}-${rawNum}`);
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
 * Geeft een korte leesbare setcode terug voor op kaartbadges (bijv. sv03.5 -> MEW, swsh7 -> EVS).
 */
export function getDisplaySetCode(cardId: string, fallbackSetName?: string): string {
  const dashIdx = cardId.indexOf('-');
  if (dashIdx > 0) {
    const setId = cardId.slice(0, dashIdx).toLowerCase();
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
  const dashIdx = val.indexOf('-');
  if (dashIdx === -1) return '';
  const setId = val.slice(0, dashIdx).toLowerCase();
  const localId = val.slice(dashIdx + 1);
  const series = inferTcgdexSeriesFolder(setId);
  return `https://assets.tcgdex.net/en/${series}/${setId}/${localId}/${quality}.webp`;
}

export function buildCardmarketSearchUrl(cardName: string, setName?: string, cardNumber?: string): string {
  const numPart = cardNumber ? cardNumber.split('/')[0] : '';
  const query = [cardName, setName, numPart].filter(Boolean).join(' ').trim();
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(query)}`;
}
