import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../app.routes';
import { App } from '../app';
import { AppsScriptSheetsAdapter } from '../core/adapters/apps-script-sheets.adapter';
import { CatalogCard, CatalogCardSummary } from '../core/domain/models';
import { CARD_CATALOG_PORT, CardCatalogPort } from '../core/ports/card-catalog.port';
import { COLLECTION_REPOSITORY } from '../core/ports/collection-repository.port';
import { CollectionStore } from '../core/state/collection.store';
import { FeedbackStore } from '../core/state/feedback.store';
import { FeedbackModalComponent } from '../shared/feedback-modal/feedback-modal.component';
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

  async getCardByExactId(): Promise<CatalogCard | null> {
    return MOCK_CATALOG_CARD;
  }

  getCachedArtworkUrl(cardId: string): string {
    return `https://assets.tcgdex.net/en/sv/sv03.5/${cardId}/high.webp`;
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

    it('navigeert via de attentiebadge naar Pokédex gefilterd op Al in Collectie', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const store = TestBed.inject(CollectionStore);
      const fixture = TestBed.createComponent(DashboardComponent);

      fixture.componentInstance.openReadyForBinder();
      expect(store.requestedPokedexFilter()).toBe('in_collection');
      expect(navSpy).toHaveBeenCalledWith('/pokedex');
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
      expect(comp.filteredCards().length).toBe(total);
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

    it('werkt aantallen bij, verwijdert kaarten en sluit Detail Sheet op Escape', async () => {
      const fixture = TestBed.createComponent(CollectionComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      const venusaur = comp.filteredCards().find((c) => c.cardId === 'sv03.5-198')!;
      const initialQty = venusaur.quantity;

      comp.openDetail(venusaur);
      expect(comp.activeCard()?.cardId).toBe('sv03.5-198');
      comp.onEscapeKey();
      expect(comp.activeCard()).toBeNull();

      comp.openDetail(venusaur);
      comp.adjustDraftQty(1);
      await comp.saveDraft();
      expect(store.collection().find((c) => c.cardId === 'sv03.5-198')?.quantity).toBe(initialQty + 1);

      // Verwijderen vanuit Detail Sheet
      const toDelete = store.collection().find((c) => c.cardId === 'base1-44')!;
      comp.openDetail(toDelete);
      await comp.deleteActiveCard();
      expect(store.collection().some((c) => c.cardId === 'base1-44')).toBe(false);
    });
  });

  describe('QuickAddComponent', () => {
    it('detecteert duplicaten en verhoogt bestaande kaart met +1 knop', async () => {
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
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
    });

    it('ondersteunt Zoek op Naam, Pack Opening Mode en handmatige offline fallback', async () => {
      const fixture = TestBed.createComponent(QuickAddComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      // Zoek op naam en selecteer resultaat
      comp.inputMode.set('name');
      await comp.searchByName('Charizard');
      expect(comp.nameResults().length).toBe(1);
      await comp.selectNameResult(comp.nameResults()[0]);
      expect(comp.previewCard()?.id).toBe('sv03-125');
      expect(comp.matchedPokedexEntry()?.dexNumber).toBe(6);

      // Opslaan in Pack Opening Mode houdt scherm open en onthoudt instellingen
      const before = store.collection().length;
      await comp.saveCard(true);
      expect(store.collection().length).toBe(before + 1);
      expect(comp.packMode()).toBe(true);
      expect(comp.previewCard()).toBeNull();

      // Handmatige invoer wanneer TCGdex geen match geeft
      comp.manualName.set('Custom Promo Pikachu');
      comp.manualSet.set('Promo');
      comp.manualNumber.set('001/001');
      await comp.saveCard(true);
      expect(store.collection().some((c) => c.name === 'Custom Promo Pikachu')).toBe(true);
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

    it('wisselt kaartvarianten, upgrade-vlag, Escape-sluiting en binder-indeling (4/9/12/16)', async () => {
      const fixture = TestBed.createComponent(PokedexBinderComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      const venusaurSlot = comp.pageSlots().find((s) => s.dexNumber === 3)!;
      comp.openSlotSheet(venusaurSlot);
      expect(comp.activeSlotMatchingCards().length).toBe(3);

      const baseVenusaur = comp.activeSlotMatchingCards().find((c) => c.cardId === 'base1-15')!;
      comp.chooseVariant(baseVenusaur);
      comp.draftUpgradeWanted.set(false);
      await comp.confirmSlotSelection();

      const updatedSlot = store.pokedex().find((s) => s.dexNumber === 3)!;
      expect(updatedSlot.selectedCard).toContain('base1-15');
      expect(updatedSlot.upgradeWanted).toBe(false);

      // Escape sluit sheet
      comp.openSlotSheet(venusaurSlot);
      comp.onEscapeKey();
      expect(comp.activeSlot()).toBeNull();

      // Indeling schakelen naar 4, 12 en 16
      await comp.changeSlotsPerPage(4);
      expect(comp.gridCols()).toBe(2);
      await comp.changeSlotsPerPage(12);
      expect(comp.gridCols()).toBe(4);
      await comp.changeSlotsPerPage(16);
      expect(comp.pageSlots().length).toBe(16);
    });
  });

  describe('SetProgress, Wishlist, Trades & Settings', () => {
    it('filtert en sorteert Set Voortgang en klikt door naar Collectie', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const fixture = TestBed.createComponent(SetProgressComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      comp.query.set('151');
      expect(comp.filteredSets().length).toBe(1);
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

      // Budgetfilter
      comp.filter.set('in_budget');
      expect(comp.filteredItems().every((w) => comp.isWithinBudget(w))).toBe(true);

      // Gevonden -> Toevoegen aan Collectie
      const beforeCol = store.collection().length;
      const target = comp.openItems()[0];
      await comp.markFoundAndAdd(target);
      expect(store.collection().length).toBe(beforeCol + 1);
      expect(store.wishlist().find((w) => w.rowIndex === target.rowIndex)?.found).toBe(true);

      // Escape sluit modal
      comp.openAddModal();
      comp.onEscapeKey();
      expect(comp.showAddSheet()).toBe(false);
    });

    it('prefillt Ruil & Verkoop vanuit Live Trade Binder en berekent netto resultaat live', async () => {
      const fixture = TestBed.createComponent(TradesComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      fixture.detectChanges();

      const tradeCard = store.tradeBinderCards()[0];
      expect(comp.tradableQty(tradeCard)).toBeGreaterThanOrEqual(1);

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

    it('schakelt Demo-modus, test verbinding, beheert cache en biedt mobiele Feedback-knop in SettingsComponent', async () => {
      const fixture = TestBed.createComponent(SettingsComponent);
      const comp = fixture.componentInstance;
      const store = TestBed.inject(CollectionStore);
      const feedback = TestBed.inject(FeedbackStore);
      fixture.detectChanges();

      expect(store.config().demoMode).toBe(true);
      comp.monthlyBudget.set(250);
      comp.saveConnectionOnly();
      expect(store.config().monthlyBudget).toBe(250);

      comp.clearCache();
      expect(store.pendingQueue().length).toBe(0);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Feedback & To-Do Hub');
      expect(el.textContent).toContain('Feedback geven');
      expect(el.textContent).toContain('Feedback Hub bekijken');

      const fbBtn = Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Feedback geven')
      )!;
      fbBtn.click();
      expect(feedback.isComposerOpen()).toBe(true);
      expect(feedback.composerDefaultPage()).toBe('Algemeen / Hele app');
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
    });

    it('rendert publieke Feedback Hub to-do lijst met status-, pagina-, categorie- en zoekfilters', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

      const feedback = TestBed.inject(FeedbackStore);
      const fixture = TestBed.createComponent(FeedbackHubComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      expect(comp.filteredItems().length).toBeGreaterThanOrEqual(4);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Feedback Hub & To-Do Lijst');

      comp.statusFilter.set('done');
      expect(comp.filteredItems().every((i) => i.status === 'done')).toBe(true);

      comp.statusFilter.set('all');
      comp.pageFilter.set('Dashboard');
      expect(comp.filteredItems().every((i) => i.page === 'Dashboard')).toBe(true);

      comp.pageFilter.set('ALL');
      comp.searchQuery.set('Widget');
      expect(comp.filteredItems().length).toBe(1);

      const target = comp.filteredItems()[0];
      const beforeVotes = target.votes;
      await feedback.toggleUpvote(target);
      expect(feedback.items().find((i) => i.id === target.id)?.votes).toBe(beforeVotes + 1);
    });

    it('toont desktop feedback-knop in App shell die huidige route meegeeft aan de modal', async () => {
      const router = TestBed.inject(Router);
      const feedback = TestBed.inject(FeedbackStore);
      const fixture = TestBed.createComponent(App);
      await router.navigateByUrl('/pokedex');
      fixture.detectChanges();

      const fab = (fixture.nativeElement as HTMLElement).querySelector(
        '.desktop-feedback-fab'
      ) as HTMLButtonElement | null;
      expect(fab).not.toBeNull();
      fab!.click();

      expect(feedback.isComposerOpen()).toBe(true);
      expect(feedback.composerDefaultPage()).toBe('Pokédex Binder');
    });
  });
});
