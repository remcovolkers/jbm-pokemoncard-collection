import { describe, expect, it } from 'vitest';
import { NATIONAL_DEX_NAMES } from './national-dex.data';
import {
  GENERATIONS,
  doesCardMatchPokemon,
  extractCardIdFromChoice,
  formatBinderChoice,
  getGenerationForDex,
} from './pokedex-matching.utils';

describe('pokedex-matching.utils', () => {
  describe('doesCardMatchPokemon', () => {
    it('matcht Mew exact zonder false positives op Mewtwo of Meowth', () => {
      expect(doesCardMatchPokemon('Mew', 'Mew')).toBe(true);
      expect(doesCardMatchPokemon('Mew ex', 'Mew')).toBe(true);
      expect(doesCardMatchPokemon('Mew-EX', 'Mew')).toBe(true);
      expect(doesCardMatchPokemon('Mew VMAX', 'Mew')).toBe(true);
      expect(doesCardMatchPokemon('Shining Mew', 'Mew')).toBe(true);
      expect(doesCardMatchPokemon('Ancient Mew', 'Mew')).toBe(true);
      expect(doesCardMatchPokemon('Mewtwo & Mew-GX', 'Mew')).toBe(true);
      expect(doesCardMatchPokemon('Mewtwo & Mew-GX', 'Mewtwo')).toBe(true);

      expect(doesCardMatchPokemon('Mewtwo', 'Mew')).toBe(false);
      expect(doesCardMatchPokemon('Mewtwo ex', 'Mew')).toBe(false);
      expect(doesCardMatchPokemon('Mewtwo VSTAR', 'Mew')).toBe(false);
      expect(doesCardMatchPokemon('Meowth', 'Mew')).toBe(false);
      expect(doesCardMatchPokemon('Meowscarada ex', 'Mew')).toBe(false);
    });

    it('matcht Porygon zonder false positives op Porygon2 of Porygon-Z', () => {
      expect(doesCardMatchPokemon('Porygon', 'Porygon')).toBe(true);
      expect(doesCardMatchPokemon('Dark Porygon', 'Porygon')).toBe(true);
      expect(doesCardMatchPokemon('Cool Porygon', 'Porygon')).toBe(true);
      expect(doesCardMatchPokemon('Porygon2', 'Porygon2')).toBe(true);
      expect(doesCardMatchPokemon('Dark Porygon2', 'Porygon2')).toBe(true);
      expect(doesCardMatchPokemon('Porygon-Z', 'Porygon-Z')).toBe(true);
      expect(doesCardMatchPokemon('Porygon-Z GX', 'Porygon-Z')).toBe(true);

      expect(doesCardMatchPokemon('Porygon2', 'Porygon')).toBe(false);
      expect(doesCardMatchPokemon('Porygon-Z', 'Porygon')).toBe(false);
      expect(doesCardMatchPokemon('Porygon-Z GX', 'Porygon')).toBe(false);
      expect(doesCardMatchPokemon('Porygon-Z', 'Porygon2')).toBe(false);
    });

    it('verwerkt Owner-kaarten, regionale vormen, Paradox en Tag Teams', () => {
      expect(doesCardMatchPokemon("Lt. Surge's Pikachu", 'Pikachu')).toBe(true);
      expect(doesCardMatchPokemon("Misty's Gyarados", 'Gyarados')).toBe(true);
      expect(doesCardMatchPokemon('Surfing Pikachu VMAX', 'Pikachu')).toBe(true);
      expect(doesCardMatchPokemon('Pikachu & Zekrom-GX', 'Pikachu')).toBe(true);
      expect(doesCardMatchPokemon('Pikachu & Zekrom-GX', 'Zekrom')).toBe(true);
      expect(doesCardMatchPokemon('Alolan Vulpix VSTAR', 'Vulpix')).toBe(true);
      expect(doesCardMatchPokemon('Hisuian Zoroark V', 'Zoroark')).toBe(true);
      expect(doesCardMatchPokemon('Iron Valiant ex', 'Iron Valiant')).toBe(true);
      expect(doesCardMatchPokemon('Roaring Moon ex', 'Roaring Moon')).toBe(true);
      expect(doesCardMatchPokemon('Radiant Charizard', 'Charizard')).toBe(true);
      expect(doesCardMatchPokemon('M Charizard-EX', 'Charizard')).toBe(true);
    });

    it('verwerkt speciale namen met leestekens, apostrofs, accenten en geslachtssymbolen', () => {
      expect(doesCardMatchPokemon('Galarian Mr. Mime', 'Mr. Mime')).toBe(true);
      expect(doesCardMatchPokemon("Sabrina's Mr. Mime", 'Mr. Mime')).toBe(true);
      expect(doesCardMatchPokemon('Mr. Mime', 'Mime Jr.')).toBe(false);
      expect(doesCardMatchPokemon('Mr. Rime', 'Mr. Mime')).toBe(false);
      expect(doesCardMatchPokemon('Mime Jr.', 'Mime Jr.')).toBe(true);
      expect(doesCardMatchPokemon("Farfetch'd", "Farfetch'd")).toBe(true);
      expect(doesCardMatchPokemon("Galarian Farfetch'd", "Farfetch'd")).toBe(true);
      expect(doesCardMatchPokemon("Sirfetch'd V", "Farfetch'd")).toBe(false);
      expect(doesCardMatchPokemon('Ho-Oh V', 'Ho-Oh')).toBe(true);
      expect(doesCardMatchPokemon('Ho-Oh-GX', 'Ho-Oh')).toBe(true);
      expect(doesCardMatchPokemon('Type: Null', 'Type: Null')).toBe(true);
      expect(doesCardMatchPokemon('Nidoran♀', 'Nidoran♀')).toBe(true);
      expect(doesCardMatchPokemon('Nidoran♂', 'Nidoran♀')).toBe(false);
      expect(doesCardMatchPokemon('Flabebe', 'Flabébé')).toBe(true);
      expect(doesCardMatchPokemon('Chien-Pao ex', 'Chien-Pao')).toBe(true);
    });

    it('voorkomt valse matches bij evolutielijnen en lege invoer', () => {
      expect(doesCardMatchPokemon('Charmeleon', 'Charizard')).toBe(false);
      expect(doesCardMatchPokemon('Charmander', 'Charmeleon')).toBe(false);
      expect(doesCardMatchPokemon('Raichu', 'Pikachu')).toBe(false);
      expect(doesCardMatchPokemon('', 'Pikachu')).toBe(false);
      expect(doesCardMatchPokemon('Pikachu', '')).toBe(false);
    });
  });

  describe('formatBinderChoice & extractCardIdFromChoice', () => {
    it('formatteert keuze-string met variant, rarity of kaartnummer als detail', () => {
      expect(
        formatBinderChoice({
          cardId: 'sv03.5-198',
          setName: '151',
          variant: 'Alt Art',
          cardNumber: '198/165',
          rarity: 'Special Illustration Rare',
        })
      ).toBe('sv03.5-198 | 151 (Alt Art)');

      expect(
        formatBinderChoice({
          cardId: 'sv03.5-166',
          setName: '151',
          variant: 'Normal',
          cardNumber: '166/165',
          rarity: 'Illustration Rare',
        })
      ).toBe('sv03.5-166 | 151 (Illustration Rare)');

      expect(
        formatBinderChoice({
          cardId: 'base1-44',
          setName: 'Base Set',
          variant: 'Normal',
          cardNumber: '44/102',
          rarity: 'Common',
        })
      ).toBe('base1-44 | Base Set (44/102)');
    });

    it('extraheert kaart-ID uit geformatteerde en ruwe keuzestrings', () => {
      expect(extractCardIdFromChoice('sv03.5-198 | 151 (Alt Art)')).toBe('sv03.5-198');
      expect(extractCardIdFromChoice('base1-15')).toBe('base1-15');
      expect(extractCardIdFromChoice('')).toBe('');
    });
  });

  describe('GENERATIONS & NATIONAL_DEX_NAMES', () => {
    it('dekt aaneengesloten National Dex #0001 t/m #1025 zonder gaten', () => {
      expect(NATIONAL_DEX_NAMES.length).toBe(1025);
      expect(NATIONAL_DEX_NAMES[0]).toBe('Bulbasaur');
      expect(NATIONAL_DEX_NAMES[150]).toBe('Mew');
      expect(NATIONAL_DEX_NAMES[1024]).toBe('Pecharunt');
      expect(NATIONAL_DEX_NAMES.every((n) => n.trim().length > 0)).toBe(true);

      let expectedStart = 1;
      for (const gen of GENERATIONS) {
        expect(gen.start).toBe(expectedStart);
        expectedStart = gen.end + 1;
      }
      expect(expectedStart - 1).toBe(1025);
    });

    it('koppelt grenswaarden aan de juiste generatie', () => {
      expect(getGenerationForDex(1).id).toBe(1);
      expect(getGenerationForDex(151).id).toBe(1);
      expect(getGenerationForDex(152).id).toBe(2);
      expect(getGenerationForDex(251).id).toBe(2);
      expect(getGenerationForDex(906).id).toBe(9);
      expect(getGenerationForDex(1025).id).toBe(9);
    });
  });
});
