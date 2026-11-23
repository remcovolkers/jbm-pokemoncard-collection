import { CollectionCard, GenerationInfo } from './models';

export const GENERATIONS: GenerationInfo[] = [
  { id: 1, label: 'Gen 1 (#0001–#0151)', shortLabel: 'Gen 1', region: 'Kanto', start: 1, end: 151 },
  { id: 2, label: 'Gen 2 (#0152–#0251)', shortLabel: 'Gen 2', region: 'Johto', start: 152, end: 251 },
  { id: 3, label: 'Gen 3 (#0252–#0386)', shortLabel: 'Gen 3', region: 'Hoenn', start: 252, end: 386 },
  { id: 4, label: 'Gen 4 (#0387–#0493)', shortLabel: 'Gen 4', region: 'Sinnoh', start: 387, end: 493 },
  { id: 5, label: 'Gen 5 (#0494–#0649)', shortLabel: 'Gen 5', region: 'Unova', start: 494, end: 649 },
  { id: 6, label: 'Gen 6 (#0650–#0721)', shortLabel: 'Gen 6', region: 'Kalos', start: 650, end: 721 },
  { id: 7, label: 'Gen 7 (#0722–#0809)', shortLabel: 'Gen 7', region: 'Alola', start: 722, end: 809 },
  { id: 8, label: 'Gen 8 (#0810–#0905)', shortLabel: 'Gen 8', region: 'Galar', start: 810, end: 905 },
  { id: 9, label: 'Gen 9 (#0906–#1025)', shortLabel: 'Gen 9', region: 'Paldea', start: 906, end: 1025 },
];

export function getGenerationForDex(dexNumber: number): GenerationInfo {
  const found = GENERATIONS.find((g) => dexNumber >= g.start && dexNumber <= g.end);
  return found ?? GENERATIONS[0];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Flabébé -> Flabebe
    .replace(/[’`]/g, "'")
    .trim();
}

/**
 * Strikt veilige Pokédex naam-matching voor Pokémon TCG kaartnamen.
 *
 * Voorkomt valse positieven zoals:
 *  - "Mew" matcht NIET op "Mewtwo" of "Mewtwo ex" of "Meowth"
 *  - "Porygon" matcht NIET op "Porygon2" of "Porygon-Z"
 *  - "Nidoran♀" matcht NIET op "Nidoran♂"
 *  - "Mime Jr." matcht NIET op "Mr. Mime"
 *  - "Ditto" matcht WEL op "Ditto VMAX", "Koga's Ditto", "Radiant Ditto"
 *  - "Charizard" matcht WEL op "Charizard ex", "Dark Charizard", "Charizard & Braixen-GX", "M Charizard-EX"
 *  - "Mr. Mime" matcht WEL op "Galarian Mr. Mime", "Sabrina's Mr. Mime", "Mr. Mime GX"
 */
export function doesCardMatchPokemon(cardName: string, pokemonName: string): boolean {
  const cleanCard = normalizeForMatch(cardName);
  const cleanPoke = normalizeForMatch(pokemonName);
  if (!cleanCard || !cleanPoke) return false;

  // Behoud geslachtssymbolen voor Nidoran♀ / Nidoran♂
  const escaped = escapeRegExp(cleanPoke);

  // Links: begin van string of spatie (of apostrof/s-prefix zoals "Misty's ") — maar GEEN letter, cijfer of koppelteken
  // (behalve als het een bekende prefix is zoals "M " of "Mega " wat al met een spatie gescheiden is).
  // Rechts: einde van string, spatie, komma, uitroepteken, vraagteken, of een bekende TCG-hyphen suffix (-EX, -GX, -V, -VMAX, -VSTAR, -ex)
  // maar GEEN andere letter, cijfer (Porygon2) of willekeurige hyphen (Porygon-Z, Ho-Oh).
  const tcgHyphenSuffix = '-(?:EX|GX|V|VMAX|VSTAR|ex|LEGEND|BREAK)(?=$|\\s)';
  const pattern = new RegExp(
    `(?:^|[\\s'"])${escaped}(?=$|[\\s,.!?&/]|${tcgHyphenSuffix})`,
    'i'
  );

  if (!pattern.test(cleanCard)) {
    return false;
  }

  // Extra check voor speciale gevallen waar een korte naam deel uitmaakt van een langere Pokémon-naam
  // (bijv. "Mime" bestaat niet als losse Pokémon, maar "Porygon" vs "Porygon-Z" en "Mr. Mime" vs "Mr. Rime" zijn al veilig door regex;
  // check expliciet dat er geen "-Z" of letter direct na cleanPoke zit in geval van bijzondere tekens).
  const lowerCard = cleanCard.toLowerCase();
  const lowerPoke = cleanPoke.toLowerCase();
  let searchFrom = 0;
  while (searchFrom < lowerCard.length) {
    const idx = lowerCard.indexOf(lowerPoke, searchFrom);
    if (idx === -1) break;

    const charBefore = idx > 0 ? cleanCard[idx - 1] : '';
    const charAfter = idx + cleanPoke.length < cleanCard.length ? cleanCard[idx + cleanPoke.length] : '';
    const restAfter = cleanCard.slice(idx + cleanPoke.length);

    const validLeft = !charBefore || /[\s'"]/.test(charBefore);
    const validRight =
      !charAfter ||
      /[\s,.!?&/]/.test(charAfter) ||
      new RegExp(`^${tcgHyphenSuffix}`, 'i').test(restAfter);

    if (validLeft && validRight) {
      return true;
    }
    searchFrom = idx + 1;
  }

  return false;
}

/**
 * Formatteert de keuze-string voor Google Sheets kolom I (`Gekozen Kaart / Art`):
 * `<kaartId> | <Set> (<Detail>)`
 */
export function formatBinderChoice(card: Pick<CollectionCard, 'cardId' | 'setName' | 'variant' | 'cardNumber' | 'rarity'>): string {
  const detail =
    card.variant && card.variant !== 'Normal'
      ? card.variant
      : card.rarity && card.rarity !== 'Common'
        ? card.rarity
        : card.cardNumber || 'Kaart';
  return `${card.cardId} | ${card.setName} (${detail})`;
}

/**
 * Haalt het Kaart-ID uit een Pokédex Binder keuze-string `<kaartId> | <Set> (<Detail>)`.
 */
export function extractCardIdFromChoice(selectedCard: string): string {
  if (!selectedCard) return '';
  const pipeIdx = selectedCard.indexOf('|');
  return (pipeIdx > 0 ? selectedCard.slice(0, pipeIdx) : selectedCard).trim();
}
