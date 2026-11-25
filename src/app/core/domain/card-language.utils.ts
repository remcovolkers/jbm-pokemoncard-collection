/**
 * Kaarttaal-ondersteuning: labels voor dropdowns, TCGdex-taalendpoints en Cardmarket `language=`-filters.
 */

export interface CardLanguageInfo {
  /** Opgeslagen code in Google Sheets (kolom Taal). */
  code: string;
  /** Leesbaar label voor kiezers. */
  label: string;
  /** TCGdex API-taalpad (`/v2/<tcgdexLang>`). */
  tcgdexLang: string;
  /** Cardmarket `language=` filter-ID. */
  cardmarketId: number;
}

export const CARD_LANGUAGES: readonly CardLanguageInfo[] = [
  { code: 'EN', label: 'EN — Engels', tcgdexLang: 'en', cardmarketId: 1 },
  { code: 'FR', label: 'FR — Frans', tcgdexLang: 'fr', cardmarketId: 2 },
  { code: 'DE', label: 'DE — Duits', tcgdexLang: 'de', cardmarketId: 3 },
  { code: 'ES', label: 'ES — Spaans', tcgdexLang: 'es', cardmarketId: 4 },
  { code: 'IT', label: 'IT — Italiaans', tcgdexLang: 'it', cardmarketId: 5 },
  { code: 'CHS', label: 'CHS — Simplified Chinese', tcgdexLang: 'zh-cn', cardmarketId: 6 },
  { code: 'JP', label: 'JP — Japans', tcgdexLang: 'ja', cardmarketId: 7 },
  { code: 'PT', label: 'PT — Portugees', tcgdexLang: 'pt', cardmarketId: 8 },
  { code: 'KR', label: 'KR — Koreaans', tcgdexLang: 'ko', cardmarketId: 10 },
  { code: 'ZHT', label: 'ZHT — Traditional Chinese', tcgdexLang: 'zh-tw', cardmarketId: 11 },
  { code: 'NL', label: 'NL — Nederlands', tcgdexLang: 'nl', cardmarketId: 12 },
];

/** Standaardlijst voor nieuwe/ontbrekende taal-dropdowns (volgorde = kiezervolgorde). */
export const DEFAULT_LANGUAGE_CODES: readonly string[] = ['EN', 'NL', 'JP', 'DE', 'FR', 'KR', 'CHS', 'ZHT'];

const LANGUAGE_ALIASES: Record<string, string> = {
  ENG: 'EN',
  ENGLISH: 'EN',
  JA: 'JP',
  JPN: 'JP',
  JAPANESE: 'JP',
  KO: 'KR',
  KOR: 'KR',
  KOREAN: 'KR',
  ZH: 'ZHT',
  'ZH-TW': 'ZHT',
  TCHI: 'ZHT',
  ZHS: 'CHS',
  'ZH-CN': 'CHS',
  SCHI: 'CHS',
};

/** Normaliseert een ruwe taalwaarde ("fr", "Frans", "ja") naar onze opslagcode. */
export function normalizeLanguageCode(raw: string | null | undefined): string {
  const upper = (raw ?? '').trim().toUpperCase();
  if (!upper) return 'EN';
  return LANGUAGE_ALIASES[upper] ?? upper;
}

export function getLanguageInfo(raw: string | null | undefined): CardLanguageInfo | undefined {
  const code = normalizeLanguageCode(raw);
  return CARD_LANGUAGES.find((l) => l.code === code);
}

/** Leesbaar label voor een taalcode; onbekende codes blijven ongewijzigd. */
export function getLanguageLabel(raw: string | null | undefined): string {
  return getLanguageInfo(raw)?.label ?? normalizeLanguageCode(raw);
}

export function getTcgdexLanguagePath(raw: string | null | undefined): string {
  return getLanguageInfo(raw)?.tcgdexLang ?? 'en';
}

export function getCardmarketLanguageId(raw: string | null | undefined): number | undefined {
  return getLanguageInfo(raw)?.cardmarketId;
}

/** Vult een bestaande taallijst aan met ontbrekende standaardtalen (zonder bestaande volgorde te wijzigen). */
export function mergeLanguageOptions(existing: readonly string[] | null | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of [...(existing ?? []), ...DEFAULT_LANGUAGE_CODES]) {
    const code = normalizeLanguageCode(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

/**
 * Voegt het Cardmarket `language=`-filter toe aan een Cardmarket-URL (vervangt een bestaand filter).
 * Engels (en onbekende talen) laten de URL ongewijzigd, zodat bestaande links hetzelfde blijven.
 */
export function withCardmarketLanguage(url: string, language: string | null | undefined): string {
  if (!url) return url;
  const id = getCardmarketLanguageId(language);
  const cleaned = url.replace(/([?&])language=\d+(&|$)/i, (_m, lead: string, tail: string) =>
    tail === '&' ? lead : ''
  );
  if (!id || id === 1) return cleaned;
  const sep = cleaned.includes('?') ? '&' : '?';
  return `${cleaned}${sep}language=${id}`;
}
