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
import { HapticsService } from './core/platform/haptics.service';
import { MobileViewportService } from './core/platform/mobile-viewport.service';
import { ModalScrollLockService } from './core/platform/modal-scroll-lock.service';
import { PlatformService } from './core/platform/platform.service';
import { CARD_CATALOG_PORT, CardCatalogPort } from './core/ports/card-catalog.port';
import { COLLECTION_REPOSITORY } from './core/ports/collection-repository.port';
import { CollectionStore } from './core/state/collection.store';
import { FeedbackStore } from './core/state/feedback.store';
import { CardDetailComponent } from './features/collection/card-detail.component';
import { CollectionComponent } from './features/collection/collection.component';
import { MoreHubComponent } from './features/more/more-hub.component';
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
        CardDetailComponent,
        PokedexBinderComponent,
        WishlistComponent,
        TradesComponent,
        FeedbackModalComponent,
        QuickAddComponent,
        MoreShellComponent,
        MoreHubComponent,
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
      const top = el.querySelector('.pb-sheet__top') as HTMLElement | null;
      const body = el.querySelector('.pb-sheet__body') as HTMLElement | null;
      const footer = el.querySelector('.pb-sheet__footer') as HTMLElement | null;
      const handle = el.querySelector('.pb-sheet__handle') as HTMLElement | null;
      expect(backdrop).not.toBeNull();
      expect(sheet).not.toBeNull();
      expect(sheet?.classList.contains('pb-sheet--structured')).toBe(true);
      expect(top).not.toBeNull();
      expect(body).not.toBeNull();
      expect(footer).not.toBeNull();
      expect(handle).not.toBeNull();

      // Wanneer gebruiker al omlaag gescrollt is (scrollTop = 120), mag omlaag slepen op body het modaal NIET sluiten
      sheet!.scrollTop = 120;
      const bodyTarget = (sheet!.querySelector('.sheet-form, .variants-list, .wl-form, .tr-form, .pb-sheet__body') ?? sheet!) as HTMLElement;
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

      // Stevige swipe omlaag vanaf .pb-sheet__top sluit het bottom sheet óók wanneer er al gescrollt was
      sheet!.scrollTop = 180;
      dispatchTouch(top!, 'touchstart', 180);
      dispatchTouch(top!, 'touchmove', 320);
      dispatchTouch(top!, 'touchend', 320);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(isOpen()).toBe(false);
      });
    }

    it('ondersteunt swipe-to-dismiss en scrollveiligheid op alle 4 mobiele bottom sheets', async () => {
      // 1. Pokédex Binder slot bottom sheet
      await assertSwipeDismissBehavior(() => {
        const fixture = TestBed.createComponent(PokedexBinderComponent);
        const comp = fixture.componentInstance;
        fixture.detectChanges();
        comp.openSlotSheet(comp.pageSlots()[0]);
        return { fixture, isOpen: () => comp.isSheetOpen() };
      });

      // 2. Verlanglijst toevoegen bottom sheet
      await assertSwipeDismissBehavior(() => {
        const fixture = TestBed.createComponent(WishlistComponent);
        const comp = fixture.componentInstance;
        fixture.detectChanges();
        comp.openAddModal();
        return { fixture, isOpen: () => comp.showAddSheet() };
      });

      // 3. Ruil & Verkoop transactie bottom sheet
      await assertSwipeDismissBehavior(() => {
        const fixture = TestBed.createComponent(TradesComponent);
        const comp = fixture.componentInstance;
        fixture.detectChanges();
        comp.openNewTradeModal();
        return { fixture, isOpen: () => comp.showLogSheet() };
      });

      // 4. Feedback modal bottom sheet
      await assertSwipeDismissBehavior(() => {
        const feedback = TestBed.inject(FeedbackStore);
        const fixture = TestBed.createComponent(FeedbackModalComponent);
        feedback.openComposer('Collectie');
        return { fixture, isOpen: () => feedback.isComposerOpen() };
      });
    });
  });

  describe('2. Vereenvoudigde mobiele routing, Meer Hub & Android hardware Back-knop', () => {
    it('gebruikt replaceUrl op de 4 hoofd-tabs + merklink (niet op + FAB) en toont een volwaardig Meer Hub menu zonder scroll-tabbalk', async () => {
      const router = TestBed.inject(Router);
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const navLinks = fixture.debugElement
        .queryAll(By.css('.bottom-nav__item, .topbar__brand'))
        .map((de) => de.injector.get(RouterLink));
      expect(navLinks.length).toBe(5);
      for (const link of navLinks) {
        expect(link.replaceUrl).toBe(true);
      }

      const fabLink = fixture.debugElement.query(By.css('.bottom-nav__fab')).injector.get(RouterLink);
      expect(fabLink.replaceUrl).toBe(false);

      // /meer toont de overzichtelijke Hub met alle 5 tools in één oogopslag en zonder dubbele tabbalk
      await router.navigateByUrl('/meer');
      fixture.detectChanges();
      await fixture.whenStable();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.more-tabs')).toBeNull();
      expect(el.querySelector('.shell__main')?.classList.contains('is-more-hub')).toBe(true);
      expect(el.querySelectorAll('.hub-row').length).toBe(5);
      const text = el.textContent ?? '';
      expect(text).toContain('Set Voortgang');
      expect(text).toContain('Verlanglijst');
      expect(text).toContain('Ruil & Verkoop');
      expect(text).toContain('Feedback Hub');
      expect(text).toContain('Instellingen & Sync');
    });

    it('opent een Collectie-kaart op een aparte Kaartdetail-pagina zonder bottom sheet en behoudt filters bij Terug', async () => {
      const router = TestBed.inject(Router);
      const platform = TestBed.inject(PlatformService);

      const appFixture = TestBed.createComponent(App);
      appFixture.detectChanges();

      await router.navigateByUrl('/collectie', { replaceUrl: true });
      appFixture.detectChanges();
      await appFixture.whenStable();

      const colComp = appFixture.debugElement.query(By.directive(CollectionComponent))
        .componentInstance as CollectionComponent;
      colComp.selectedSet.set('151');
      colComp.searchQuery.set('Venusaur');
      appFixture.detectChanges();

      const cardSlab = (appFixture.nativeElement as HTMLElement).querySelector('.card-slab') as HTMLElement;
      expect(cardSlab).not.toBeNull();
      cardSlab.click();
      appFixture.detectChanges();
      await appFixture.whenStable();

      expect(router.url).toMatch(/^\/collectie\/kaart\/\d+\/.+/);
      const el = appFixture.nativeElement as HTMLElement;
      expect(el.querySelector('.pb-sheet')).toBeNull();
      expect(el.querySelector('.bottom-nav')).toBeNull();
      expect(el.querySelector('.topbar__icon-btn')).not.toBeNull();
      expect(el.querySelector('.topbar__profile-btn')).toBeNull();
      expect(el.querySelector('.detail-dock')).toBeNull();
      expect(el.querySelector('.detail-layout')).not.toBeNull();

      // Zodra er iets wijzigt, verschijnt de slimme .detail-dock en na Herstellen verdwijnt deze weer
      const incBtn = el.querySelector('button[aria-label="Aantal vermeerderen"]') as HTMLButtonElement;
      incBtn.click();
      appFixture.detectChanges();
      expect(el.querySelector('.detail-dock')).not.toBeNull();

      const resetBtn = el.querySelector('.detail-dock__reset') as HTMLButtonElement;
      resetBtn.click();
      appFixture.detectChanges();
      expect(el.querySelector('.detail-dock')).toBeNull();

      expect(platform.handleMobileBackButton()).toBe('popped_stack');
      appFixture.detectChanges();
      await appFixture.whenStable();

      expect(router.url).toBe('/collectie');
      const restoredCol = appFixture.debugElement.query(By.directive(CollectionComponent))
        .componentInstance as CollectionComponent;
      expect(restoredCol.selectedSet()).toBe('151');
      expect(restoredCol.searchQuery()).toBe('Venusaur');
    });

    it('handelt Android Back-knop & topbar terugpijl voorspelbaar af over tabs, /meer/* detailpagina en /toevoegen', async () => {
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

      // Tab wissel naar /meer -> Back op /meer zelf verlaat app (keert niet terug naar Pokédex)
      await router.navigateByUrl('/meer', { replaceUrl: true });
      appFixture.detectChanges();
      expect(platform.handleMobileBackButton()).toBe('exit');
      expect((appFixture.nativeElement as HTMLElement).querySelector('.topbar__icon-btn')).toBeNull();

      // Vanuit /meer doorboren naar /meer/verlanglijst toont de topbar terugpijl en Back gaat terug naar /meer
      await router.navigateByUrl('/meer/verlanglijst');
      appFixture.detectChanges();
      await appFixture.whenStable();
      expect((appFixture.nativeElement as HTMLElement).querySelector('.topbar__icon-btn')).not.toBeNull();
      expect(platform.handleMobileBackButton()).toBe('popped_stack');
      await appFixture.whenStable();
      expect(router.url).toBe('/meer');

      // Open modal op Pokédex -> Back sluit eerst de modal en blijft op /pokedex
      await router.navigateByUrl('/pokedex', { replaceUrl: true });
      appFixture.detectChanges();
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

    it('scrolt een invoerveld onderin een bottom sheet en Kaartdetail-pagina omhoog wanneer het toetsenbord opent', async () => {
      const viewport = TestBed.inject(MobileViewportService);
      viewport.initialize();

      const fixture = TestBed.createComponent(WishlistComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      comp.openAddModal();
      fixture.detectChanges();

      const sheet = (fixture.nativeElement as HTMLElement).querySelector('.pb-sheet') as HTMLElement;
      const notesInput = (fixture.nativeElement as HTMLElement).querySelector('#wl-notes') as HTMLInputElement;
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
      fixture.destroy();

      // En op Kaartdetail-pagina scrolt #edit-notes binnen .shell__main
      setViewportMetrics(390, 844);
      const router = TestBed.inject(Router);
      const store = TestBed.inject(CollectionStore);
      const appFixture = TestBed.createComponent(App);
      appFixture.detectChanges();
      const firstCard = store.collection()[0];
      await router.navigate(['/collectie/kaart', firstCard.rowIndex, firstCard.cardId]);
      appFixture.detectChanges();
      await appFixture.whenStable();

      const mainEl = (appFixture.nativeElement as HTMLElement).querySelector('.shell__main') as HTMLElement;
      const detailNotes = (appFixture.nativeElement as HTMLElement).querySelector('#edit-notes') as HTMLInputElement;
      mainEl.scrollTop = 80;
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
      vi.spyOn(detailNotes, 'getBoundingClientRect').mockReturnValue({
        top: 540,
        bottom: 586,
        left: 16,
        right: 374,
        width: 358,
        height: 46,
        x: 16,
        y: 540,
        toJSON: () => ({}),
      });

      setViewportMetrics(390, 440);
      detailNotes.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
      expect(mainEl.scrollTop).toBeGreaterThan(180);
    });
  });

  describe('4. Volledige mobiele smoke-tour over alle schermen', () => {
    it('rendert alle hoofdroutes zonder fouten op mobiel (390x844)', async () => {
      const router = TestBed.inject(Router);
      const store = TestBed.inject(CollectionStore);
      expect(store.collection().length).toBeGreaterThan(0);
      const firstCard = store.collection()[0];

      const appFixture = TestBed.createComponent(App);
      appFixture.detectChanges();

      const mobileRoutes: Array<{ path: string; expectedText: string }> = [
        { path: '/dashboard', expectedText: 'Totale Portfoliowaarde' },
        { path: '/collectie', expectedText: 'Collectie' },
        { path: `/collectie/kaart/${firstCard.rowIndex}/${firstCard.cardId}`, expectedText: firstCard.name },
        { path: '/toevoegen', expectedText: 'Kaart Toevoegen' },
        { path: '/pokedex', expectedText: 'Pokédex' },
        { path: '/meer', expectedText: 'Instellingen & Sync' },
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

  describe('5. Pokédex Binder swipe-bladeren, QuickAdd shimmer & Haptics', () => {
    it('bladert in de Pokédex Binder met horizontale swipe links/rechts zonder bij verticale scroll te triggeren', () => {
      const fixture = TestBed.createComponent(PokedexBinderComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      const binderSheet = (fixture.nativeElement as HTMLElement).querySelector('.binder-sheet') as HTMLElement;
      expect(binderSheet).not.toBeNull();
      expect(comp.clampedPage()).toBe(1);

      // Verticale scroll mag niet per ongeluk naar pagina 2 bladeren
      dispatchTouch(binderSheet, 'touchstart', 300, 180);
      dispatchTouch(binderSheet, 'touchmove', 160, 188);
      dispatchTouch(binderSheet, 'touchend', 160, 188);
      expect(comp.clampedPage()).toBe(1);

      // Horizontaal naar links vegen -> volgende pagina
      dispatchTouch(binderSheet, 'touchstart', 300, 260);
      dispatchTouch(binderSheet, 'touchmove', 304, 150);
      dispatchTouch(binderSheet, 'touchend', 304, 150);
      fixture.detectChanges();
      expect(comp.clampedPage()).toBe(2);

      // Horizontaal naar rechts vegen -> vorige pagina
      dispatchTouch(binderSheet, 'touchstart', 300, 140);
      dispatchTouch(binderSheet, 'touchmove', 302, 250);
      dispatchTouch(binderSheet, 'touchend', 302, 250);
      fixture.detectChanges();
      expect(comp.clampedPage()).toBe(1);

      // Android edge-swipe guard: veeg vanaf uiterste linker/rechter schermrand (<= 24px) wordt genegeerd
      comp.nextPage();
      fixture.detectChanges();
      expect(comp.clampedPage()).toBe(2);
      dispatchTouch(binderSheet, 'touchstart', 300, 10);
      dispatchTouch(binderSheet, 'touchmove', 300, 150);
      dispatchTouch(binderSheet, 'touchend', 300, 150);
      fixture.detectChanges();
      expect(comp.clampedPage()).toBe(2);

      dispatchTouch(binderSheet, 'touchstart', 300, 380);
      dispatchTouch(binderSheet, 'touchmove', 300, 240);
      dispatchTouch(binderSheet, 'touchend', 300, 240);
      fixture.detectChanges();
      expect(comp.clampedPage()).toBe(2);

      // Tablet / brede touchscreens (bijv. 1024px) ondersteunen ook aanraak-swipe
      setViewportMetrics(1024, 900);
      dispatchTouch(binderSheet, 'touchstart', 300, 300);
      dispatchTouch(binderSheet, 'touchmove', 300, 420);
      dispatchTouch(binderSheet, 'touchend', 300, 420);
      fixture.detectChanges();
      expect(comp.clampedPage()).toBe(1);
    });

    it('bladert in QuickAdd Alle Sets per pagina met horizontale swipe en ArrowLeft/ArrowRight', () => {
      const fixture = TestBed.createComponent(QuickAddComponent);
      const comp = fixture.componentInstance;
      comp.inputMode.set('sets');
      comp.activeSetDetail.set({
        id: 'sv03.5',
        name: '151',
        seriesName: 'Scarlet & Violet',
        officialCount: 165,
        totalCount: 207,
        cards: Array.from({ length: 65 }, (_, i) => ({
          id: `sv03.5-${i + 1}`,
          localId: String(i + 1),
          name: `TestKaart ${i + 1}`,
          imageUrl: MOCK_CARD.lowImageUrl,
        })),
      });
      fixture.detectChanges();

      const resultsEl = (fixture.nativeElement as HTMLElement).querySelector('.search-results') as HTMLElement;
      expect(resultsEl).not.toBeNull();
      expect(comp.catalogTotalPages()).toBeGreaterThan(1);
      expect(comp.setCatalogPage()).toBe(1);

      dispatchTouch(resultsEl, 'touchstart', 260, 280);
      dispatchTouch(resultsEl, 'touchmove', 262, 160);
      dispatchTouch(resultsEl, 'touchend', 262, 160);
      fixture.detectChanges();
      expect(comp.setCatalogPage()).toBe(2);

      dispatchTouch(resultsEl, 'touchstart', 260, 150);
      dispatchTouch(resultsEl, 'touchmove', 262, 270);
      dispatchTouch(resultsEl, 'touchend', 262, 270);
      fixture.detectChanges();
      expect(comp.setCatalogPage()).toBe(1);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      fixture.detectChanges();
      expect(comp.setCatalogPage()).toBe(2);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      fixture.detectChanges();
      expect(comp.setCatalogPage()).toBe(1);
    });

    it('bladert in Pokédex Binder ook met ArrowLeft/ArrowRight en linkt ontbrekende Pokémon door naar QuickAdd', async () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const fixture = TestBed.createComponent(PokedexBinderComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      expect(comp.clampedPage()).toBe(1);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(comp.clampedPage()).toBe(2);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      expect(comp.clampedPage()).toBe(1);

      // Ontbrekende Pokémon (#0004 Charmander als niet in collectie) -> klik "Zoek ... om toe te voegen"
      const missingSlot = comp.pageSlots().find((s) => s.inCollectionCount === 0) ?? comp.pageSlots()[0];
      comp.addMissingPokemon(missingSlot);
      expect(navSpy).toHaveBeenCalledWith('/toevoegen');

      const qaFixture = TestBed.createComponent(QuickAddComponent);
      qaFixture.componentInstance.ngOnInit();
      expect(qaFixture.componentInstance.inputMode()).toBe('name');
      expect(qaFixture.componentInstance.nameQuery()).toBe(missingSlot.pokemonName);
    });

    it('toont een shimmer-skeleton tijdens het laden van Alle Sets en voert Haptics veilig uit', async () => {
      const fixture = TestBed.createComponent(QuickAddComponent);
      const comp = fixture.componentInstance;
      comp.inputMode.set('sets');
      comp.isLoadingSetCards.set(true);
      comp.activeSetDetail.set(null);
      fixture.detectChanges();

      const skeletons = (fixture.nativeElement as HTMLElement).querySelectorAll('.pb-skeleton-tile');
      expect(skeletons.length).toBe(6);

      const haptics = TestBed.inject(HapticsService);
      await expect(haptics.light()).resolves.toBeUndefined();
      await expect(haptics.medium()).resolves.toBeUndefined();
      await expect(haptics.success()).resolves.toBeUndefined();
      await expect(haptics.warning()).resolves.toBeUndefined();
    });
  });
});
