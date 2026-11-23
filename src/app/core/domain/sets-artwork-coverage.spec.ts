import { describe, expect, it } from 'vitest';
import {
  KNOWN_NO_SCAN_SET_IDS,
  buildLimitlessAssetUrl,
  buildPokemonTcgAssetUrl,
  isKnownNoScanSet,
  resolveCardArtworkUrl,
} from './card-id.utils';

describe('sets-artwork-coverage (Alle fallback-CDNs & no-scan detectie)', () => {
  it('houdt de lijst met bekende scanloze nevensets consistent en herkent ze case-insensitive', () => {
    expect(KNOWN_NO_SCAN_SET_IDS.size).toBe(28);
    expect(isKnownNoScanSet('30th-c')).toBe(true);
    expect(isKnownNoScanSet('30TH-C')).toBe(true);
    expect(isKnownNoScanSet('tk-sm-r')).toBe(true);
    expect(isKnownNoScanSet('sv03.5')).toBe(false);
    expect(isKnownNoScanSet('swsh4.5sv')).toBe(false);
  });

  it('lost alle herstelde subsets, Trainer Kits, McDonald sets, Unown en Energy-sets op naar werkende CDN-URLs', () => {
    // 1. TCGdex parent subsets (geen kapotte subset-mappen!)
    expect(resolveCardArtworkUrl('swsh4.5sv-SV001', undefined, 'low')).toBe(
      'https://assets.tcgdex.net/en/swsh/swsh4.5/SV001/low.webp'
    );
    expect(resolveCardArtworkUrl('swsh9tg-TG01', undefined, 'low')).toBe(
      'https://assets.tcgdex.net/en/swsh/swsh9/TG01/low.webp'
    );
    expect(resolveCardArtworkUrl('swsh10tg-TG01', undefined, 'low')).toBe(
      'https://assets.tcgdex.net/en/swsh/swsh10/TG01/low.webp'
    );
    expect(resolveCardArtworkUrl('swsh11tg-TG01', undefined, 'low')).toBe(
      'https://assets.tcgdex.net/en/swsh/swsh11/TG01/low.webp'
    );
    expect(resolveCardArtworkUrl('swsh12tg-TG01', undefined, 'low')).toBe(
      'https://assets.tcgdex.net/en/swsh/swsh12/TG01/low.webp'
    );
    expect(resolveCardArtworkUrl('swsh12.5gg-GG01', undefined, 'low')).toBe(
      'https://assets.tcgdex.net/en/swsh/swsh12.5/GG01/low.webp'
    );

    // 2. PokemonTCG.io fallbacks
    expect(buildPokemonTcgAssetUrl('exu-A', 'low')).toBe('https://images.pokemontcg.io/ex10/A.png');
    expect(resolveCardArtworkUrl('exu-A', undefined, 'low')).toBe('https://images.pokemontcg.io/ex10/A.png');
    expect(resolveCardArtworkUrl('tk-ex-latia-1', undefined, 'low')).toBe(
      'https://images.pokemontcg.io/tk1a/1.png'
    );
    expect(resolveCardArtworkUrl('tk-ex-latio-1', undefined, 'low')).toBe(
      'https://images.pokemontcg.io/tk1b/1.png'
    );
    expect(resolveCardArtworkUrl('tk-ex-p-1', undefined, 'low')).toBe(
      'https://images.pokemontcg.io/tk2a/1.png'
    );
    expect(resolveCardArtworkUrl('tk-ex-m-1', undefined, 'low')).toBe(
      'https://images.pokemontcg.io/tk2b/1.png'
    );
    expect(resolveCardArtworkUrl('sm3.5-1', undefined, 'low')).toBe('https://images.pokemontcg.io/sm35/1.png');
    expect(resolveCardArtworkUrl('sm7.5-1', undefined, 'low')).toBe('https://images.pokemontcg.io/sm75/1.png');
    expect(resolveCardArtworkUrl('bog-1', undefined, 'low')).toBe('https://images.pokemontcg.io/bp/1.png');
    expect(resolveCardArtworkUrl('hgssp-HGSS17', undefined, 'low')).toBe(
      'https://images.pokemontcg.io/hsp/HGSS17.png'
    );
    expect(resolveCardArtworkUrl('ecard3-H01', undefined, 'low')).toBe(
      'https://images.pokemontcg.io/ecard3/H1.png'
    );
    expect(resolveCardArtworkUrl('2021swsh-1', undefined, 'low')).toBe(
      'https://images.pokemontcg.io/mcd21/1.png'
    );

    // 3. LimitlessTCG CDN (Mega Evolution Energy)
    expect(buildLimitlessAssetUrl('mee-001', 'low')).toBe(
      'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEE/MEE_001_R_EN_SM.png'
    );
    expect(resolveCardArtworkUrl('mee-001', undefined, 'high')).toBe(
      'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEE/MEE_001_R_EN_LG.png'
    );
  });
});
