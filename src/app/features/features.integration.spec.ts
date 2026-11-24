import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../app.routes';
import { App } from '../app';
import { AppsScriptSheetsAdapter } from '../core/adapters/apps-script-sheets.adapter';
import { CatalogCard, CatalogCardSummary } from '../core/domain/models';
import { CARD_CATALOG_PORT, CardCatalogPort } from '../core/ports/card-catalog.port';
import { COLLECTION_REPOSITORY } from '../core/ports/collection-repository.port';
import { FEEDBACK_HUB_ENDPOINT } from '../core/platform/feedback-hub-config';
import { CollectionStore } from '../core/state/collection.store';
import { FeedbackStore } from '../core/state/feedback.store';
import { FeedbackModalComponent } from '../shared/feedback-modal/feedback-modal.component';
import { CardDetailComponent } from './collection/card-detail.component';
import { CollectionComponent } from './collection/collection.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { FeedbackHubComponent } from './feedback-hub/feedback-hub.component';
import { PokedexBinderComponent } from './pokedex-binder/pokedex-binder.component';
import { QuickAddComponent } from './quick-add/quick-add.component';
import { SetProgressComponent } from './set-progress/set-progress.component';
import { SettingsComponent } from './settings/settings.component';
import { TradesComponent } from './trades/trades.component';
import { WishlistComponent } from './wishlist/wishlist.component';

const MOCK_CATALOG_CARD: CatalogCard = {
  id: 'sv03-125',
  localId: '125',
  name: 'Charizard ex',
  setId: 'sv03',
  setName: 'Obsidian Flames',
  seriesName: 'Scarlet & Violet',
  officialCardCount: 197,
  totalCardCount: 230,
  cardNumber: '125/197',
  type: 'Darkness',
  rarity: 'Double Rare',
  imageUrl: 'https://assets.tcgdex.net/en/sv/sv03/125/high.webp',
  lowImageUrl: 'https://assets.tcgdex.net/en/sv/sv03/125/low.webp',
  marketPriceEur: 9.5,
  cardmarketProductId: 733794,
  lowPriceEur: 6.0,
  highPriceEur: 14.0,
  trendPercent: 4.2,
  dexIds: [6],
};

class MockCardCatalogAdapter implements CardCatalogPort {
  async lookupByCardId(rawInput: string): Promise<CatalogCard | null> {
    if (rawInput.toUpperCase().includes('MEW 181')) {
      return {
        ...MOCK_CATALOG_CARD,
        id: 'sv03.5-181',
        localId: '181',
        name: 'Dragonair',
        setId: 'sv03.5',
        setName: '151',
        cardNumber: '181/165',
        dexIds: [148],
      };
    }
    if (rawInput.toUpperCase().includes('NONE')) {
      return null;
    }
    return MOCK_CATALOG_CARD;
  }

  async searchByName(query: string): Promise<CatalogCardSummary[]> {
    if (query.toLowerCase().includes('unknown')) return [];
    return [
      {
        id: 'sv03-125',
        localId: '125',
        name: 'Charizard ex',
        imageUrl: MOCK_CATALOG_CARD.lowImageUrl,
      },
    ];
  }

  async getCardByExactId(cardId?: string): Promise<CatalogCard | null> {
    if (cardId === 'sv03.5-199') {
      return {
        ...MOCK_CATALOG_CARD,
        id: 'sv03.5-199',
        localId: '199',
        setId: 'sv03.5',
        setName: '151',
        cardNumber: '199/165',
        dexIds: [6],
      };
    }
    return MOCK_CATALOG_CARD;
  }

  getCachedArtworkUrl(cardId: string): string {
    return `https://assets.tcgdex.net/en/sv/sv03.5/${cardId}/high.webp`;
  }

  async listAllSets() {
    return [
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
      {
        id: 'tk-ex-latia',
        code: 'TK1A',
        name: 'EX trainer Kit (Latias)',
        series: 'Trainer kits',
        seriesId: 'tk',
        releaseDate: '2004-07-01',
        officialCount: 10,
        totalCount: 10,
      },
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
        id: 'swsh4.5sv',
        code: 'SHF',
        name: 'Shining Fates Shiny Vault',
        series: 'Sword & Shield',
        seriesId: 'swsh',
        releaseDate: '2021-02-19',
        officialCount: 122,
        totalCount: 122,
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
      cards: [
        { id: 'sv03.5-199', localId: '199', name: 'Charizard ex', imageUrl: MOCK_CATALOG_CARD.lowImageUrl },
        { id: 'sv03-125', localId: '125', name: 'Charizard ex OBF', imageUrl: MOCK_CATALOG_CARD.lowImageUrl },
      ],
    };
  }
}

describe('PokéBinder Feature Integratietests (Demo-modus)', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [
        App,
        DashboardComponent,
        CollectionComponent,
        CardDetailComponent,
        QuickAddComponent,
        PokedexBinderComponent,
        SetProgressComponent,
        WishlistComponent,
        TradesComponent,
        SettingsComponent,
        FeedbackHubComponent,
        FeedbackModalComponent,
      ],
      providers: [
        provideRouter(routes),
        { provide: FEEDBACK_HUB_ENDPOINT, useValue: { endpointUrl: '', appKey: '' } },
        { provide: COLLECTION_REPOSITORY, useExisting: AppsScriptSheetsAdapter },
        { provide: CARD_CATALOG_PORT, useClass: MockCardCatalogAdapter },
      ],
    }).compileComponents();
  });

  describe('DashboardComponent', () => {
    it('rendert live KPIs, Pokédex voortgang, Gen 1–9 overzicht, Top 5 en Master Sets', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

      expect(text).toContain('Totale Portfoliowaarde');
      expect(text).toContain('National Pokédex Binder');
      expect(text).toContain('3 kaarten in collectie klaar voor binder');
      expect(text).toContain('Top Waardevolste Kaarten');
      expect(text).toContain('Actieve Master Sets');
      expect(text).toContain('Umbreon VMAX');
      expect(comp.generationSummaries().length).toBe(9);
      expect(comp.topMasterSets().length).toBeLessThanOrEqual(4);
    });

    it('navigeert via de attentiebadge naar Pokédex gefilterd op Al in Collectie en via Gen-tegels naar specifieke generatie', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const store = TestBed.inject(CollectionStore);
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      // In demo-modus blijft de dubbele sync-strip verborgen
      expect(fixture.componentInstance.showSyncStrip()).toBe(false);

      fixture.componentInstance.openReadyForBinder();
      expect(store.requestedPokedexFilter()).toBe('in_collection');
      expect(navSpy).toHaveBeenCalledWith('/pokedex');

      fixture.componentInstance.openGenInBinder(4);
      expect(store.requestedPokedexGen()).toBe(4);
      expect(navSpy).toHaveBeenCalledWith('/pokedex');

      // Wanneer ontkoppeld buiten demo-modus verschijnt de sync-strip wél
      store.updateConfig({ demoMode: false, webAppUrl: '', apiToken: '' });
      fixture.detectChanges();
      expect(fixture.componentInstance.showSyncStrip()).toBe(true);
    });
  });

  describe('CollectionComponent', () => {
    it('combineert zoek-, set-, locatie-, zeldzaamheids- en te-ruilfilters en reset alles schoon', () => {
      const fixture = TestBed.createComponent(CollectionComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      const total = comp.filteredCards().length;
      expect(total).toBeGreaterThan(15);

      comp.selectedSet.set('151');
      comp.onlyForTrade.set(true);
      expect(comp.filteredCards().every((c) => c.setName === '151' && c.forTrade)).toBe(true);
      expect(comp.hasActiveFilters()).toBe(true);

      comp.selectedLocation.set('Trade Binder');
      expect(comp.filteredCards().every((c) => c.storageLocation === 'Trade Binder')).toBe(true);

      comp.searchQuery.set('Mew');
      expect(comp.filteredCards().every((c) => c.name.toLowerCase().includes('mew'))).toBe(true);

      comp.resetFilters();
      expect(comp.hasActiveFilters()).toBe(false);
      expect(comp.activeSheetFilterCount()).toBe(0);
      expect(comp.filteredCards().length).toBe(total);

      // Verberg ×1 badge op unieke kaarten, toon ×N wel op dubbele kaarten
      fixture.detectChanges();
      const qtyBadges = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.overlay-pill--qty')
      ).map((el) => el.textContent?.trim());
      expect(qtyBadges.length).toBeGreaterThan(0);
      expect(qtyBadges.every((txt) => txt !== '×1')).toBe(true);

      // Mobiele Filter Bottom Sheet opent, telt actieve filters en sluit weer
      comp.openFilterSheet();
      comp.onlyForTrade.set(true);
      expect(comp.isFilterSheetOpen()).toBe(true);
      expect(comp.activeSheetFilterCount()).toBe(1);
      comp.closeFilterSheet();
      expect(comp.isFilterSheetOpen()).toBe(false);
    });

    it('ondersteunt alle 5 sorteermodi inclusief numerieke kaartnummer-sortering', () => {
      const fixture = TestBed.createComponent(CollectionComponent);
      const comp = fixture.componentInstance;

      comp.selectedSet.set('151');
      comp.sortBy.set('number_asc');
      expect(comp.filteredCards()[0].cardNumber).toBe('003/165');

      comp.sortBy.set('value_desc');
      const desc = comp.filteredCards();
      expect(desc[0].marketPrice).toBeGreaterThanOrEqual(desc[desc.length - 1].marketPrice);

      comp.sortBy.set('value_asc');
      const asc = comp.filteredCards();
      expect(asc[0].marketPrice).toBeLessThanOrEqual(asc[asc.length - 1].marketPrice);

      comp.sortBy.set('qty_desc');
      const byQty = comp.filteredCards();
      expect(byQty[0].quantity).toBeGreaterThanOrEqual(byQty[byQty.length - 1].quantity);

      comp.sortBy.set('name_asc');
      const byName = comp.filteredCards();
      expect(byName[0].name.localeCompare(byName[1].name, 'nl')).toBeLessThanOrEqual(0);
    });

    it('navigeert bij openDetail naar de aparte Kaartdetail-pagina /collectie/kaart/:rowIndex/:cardId', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const fixture = TestBed.createComponent(CollectionComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      const venusaur = comp.filteredCards().find((c) => c.cardId === 'sv03.5-198')!;
      comp.openDetail(venusaur);
      expect(navSpy).toHaveBeenCalledWith(['/collectie/kaart', venusaur.rowIndex, 'sv03.5-198']);
    });

    it('verbergt winst % in grid en lijst bij kaarten met €0 aankoopprijs', () => {
      const fixture = TestBed.createComponent(CollectionComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);

      const zeroCard = {
        ...store.collection()[0],
        rowIndex: 999,
        cardId: 'sv03.5-zero',
        name: 'Gratis Promo Pikachu',
        purchasePrice: 0,
        marketPrice: 25,
        trendPercent: 12.5,
      };
      const paidCard = {
        ...store.collection()[0],
        rowIndex: 1000,
        cardId: 'sv03.5-paid',
        name: 'Gekochte Charizard',
        purchasePrice: 20,
        marketPrice: 30,
      };
      const breakEvenCard = {
        ...store.collection()[0],
        rowIndex: 1001,
        cardId: 'sv03.5-even',
        name: 'Break-even Mew',
        purchasePrice: 15,
        marketPrice: 15,
      };
      store.snapshot.update((snap) => ({
        ...snap,
        collection: [zeroCard, paidCard, breakEvenCard],
      }));
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const cards = Array.from(el.querySelectorAll('.card-slab'));
      expect(cards.length).toBe(3);

      const zeroCardEl = cards.find((c) => c.textContent?.includes('Gratis Promo Pikachu'))!;
      const paidCardEl = cards.find((c) => c.textContent?.includes('Gekochte Charizard'))!;
      const evenCardEl = cards.find((c) => c.textContent?.includes('Break-even Mew'))!;

      // €0 kaart: geen winst % badge in grid
      expect(zeroCardEl).toBeDefined();
      expect(zeroCardEl.querySelector('.card-slab__roi')).toBeNull();

      // Betaalde kaart en break-even kaart (> €0): winst % wél zichtbaar
      expect(paidCardEl.querySelector('.card-slab__roi')?.textContent?.trim()).toBe('+50,0%');
      expect(evenCardEl.querySelector('.card-slab__roi')?.textContent?.trim()).toBe('0,0%');

      // Lijstweergave: €0 kaart verbergt ROI, betaalde kaart toont ROI
      comp.viewMode.set('list');
      fixture.detectChanges();
      const rows = Array.from(el.querySelectorAll('.list-row'));
      const zeroRowEl = rows.find((r) => r.textContent?.includes('Gratis Promo Pikachu'))!;
      const paidRowEl = rows.find((r) => r.textContent?.includes('Gekochte Charizard'))!;
      expect(zeroRowEl.querySelector('.list-row__qty strong')).toBeNull();
      expect(paidRowEl.querySelector('.list-row__qty strong')?.textContent?.trim()).toBe('+50,0%');

      // filteredStats berekent unieke kaarten, exemplaren en gefilterde totale waarde
      expect(comp.filteredStats()).toEqual({
        uniqueCards: 3,
        totalCopies: zeroCard.quantity + paidCard.quantity + breakEvenCard.quantity,
        totalValue: zeroCard.quantity * 25 + paidCard.quantity * 30 + breakEvenCard.quantity * 15,
      });
    });
  });

  describe('CardDetailComponent', () => {
    it('laadt Cardmarket URL, ondersteunt Escape terugnavigatie, werkt aantallen bij en verwijdert kaarten', async () => {
      const router = TestBed.inject(Router);
      const store = TestBed.inject(CollectionStore);
      const appFixture = TestBed.createComponent(App);
      appFixture.detectChanges();

      await router.navigateByUrl('/collectie');
      appFixture.detectChanges();

      const venusaur = store.collection().find((c) => c.cardId === 'sv03.5-198')!;
      const initialQty = venusaur.quantity;

      await router.navigate(['/collectie/kaart', venusaur.rowIndex, venusaur.cardId]);
      appFixture.detectChanges();
      await appFixture.whenStable();

      const detail = appFixture.debugElement.query(By.directive(CardDetailComponent))
        .componentInstance as CardDetailComponent;
      expect(detail.activeCard()?.cardId).toBe('sv03.5-198');
      await new Promise((r) => setTimeout(r, 0));
      expect(detail.activeCardmarketUrl()).toBe(
        'https://www.cardmarket.com/en/Pokemon/Products?idProduct=733794'
      );

      // Escape keert direct terug naar /collectie
      detail.onEscapeKey();
      await appFixture.whenStable();
      expect(router.url).toBe('/collectie');

      // Aantal verhogen en opslaan (optimistisch terug naar /collectie vóór trage sync)
      await router.navigate(['/collectie/kaart', venusaur.rowIndex, venusaur.cardId]);
      appFixture.detectChanges();
      await appFixture.whenStable();
      const detail2 = appFixture.debugElement.query(By.directive(CardDetailComponent))
        .componentInstance as CardDetailComponent;
      detail2.adjustDraftQty(1);
      await detail2.saveDraft();
      await appFixture.whenStable();
      expect(router.url).toBe('/collectie');
      expect(store.collection().find((c) => c.cardId === 'sv03.5-198')?.quantity).toBe(initialQty + 1);

      let resolvePendingUpdate!: () => void;
      vi.spyOn(store, 'updateCard').mockImplementationOnce(
        () => new Promise<void>((resolve) => { resolvePendingUpdate = resolve; })
      );
      const refreshedVenusaur = store.collection().find((c) => c.cardId === 'sv03.5-198')!;
      await router.navigate(['/collectie/kaart', refreshedVenusaur.rowIndex, refreshedVenusaur.cardId]);
      appFixture.detectChanges();
      await appFixture.whenStable();
      const detail3 = appFixture.debugElement.query(By.directive(CardDetailComponent))
        .componentInstance as CardDetailComponent;
      const pendingSave = detail3.saveDraft();
      await appFixture.whenStable();
      expect(router.url).toBe('/collectie');
      resolvePendingUpdate();
      await pendingSave;

      // Verwijderen vanuit Detailpagina
      const toDelete = store.collection().find((c) => c.cardId === 'base1-44')!;
      await router.navigate(['/collectie/kaart', toDelete.rowIndex, toDelete.cardId]);
      appFixture.detectChanges();
      await appFixture.whenStable();
      const detail4 = appFixture.debugElement.query(By.directive(CardDetailComponent))
        .componentInstance as CardDetailComponent;
      await detail4.deleteActiveCard();
      await appFixture.whenStable();
      expect(router.url).toBe('/collectie');
      expect(store.collection().some((c) => c.cardId === 'base1-44')).toBe(false);
    });

    it('ondersteunt dirty-state Herstellen, high-res artwork lightbox en Vorige/Volgende kaartnavigatie', async () => {
      const router = TestBed.inject(Router);
      const store = TestBed.inject(CollectionStore);
      const appFixture = TestBed.createComponent(App);
      appFixture.detectChanges();

      const cards = store.collection();
      expect(cards.length).toBeGreaterThanOrEqual(2);
      const first = cards[0];

      await router.navigate(['/collectie/kaart', first.rowIndex, first.cardId]);
      appFixture.detectChanges();
      await appFixture.whenStable();

      const detail = appFixture.debugElement.query(By.directive(CardDetailComponent))
        .componentInstance as CardDetailComponent;

      expect(detail.hasUnsavedChanges()).toBe(false);
      detail.adjustDraftQty(1);
      expect(detail.hasUnsavedChanges()).toBe(true);
      detail.resetDraft();
      expect(detail.hasUnsavedChanges()).toBe(false);

      // Artwork Lightbox opent en sluit eerst met Escape zonder pagina te verlaten
      detail.openLightbox();
      appFixture.detectChanges();
      expect(detail.isLightboxOpen()).toBe(true);
      detail.onEscapeKey();
      expect(detail.isLightboxOpen()).toBe(false);
      expect(router.url).toContain(`/collectie/kaart/${first.rowIndex}/${first.cardId}`);

      // Volgende / Vorige kaart navigatie via ArrowRight / ArrowLeft
      const expectedNext = detail.nextCard();
      expect(expectedNext).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      appFixture.detectChanges();
      await appFixture.whenStable();
      expect(router.url).toContain(`/collectie/kaart/${expectedNext!.rowIndex}/${expectedNext!.cardId}`);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      appFixture.detectChanges();
      await appFixture.whenStable();
      expect(router.url).toContain(`/collectie/kaart/${first.rowIndex}/${first.cardId}`);

      // Horizontale swipe op .detail-layout bladert naar volgende en vorige kaart
      const dispatchHorizontalTouch = (el: HTMLElement, fromX: number, toX: number): void => {
        const fire = (type: string, x: number | null) => {
          const evt = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperty(evt, 'touches', {
            value: x === null ? [] : [{ clientX: x, clientY: 260 }],
            configurable: true,
          });
          el.dispatchEvent(evt);
        };
        fire('touchstart', fromX);
        fire('touchmove', toX);
        fire('touchend', null);
      };

      const detailLayout = (appFixture.nativeElement as HTMLElement).querySelector('.detail-layout') as HTMLElement;
      dispatchHorizontalTouch(detailLayout, 280, 160);
      appFixture.detectChanges();
      await appFixture.whenStable();
      expect(router.url).toContain(`/collectie/kaart/${expectedNext!.rowIndex}/${expectedNext!.cardId}`);

      dispatchHorizontalTouch(detailLayout, 150, 270);
      appFixture.detectChanges();
      await appFixture.whenStable();
      expect(router.url).toContain(`/collectie/kaart/${first.rowIndex}/${first.cardId}`);

      // Dirty-state bescherming blokkeert per ongeluk wegbladeren/swipen en waarschuwt via toast
      detail.adjustDraftQty(1);
      appFixture.detectChanges();
      detail.goToAdjacentCard(expectedNext);
      expect(router.url).toContain(`/collectie/kaart/${first.rowIndex}/${first.cardId}`);
      expect(store.toasts().some((t) => t.tone === 'warning' && t.text.includes('Herstellen'))).toBe(true);
      detail.resetDraft();
      appFixture.detectChanges();

      // Fullscreen 3D Showcase opent met eenmalige katana-sheen, draait om met Spatie en sluit geen Common-kaarten in
      detail.openLightbox();
      appFixture.detectChanges();
      expect(detail.isLightboxOpen()).toBe(true);
      expect(
        (appFixture.nativeElement as HTMLElement).querySelector('.card3d__katana-sheen.is-active')
      ).not.toBeNull();
      expect((appFixture.nativeElement as HTMLElement).querySelector('.pb-showcase__panel')).toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      appFixture.detectChanges();
      const card3dEl = (appFixture.nativeElement as HTMLElement).querySelector('.card3d') as HTMLElement;
      expect(card3dEl.style.transform).toContain('rotateY(180.00deg)');

      detail.closeLightbox();

      const commonCard = store.collection().find((c) => c.rarity === 'Common' && c.variant === 'Normal');
      if (commonCard) {
        await router.navigate(['/collectie/kaart', commonCard.rowIndex, commonCard.cardId]);
        appFixture.detectChanges();
        expect(detail.isShowcaseEligible()).toBe(false);
        detail.openLightbox();
        expect(detail.isLightboxOpen()).toBe(false);
      }
    });

    it('laat optionele herkomst en aankoopprijs instellen/wissen en toont € 0,00 zonder ROI op de detailpagina', async () => {
      const router = TestBed.inject(Router);
      const store = TestBed.inject(CollectionStore);
      const appFixture = TestBed.createComponent(App);
      appFixture.detectChanges();

      const target = store.collection()[0];
      await router.navigate(['/collectie/kaart', target.rowIndex, target.cardId]);
      appFixture.detectChanges();
      await appFixture.whenStable();

      const detail = appFixture.debugElement.query(By.directive(CardDetailComponent))
        .componentInstance as CardDetailComponent;
      detail.toggleDraftAcquisitionMethod('Pack Pull');
      detail.onDraftPurchasePriceChange('');
      appFixture.detectChanges();

      const detailText = (appFixture.nativeElement as HTMLElement).textContent ?? '';
      expect(detailText).toContain('€\u00A00,00');
      expect(detailText).not.toContain('Niet ingevuld');
      expect(detailText).not.toContain('Winst / Verlies');
      expect((appFixture.nativeElement as HTMLElement).querySelector('.hero-card__roi')).toBeNull();

      await detail.saveDraft();
      const updated = store.collection().find((c) => c.cardId === target.cardId && c.rowIndex === target.rowIndex)!;
      expect(updated.acquisitionMethod).toBe('Pack Pull');
      expect(updated.purchasePrice).toBe(0);

      // Nogmaals kiezen wist optionele herkomst en zet numerieke aankoopprijs
      await router.navigate(['/collectie/kaart', updated.rowIndex, updated.cardId]);
      appFixture.detectChanges();
      await appFixture.whenStable();
      const detail2 = appFixture.debugElement.query(By.directive(CardDetailComponent))
        .componentInstance as CardDetailComponent;
      detail2.toggleDraftAcquisitionMethod('Pack Pull');
      detail2.onDraftPurchasePriceChange('14.5');
      await detail2.saveDraft();
      const cleared = store.collection().find((c) => c.cardId === target.cardId && c.rowIndex === target.rowIndex)!;
      expect(cleared.acquisitionMethod).toBe('');
      expect(cleared.purchasePrice).toBe(14.5);

      // Onbekende kaart-route toont veilige lege staat
      await router.navigate(['/collectie/kaart', 99999, 'bestaat-niet']);
      appFixture.detectChanges();
      await appFixture.whenStable();
      expect((appFixture.nativeElement as HTMLElement).textContent).toContain('Kaart niet gevonden');
    });

    it('behoudt onopgeslagen wijzigingen in editDraft als achtergrond-sync tempRowIndex (< 0) oplost', async () => {
      const router = TestBed.inject(Router);
      const store = TestBed.inject(CollectionStore);
      const appFixture = TestBed.createComponent(App);
      appFixture.detectChanges();

      store.updateConfig({ demoMode: false, webAppUrl: 'https://example.com/exec', apiToken: 'tok' });
      vi.spyOn(TestBed.inject(AppsScriptSheetsAdapter), 'batchMutations').mockImplementation(
        () => new Promise(() => undefined)
      );
      store.isOnline.set(false);
      await store.addCard({
        cardId: 'sv03-125',
        name: 'Charizard ex',
        setName: 'Obsidian Flames',
        cardNumber: '125/197',
        quantity: 1,
      });

      const tempCard = store.collection().find((c) => c.cardId === 'sv03-125' && c.rowIndex < 0)!;
      await router.navigate(['/collectie/kaart', tempCard.rowIndex, tempCard.cardId]);
      appFixture.detectChanges();
      await appFixture.whenStable();

      const detail = appFixture.debugElement.query(By.directive(CardDetailComponent))
        .componentInstance as CardDetailComponent;
      detail.patchDraft({ notes: 'Zelf net getypte notitie' });
      expect(detail.editDraft()?.notes).toBe('Zelf net getypte notitie');

      // Simuleer achtergrond-sync die tempRowIndex -> 42 teruggeeft
      store.snapshot.update((snap) => ({
        ...snap,
        collection: snap.collection.map((c) =>
          c.rowIndex === tempCard.rowIndex && c.cardId === tempCard.cardId ? { ...c, rowIndex: 42 } : c
        ),
      }));
      appFixture.detectChanges();

      expect(detail.editDraft()?.rowIndex).toBe(42);
      expect(detail.editDraft()?.notes).toBe('Zelf net getypte notitie');
    });
  });

  describe('QuickAddComponent', () => {
    it('detecteert duplicaten, verhoogt bestaande kaart met +1 en blijft schoon op het scherm', async () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const fixture = TestBed.createComponent(QuickAddComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      const beforeQty = store.collection().find((c) => c.cardId === 'sv03.5-181')!.quantity;
      await comp.lookupByCode('MEW 181');
      expect(comp.previewCard()?.name).toBe('Dragonair');
      expect(comp.existingMatch()?.cardId).toBe('sv03.5-181');

      await comp.incrementDuplicate();
      expect(store.collection().find((c) => c.cardId === 'sv03.5-181')?.quantity).toBe(beforeQty + 1);
      expect(navSpy).not.toHaveBeenCalled();
      expect(comp.codeQuery()).toBe('');
      expect(comp.previewCard()).toBeNull();
    });

    it('ondersteunt Zoek op Naam, op scherm blijven zonder set-geheugen, Pack Opening Mode en handmatige offline fallback', async () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const fixture = TestBed.createComponent(QuickAddComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      // Zoek op naam en selecteer resultaat -> aankoopprijs staat standaard op €0 (nooit automatisch Cardmarket-prijs invullen!)
      comp.inputMode.set('name');
      await comp.searchByName('Charizard');
      expect(comp.nameResults().length).toBe(1);
      await comp.selectNameResult(comp.nameResults()[0]);
      expect(comp.previewCard()?.id).toBe('sv03-125');
      expect(comp.matchedPokedexEntry()?.dexNumber).toBe(6);
      expect(comp.purchasePrice()).toBe(0);

      // Opt-in knop kan marktprijs expliciet overnemen als gebruiker dat zelf kiest
      comp.applyMarketPriceAsPurchase();
      expect(comp.purchasePrice()).toBe(MOCK_CATALOG_CARD.marketPriceEur);

      // Opslaan & op scherm blijven ZONDER Pack Mode -> reset zoekveld, prijs naar €0, herkomst en te-ruil vlag!
      comp.toggleAcquisitionMethod('Single gekocht');
      expect(comp.acquisitionMethod()).toBe('Single gekocht');
      comp.purchasePrice.set(12.5);
      comp.forTrade.set(true);
      const before = store.collection().length;
      await comp.saveCard(true);
      expect(store.collection().length).toBe(before + 1);
      expect(store.collection()[0].acquisitionMethod).toBe('Single gekocht');
      expect(store.collection()[0].purchasePrice).toBe(12.5);
      expect(comp.packMode()).toBe(false);
      expect(comp.codeQuery()).toBe('');
      expect(comp.purchasePrice()).toBe(0);
      expect(comp.acquisitionMethod()).toBe('');
      expect(comp.forTrade()).toBe(false);
      expect(comp.previewCard()).toBeNull();

      // Nieuwe lookup -> aankoopprijs blijft €0 en kaart wordt met € 0 opgeslagen als Pack Pull
      await comp.lookupByCode('OBF 125');
      expect(comp.purchasePrice()).toBe(0);
      comp.toggleAcquisitionMethod('Pack Pull');
      await comp.saveCard(true, true);
      expect(comp.packMode()).toBe(true);
      expect(comp.acquisitionMethod()).toBe('Pack Pull');

      // Handmatige invoer met Pack Opening Mode AAN -> houdt scherm open en onthoudt setcode & pull method
      comp.inputMode.set('code');
      comp.codeQuery.set('OBF 999');
      comp.previewCard.set(null);
      comp.manualName.set('Custom Promo Pikachu');
      comp.manualSet.set('Promo');
      comp.manualNumber.set('001/001');
      await comp.saveCard(true, true);
      expect(comp.packMode()).toBe(true);
      expect(comp.codeQuery()).toBe('OBF ');
      expect(store.collection().some((c) => c.name === 'Custom Promo Pikachu' && c.purchasePrice === 0)).toBe(true);

      // Expliciet "Opslaan & Naar Collectie" navigeert óók als Pack Opening Mode aan staat
      comp.manualName.set('Final Card');
      await comp.saveCard(false);
      expect(navSpy).toHaveBeenCalledWith('/collectie');
    });

    it('maakt Opslaan & Volgende kaart in Live-modus direct (< 50 ms) vrij zonder op Google Sheets te wachten', async () => {
      const fixture = TestBed.createComponent(QuickAddComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      const adapter = TestBed.inject(AppsScriptSheetsAdapter);
      fixture.detectChanges();

      let resolveRemote!: () => void;
      vi.spyOn(adapter, 'bootstrap').mockResolvedValue(store.snapshot());
      vi.spyOn(adapter, 'batchMutations').mockImplementation(
        (_cfg, mutations) =>
          new Promise((resolve) => {
            resolveRemote = () =>
              resolve({
                results: [
                  {
                    id: mutations[0]?.id ?? 'x',
                    action: 'addCard',
                    ok: true,
                    result: { rowIndex: 25, cardId: 'sv03-125' },
                  },
                ],
              });
          })
      );

      store.updateConfig({
        demoMode: false,
        webAppUrl: 'https://script.google.com/macros/s/test/exec',
        apiToken: 'tok',
      });
      await store.syncFromRemote(true);

      await comp.lookupByCode('OBF 125');
      await comp.saveCard(true);

      // Direct klaar terwijl netwerk nog wacht!
      expect(comp.isSaving()).toBe(false);
      expect(comp.previewCard()).toBeNull();
      expect(comp.codeQuery()).toBe('');
      expect(store.collection()[0].name).toBe('Charizard ex');
      expect(store.collection()[0].rowIndex).toBeLessThan(0);
      expect(store.syncStatus()).toBe('syncing');

      resolveRemote();
      await store.waitForPendingSync();
      expect(store.collection()[0].rowIndex).toBe(25);
      expect(store.pendingQueue().length).toBe(0);
    });
  });

  describe('PokedexBinderComponent', () => {
    it('filtert op generatie, status, zoekterm, bladerpagina en plaatst beschikbare kaart direct', async () => {
      const fixture = TestBed.createComponent(PokedexBinderComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      expect(comp.pageSlots().length).toBe(9);
      comp.nextPage();
      expect(comp.clampedPage()).toBe(2);
      comp.prevPage();
      expect(comp.clampedPage()).toBe(1);

      // Zoek specifiek op #0148 Dragonair
      comp.onSearchChange('Dragonair');
      expect(comp.filteredSlots().length).toBe(1);
      expect(comp.filteredSlots()[0].dexNumber).toBe(148);
      comp.onSearchChange('');

      // Statusfilter: Al in Collectie (moet 3 kaarten tonen in Gen 1)
      comp.selectStatus('in_collection');
      expect(comp.filteredSlots().length).toBe(3);

      // Direct plaatsen via quickPlaceReadySlot
      const dragonair = comp.filteredSlots().find((s) => s.dexNumber === 148)!;
      await comp.quickPlaceReadySlot(dragonair);
      expect(store.pokedex().find((s) => s.dexNumber === 148)?.inBinder).toBe(true);
      expect(comp.filteredSlots().length).toBe(2);
    });

    it('wisselt kaartvarianten (met directe sluiting), upgrade-vlag, Escape-sluiting en binder-indeling (4/9/12/16/20)', async () => {
      const fixture = TestBed.createComponent(PokedexBinderComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      const venusaurSlot = comp.pageSlots().find((s) => s.dexNumber === 3)!;
      comp.openSlotSheet(venusaurSlot);
      expect(comp.activeSlotMatchingCards().length).toBe(3);

      const baseVenusaur = comp.activeSlotMatchingCards().find((c) => c.cardId === 'base1-15')!;
      await comp.chooseVariant(baseVenusaur);
      expect(comp.activeSlot()).toBeNull(); // Modaal sluit direct na kiezen van andere kaart!

      const updatedSlot = store.pokedex().find((s) => s.dexNumber === 3)!;
      expect(updatedSlot.selectedCard).toContain('base1-15');
      expect(updatedSlot.inBinder).toBe(true);

      // Opnieuw klikken op de al actieve kaart sluit zonder extra write naar Google Sheets
      const updateSpy = vi.spyOn(store, 'updatePokedexSlot');
      comp.openSlotSheet(updatedSlot);
      await comp.chooseVariant(baseVenusaur);
      expect(comp.activeSlot()).toBeNull();
      expect(updateSpy).not.toHaveBeenCalled();

      // Escape sluit sheet
      comp.openSlotSheet(venusaurSlot);
      comp.onEscapeKey();
      expect(comp.activeSlot()).toBeNull();

      // Indeling schakelen naar 4, 12, 16 en 20 (5x4)
      await comp.changeSlotsPerPage(4);
      expect(comp.gridCols()).toBe(2);
      await comp.changeSlotsPerPage(12);
      expect(comp.gridCols()).toBe(4);
      await comp.changeSlotsPerPage(16);
      expect(comp.pageSlots().length).toBe(16);
      await comp.changeSlotsPerPage(20);
      expect(comp.gridCols()).toBe(5);
      expect(comp.pageSlots().length).toBe(20);
    });
  });

  describe('SetProgress, Wishlist, Trades & Settings', () => {
    it('filtert en sorteert Set Voortgang, telt alleen actieve sets (>0 kaarten) en klikt door naar Collectie', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const fixture = TestBed.createComponent(SetProgressComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      const activeBefore = comp.stats().count;
      // Voeg een lege set zonder kaarten toe -> mag NIET als actieve set worden meegeteld!
      store.snapshot.update((snap) => ({
        ...snap,
        setProgress: [
          ...snap.setProgress,
          {
            setName: 'Lege Testset',
            series: 'Test',
            totalCards: 100,
            ownedUnique: 0,
            remaining: 100,
            progressPercent: 0,
            totalSetValue: 0,
          },
        ],
      }));
      expect(comp.stats().count).toBe(activeBefore);
      // Standaard worden lege 0-kaart sets ook verborgen zodat lijst exact klopt met teller
      expect(comp.filteredSets().length).toBe(activeBefore);
      expect(comp.inactiveSetsCount()).toBe(1);
      expect(comp.filteredSets().some((s) => s.setName === 'Lege Testset')).toBe(false);

      // Gebruiker kan lege sets optioneel toch tonen
      comp.showInactiveSets.set(true);
      expect(comp.filteredSets().some((s) => s.setName === 'Lege Testset')).toBe(true);
      comp.showInactiveSets.set(false);

      comp.query.set('151');
      expect(comp.filteredSets().length).toBe(1);
      comp.addCardFromSet(comp.filteredSets()[0]);
      expect(store.requestedQuickAddSearch()).toEqual({ mode: 'sets', query: '151' });
      expect(navSpy).toHaveBeenCalledWith('/toevoegen');

      comp.openSetInCollection(comp.filteredSets()[0]);
      expect(store.requestedSetFilter()).toBe('151');
      expect(navSpy).toHaveBeenCalledWith('/collectie');
    });

    it('beheert Verlanglijst: TCGdex-lookup, budgetfilters, alleen afvinken én doorzetten naar Collectie', async () => {
      const fixture = TestBed.createComponent(WishlistComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      // Nieuwe wens met TCGdex lookup
      comp.openAddModal();
      comp.lookupQuery.set('OBF 125');
      await comp.lookupCardForWishlist();
      expect(comp.newCardName()).toBe('Charizard ex');
      await comp.saveNewWish();
      expect(comp.showAddSheet()).toBe(false);
      expect(store.wishlist().some((w) => w.cardName === 'Charizard ex')).toBe(true);

      // Inline maandbudget bewerken & opslaan
      comp.startBudgetEdit();
      comp.budgetDraft.set(275);
      comp.saveBudgetEdit();
      expect(store.config().monthlyBudget).toBe(275);
      expect(comp.isEditingBudget()).toBe(false);

      // Bestaand verlanglijst-item bewerken & verwijderen
      const editable = store.wishlist().find((w) => w.cardName === 'Charizard ex')!;
      comp.openEditModal(editable);
      comp.newMaxBudget.set(320);
      comp.newPriority.set('Grail');
      await comp.saveNewWish();
      expect(store.wishlist().find((w) => w.rowIndex === editable.rowIndex)?.maxBudget).toBe(320);
      expect(store.wishlist().find((w) => w.rowIndex === editable.rowIndex)?.priority).toBe('Grail');

      // Budgetfilter
      comp.filter.set('in_budget');
      expect(comp.filteredItems().every((w) => comp.isWithinBudget(w))).toBe(true);

      // Gevonden -> Toevoegen aan Collectie
      const beforeCol = store.collection().length;
      const target = comp.openItems()[0];
      await comp.markFoundAndAdd(target);
      expect(store.collection().length).toBe(beforeCol + 1);
      expect(store.wishlist().find((w) => w.rowIndex === target.rowIndex)?.found).toBe(true);

      // Verwijderen
      const countBeforeDel = store.wishlist().length;
      await comp.confirmDeleteItem(target);
      expect(store.wishlist().length).toBe(countBeforeDel - 1);

      // Escape sluit modal
      comp.openAddModal();
      comp.onEscapeKey();
      expect(comp.showAddSheet()).toBe(false);

      // 3D Kaart Showcase op Verlanglijst: Rare/Grail wél, Common/Uncommon níét ("Bijzondere kaart = bijzondere view")
      comp.filter.set('open');
      await store.addWishlistItem({
        cardName: 'Caterpie',
        setName: '151',
        cardNumber: '010/165',
        desiredVariant: 'Normal',
        minCondition: 'Near Mint (NM)',
        priority: 'Laag',
        maxBudget: 1,
        marketPrice: 0.2,
        notes: '',
      });
      fixture.detectChanges();

      const commonWish = comp.filteredItems().find((w) => w.cardName === 'Caterpie')!;
      expect(comp.isShowcaseEligible(commonWish)).toBe(false);
      comp.openShowcase(commonWish);
      expect(comp.activeShowcaseWish()).toBeNull();

      const grailWish = comp.showcaseItems()[0]!;
      expect(comp.isShowcaseEligible(grailWish)).toBe(true);
      comp.openShowcase(grailWish);
      fixture.detectChanges();

      expect(comp.activeShowcaseWish()?.cardName).toBe(grailWish.cardName);
      const backdropEl = (fixture.nativeElement as HTMLElement).querySelector('.pb-showcase-backdrop');
      const showcaseEl = (fixture.nativeElement as HTMLElement).querySelector('.pb-showcase');
      expect(showcaseEl).not.toBeNull();
      expect(backdropEl?.getAttribute('aria-label')).toContain(grailWish.cardName);
      expect(showcaseEl?.querySelector('.card3d__katana-sheen.is-active')).not.toBeNull();
      expect(showcaseEl?.querySelector('.card3d__back-img')?.getAttribute('src')).toContain(
        'tcg.pokemon.com'
      );

      comp.closeShowcase();
      expect(comp.activeShowcaseWish()).toBeNull();
    });

    it('prefillt Ruil & Verkoop vanuit Live Trade Binder en berekent netto resultaat live', async () => {
      const fixture = TestBed.createComponent(TradesComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      const tradeCard = store.tradeBinderCards()[0];
      expect(comp.tradableQty(tradeCard)).toBeGreaterThanOrEqual(1);

      const navSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      comp.openCardDetail(tradeCard);
      expect(navSpy).toHaveBeenCalledWith(['/collectie/kaart', tradeCard.rowIndex, tradeCard.cardId]);

      comp.openNewTradeModal(tradeCard);
      expect(comp.cardName()).toContain(tradeCard.name);

      const beforeProfit = store.portfolio().realizedProfit;
      comp.purchasePrice.set(100);
      comp.saleValue.set(150);
      comp.platformFees.set(5);
      expect(comp.previewNetResult()).toBe(45);

      await comp.submitTrade();
      expect(store.portfolio().realizedProfit).toBeCloseTo(beforeProfit + 45, 2);
      expect(comp.showLogSheet()).toBe(false);

      // Escape sluit modal
      comp.openNewTradeModal();
      comp.onEscapeKey();
      expect(comp.showLogSheet()).toBe(false);
    });

    it('schakelt Demo-modus, test verbinding, beheert profielen & cache zonder dubbele feedback-kaart in SettingsComponent', async () => {
      const fixture = TestBed.createComponent(SettingsComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      expect(store.config().demoMode).toBe(true);
      comp.clearCache();
      expect(store.pendingQueue().length).toBe(0);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).not.toContain('Feedback & To-Do Hub');
      expect(el.textContent).toContain('Voorkeuren');
      expect(el.textContent).toContain('Aanpassen op Verlanglijst');
      expect(el.textContent).toContain('Hoe koppel ik een eigen Google Sheet');

      // Demo-modus uitzetten zonder spreadsheet -> badge toont "Niet gekoppeld"
      comp.toggleDemoMode();
      fixture.detectChanges();
      expect(el.textContent).toContain('Niet gekoppeld');

      // Spreadsheet-profielen aanmaken en wisselen via dropdown (Test <-> Live)
      comp.profileName.set('Remco Test');
      comp.profileRole.set('test');
      comp.webAppUrl.set('https://script.google.com/macros/s/test/exec');
      comp.apiToken.set('tok-test');
      comp.saveConnectionOnly();
      const testId = comp.selectedProfileId();

      comp.startNewProfile();
      comp.profileName.set('Mel Echte Sheet');
      comp.profileRole.set('live');
      comp.webAppUrl.set('https://script.google.com/macros/s/mel/exec');
      comp.apiToken.set('tok-mel');
      comp.saveConnectionOnly();
      fixture.detectChanges();

      expect(store.sheetProfiles().length).toBe(2);
      expect(el.textContent).toContain('Test · Remco Test');
      expect(el.textContent).toContain('Live · Mel Echte Sheet');

      // Wissel via de dropdown terug naar Remco Test
      await comp.onProfileSelect(testId);
      fixture.detectChanges();
      expect(store.activeProfile()?.id).toBe(testId);
      expect(comp.webAppUrl()).toBe('https://script.google.com/macros/s/test/exec');
      expect(el.textContent).toContain('Test: Remco Test');

      // Barebones Template kopieer-knop opent Google /copy in browser & 1-klik API-token generator
      const openSpy = vi.spyOn(comp.platform, 'openExternalUrl').mockResolvedValue();
      await comp.openTemplateCopy();
      expect(openSpy).toHaveBeenCalledWith(
        'https://docs.google.com/spreadsheets/d/1bZKzRHDNTaExkag2-5JSt8ncxrARfdojcjk2Stynmwg/copy'
      );

      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextSpy },
        configurable: true,
      });
      await comp.generateAndCopyApiToken();
      expect(comp.apiToken().length).toBeGreaterThanOrEqual(24);
      expect(comp.showToken()).toBe(true);
      expect(writeTextSpy).toHaveBeenCalledWith(comp.apiToken());

      // Code.gs ophalen + kopiëren via klembord + scriptversie-update detectie
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response("var SCRIPT_VERSION = '2.1.0';\nfunction doGet() {}", { status: 200 })
      );
      await comp.copyLatestAppsScript();
      expect(fetchSpy).toHaveBeenCalled();
      expect(comp.copiedScriptLines()).toBe(2);
      expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining("SCRIPT_VERSION = '2.1.0'"));

      // Deployment ID hint bij meerdere implementaties + spatie voor '(' + directe hercontrole knop
      comp.webAppUrl.set(
        'https://script.google.com/macros/s/AKfycbw9HJg8tJQeL9guRHL51gg1c8bOs-15QUNXmUOSKjNPNXm8dMpCKkLavxZQ/exec'
      );
      comp.saveConnectionOnly();
      store.connectedScriptVersion.set('1.9.0');
      fixture.detectChanges();

      expect(comp.scriptUpdateAvailable()).toBe(true);
      expect(comp.activeDeploymentShortId()).toBe('AKfycbw9HJg8tJQe…LavxZQ');
      expect(el.textContent).toContain('AKfycbw9HJg8tJQe…LavxZQ');
      expect(el.textContent).toContain('Implementaties beheren (maak geen nieuwe implementatie aan');
      expect(el.textContent).toContain('Controleer script-versie');

      vi.spyOn(store, 'testConnection').mockImplementationOnce(async () => {
        store.connectedScriptVersion.set(comp.latestScriptVersion());
        store.legacyAppsScriptDetected.set(false);
        return {
          ok: true,
          spreadsheetName: 'Remco Test',
          scriptVersion: comp.latestScriptVersion(),
        };
      });
      await comp.verifyScriptVersion(false);
      fixture.detectChanges();

      expect(comp.scriptUpdateAvailable()).toBe(false);
      expect(comp.isSetupSectionExpanded()).toBe(true);
      expect(el.textContent).toContain('Je Google Sheet script is up-to-date');
    });

    it('ondersteunt de Alle Sets Catalogus browser in QuickAddComponent met in-bezit detectie, zoekbare dropdown en sortering', async () => {
      const fixture = TestBed.createComponent(QuickAddComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      await comp.openSetsCatalog();
      fixture.detectChanges();
      expect(comp.inputMode()).toBe('sets');
      expect(comp.allSets().length).toBe(4);

      // Standaard 'series'-sortering: Scarlet & Violet (151) vóór Sword & Shield, Base, en Trainer kits onderaan
      expect(comp.filteredCatalogSets().map((s) => s.id)).toEqual([
        'sv03.5',
        'swsh4.5sv',
        'base1',
        'tk-ex-latia',
      ]);

      // Dropdown openen, zoeken in de dropdown, sorteervolgorde wisselen en toetsenbord-navigatie testen
      comp.openSetDropdown();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('#qa-set-search-input')).not.toBeNull();

      comp.setSetSortMode('az');
      expect(comp.filteredCatalogSets().map((s) => s.name)).toEqual([
        '151',
        'Base Set',
        'EX trainer Kit (Latias)',
        'Shining Fates Shiny Vault',
      ]);

      comp.setSetSortMode('newest');
      expect(comp.filteredCatalogSets().map((s) => s.id)).toEqual([
        'sv03.5',
        'swsh4.5sv',
        'tk-ex-latia',
        'base1',
      ]);

      comp.onSetSearchQueryChange('shf');
      expect(comp.filteredCatalogSets().map((s) => s.id)).toEqual(['swsh4.5sv']);

      comp.onSetSearchQueryChange('');
      comp.onSetSearchKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(comp.isSetDropdownOpen()).toBe(false);

      comp.openSetDropdown();
      comp.onSetSearchQueryChange('151');
      comp.onSetSearchKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
      await new Promise((r) => setTimeout(r, 0));
      expect(comp.isSetDropdownOpen()).toBe(false);
      expect(comp.selectedCatalogSetId()).toBe('sv03.5');
      expect(comp.pagedSetCards().length).toBe(2);
      expect(comp.isCardOwned('sv03.5-199')).toBe(true);

      comp.onSetCardFilterChange('125');
      expect(comp.filteredSetCards().length).toBe(1);

      // Demo-modus toont Snel testen en berekent recente setcodes; Live-modus verbergt demo-chips en toont Recente sets
      const store = TestBed.inject(CollectionStore);
      expect(comp.recentSetCodes().length).toBeGreaterThan(0);
      comp.inputMode.set('code');
      fixture.detectChanges();
      expect(el.textContent).toContain('Snel testen');

      store.updateConfig({ demoMode: false });
      comp.storedRecentSetCodes.set(['MEW', 'EVS']);
      comp.toggleMoreOptions();
      fixture.detectChanges();
      expect(comp.showMoreOptions()).toBe(true);
      expect(el.querySelector('.qa-more-panel')).not.toBeNull();
      expect(comp.moreOptionsSummary()).toContain('Raw');
      expect(el.textContent).not.toContain('Snel testen');
      expect(el.textContent).toContain('Recente sets');
      expect(comp.recentSetCodes()).toEqual(['MEW', 'EVS']);
    });

    it('scrollt nooit automatisch omhoog na opslaan of duplicaat-increment (Feedback #3)', async () => {
      const fixture = TestBed.createComponent(QuickAddComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      const fakeMain = document.createElement('div');
      fakeMain.className = 'shell__main';
      const mainScrollSpy = vi.fn();
      fakeMain.scrollTo = mainScrollSpy;
      document.body.appendChild(fakeMain);

      try {
        await comp.lookupByCode('MEW 181');
        await comp.incrementDuplicate();
        comp.manualName.set('Bulbasaur Promo');
        await comp.saveCard(true);
        await new Promise((r) => setTimeout(r, 20));

        expect(scrollSpy).not.toHaveBeenCalled();
        expect(mainScrollSpy).not.toHaveBeenCalled();
      } finally {
        fakeMain.remove();
        scrollSpy.mockRestore();
      }
    });

    it('ondersteunt Multi-select (Alle Sets + Op Naam), Alleen ontbrekende filter, +1 tegel & set-overstijgende batch-opslag (Feedback #2)', async () => {
      const fixture = TestBed.createComponent(QuickAddComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      await comp.openSetsCatalog();
      await comp.selectCatalogSet('sv03.5');
      fixture.detectChanges();

      // Standaard 2 kaarten (sv03.5-199 in bezit, sv03-125 nieuw)
      expect(comp.activeSetOwnedCount()).toBe(1);
      expect(comp.activeSetMissingCount()).toBe(1);

      // Filter 'Alleen ontbrekende' verbergt kaarten die al in bezit zijn
      comp.toggleOnlyMissingInSet();
      expect(comp.filteredSetCards().map((c) => c.id)).toEqual(['sv03-125']);
      comp.toggleOnlyMissingInSet();
      expect(comp.filteredSetCards().length).toBe(2);

      // Multi-select inschakelen: 1e tik selecteert, +1 verhoogt aantal, 2e tik deselecteert
      comp.toggleMultiSelectMode();
      expect(comp.multiSelectMode()).toBe(true);
      expect(window.localStorage.getItem('pokebinder_qa_multiselect_v1')).toBe('true');

      const [cardOwned, cardNew] = comp.pagedSetCards();
      comp.onCatalogTileClick(cardOwned, comp.activeSetDetail());
      comp.onCatalogTileClick(cardNew, comp.activeSetDetail());
      expect(comp.batchUniqueCount()).toBe(2);

      comp.adjustBatchCardQty(cardNew.id, 1);
      expect(comp.getSelectedBatchItem(cardNew.id)?.quantity).toBe(2);
      expect(comp.batchTotalCopies()).toBe(3);

      // 2e tik op cardOwned deselecteert die weer
      comp.onCatalogTileClick(cardOwned, comp.activeSetDetail());
      expect(comp.batchUniqueCount()).toBe(1);

      // Set-overstijgend mandje: selecteer ook een kaart via Op Naam
      comp.inputMode.set('name');
      await comp.searchByName('Charizard');
      const nameItem = {
        id: 'sv03.5-199',
        localId: '199',
        name: 'Charizard ex 151',
        imageUrl: MOCK_CATALOG_CARD.lowImageUrl,
      };
      comp.onCatalogTileClick(nameItem);
      expect(comp.batchUniqueCount()).toBe(2);

      // Variant-override & opslaan in 1 batch
      comp.setBatchCardVariant('sv03.5-199', 'Reverse Holo');
      comp.batchDuplicateMode.set('separate');
      const countBefore = store.collection().length;
      await comp.saveBatchSelection();

      expect(comp.batchUniqueCount()).toBe(0);
      expect(comp.showBatchSheet()).toBe(false);
      expect(store.collection().length).toBe(countBefore + 2);
      expect(store.collection().some((c) => c.cardId === 'sv03-125' && c.quantity === 2)).toBe(true);
      expect(store.collection().some((c) => c.cardId === 'sv03.5-199' && c.variant === 'Reverse Holo')).toBe(true);
    });
  });

  describe('Feedback Modal, Desktop FAB & Feedback Hub To-Do Lijst', () => {
    it('opent FeedbackModal met paginadropdown, laat pagina wijzigen (mobiel) en voegt item toe', async () => {
      const feedback = TestBed.inject(FeedbackStore);
      const fixture = TestBed.createComponent(FeedbackModalComponent);
      const comp = fixture.componentInstance;

      feedback.openComposer('Instellingen');
      fixture.detectChanges();
      expect(comp.selectedPage()).toBe('Instellingen');

      // Gebruiker kiest via dropdown een andere pagina (zoals op mobiel vanuit Settings)
      comp.selectedPage.set('Pokédex Binder');
      comp.category.set('Verbetering');
      comp.title.set('Filter op shiny kaarten');
      comp.description.set('Handig voor master sets.');
      await comp.submit(false);

      expect(feedback.isComposerOpen()).toBe(false);
      const saved = feedback.items().find((i) => i.title === 'Filter op shiny kaarten')!;
      expect(saved).toBeDefined();
      expect(saved.page).toBe('Pokédex Binder');
      expect(saved.category).toBe('Verbetering');

      // Escape sluit modal
      feedback.openComposer('Dashboard');
      comp.onEscapeKey();
      expect(feedback.isComposerOpen()).toBe(false);

      // Bewerken van bestaand feedback-item via FeedbackModal in edit-modus
      feedback.openEditor(saved);
      fixture.detectChanges();
      expect(comp.isEditMode()).toBe(true);
      expect(comp.title()).toBe('Filter op shiny kaarten');

      comp.selectedPage.set('Collectie');
      comp.category.set('Idee');
      comp.title.set('Filter op shiny én alt art kaarten');
      comp.description.set('Aangepaste toelichting voor master sets.');
      await comp.submit(false);

      expect(feedback.isComposerOpen()).toBe(false);
      const updated = feedback.items().find((i) => i.id === saved.id)!;
      expect(updated.title).toBe('Filter op shiny én alt art kaarten');
      expect(updated.page).toBe('Collectie');
      expect(updated.category).toBe('Idee');
      expect(updated.description).toBe('Aangepaste toelichting voor master sets.');
    });

    it('rendert publieke Feedback Hub to-do lijst schoon zonder demodata en filtert op status/pagina/zoekterm', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

      const feedback = TestBed.inject(FeedbackStore);
      const fixture = TestBed.createComponent(FeedbackHubComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      // Standaard leeg (geen demo-data meer!)
      expect(comp.filteredItems().length).toBe(0);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Feedback Hub & To-Do Lijst');

      // Voeg 2 echte feedback-items toe en test filters + upvotes
      const itemA = await feedback.submitFeedback({
        page: 'Dashboard',
        category: 'Idee',
        title: 'Home screen Widget',
        description: 'Waarde op startscherm',
      });
      const itemB = await feedback.submitFeedback({
        page: 'Collectie',
        category: 'Bug',
        title: 'Zoekbalk ellipsis',
        description: 'Afkappen op smal scherm',
      });
      await feedback.setStatus(itemB, 'done');

      expect(comp.filteredItems().length).toBe(2);

      comp.statusFilter.set('done');
      expect(comp.filteredItems().length).toBe(1);
      expect(comp.filteredItems()[0].id).toBe(itemB.id);

      comp.statusFilter.set('all');
      comp.pageFilter.set('Dashboard');
      expect(comp.filteredItems().length).toBe(1);

      comp.pageFilter.set('ALL');
      comp.searchQuery.set('Widget');
      expect(comp.filteredItems().length).toBe(1);

      const beforeVotes = itemA.votes;
      await feedback.toggleUpvote(itemA);
      expect(feedback.items().find((i) => i.id === itemA.id)?.votes).toBe(beforeVotes - 1);

      // Copy-to-prompt: slaat op tabblad 'Alle' afgeronde items over, maar neemt ze wel mee op 'Afgerond'
      comp.searchQuery.set('');
      const bulkActivePrompt = comp.buildFilteredPrompt();
      expect(bulkActivePrompt).toContain('[Idee] Dashboard — Home screen Widget');
      expect(bulkActivePrompt).not.toContain('Zoekbalk ellipsis');

      comp.statusFilter.set('done');
      const bulkDonePrompt = comp.buildFilteredPrompt();
      expect(bulkDonePrompt).toContain('[Bug] Collectie — Zoekbalk ellipsis');

      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextSpy },
        configurable: true,
      });
      await comp.copyItemPrompt(itemA);
      expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('Home screen Widget'));
      expect(comp.copiedKey()).toBe(itemA.id);
      await comp.copyFilteredPrompt();
      expect(comp.copiedKey()).toBe('bulk');

      // Screenshot thumbnail + lightbox + prompt URL
      const itemWithShot = await feedback.submitFeedback({
        page: 'Collectie',
        category: 'Bug',
        title: 'Uitlijning screenshot',
        description: 'Met Drive preview',
        screenshot: {
          base64: 'YWJj',
          mimeType: 'image/webp',
          fileName: 'shot.webp',
          dataUrl: 'data:image/webp;base64,YWJj',
          sizeKb: 4,
        },
      });
      fixture.detectChanges();
      expect(comp.formatItemAsPrompt(itemWithShot)).toContain('Screenshot: data:image/webp;base64,YWJj');
      comp.openLightbox(itemWithShot);
      expect(comp.activeLightboxItem()?.id).toBe(itemWithShot.id);
      comp.onEscapeKey();
      expect(comp.activeLightboxItem()).toBeNull();
    });

    it('toont desktop feedback-knop in de zijbalk van App shell (zonder zwevende FAB) en geeft huidige route mee', async () => {
      const router = TestBed.inject(Router);
      const feedback = TestBed.inject(FeedbackStore);
      const fixture = TestBed.createComponent(App);
      await router.navigateByUrl('/pokedex');
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.desktop-feedback-fab')).toBeNull();
      const sidebarFeedbackBtn = el.querySelector(
        '.sidebar__feedback-btn'
      ) as HTMLButtonElement | null;
      expect(sidebarFeedbackBtn).not.toBeNull();
      sidebarFeedbackBtn!.click();

      expect(feedback.isComposerOpen()).toBe(true);
      expect(feedback.composerDefaultPage()).toBe('Pokédex Binder');
    });

    it('vergrendelt achtergrond-scroll via pb-modal-open zodra een modaal opent en geeft vrij bij sluiten of destroy', () => {
      const feedback = TestBed.inject(FeedbackStore);
      expect(document.documentElement.classList.contains('pb-modal-open')).toBe(false);

      // 1. Pokédex Binder sheet
      const dexFix = TestBed.createComponent(PokedexBinderComponent);
      dexFix.detectChanges();
      dexFix.componentInstance.openSlotSheet(dexFix.componentInstance.pageSlots()[0]);
      dexFix.detectChanges();
      expect(document.documentElement.classList.contains('pb-modal-open')).toBe(true);
      dexFix.componentInstance.closeSlotSheet();
      dexFix.detectChanges();
      expect(document.documentElement.classList.contains('pb-modal-open')).toBe(false);
      dexFix.destroy();

      // 2. Wishlist add modal
      const wlFix = TestBed.createComponent(WishlistComponent);
      wlFix.detectChanges();
      wlFix.componentInstance.openAddModal();
      wlFix.detectChanges();
      expect(document.documentElement.classList.contains('pb-modal-open')).toBe(true);
      wlFix.componentInstance.showAddSheet.set(false);
      wlFix.detectChanges();
      expect(document.documentElement.classList.contains('pb-modal-open')).toBe(false);
      wlFix.destroy();

      // 3. Trades log modal (en cleanup bij destroy terwijl open)
      const trFix = TestBed.createComponent(TradesComponent);
      trFix.detectChanges();
      trFix.componentInstance.openNewTradeModal();
      trFix.detectChanges();
      expect(document.documentElement.classList.contains('pb-modal-open')).toBe(true);
      trFix.destroy();
      expect(document.documentElement.classList.contains('pb-modal-open')).toBe(false);

      // 4. Global FeedbackModal
      const fbModalFix = TestBed.createComponent(FeedbackModalComponent);
      fbModalFix.detectChanges();
      feedback.openComposer('Dashboard');
      fbModalFix.detectChanges();
      expect(document.documentElement.classList.contains('pb-modal-open')).toBe(true);
      fbModalFix.componentInstance.close();
      fbModalFix.detectChanges();
      expect(document.documentElement.classList.contains('pb-modal-open')).toBe(false);
      fbModalFix.destroy();

      // 6. FeedbackHub screenshot lightbox
      const hubFix = TestBed.createComponent(FeedbackHubComponent);
      hubFix.detectChanges();
      hubFix.componentInstance.openLightbox({
        id: 'fb-shot-1',
        createdAt: '2026-01-01',
        page: 'Collectie',
        category: 'Bug',
        title: 'Screenshot test',
        description: '',
        status: 'open',
        votes: 1,
        author: 'Test',
        platform: 'Web',
        source: 'hub',
        screenshotUrl: 'https://example.com/shot.webp',
      });
      hubFix.detectChanges();
      expect(document.documentElement.classList.contains('pb-modal-open')).toBe(true);
      hubFix.componentInstance.closeLightbox();
      hubFix.detectChanges();
      expect(document.documentElement.classList.contains('pb-modal-open')).toBe(false);
      hubFix.destroy();
    });
  });
});
