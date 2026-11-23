import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AppsScriptSheetsAdapter } from './core/adapters/apps-script-sheets.adapter';
import { TcgdexAdapter } from './core/adapters/tcgdex.adapter';
import { FEEDBACK_HUB_ENDPOINT } from './core/platform/feedback-hub-config';
import { CARD_CATALOG_PORT } from './core/ports/card-catalog.port';
import { COLLECTION_REPOSITORY } from './core/ports/collection-repository.port';
import { App } from './app';

describe('App', () => {
  it('maakt de PokéBinder app-shell aan met navigatie', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: FEEDBACK_HUB_ENDPOINT, useValue: { endpointUrl: '', appKey: '' } },
        { provide: COLLECTION_REPOSITORY, useExisting: AppsScriptSheetsAdapter },
        { provide: CARD_CATALOG_PORT, useExisting: TcgdexAdapter },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('PokéBinder');
    expect(el.textContent).toContain('Dashboard');
    expect(el.textContent).toContain('Collectie');
    expect(el.textContent).toContain('Pokédex');
  });
});
