import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CardArtworkComponent } from './card-artwork.component';

describe('CardArtworkComponent', () => {
  it('laadt high.webp -> low.webp -> PokemonTCG CDN en toont daarna een nette fallback', async () => {
    await TestBed.configureTestingModule({
      imports: [CardArtworkComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CardArtworkComponent);
    fixture.componentRef.setInput('cardId', 'sv03.5-199');
    fixture.componentRef.setInput('alt', 'Charizard ex');
    fixture.detectChanges();

    let img = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://assets.tcgdex.net/en/sv/sv03.5/199/high.webp');

    // Eerste fout -> schakelt over naar low.webp
    fixture.componentInstance.onImgError();
    fixture.detectChanges();
    img = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe('https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp');

    // Tweede en derde fout -> schakelt over naar PokemonTCG CDN (_hires.png -> .png)
    fixture.componentInstance.onImgError();
    fixture.detectChanges();
    img = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe('https://images.pokemontcg.io/sv3pt5/199_hires.png');

    fixture.componentInstance.onImgError();
    fixture.detectChanges();
    img = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe('https://images.pokemontcg.io/sv3pt5/199.png');

    // Daarna -> fallback placeholder zonder gebroken <img>
    fixture.componentInstance.onImgError();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.art-fallback')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('sv03.5-199');
  });

  it('reset de fallback-status bij nieuwe kaart-input en herstelt oude subset-URLs', async () => {
    await TestBed.configureTestingModule({
      imports: [CardArtworkComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CardArtworkComponent);
    fixture.componentRef.setInput('cardId', 'swsh4.5sv-SV001');
    fixture.componentRef.setInput('src', 'https://assets.tcgdex.net/en/swsh/swsh4.5sv/SV001/low.webp');
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    // Oude broken URL -> high.png poging -> herstelde parent TCGdex URL
    fixture.componentInstance.onImgError();
    fixture.componentInstance.onImgError();
    fixture.detectChanges();
    let img = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe('https://assets.tcgdex.net/en/swsh/swsh4.5/SV001/low.webp');

    // Laat falen tot fallback en wissel daarna van kaart -> moet direct resetten naar stap 0
    fixture.componentInstance.onImgError();
    fixture.componentInstance.onImgError();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.art-fallback')).not.toBeNull();

    fixture.componentRef.setInput('cardId', 'tk-ex-latia-4');
    fixture.componentRef.setInput('src', 'https://images.pokemontcg.io/tk1a/4.png');
    fixture.detectChanges();
    img = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe('https://images.pokemontcg.io/tk1a/4.png');
  });

  it('verbergt het fallback-label in compacte modus', async () => {
    await TestBed.configureTestingModule({
      imports: [CardArtworkComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CardArtworkComponent);
    fixture.componentRef.setInput('cardId', 'base1-4');
    fixture.componentRef.setInput('compact', true);
    for (let i = 0; i < 4; i++) {
      fixture.componentInstance.onImgError();
    }
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.art-fallback__label')).toBeNull();
  });
});
