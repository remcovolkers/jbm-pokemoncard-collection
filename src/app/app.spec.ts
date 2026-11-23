import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AppsScriptSheetsAdapter } from './core/adapters/apps-script-sheets.adapter';
import { TcgdexAdapter } from './core/adapters/tcgdex.adapter';
import { FEEDBACK_HUB_ENDPOINT } from './core/platform/feedback-hub-config';
import { CARD_CATALOG_PORT } from './core/ports/card-catalog.port';
import { COLLECTION_REPOSITORY } from './core/ports/collection-repository.port';
import { App } from './app';

describe('App', () => {
  it('maakt de PokéBinder app-shell aan met navigatie en reset scroll bij routewissel', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: 'dashboard', component: App },
          { path: 'collectie', component: App },
        ]),
        { provide: FEEDBACK_HUB_ENDPOINT, useValue: { endpointUrl: '', appKey: '' } },
        { provide: COLLECTION_REPOSITORY, useExisting: AppsScriptSheetsAdapter },
        { provide: CARD_CATALOG_PORT, useExisting: TcgdexAdapter },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('PokéBinder');
    expect(el.textContent).toContain('Dashboard');
    expect(el.textContent).toContain('Collectie');
    expect(el.textContent).toContain('Pokédex');

    const mainEl = el.querySelector('.shell__main') as HTMLElement;
    expect(mainEl).not.toBeNull();
    mainEl.scrollTop = 240;

    await router.navigateByUrl('/collectie');
    fixture.detectChanges();
    expect(mainEl.scrollTop).toBe(0);
  });
});
