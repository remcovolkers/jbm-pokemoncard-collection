import {
  inferCardIdFromSetAndNumber,
  isKnownNoScanSet,
  parseCardIdInput,
  resolveCardArtworkUrl,
  extractSetCodeFromImagePath,
} from './card-id.utils';
import { formatDexNumber, roundCurrency } from './card-math.utils';
import {
  AppSnapshot,
  BinderSlotsPerPage,
  CatalogSetSummary,
  CollectionCard,
  PokedexSlot,
  WishlistItem,
} from './models';
import { NATIONAL_DEX_NAMES } from './national-dex.data';
import {
  doesCardMatchPokemon,
  extractCardIdFromChoice,
  formatBinderChoice,
} from './pokedex-matching.utils';

export interface ParsedKaartspotInput {
  rawInput: string;
  username: string;
  targetBinderId: string | null;
  apiUrl: string;
}

export interface KaartspotBinderSummary {
  id: string;
  index: number;
  name: string;
  gridSize: number;
  supportedSlotsPerPage: BinderSlotsPerPage | null;
  isPokedexBinder: boolean;
  ownedCardCount: number;
  wantedCardCount: number;
  sealedSkippedCount: number;
  ownedValueEur: number;
}

export interface NormalizedKaartspotCard {
  ksItemId: string;
  ksTag: string;
  binderId: string;
  binderName: string;
  isPokedexBinder: boolean;
  obtained: boolean;
  dexSlotNumber: number | null;
  slotIndex: number | null;
  cardId: string;
  name: string;
  setName: string;
  seriesName: string;
  setId: string;
  setTotalCards: number;
  cardNumber: string;
  language: string;
  /** Echte setcode uit de bron (bijv. Chinese `CS4.5C`), indien bekend. */
  setCode?: string;
  rarity: string;
  variant: string;
  condition: string;
  grading: string;
  grade: string;
  quantity: number;
  marketPrice: number;
  sourceImageUrl: string;
  resolvedImageUrl: string;
  needsEmbeddedImageNote: boolean;
}

export interface KaartspotProfileData {
  username: string;
  calculatedAt: string;
  binders: KaartspotBinderSummary[];
  cards: NormalizedKaartspotCard[];
  totalSealedSkipped: number;
}

export interface KaartspotSyncOptions {
  selectedBinderIds: ReadonlyArray<string>;
  wishlistWanted: boolean;
  syncLayout: boolean;
}

export interface KaartspotCardInsertPayload {
  ksTag: string;
  cardId: string;
  name: string;
  setName: string;
  seriesName: string;
  setId: string;
  setTotalCards: number;
  cardNumber: string;
  language: string;
  setCode?: string;
  type: string;
  rarity: string;
  variant: string;
  condition: string;
  grading: string;
  grade: string;
  quantity: number;
  storageLocation: string;
  binderDetail: string;
  purchasePrice: number;
  marketPrice: number;
  forTrade: boolean;
  acquisitionMethod: string;
  notes: string;
  imageUrl?: string;
}

export interface KaartspotWishlistInsertPayload {
  ksTag: string;
  cardId: string;
  cardName: string;
  setName: string;
  cardNumber: string;
  desiredVariant: string;
  minCondition: string;
  priority: string;
  maxBudget: number;
  marketPrice: number;
  notes: string;
  imageUrl?: string;
}

export interface KaartspotPokedexSlotUpdate {
  dexNumber: number;
  pokemonName: string;
  inBinder: true;
  selectedCard: string;
}

export interface KaartspotSyncPlan {
  username: string;
  selectedBinderNames: string[];
  cardsToAdd: KaartspotCardInsertPayload[];
  wishlistToAdd: KaartspotWishlistInsertPayload[];
  wishlistRowsToMarkFound: number[];
  pokedexUpdates: KaartspotPokedexSlotUpdate[];
  targetSlotsPerPage: BinderSlotsPerPage | null;
  artworkCacheEntries: Array<{ cardId: string; imageUrl: string }>;
  summary: {
    selectedOwnedTotal: number;
    selectedWantedTotal: number;
    selectedSealedSkipped: number;
    newCollectionCount: number;
    skippedExistingCollectionCount: number;
    pokedexSlotsUpdatedCount: number;
    newWishlistCount: number;
    skippedExistingWishlistCount: number;
    promotedFromWishlistCount: number;
    hasAnyChanges: boolean;
  };
}

const SCRYDEX_TO_TCGDEX_SET_ID: Record<string, string> = {
  base6: 'lc',
  me55: '30th',
  me55c: '30th-c',
  '30thc': '30th-c',
  tk1a: 'tk-ex-latia',
  tk1b: 'tk-ex-latio',
  tk2a: 'tk-ex-p',
  tk2b: 'tk-ex-m',
  tk3a: 'tk-dp-m',
  tk3b: 'tk-dp-l',
  tk4a: 'tk-hs-g',
  tk4b: 'tk-hs-r',
  pgo: 'swsh10.5',
  swsh35: 'swsh3.5',
  swsh45: 'swsh4.5',
  swsh45sv: 'swsh4.5sv',
  swsh12pt5: 'swsh12.5',
  swsh12pt5gg: 'swsh12.5gg',
  sm35: 'sm3.5',
  sm75: 'sm7.5',
  sm115: 'sm115',
  hsp: 'hgssp',
  bp: 'bog',
  mcd11: '2011bw',
  mcd12: '2012bw',
  mcd14: '2014xy',
  mcd15: '2015xy',
  mcd16: '2016xy',
  mcd17: '2017sm',
  mcd18: '2018sm',
  mcd19: '2019sm',
  mcd21: '2021swsh',
  mcd22: '2022swsh',
  mcd23: '2023sv',
  mcd24: '2024sv',
};

const KAARTSPOT_SET_NAME_ALIASES: Record<string, string> = {
  base: 'Base Set',
  'hs—triumphant': 'Triumphant',
  'hs-triumphant': 'Triumphant',
  'scarlet & violet black star promos': 'SVP Black Star Promos',
  'mega evolution black star promos': 'MEP Black Star Promos',
  'sword & shield black star promos': 'SWSH Black Star Promos',
  'dp trainer kit lucario': 'DP trainer Kit (Lucario)',
  'dp trainer kit manaphy': 'DP trainer Kit (Manaphy)',
};

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{1,60}$/;
const LOOSE_CARDS_BINDER_ID = '__losse_kaarten__';

export function buildKaartspotTag(ksItemId: string): string {
  const clean = ksItemId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return `[KS:${clean.slice(0, 12) || ksItemId.trim()}]`;
}

export function extractKaartspotKeysFromNotes(notes?: string): string[] {
  if (!notes) return [];
  const matches = [...notes.matchAll(/\[KS:([^\]\s]+)\]/gi)];
  return matches.map((m) => m[1].replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 12)).filter(Boolean);
}

/**
 * Herkent elke Kaartspot link of gebruikersnaam:
 *  - https://kaartspot.nl/wrapped/jellybeanmels?cat=c4c1bf4b-...
 *  - https://kaartspot.nl/profiel/jellybeanmels?tab=binder&binder=c4c1bf4b-...
 *  - https://kaartspot.nl/api/binder-publiek/jellybeanmels
 *  - @jellybeanmels of jellybeanmels
 */
export function parseKaartspotInput(rawInput: string): ParsedKaartspotInput | null {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;

  const bare = trimmed.replace(/^@+/, '').trim();
  if (!trimmed.includes('/') && !trimmed.includes('?') && USERNAME_PATTERN.test(bare)) {
    return {
      rawInput: trimmed,
      username: bare,
      targetBinderId: null,
      apiUrl: `https://kaartspot.nl/api/binder-publiek/${encodeURIComponent(bare)}`,
    };
  }

  let candidateUrl = trimmed;
  if (/^(?:www\.)?kaartspot\.nl\//i.test(candidateUrl)) {
    candidateUrl = `https://${candidateUrl}`;
  }

  try {
    const url = new URL(candidateUrl);
    if (!/(?:^|\.)kaartspot\.nl$/i.test(url.hostname)) {
      return null;
    }

    const segments = url.pathname
      .split('/')
      .map((s) => decodeURIComponent(s.trim()))
      .filter(Boolean);

    let username = '';
    if (segments[0]?.toLowerCase() === 'wrapped' && segments[1]) {
      username = segments[1];
    } else if (
      (segments[0]?.toLowerCase() === 'profiel' ||
        segments[0]?.toLowerCase() === 'u' ||
        segments[0]?.toLowerCase() === 'user') &&
      segments[1]
    ) {
      username = segments[1];
    } else if (
      segments[0]?.toLowerCase() === 'api' &&
      segments[1]?.toLowerCase() === 'binder-publiek' &&
      segments[2]
    ) {
      username = segments[2];
    } else if (segments.length === 1 && USERNAME_PATTERN.test(segments[0].replace(/^@+/, ''))) {
      username = segments[0];
    }

    username = username.replace(/^@+/, '').trim();
    if (!USERNAME_PATTERN.test(username)) {
      return null;
    }

    const catParam = (url.searchParams.get('cat') || url.searchParams.get('binder') || '').trim();
    return {
      rawInput: trimmed,
      username,
      targetBinderId: catParam || null,
      apiUrl: `https://kaartspot.nl/api/binder-publiek/${encodeURIComponent(username)}`,
    };
  } catch {
    return null;
  }
}

export function mapScrydexSetIdToTcgdex(rawScrydexSetId: string): string {
  const lower = (rawScrydexSetId || '').trim().toLowerCase();
  if (!lower) return '';
  if (SCRYDEX_TO_TCGDEX_SET_ID[lower]) {
    return SCRYDEX_TO_TCGDEX_SET_ID[lower];
  }

  const withDot = lower.replace(/(\d)pt(\d)/g, '$1.$2');
  if (SCRYDEX_TO_TCGDEX_SET_ID[withDot]) {
    return SCRYDEX_TO_TCGDEX_SET_ID[withDot];
  }

  const svMeSingle = withDot.match(/^(sv|me)(\d)(\.\d+[a-z]?)?$/i);
  if (svMeSingle) {
    return `${svMeSingle[1].toLowerCase()}0${svMeSingle[2]}${(svMeSingle[3] ?? '').toLowerCase()}`;
  }

  return withDot;
}

export function mapKaartspotVariant(rawPrint: string | null | undefined): string {
  const p = (rawPrint || '').trim().toLowerCase();
  if (!p || p === 'normal') return 'Normal';
  if (p.includes('first_edition') || p.includes('1st_edition') || p === 'shadowless') {
    return 'First Edition';
  }
  if (p.includes('reverse')) {
    return 'Reverse Holo';
  }
  if (
    p.includes('stamp') ||
    p === 'prerelease' ||
    p === 'staff' ||
    p === 'promo' ||
    p.includes('league')
  ) {
    return 'Stamped / Promo';
  }
  if (p.includes('full_art') || p.includes('full art')) {
    return 'Full Art';
  }
  if (p.includes('alt_art') || p.includes('special_illustration')) {
    return 'Alt Art';
  }
  if (p.includes('holo') || p.includes('foil') || p.includes('cosmos')) {
    return 'Holo';
  }
  return 'Normal';
}

export function mapKaartspotCondition(rawCond: string | null | undefined): string {
  const c = (rawCond || '').trim().toUpperCase();
  switch (c) {
    case 'MT':
    case 'M':
    case 'MINT':
      return 'Mint (MT)';
    case 'NM':
    case '':
      return 'Near Mint (NM)';
    case 'EX':
      return 'Excellent (EX)';
    case 'GD':
      return 'Good (GD)';
    case 'LP':
      return 'Light Played (LP)';
    case 'PL':
    case 'MP':
      return 'Played (PL)';
    case 'PO':
    case 'HP':
    case 'DMG':
      return 'Poor (PO)';
    default:
      return 'Near Mint (NM)';
  }
}

export function mapKaartspotRarity(rawRarity: string | null | undefined): string {
  const r = (rawRarity || '').trim().toLowerCase();
  if (!r) return 'Rare';
  if (r.includes('special illustration') || r === 'three star' || r === 'two shiny') {
    return 'Special Illustration Rare';
  }
  if (r.includes('illustration') || r === 'one star' || r === 'one shiny') {
    return 'Illustration Rare';
  }
  if (r.includes('hyper') || r.includes('secret') || r === 'crown') {
    return 'Hyper Rare';
  }
  if (
    r.includes('ultra') ||
    r.includes('ace spec') ||
    r.includes('holo v') ||
    r.includes('holo gx') ||
    r.includes('holo ex') ||
    r.includes('full art') ||
    r === 'two star'
  ) {
    return 'Ultra Rare';
  }
  if (r.includes('double') || r === 'four diamond') {
    return 'Double Rare';
  }
  if (r.includes('promo')) {
    return 'Promo';
  }
  if (r === 'rare holo' || r === 'holo rare' || r.includes('vintage holo')) {
    return 'Holo Rare';
  }
  if (r.includes('uncommon') || r === 'two diamond') {
    return 'Uncommon';
  }
  if (r.includes('common') || r === 'one diamond') {
    return 'Common';
  }
  return 'Rare';
}

export function mapKaartspotGrading(rawGrader: string | null | undefined): string {
  const g = (rawGrader || '').trim().toUpperCase();
  if (g === 'PSA' || g === 'BGS' || g === 'CGC' || g === 'TAG') {
    return g;
  }
  return 'Raw';
}

function toSupportedSlotsPerPage(gridSize: number): BinderSlotsPerPage | null {
  if (gridSize === 4 || gridSize === 9 || gridSize === 12 || gridSize === 16 || gridSize === 20) {
    return gridSize;
  }
  return null;
}

function isPokedexBinderName(name: string): boolean {
  const clean = (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return clean.includes('pokedex') || clean.includes('national dex');
}

function buildCustomCardId(setName: string, cardNumber: string, language: string): string {
  const setSlug =
    (setName || 'promo')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'custom';
  const numSlug = (cardNumber || '1').split('/')[0].replace(/[^a-zA-Z0-9]+/g, '') || '1';
  const langPrefix = language && language !== 'EN' ? `${language.toLowerCase()}-` : '';
  return `${langPrefix}${setSlug}-${numSlug}`;
}

function upgradeKaartspotImageUrl(rawUrl: string): string {
  const clean = (rawUrl || '').trim();
  if (!clean) return '';
  if (clean.startsWith('https://images.scrydex.com/pokemon/') && clean.endsWith('/small')) {
    return `${clean.slice(0, -'/small'.length)}/large`;
  }
  return clean;
}

function resolveKaartspotDexSlot(
  cardName: string,
  slotIndex: number | null,
  isDexBinder: boolean
): number | null {
  if (isDexBinder && slotIndex !== null && slotIndex >= 0 && slotIndex < NATIONAL_DEX_NAMES.length) {
    const candidateDex = slotIndex + 1;
    const expectedName = NATIONAL_DEX_NAMES[slotIndex];
    if (expectedName && doesCardMatchPokemon(cardName, expectedName)) {
      return candidateDex;
    }
    // Als Kaartspot een afwijkende/vertaalde kaartnaam heeft op exact dit Pokédex-vakje, vertrouw vakje + 1
    // tenzij de naam ondubbelzinnig op een andere Pokémon matcht.
    const otherMatchIdx = NATIONAL_DEX_NAMES.findIndex((p) => doesCardMatchPokemon(cardName, p));
    return otherMatchIdx >= 0 ? otherMatchIdx + 1 : candidateDex;
  }

  return null;
}

/**
 * Decodeert en normaliseert de publieke Kaartspot API response (`/api/binder-publiek/<username>`).
 */
export function parseKaartspotPublicPayload(
  rawPayload: unknown,
  setsCatalog: ReadonlyArray<CatalogSetSummary> = []
): KaartspotProfileData {
  if (!rawPayload || typeof rawPayload !== 'object') {
    throw new Error('Ongeldige Kaartspot-data ontvangen.');
  }

  const record = rawPayload as Record<string, unknown>;
  if (typeof record['error'] === 'string' && record['error']) {
    throw new Error(record['error']);
  }

  const columns = Array.isArray(record['kolommen']) ? (record['kolommen'] as string[]) : null;
  const texts = Array.isArray(record['teksten']) ? (record['teksten'] as string[]) : [];
  const rawItems = Array.isArray(record['items']) ? (record['items'] as unknown[][]) : null;
  const rawBinders = Array.isArray(record['binders'])
    ? (record['binders'] as Array<Record<string, unknown>>)
    : [];

  if (!columns || !rawItems) {
    throw new Error('Dit Kaartspot-bestand bevat geen herkenbare binder-structuur (formaat 2 verwacht).');
  }

  const colIdx = new Map<string, number>();
  columns.forEach((col, i) => colIdx.set(String(col), i));

  const readText = (val: unknown): string => {
    if (typeof val === 'number' && val >= 0 && val < texts.length) {
      return String(texts[val] ?? '');
    }
    if (typeof val === 'string') return val;
    return '';
  };

  const catalogById = new Map<string, CatalogSetSummary>();
  const catalogByLowerName = new Map<string, CatalogSetSummary>();
  for (const s of setsCatalog) {
    catalogById.set(s.id.trim().toLowerCase(), s);
    catalogByLowerName.set(s.name.trim().toLowerCase(), s);
  }

  const ownerObj = (record['eigenaar'] ?? {}) as Record<string, unknown>;
  const username = String(ownerObj['username'] || 'kaartspot').trim();
  const calculatedAt = String(record['berekendOp'] || new Date().toISOString());

  const binderSummaries: KaartspotBinderSummary[] = rawBinders.map((b, idx) => {
    const name = String(b['name'] || `Binder ${idx + 1}`).trim();
    const gridSize = Number(b['grid_size']) || 9;
    return {
      id: String(b['id'] || `binder-${idx}`),
      index: idx,
      name,
      gridSize,
      supportedSlotsPerPage: toSupportedSlotsPerPage(gridSize),
      isPokedexBinder: isPokedexBinderName(name),
      ownedCardCount: 0,
      wantedCardCount: 0,
      sealedSkippedCount: 0,
      ownedValueEur: 0,
    };
  });

  const looseSummary: KaartspotBinderSummary = {
    id: LOOSE_CARDS_BINDER_ID,
    index: -1,
    name: String(((record['losseKaarten'] ?? {}) as Record<string, unknown>)['naam'] || 'Losse kaarten'),
    gridSize: 9,
    supportedSlotsPerPage: 9,
    isPokedexBinder: false,
    ownedCardCount: 0,
    wantedCardCount: 0,
    sealedSkippedCount: 0,
    ownedValueEur: 0,
  };

  const getField = (row: unknown[], key: string): unknown => {
    const idx = colIdx.get(key);
    return idx !== undefined ? row[idx] : undefined;
  };

  const cards: NormalizedKaartspotCard[] = [];
  let totalSealedSkipped = 0;

  for (let i = 0; i < rawItems.length; i++) {
    const row = rawItems[i];
    if (!Array.isArray(row)) continue;

    const binderIdxRaw = getField(row, 'binder');
    const binderSummary =
      typeof binderIdxRaw === 'number' && binderIdxRaw >= 0 && binderIdxRaw < binderSummaries.length
        ? binderSummaries[binderIdxRaw]
        : looseSummary;

    const itemKind = Number(getField(row, 'soort') ?? 0);
    if (itemKind !== 0) {
      binderSummary.sealedSkippedCount++;
      totalSealedSkipped++;
      continue;
    }

    const ksItemId = String(getField(row, 'id') || `item-${i}`).trim();
    const rawName = String(getField(row, 'naam') || '').trim();
    if (!rawName) continue;

    const nogNodigVal = Number(getField(row, 'nogNodig') ?? 0);
    const obtained = nogNodigVal !== 1;

    const rawSetName = readText(getField(row, 'set')).trim();
    const canonicalSetNameInput =
      KAARTSPOT_SET_NAME_ALIASES[rawSetName.toLowerCase()] || rawSetName;

    const rawNumber = String(getField(row, 'nummer') ?? '').trim();
    const fotoPrefix = readText(getField(row, 'fotoBegin'));
    const fotoRest = String(getField(row, 'fotoRest') ?? '').trim();
    const rawSourceImageUrl = fotoPrefix && fotoRest ? `${fotoPrefix}${fotoRest}` : '';
    const highResSourceImage = upgradeKaartspotImageUrl(rawSourceImageUrl);

    const language = (readText(getField(row, 'taal')).trim().toUpperCase() || 'EN');
    // Chinese Pikaqian-scans bevatten de echte setcode in het pad (cs4.5c/dragonite-v.png -> CS4.5C)
    const sourceSetCode =
      fotoPrefix.includes('pikaqian') ? (extractSetCodeFromImagePath(fotoRest) ?? undefined) : undefined;

    // 1. Probeer Kaart-ID af te leiden uit Scrydex pad (bijv. "sv7-143/small" -> set "sv07", nr "143")
    let resolvedSetId = '';
    let resolvedLocalNum = rawNumber.split('/')[0].replace(/^#/, '').trim();

    if (fotoPrefix.includes('scrydex.com') && fotoRest) {
      const slug = fotoRest.split('/')[0].trim();
      const dashIdx = slug.lastIndexOf('-');
      if (dashIdx > 0) {
        const scrydexSet = slug.slice(0, dashIdx);
        const scrydexNum = slug.slice(dashIdx + 1);
        resolvedSetId = mapScrydexSetIdToTcgdex(scrydexSet);
        if (!resolvedLocalNum && scrydexNum) {
          resolvedLocalNum = scrydexNum;
        }
      }
    }

    // 2. Val terug op setnaam -> TCGdex set-ID als er geen Scrydex pad was (bijv. TCGplayer CDN)
    if (!resolvedSetId && canonicalSetNameInput && resolvedLocalNum && language !== 'ZHT') {
      const inferred = inferCardIdFromSetAndNumber(
        canonicalSetNameInput,
        resolvedLocalNum,
        setsCatalog
      );
      if (inferred) {
        const d = inferred.lastIndexOf('-');
        if (d > 0) {
          resolvedSetId = inferred.slice(0, d).toLowerCase();
        }
      }
    }

    const matchedSetMeta =
      (resolvedSetId ? catalogById.get(resolvedSetId.toLowerCase()) : undefined) ??
      (canonicalSetNameInput
        ? catalogByLowerName.get(canonicalSetNameInput.toLowerCase())
        : undefined);

    if (!resolvedSetId && matchedSetMeta && language !== 'ZHT') {
      resolvedSetId = matchedSetMeta.id.toLowerCase();
    }

    let cardId = '';
    let isStandardTcgdexCard = false;
    if (resolvedSetId && resolvedLocalNum && language !== 'ZHT') {
      const parsed = parseCardIdInput(`${resolvedSetId} ${resolvedLocalNum}`);
      cardId = parsed?.normalizedId ?? `${resolvedSetId}-${resolvedLocalNum}`;
      isStandardTcgdexCard = true;
    } else {
      cardId = buildCustomCardId(rawSetName || 'kaartspot', resolvedLocalNum || '1', language);
    }

    const setName = matchedSetMeta?.name || canonicalSetNameInput || rawSetName || 'Onbekende Set';
    const seriesName = matchedSetMeta?.series || 'Pokémon TCG';
    const officialCount = matchedSetMeta?.officialCount ?? 0;
    const setTotalCards = matchedSetMeta?.totalCount || officialCount || 0;

    let cardNumber = rawNumber;
    if (cardNumber && !cardNumber.includes('/') && officialCount > 0) {
      cardNumber = `${cardNumber}/${officialCount}`;
    }

    const rarity = mapKaartspotRarity(readText(getField(row, 'zeldzaamheid')));
    const variant = mapKaartspotVariant(readText(getField(row, 'druk')));
    const condition = mapKaartspotCondition(readText(getField(row, 'conditie')));
    const grading = mapKaartspotGrading(readText(getField(row, 'grader')));
    const rawGrade = getField(row, 'cijfer');
    const grade =
      grading !== 'Raw' && rawGrade !== null && rawGrade !== undefined && String(rawGrade).trim() !== ''
        ? String(rawGrade).trim()
        : '';
    const quantity = Math.max(1, Number(getField(row, 'aantal')) || 1);

    const rawPriceCents = Number(getField(row, 'waardeCents') ?? 0);
    const customPriceCents = Number(getField(row, 'eigenWaarde') ?? 0);
    const effectiveCents = rawPriceCents > 0 ? rawPriceCents : customPriceCents;
    const marketPrice = roundCurrency(Math.max(0, effectiveCents) / 100);

    const vakjeRaw = getField(row, 'vakje');
    const slotIndex = typeof vakjeRaw === 'number' && Number.isFinite(vakjeRaw) ? vakjeRaw : null;
    const dexSlotNumber = resolveKaartspotDexSlot(rawName, slotIndex, binderSummary.isPokedexBinder);

    const needsEmbeddedImageNote =
      Boolean(highResSourceImage) &&
      (!isStandardTcgdexCard || isKnownNoScanSet(resolvedSetId));

    const resolvedImageUrl = needsEmbeddedImageNote
      ? highResSourceImage
      : resolveCardArtworkUrl(cardId, undefined, 'high') || highResSourceImage;

    if (obtained) {
      binderSummary.ownedCardCount += quantity;
      binderSummary.ownedValueEur = roundCurrency(
        binderSummary.ownedValueEur + marketPrice * quantity
      );
    } else {
      binderSummary.wantedCardCount++;
    }

    cards.push({
      ksItemId,
      ksTag: buildKaartspotTag(ksItemId),
      binderId: binderSummary.id,
      binderName: binderSummary.name,
      isPokedexBinder: binderSummary.isPokedexBinder,
      obtained,
      dexSlotNumber,
      slotIndex,
      cardId,
      name: rawName,
      setName,
      seriesName,
      setId: resolvedSetId,
      setTotalCards,
      cardNumber,
      language,
      setCode: sourceSetCode,
      rarity,
      variant,
      condition,
      grading,
      grade,
      quantity,
      marketPrice,
      sourceImageUrl: highResSourceImage,
      resolvedImageUrl,
      needsEmbeddedImageNote,
    });
  }

  const allBinders = [...binderSummaries];
  if (
    looseSummary.ownedCardCount > 0 ||
    looseSummary.wantedCardCount > 0 ||
    looseSummary.sealedSkippedCount > 0
  ) {
    allBinders.push(looseSummary);
  }

  return {
    username,
    calculatedAt,
    binders: allBinders,
    cards,
    totalSealedSkipped,
  };
}

export function selectDefaultBinderIds(
  profile: KaartspotProfileData,
  targetBinderId?: string | null
): string[] {
  const cleanTarget = (targetBinderId || '').trim();
  if (cleanTarget && profile.binders.some((b) => b.id === cleanTarget)) {
    return [cleanTarget];
  }

  const dexBinder = profile.binders.find(
    (b) => b.isPokedexBinder && b.ownedCardCount + b.wantedCardCount > 0
  );
  if (dexBinder) {
    return [dexBinder.id];
  }

  return profile.binders
    .filter((b) => b.ownedCardCount + b.wantedCardCount > 0)
    .map((b) => b.id);
}

/**
 * Berekent een volledig veilig, idempotent Merge / Delta-Sync plan tussen Kaartspot en de huidige PokéBinder-collectie:
 *  - nogNodig === 0 (obtained): gaat naar Collectie + vult Pokédex Binder vakje; promoveert eventuele Verlanglijst-match naar Gevonden.
 *  - nogNodig === 1 (greyed out, bijv. Treecko): gaat NOOIT naar Collectie/In Binder, maar optioneel naar Verlanglijst.
 *  - Tweemaal draaien produceert 0 duplicaten.
 */
export function computeKaartspotSyncPlan(
  profile: KaartspotProfileData,
  options: KaartspotSyncOptions,
  currentSnapshot: AppSnapshot
): KaartspotSyncPlan {
  const selectedSet = new Set(options.selectedBinderIds);
  const selectedBinders = profile.binders.filter((b) => selectedSet.has(b.id));
  const selectedCards = profile.cards.filter((c) => selectedSet.has(c.binderId));

  const existingCollectionByKsKey = new Map<string, CollectionCard>();
  const existingCollectionByNaturalKey = new Map<string, CollectionCard>();
  const existingCollectionByCardVariant = new Map<string, CollectionCard>();

  for (const card of currentSnapshot.collection) {
    for (const ksKey of extractKaartspotKeysFromNotes(card.notes)) {
      existingCollectionByKsKey.set(ksKey, card);
    }
    const cardVarKey = `${card.cardId.trim().toLowerCase()}|${card.variant.trim().toLowerCase()}`;
    if (!existingCollectionByCardVariant.has(cardVarKey)) {
      existingCollectionByCardVariant.set(cardVarKey, card);
    }
    const natKey = `${cardVarKey}|${card.binderDetail.trim().toLowerCase()}`;
    if (!existingCollectionByNaturalKey.has(natKey)) {
      existingCollectionByNaturalKey.set(natKey, card);
    }
  }

  const existingWishlistByKsKey = new Map<string, WishlistItem>();
  const existingWishlistByCardKey = new Map<string, WishlistItem>();
  for (const w of currentSnapshot.wishlist) {
    for (const ksKey of extractKaartspotKeysFromNotes(w.notes)) {
      existingWishlistByKsKey.set(ksKey, w);
    }
    const wKey = w.cardId?.trim()
      ? `id:${w.cardId.trim().toLowerCase()}`
      : `name:${w.cardName.trim().toLowerCase()}|${w.setName.trim().toLowerCase()}|${w.cardNumber.split('/')[0].trim().toLowerCase()}`;
    if (!existingWishlistByCardKey.has(wKey)) {
      existingWishlistByCardKey.set(wKey, w);
    }
  }

  const pokedexSlotMap = new Map<number, PokedexSlot>();
  for (const slot of currentSnapshot.pokedex) {
    pokedexSlotMap.set(slot.dexNumber, slot);
  }

  const cardsToAdd: KaartspotCardInsertPayload[] = [];
  const wishlistToAdd: KaartspotWishlistInsertPayload[] = [];
  const wishlistRowsToMarkFoundSet = new Set<number>();
  const pokedexUpdatesMap = new Map<number, KaartspotPokedexSlotUpdate>();
  const artworkCacheMap = new Map<string, string>();

  let selectedOwnedTotal = 0;
  let selectedWantedTotal = 0;
  let skippedExistingCollectionCount = 0;
  let skippedExistingWishlistCount = 0;

  const seenBatchKsKeys = new Set<string>();

  for (const item of selectedCards) {
    const ksKey = item.ksItemId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 12);
    if (seenBatchKsKeys.has(ksKey)) continue;
    seenBatchKsKeys.add(ksKey);

    if (item.sourceImageUrl && item.needsEmbeddedImageNote) {
      artworkCacheMap.set(item.cardId.toLowerCase(), item.sourceImageUrl);
    }

    const binderDetail = `Kaartspot · ${item.binderName}`;
    const cardVarKey = `${item.cardId.toLowerCase()}|${item.variant.toLowerCase()}`;
    const natKey = `${cardVarKey}|${binderDetail.toLowerCase()}`;

    if (item.obtained) {
      selectedOwnedTotal++;

      const existingCard =
        existingCollectionByKsKey.get(ksKey) ??
        existingCollectionByNaturalKey.get(natKey) ??
        existingCollectionByCardVariant.get(cardVarKey);

      if (existingCard) {
        skippedExistingCollectionCount++;
      } else {
        const noteParts = [`Kaartspot sync (${item.binderName}) ${item.ksTag}`];
        if (item.needsEmbeddedImageNote && item.sourceImageUrl) {
          noteParts.push(`[IMG:${item.sourceImageUrl}]`);
        }
        if (item.setCode) noteParts.push(`[SET:${item.setCode}]`);
        const insertPayload: KaartspotCardInsertPayload = {
          ksTag: item.ksTag,
          cardId: item.cardId,
          name: item.name,
          setName: item.setName,
          seriesName: item.seriesName,
          setId: item.setId,
          setTotalCards: item.setTotalCards,
          cardNumber: item.cardNumber,
          language: item.language,
          setCode: item.setCode,
          type: '',
          rarity: item.rarity,
          variant: item.variant,
          condition: item.condition,
          grading: item.grading,
          grade: item.grade,
          quantity: item.quantity,
          storageLocation: 'Hoofdbinder',
          binderDetail,
          purchasePrice: 0,
          marketPrice: item.marketPrice,
          forTrade: false,
          acquisitionMethod: 'Kaartspot Sync',
          notes: noteParts.join(' '),
          imageUrl: item.resolvedImageUrl || undefined,
        };
        cardsToAdd.push(insertPayload);
      }

      // Promoveer eventueel openstaand Verlanglijst-item automatisch naar Gevonden (bijv. Treecko nogNodig 1 -> 0!)
      const matchingWish =
        existingWishlistByKsKey.get(ksKey) ??
        existingWishlistByCardKey.get(`id:${item.cardId.toLowerCase()}`) ??
        existingWishlistByCardKey.get(
          `name:${item.name.toLowerCase()}|${item.setName.toLowerCase()}|${item.cardNumber.split('/')[0].toLowerCase()}`
        );

      if (matchingWish && !matchingWish.found && matchingWish.rowIndex >= 2) {
        wishlistRowsToMarkFoundSet.add(matchingWish.rowIndex);
      }

      // Koppel het Pokédex-vakje als dit item uit een Pokédex-binder komt
      if (item.isPokedexBinder && item.dexSlotNumber !== null) {
        const targetChoice = formatBinderChoice({
          cardId: existingCard?.cardId || item.cardId,
          setName: existingCard?.setName || item.setName,
          variant: existingCard?.variant || item.variant,
          cardNumber: existingCard?.cardNumber || item.cardNumber,
          rarity: existingCard?.rarity || item.rarity,
        });
        const existingSlot = pokedexSlotMap.get(item.dexSlotNumber);
        const currentChosenId = extractCardIdFromChoice(existingSlot?.selectedCard ?? '').toLowerCase();
        const desiredId = (existingCard?.cardId || item.cardId).toLowerCase();

        if (!existingSlot || !existingSlot.inBinder || currentChosenId !== desiredId) {
          pokedexUpdatesMap.set(item.dexSlotNumber, {
            dexNumber: item.dexSlotNumber,
            pokemonName:
              existingSlot?.pokemonName ||
              NATIONAL_DEX_NAMES[item.dexSlotNumber - 1] ||
              item.name,
            inBinder: true,
            selectedCard: targetChoice,
          });
        }
      }
    } else {
      // nogNodig === 1 (greyed out op Kaartspot, zoals Treecko!): NOOIT als bezit in Collectie of In Binder!
      selectedWantedTotal++;

      if (options.wishlistWanted) {
        const alreadyOwnedExact = existingCollectionByCardVariant.has(cardVarKey);
        const existingWish =
          existingWishlistByKsKey.get(ksKey) ??
          existingWishlistByCardKey.get(`id:${item.cardId.toLowerCase()}`) ??
          existingWishlistByCardKey.get(
            `name:${item.name.toLowerCase()}|${item.setName.toLowerCase()}|${item.cardNumber.split('/')[0].toLowerCase()}`
          );

        if (alreadyOwnedExact || existingWish) {
          skippedExistingWishlistCount++;
        } else {
          const dexLabel =
            item.dexSlotNumber !== null
              ? `Pokédex ${formatDexNumber(item.dexSlotNumber)} · `
              : `${item.binderName} · `;
          const noteParts = [`${dexLabel}Kaartspot target ${item.ksTag}`];
          if (item.needsEmbeddedImageNote && item.sourceImageUrl) {
            noteParts.push(`[IMG:${item.sourceImageUrl}]`);
          }
          if (item.setCode) noteParts.push(`[SET:${item.setCode}]`);
          wishlistToAdd.push({
            ksTag: item.ksTag,
            cardId: item.cardId,
            cardName: item.name,
            setName: item.setName,
            cardNumber: item.cardNumber,
            desiredVariant: item.variant,
            minCondition: item.condition,
            priority: item.isPokedexBinder ? 'Hoog' : 'Gemiddeld',
            maxBudget: item.marketPrice,
            marketPrice: item.marketPrice,
            notes: noteParts.join(' '),
            imageUrl: item.resolvedImageUrl || undefined,
          });
        }
      }
    }
  }

  let targetSlotsPerPage: BinderSlotsPerPage | null = null;
  if (options.syncLayout) {
    const selectedDexBinder = selectedBinders.find(
      (b) => b.isPokedexBinder && b.supportedSlotsPerPage !== null
    );
    if (
      selectedDexBinder?.supportedSlotsPerPage &&
      selectedDexBinder.supportedSlotsPerPage !== currentSnapshot.binderSlotsPerPage
    ) {
      targetSlotsPerPage = selectedDexBinder.supportedSlotsPerPage;
    }
  }

  const selectedSealedSkipped = selectedBinders.reduce((sum, b) => sum + b.sealedSkippedCount, 0);
  const pokedexUpdates = [...pokedexUpdatesMap.values()].sort((a, b) => a.dexNumber - b.dexNumber);
  const wishlistRowsToMarkFound = [...wishlistRowsToMarkFoundSet.values()].sort((a, b) => a - b);

  const hasAnyChanges =
    cardsToAdd.length > 0 ||
    wishlistToAdd.length > 0 ||
    wishlistRowsToMarkFound.length > 0 ||
    pokedexUpdates.length > 0 ||
    targetSlotsPerPage !== null;

  return {
    username: profile.username,
    selectedBinderNames: selectedBinders.map((b) => b.name),
    cardsToAdd,
    wishlistToAdd,
    wishlistRowsToMarkFound,
    pokedexUpdates,
    targetSlotsPerPage,
    artworkCacheEntries: [...artworkCacheMap.entries()].map(([cardId, imageUrl]) => ({
      cardId,
      imageUrl,
    })),
    summary: {
      selectedOwnedTotal,
      selectedWantedTotal,
      selectedSealedSkipped,
      newCollectionCount: cardsToAdd.length,
      skippedExistingCollectionCount,
      pokedexSlotsUpdatedCount: pokedexUpdates.length,
      newWishlistCount: wishlistToAdd.length,
      skippedExistingWishlistCount,
      promotedFromWishlistCount: wishlistRowsToMarkFound.length,
      hasAnyChanges,
    },
  };
}
