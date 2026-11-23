import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router, RouterLink } from '@angular/router';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { routes } from './app.routes';
import { AppsScriptSheetsAdapter } from './core/adapters/apps-script-sheets.adapter';
import { CatalogCard, CatalogCardSummary } from './core/domain/models';
import { FEEDBACK_HUB_ENDPOINT } from './core/platform/feedback-hub-config';
import { MobileViewportService } from './core/platform/mobile-viewport.service';
import { ModalScrollLockService } from './core/platform/modal-scroll-lock.service';
import { PlatformService } from './core/platform/platform.service';
import { CARD_CATALOG_PORT, CardCatalogPort } from './core/ports/card-catalog.port';
import { COLLECTION_REPOSITORY } from './core/ports/collection-repository.port';
import { CollectionStore } from './core/state/collection.store';
import { FeedbackStore } from './core/state/feedback.store';
import { CollectionComponent } from './features/collection/collection.component';
import { MoreShellComponent } from './features/more/more-shell.component';
import { PokedexBinderComponent } from './features/pokedex-binder/pokedex-binder.component';
import { QuickAddComponent } from './features/quick-add/quick-add.component';
import { TradesComponent } from './features/trades/trades.component';
import { WishlistComponent } from './features/wishlist/wishlist.component';
import { FeedbackModalComponent } from './shared/feedback-modal/feedback-modal.component';

const MOCK_CARD: CatalogCard = {
  id: 'sv03.5-181',
  localId: '181',
  name: 'Dragonair',
  setId: 'sv03.5',
  setName: '151',
  seriesName: 'Scarlet & Violet',
  officialCardCount: 165,
  totalCardCount: 207,
  cardNumber: '181/165',
  type: 'Dragon',
  rarity: 'Illustration Rare',
  imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/181/high.webp',
  lowImageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/181/low.webp',
  marketPriceEur: 22.5,
  dexIds: [148],
};

class MobileMockCatalogAdapter implements CardCatalogPort {
  async lookupByCardId(): Promise<CatalogCard | null> {
    return MOCK_CARD;
  }
  async searchByName(): Promise<CatalogCardSummary[]> {
    return [{ id: MOCK_CARD.id, localId: MOCK_CARD.localId, name: MOCK_CARD.name, imageUrl: MOCK_CARD.lowImageUrl }];
  }
  async getCardByExactId(): Promise<CatalogCard | null> {
    return MOCK_CARD;
  }
  getCachedArtworkUrl(cardId: string): string {
    return `https://assets.tcgdex.net/en/sv/sv03.5/${cardId}/high.webp`;
  }
  async listAllSets() {
    return [
      {
        id: 'sv03.5',
        code: 'MEW',
        name: '151',
        series: 'Scarlet & Violet',
        seriesId: 'sv',
        releaseDate: '2023-09-22',
        officialCount: 165,
        totalCount: 207,
      },
      {
        id: 'base1',
        code: 'BS',
        name: 'Base Set',
        series: 'Base',
        seriesId: 'base',
        releaseDate: '1999-01-09',
        officialCount: 102,
        totalCount: 102,
      },
    ];
  }
  async getSetCards(setId: string) {
    return {
      id: setId,
      name: setId === 'base1' ? 'Base Set' : '151',
      seriesName: 'Scarlet & Violet',
      officialCount: 165,
      totalCount: 207,
      cards: [{ id: MOCK_CARD.id, localId: MOCK_CARD.localId, name: MOCK_CARD.name, imageUrl: MOCK_CARD.lowImageUrl }],
    };
  }
}

function dispatchTouch(target: EventTarget, type: 'touchstart' | 'touchmove' | 'touchend', clientY: number, clientX = 180): void {
  const evt = new Event(type, { bubbles: true, cancelable: true }) as unknown as TouchEvent & {
    touches: Array<{ clientX: number; clientY: number }>;
  };
  Object.defineProperty(evt, 'touches', {
    value: type === 'touchend' ? [] : [{ clientX, clientY }],
    configurable: true,
  });
  target.dispatchEvent(evt);
}

describe('Mobiele UI, Gebaren, Routing & Toetsenbord Suite', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;
  const originalVisualViewport = window.visualViewport;
  let mockViewportHeight = 844;
  let viewportListeners: Array<() => void> = [];

  function setViewportMetrics(width: number, height: number): void {
    mockViewportHeight = height;
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
    for (const listener of viewportListeners) {
      listener();
    }
  }

  beforeEach(async () => {
    window.localStorage.clear();
    document.documentElement.classList.remove('pb-modal-open', 'pb-keyboard-open');
    document.body.classList.remove('pb-modal-open');
    document.documentElement.style.removeProperty('--pb-viewport-height');

    mockViewportHeight = 844;
    viewportListeners = [];
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        get height() {
          return mockViewportHeight;
        },
        get width() {
          return window.innerWidth;
        },
        addEventListener: (name: string, cb: () => void) => {
          if (name === 'resize') viewportListeners.push(cb);
        },
        removeEventListener: (name: string, cb: () => void) => {
          if (name === 'resize') {
            viewportListeners = viewportListeners.filter((fn) => fn !== cb);
          }
        },
      },
    });

    await TestBed.configureTestingModule({
      imports: [
        App,
        CollectionComponent,
        PokedexBinderComponent,
        WishlistComponent,
        TradesComponent,
        FeedbackModalComponent,
        QuickAddComponent,
        MoreShellComponent,
      ],
      providers: [
        provideRouter(routes),
        { provide: FEEDBACK_HUB_ENDPOINT, useValue: { endpointUrl: '', appKey: '' } },
        { provide: COLLECTION_REPOSITORY, useExisting: AppsScriptSheetsAdapter },
        { provide: CARD_CATALOG_PORT, useClass: MobileMockCatalogAdapter },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    document.documentElement.classList.remove('pb-modal-open', 'pb-keyboard-open');
    document.body.classList.remove('pb-modal-open');
    document.documentElement.style.removeProperty('--pb-viewport-height');
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true, writable: true });
    Object.defineProperty(window, 'visualViewport', { value: originalVisualViewport, configurable: true });
  });

  describe('1. Bottom sheets: swipe-omlaag sluiten & veilig scrollen', () => {
    async function assertSwipeDismissBehavior(
      openSheet: () => { fixture: ComponentFixture<unknown>; isOpen: () => boolean }
    ): Promise<void> {
      const { fixture, isOpen } = openSheet();
      fixture.detectChanges();
      await fixture.whenStable();

      const el = fixture.nativeElement as HTMLElement;
      const backdrop = el.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement | null;
      const sheet = el.querySelector('.pb-sheet') as HTMLElement | null;
      const handle = el.querySelector('.pb-sheet__handle') as HTMLElement | null;
      expect(backdrop).not.toBeNull();
      expect(sheet).not.toBeNull();
      expect(handle).not.toBeNull();

      // Wanneer gebruiker al omlaag gescrollt is (scrollTop = 120), mag omlaag slepen op body het modaal NIET sluiten
      sheet!.scrollTop = 120;
      const bodyTarget = (sheet!.querySelector('.sheet-form, .variants-list, .wl-form, .tr-form, .fb-form') ?? sheet!) as HTMLElement;
      dispatchTouch(bodyTarget, 'touchstart', 260);
      dispatchTouch(bodyTarget, 'touchmove', 410);
      dispatchTouch(bodyTarget, 'touchend', 410);
      await new Promise((r) => setTimeout(r, 180));
      expect(isOpen()).toBe(true);

      // Korte sleep (< 50px) vanaf het handvat houdt het modaal netjes open
      sheet!.scrollTop = 0;
      dispatchTouch(handle!, 'touchstart', 200);
      dispatchTouch(handle!, 'touchmove', 235);
      await new Promise((r) => setTimeout(r, 60));
      dispatchTouch(handle!, 'touchend', 235);
      await new Promise((r) => setTimeout(r, 180));
      expect(isOpen()).toBe(true);

      // Stevige swipe omlaag (>= 110px) sluit het bottom sheet direct
      dispatchTouch(handle!, 'touchstart', 200);
      dispatchTouch(handle!, 'touchmove', 340);
      dispatchTouch(handle!, 'touchend', 340);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(isOpen()).toBe(false);
      });
    }

    it('ondersteunt swipe-to-dismiss en scrollveiligheid op alle 5 mobiele bottom sheets', async () => {
      // 1. Collectie detail bottom sheet
      await assertSwipeDismissBehavior(() => {
        const fixture = TestBed.createComponent(CollectionComponent);
        const comp = fixture.componentInstance;
        fixture.detectChanges();
        comp.openDetail(comp.filteredCards()[0]);
        return { fixture, isOpen: () => comp.isDetailOpen() };
      });

      // 2. Pokédex Binder slot bottom sheet
      await assertSwipeDismissBehavior(() => {
        const fixture = TestBed.createComponent(PokedexBinderComponent);
        const comp = fixture.componentInstance;
        fixture.detectChanges();
        comp.openSlotSheet(comp.pageSlots()[0]);
        return { fixture, isOpen: () => comp.isSheetOpen() };
      });

      // 3. Verlanglijst toevoegen bottom sheet
      await assertSwipeDismissBehavior(() => {
        const fixture = TestBed.createComponent(WishlistComponent);
        const comp = fixture.componentInstance;
        fixture.detectChanges();
        comp.openAddModal();
        return { fixture, isOpen: () => comp.showAddSheet() };
      });

      // 4. Ruil & Verkoop transactie bottom sheet
      await assertSwipeDismissBehavior(() => {
        const fixture = TestBed.createComponent(TradesComponent);
        const comp = fixture.componentInstance;
        fixture.detectChanges();
        comp.openNewTradeModal();
        return { fixture, isOpen: () => comp.showLogSheet() };
      });

      // 5. Feedback modal bottom sheet
      await assertSwipeDismissBehavior(() => {
        const feedback = TestBed.inject(FeedbackStore);
        const fixture = TestBed.createComponent(FeedbackModalComponent);
        feedback.openComposer('Collectie');
        return { fixture, isOpen: () => feedback.isComposerOpen() };
      });
    });
  });

  describe('2. Vereenvoudigde mobiele routing & Android hardware Back-knop', () => {
    it('gebruikt replaceUrl op alle hoofd- en sub-tabs behalve de /toevoegen FAB', async () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const navLinks = fixture.debugElement
        .queryAll(By.css('.bottom-nav__item, .topbar__brand, .topbar__profile-btn'))
        .map((de) => de.injector.get(RouterLink));
      expect(navLinks.length).toBe(6);
      for (const link of navLinks) {
        expect(link.replaceUrl).toBe(true);
      }

      const fabLink = fixture.debugElement.query(By.css('.bottom-nav__fab')).injector.get(RouterLink);
      expect(fabLink.replaceUrl).toBe(false);

      const moreFixture = TestBed.createComponent(MoreShellComponent);
      moreFixture.detectChanges();
      const moreTabs = moreFixture.debugElement
        .queryAll(By.css('.more-tab'))
        .map((de) => de.injector.get(RouterLink));
      expect(moreTabs.length).toBe(5);
      for (const tab of moreTabs) {
        expect(tab.replaceUrl).toBe(true);
      }
    });

    it('handelt Android Back-knop voorspelbaar af: eerst overlays sluiten, dan /toevoegen terug, nooit terug naar vorige tab', async () => {
      const router = TestBed.inject(Router);
      const platform = TestBed.inject(PlatformService);
      const scrollLock = TestBed.inject(ModalScrollLockService);

      const appFixture = TestBed.createComponent(App);
      appFixture.detectChanges();

      await router.navigateByUrl('/collectie');
      appFixture.detectChanges();
      expect(platform.lastTabUrl()).toBe('/collectie');

      // Tab wissel naar Pokédex -> Back keert NIET terug naar Collectie
      await router.navigateByUrl('/pokedex', { replaceUrl: true });
      appFixture.detectChanges();
      expect(platform.handleMobileBackButton()).toBe('exit');
      expect(router.url).toBe('/pokedex');

      // Open modal op Pokédex -> Back sluit eerst de modal en blijft op /pokedex
      const modalOpen = signal(true);
      TestBed.runInInjectionContext(() => {
        scrollLock.registerDismissHandler(() => modalOpen(), () => modalOpen.set(false));
      });
      appFixture.detectChanges();
      expect(platform.handleMobileBackButton()).toBe('dismissed_overlay');
      expect(modalOpen()).toBe(false);
      expect(router.url).toBe('/pokedex');
      appFixture.detectChanges();

      // Open /toevoegen vanuit /pokedex en test QuickAdd dropdown dismiss + terugkeer naar /pokedex
      await router.navigateByUrl('/toevoegen');
      appFixture.detectChanges();

      const dropdownOpen = signal(true);
      TestBed.runInInjectionContext(() => {
        scrollLock.registerDismissHandler(() => dropdownOpen(), () => dropdownOpen.set(false));
      });
      appFixture.detectChanges();
      expect(platform.handleMobileBackButton()).toBe('dismissed_overlay');
      expect(dropdownOpen()).toBe(false);
      expect(router.url).toBe('/toevoegen');
      appFixture.detectChanges();

      // Tweede Back op /toevoegen gaat terug naar de laatst geopende tab (/pokedex)
      expect(platform.handleMobileBackButton()).toBe('popped_stack');
      await appFixture.whenStable();
      expect(router.url).toBe('/pokedex');
    });
  });

  describe('3. Virtueel toetsenbord: Alle Sets & onderste modal-inputs schuiven netjes in beeld', () => {
    it('stelt --pb-viewport-height + html.pb-keyboard-open in en scrolt .set-picker naar boven achter het toetsenbord vandaan', async () => {
      const viewport = TestBed.inject(MobileViewportService);
      viewport.initialize();

      const router = TestBed.inject(Router);
      const appFixture = TestBed.createComponent(App);
      appFixture.detectChanges();

      await router.navigateByUrl('/toevoegen');
      appFixture.detectChanges();

      const mainEl = (appFixture.nativeElement as HTMLElement).querySelector('.shell__main') as HTMLElement;
      mainEl.scrollTop = 20;
      vi.spyOn(mainEl, 'getBoundingClientRect').mockReturnValue({
        top: 64,
        bottom: 440,
        left: 0,
        right: 390,
        width: 390,
        height: 376,
        x: 0,
        y: 64,
        toJSON: () => ({}),
      });

      const qaDebugEl = appFixture.debugElement.query(By.directive(QuickAddComponent));
      const qaComp = qaDebugEl.componentInstance as QuickAddComponent;
      await qaComp.openSetsCatalog();
      appFixture.detectChanges();

      const setPickerEl = (appFixture.nativeElement as HTMLElement).querySelector('.set-picker') as HTMLElement;
      vi.spyOn(setPickerEl, 'getBoundingClientRect').mockReturnValue({
        top: 320,
        bottom: 370,
        left: 16,
        right: 374,
        width: 358,
        height: 50,
        x: 16,
        y: 320,
        toJSON: () => ({}),
      });

      qaComp.openSetDropdown();
      appFixture.detectChanges();

      const searchInput = document.getElementById('qa-set-search-input') as HTMLInputElement;
      expect(searchInput).not.toBeNull();

      // Simuleer openklappen virtueel toetsenbord (viewport krimpt naar 440px)
      setViewportMetrics(390, 440);
      searchInput.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));

      expect(document.documentElement.classList.contains('pb-keyboard-open')).toBe(true);
      expect(document.documentElement.style.getPropertyValue('--pb-viewport-height')).toBe('440px');
      // 20 (start) + (320 - (64 + 10)) = 266 -> .set-picker wordt helemaal naar boven gescrold
      expect(mainEl.scrollTop).toBeGreaterThan(200);

      // Toetsenbord sluiten + blur wist pb-keyboard-open
      (document.activeElement as HTMLElement | null)?.blur?.();
      setViewportMetrics(390, 844);
      searchInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 160));
      expect(document.documentElement.classList.contains('pb-keyboard-open')).toBe(false);
    });

    it('scrolt een invoerveld onderin een bottom sheet omhoog wanneer het toetsenbord opent', async () => {
      const viewport = TestBed.inject(MobileViewportService);
      viewport.initialize();

      const fixture = TestBed.createComponent(CollectionComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      comp.openDetail(comp.filteredCards()[0]);
      fixture.detectChanges();

      const sheet = (fixture.nativeElement as HTMLElement).querySelector('.pb-sheet') as HTMLElement;
      const notesInput = (fixture.nativeElement as HTMLElement).querySelector('#edit-notes') as HTMLInputElement;
      sheet.scrollTop = 100;

      vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue({
        top: 120,
        bottom: 430,
        left: 0,
        right: 390,
        width: 390,
        height: 310,
        x: 0,
        y: 120,
        toJSON: () => ({}),
      });
      vi.spyOn(notesInput, 'getBoundingClientRect').mockReturnValue({
        top: 520,
        bottom: 566,
        left: 16,
        right: 374,
        width: 358,
        height: 46,
        x: 16,
        y: 520,
        toJSON: () => ({}),
      });

      setViewportMetrics(390, 440);
      notesInput.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));

      expect(sheet.scrollTop).toBeGreaterThan(200);
    });
  });

  describe('4. Volledige mobiele smoke-tour over alle schermen', () => {
    it('rendert alle hoofdroutes zonder fouten op mobiel (390x844)', async () => {
      const router = TestBed.inject(Router);
      const store = TestBed.inject(CollectionStore);
      expect(store.collection().length).toBeGreaterThan(0);

      const appFixture = TestBed.createComponent(App);
      appFixture.detectChanges();

      const mobileRoutes: Array<{ path: string; expectedText: string }> = [
        { path: '/dashboard', expectedText: 'Totale Portfoliowaarde' },
        { path: '/collectie', expectedText: 'Collectie' },
        { path: '/toevoegen', expectedText: 'Kaart Toevoegen' },
        { path: '/pokedex', expectedText: 'Pokédex' },
        { path: '/meer/sets', expectedText: 'Actieve Sets' },
        { path: '/meer/verlanglijst', expectedText: 'Maandbudget Kaarten' },
        { path: '/meer/ruil-verkoop', expectedText: 'Live Trade Binder' },
        { path: '/meer/feedback', expectedText: 'Feedback Hub' },
        { path: '/meer/instellingen', expectedText: 'Demo-modus' },
      ];

      for (const route of mobileRoutes) {
        await router.navigateByUrl(route.path);
        appFixture.detectChanges();
        await appFixture.whenStable();
        const text = (appFixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain(route.expectedText);
      }
    });
  });
});
