import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CardArtworkComponent } from './card-artwork.component';

describe('CardArtworkComponent', () => {
  it('laadt eerst high.webp, valt terug op low.webp en toont daarna een nette fallback', async () => {
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

    // Tweede fout -> toont fallback placeholder zonder gebroken <img>
    fixture.componentInstance.onImgError();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.art-fallback')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('sv03.5-199');
  });

  it('verbergt het fallback-label in compacte modus', async () => {
    await TestBed.configureTestingModule({
      imports: [CardArtworkComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CardArtworkComponent);
    fixture.componentRef.setInput('cardId', 'base1-4');
    fixture.componentRef.setInput('compact', true);
    fixture.componentInstance.onImgError();
    fixture.componentInstance.onImgError();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.art-fallback__label')).toBeNull();
  });
});
