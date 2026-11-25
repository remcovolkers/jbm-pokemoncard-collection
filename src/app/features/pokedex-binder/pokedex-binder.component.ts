import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { getCardSetCode, getDisplaySetCode, resolveCardmarketUrl } from '../../core/domain/card-id.utils';
import { normalizeLanguageCode } from '../../core/domain/card-language.utils';
import {
  calculateBinderPosition,
  calculateCardMetrics,
  formatDexNumber,
  formatEur,
  formatPercent,
} from '../../core/domain/card-math.utils';
import {
  ShowcaseCardViewModel,
  buildShowcaseFromCollectionCard,
  isCollectionCardShowcaseEligible,
} from '../../core/domain/card-showcase.utils';
import { BinderSlotsPerPage, CollectionCard, PokedexSlot } from '../../core/domain/models';
import {
  GENERATIONS,
  extractCardIdFromChoice,
  formatBinderChoice,
} from '../../core/domain/pokedex-matching.utils';
import { HapticsService } from '../../core/platform/haptics.service';
import { isEditableEventTarget } from '../../core/platform/keyboard.utils';
import { ModalScrollLockService } from '../../core/platform/modal-scroll-lock.service';
import { CARD_CATALOG_PORT } from '../../core/ports/card-catalog.port';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';
import { CardShowcaseComponent } from '../../shared/card-showcase/card-showcase.component';
import { PbBinderSwipeDirective } from '../../shared/directives/binder-swipe.directive';
import { PbSheetDismissDirective } from '../../shared/directives/sheet-dismiss.directive';

type StatusFilter = 'all' | 'missing' | 'in_collection' | 'in_binder' | 'upgrade';

@Component({
  selector: 'app-pokedex-binder',
  standalone: true,
  imports: [
    FormsModule,
    CardArtworkComponent,
    CardShowcaseComponent,
    PbSheetDismissDirective,
    PbBinderSwipeDirective,
  ],
  templateUrl: './pokedex-binder.component.html',
  styleUrl: './pokedex-binder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PokedexBinderComponent implements OnInit {
  readonly store = inject(CollectionStore);
  private readonly router = inject(Router);
  private readonly scrollLock = inject(ModalScrollLockService);
  private readonly haptics = inject(HapticsService);
  private readonly catalog = inject(CARD_CATALOG_PORT, { optional: true });

  readonly generations = GENERATIONS;
  readonly formatDexNumber = formatDexNumber;
  readonly formatEur = formatEur;
  readonly formatPercent = formatPercent;
  readonly normalizeLanguageCode = normalizeLanguageCode;
  readonly getDisplaySetCode = getDisplaySetCode;
  readonly getCardSetCode = getCardSetCode;

  readonly selectedGen = signal<number>(1); // 0 = Alle, 1..9 = specifieke Gen
  readonly statusFilter = signal<StatusFilter>('all');
  readonly viewMode = signal<'binder' | 'checklist'>('binder');
  readonly searchQuery = signal('');
  readonly currentPage = signal<number>(1);
  readonly checklistLimit = signal<number>(60);

  // Bottom Sheet state voor slot-bewerking & variant-kiezer
  readonly activeDexNumber = signal<number | null>(null);
  /** Het actieve vakje volgt live de store, zodat schakelaars direct zichtbaar zijn zonder "Bevestig selectie". */
  readonly activeSlot = computed<PokedexSlot | null>(() => {
    const dex = this.activeDexNumber();
    if (dex === null) return null;
    return this.store.pokedex().find((s) => s.dexNumber === dex) ?? null;
  });
  readonly isSheetOpen = computed(() => this.activeSlot() !== null);
  /** Gevulde vakjes (op volgorde van de huidige lijst) waartussen je kunt bladeren met Vorige/Volgende of swipen. */
  private readonly navDexNumbers = signal<number[]>([]);
  readonly showcaseCardKey = signal<string | null>(null);

  constructor() {
    this.scrollLock.bind(() => this.isSheetOpen(), () => this.closeSlotSheet());
  }

  readonly slotsPerPage = computed(() => this.store.binderSlotsPerPage());

  readonly gridCols = computed(() => {
    const spp = this.slotsPerPage();
    if (spp === 4) return 2;
    if (spp === 9) return 3;
    if (spp === 20) return 5;
    return 4; // 12 (4x3) en 16 (4x4)
  });

  // Live teller per generatie voor generatie-chips
  readonly generationCounts = computed(() => {
    const all = this.store.pokedex();
    const map = new Map<number, { owned: number; total: number }>();
    for (const g of GENERATIONS) {
      const slice = all.filter((s) => s.dexNumber >= g.start && s.dexNumber <= g.end);
      map.set(g.id, {
        owned: slice.filter((s) => s.inBinder).length,
        total: g.end - g.start + 1,
      });
    }
    return map;
  });

  // Kaart-lookup map per cardId voor snelle artwork-resolutie in de binder
  readonly cardByIdMap = computed(() => {
    const map = new Map<string, CollectionCard>();
    for (const card of this.store.collection()) {
      const key = card.cardId.toLowerCase();
      if (!map.has(key)) map.set(key, card);
    }
    return map;
  });

  // Gefilterde slots op basis van generatie + zoekveld (vóór statusfilter, voor live status-tellers)
  readonly genScopedSlots = computed(() => {
    const genId = this.selectedGen();
    const q = this.searchQuery().trim().toLowerCase();
    const all = this.store.pokedex();

    return all.filter((slot) => {
      if (genId > 0) {
        const gen = GENERATIONS.find((g) => g.id === genId);
        if (gen && (slot.dexNumber < gen.start || slot.dexNumber > gen.end)) return false;
      }
      if (q) {
        const numStr = String(slot.dexNumber);
        const padded = formatDexNumber(slot.dexNumber).toLowerCase();
        if (
          !slot.pokemonName.toLowerCase().includes(q) &&
          !numStr.includes(q) &&
          !padded.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  });

  readonly statusCounts = computed(() => {
    const list = this.genScopedSlots();
    return {
      all: list.length,
      missing: list.filter((s) => !s.inBinder && s.inCollectionCount === 0).length,
      inCollection: list.filter((s) => !s.inBinder && s.inCollectionCount > 0).length,
      inBinder: list.filter((s) => s.inBinder).length,
      upgrade: list.filter((s) => s.upgradeWanted).length,
    };
  });

  readonly filteredSlots = computed(() => {
    const status = this.statusFilter();
    const list = this.genScopedSlots();
    switch (status) {
      case 'missing':
        return list.filter((s) => !s.inBinder && s.inCollectionCount === 0);
      case 'in_collection':
        return list.filter((s) => !s.inBinder && s.inCollectionCount > 0);
      case 'in_binder':
        return list.filter((s) => s.inBinder);
      case 'upgrade':
        return list.filter((s) => s.upgradeWanted);
      default:
        return list;
    }
  });

  readonly totalPages = computed(() => {
    const count = this.filteredSlots().length;
    return Math.max(1, Math.ceil(count / this.slotsPerPage()));
  });

  readonly clampedPage = computed(() => Math.min(Math.max(1, this.currentPage()), this.totalPages()));

  readonly pageSlots = computed(() => {
    const spp = this.slotsPerPage();
    const page = this.clampedPage();
    const start = (page - 1) * spp;
    return this.filteredSlots().slice(start, start + spp);
  });

  readonly pageStats = computed(() => {
    const slots = this.pageSlots();
    const filled = slots.filter((s) => s.inBinder).length;
    const total = slots.length;
    const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
    return { filled, total, pct };
  });

  readonly visibleChecklist = computed(() => this.filteredSlots().slice(0, this.checklistLimit()));

  // Eerste kaart die al in Collectie zit maar nog niet in de Binder is geplaatst
  readonly nextReadyToPlace = computed(() => {
    return this.store.pokedex().find((s) => !s.inBinder && s.inCollectionCount > 0) ?? null;
  });

  readonly activeSlotMatchingCards = computed(() => {
    const slot = this.activeSlot();
    if (!slot) return [];
    return this.store.getCardsForPokemon(slot.pokemonName);
  });

  readonly activeSlotPosition = computed(() => {
    const slot = this.activeSlot();
    if (!slot) return null;
    return calculateBinderPosition(slot.dexNumber, this.slotsPerPage());
  });

  ngOnInit(): void {
    const requested = this.store.requestedPokedexFilter();
    if (requested) {
      this.selectedGen.set(0);
      this.statusFilter.set(requested);
      this.currentPage.set(1);
      this.store.requestedPokedexFilter.set(null);
    }
    const requestedGen = this.store.requestedPokedexGen();
    if (requestedGen !== null) {
      this.selectedGen.set(requestedGen);
      this.currentPage.set(1);
      this.checklistLimit.set(60);
      this.store.requestedPokedexGen.set(null);
    }
  }

  selectGeneration(genId: number): void {
    this.selectedGen.set(genId);
    this.currentPage.set(1);
    this.checklistLimit.set(60);
  }

  selectStatus(status: StatusFilter): void {
    this.statusFilter.set(status);
    this.currentPage.set(1);
    this.checklistLimit.set(60);
  }

  onSearchChange(q: string): void {
    this.searchQuery.set(q);
    this.currentPage.set(1);
  }

  async changeSlotsPerPage(rawValue: string | number): Promise<void> {
    const val = Number(rawValue) as BinderSlotsPerPage;
    if (val === 4 || val === 9 || val === 12 || val === 16 || val === 20) {
      await this.store.updatePokedexSlot({ slotsPerPage: val });
      this.currentPage.set(1);
    }
  }

  prevPage(): void {
    const prev = this.clampedPage();
    const next = Math.max(1, prev - 1);
    if (next !== prev) void this.haptics.light();
    this.currentPage.set(next);
  }

  nextPage(): void {
    const prev = this.clampedPage();
    const next = Math.min(this.totalPages(), prev + 1);
    if (next !== prev) void this.haptics.light();
    this.currentPage.set(next);
  }

  jumpToPage(pageValue: number | string): void {
    const num = parseInt(String(pageValue), 10);
    if (!Number.isNaN(num)) {
      this.currentPage.set(Math.min(this.totalPages(), Math.max(1, num)));
    }
  }

  loadMoreChecklist(): void {
    this.checklistLimit.update((n) => n + 80);
  }

  getSlotCard(slot: PokedexSlot): CollectionCard | null {
    const cardId = extractCardIdFromChoice(slot.selectedCard);
    if (cardId) {
      const found = this.cardByIdMap().get(cardId.toLowerCase());
      if (found) return found;
    }
    if (slot.inCollectionCount > 0) {
      const matches = this.store.getCardsForPokemon(slot.pokemonName);
      return matches[0] ?? null;
    }
    return null;
  }

  shortChoiceLabel(slot: PokedexSlot): string {
    const card = this.getSlotCard(slot);
    if (card) {
      const code = getCardSetCode(card);
      const num = card.cardNumber.split('/')[0] || '';
      const shortRar =
        card.rarity === 'Special Illustration Rare'
          ? 'SIR'
          : card.rarity === 'Illustration Rare'
            ? 'IR'
            : card.rarity === 'Double Rare'
              ? 'RR'
              : card.rarity === 'Ultra Rare'
                ? 'UR'
                : '';
      return `${code} ${num} ${shortRar}`.trim();
    }
    if (slot.selectedCard) return slot.selectedCard;
    return slot.inBinder ? 'Losse kaart' : 'Ontbreekt';
  }

  openSlotSheet(slot: PokedexSlot): void {
    this.activeDexNumber.set(slot.dexNumber);
    const filled = this.filteredSlots()
      .filter((s) => this.slotIsFilled(s))
      .map((s) => s.dexNumber);
    // Zorg dat het geopende vakje altijd in de bladerlijst zit
    const includeActive = this.slotIsFilled(slot) && !filled.includes(slot.dexNumber);
    this.navDexNumbers.set(includeActive ? [...filled, slot.dexNumber] : filled);
  }

  closeSlotSheet(): void {
    this.showcaseCardKey.set(null);
    this.activeDexNumber.set(null);
  }

  private slotIsFilled(slot: PokedexSlot): boolean {
    return slot.inBinder || slot.inCollectionCount > 0;
  }

  /** De kaart die in de Hero-kaartview getoond wordt: gekozen versie, anders de eerste passende kaart. */
  readonly heroCard = computed<CollectionCard | null>(() => {
    const slot = this.activeSlot();
    if (!slot) return null;
    const matches = this.activeSlotMatchingCards();
    if (slot.selectedCard) {
      const exact = matches.find((c) => formatBinderChoice(c) === slot.selectedCard);
      if (exact) return exact;
      const chosenId = extractCardIdFromChoice(slot.selectedCard).toLowerCase();
      const byId = matches.find((c) => c.cardId.toLowerCase() === chosenId) ?? this.cardByIdMap().get(chosenId);
      if (byId) return byId;
    }
    return matches[0] ?? null;
  });

  readonly heroMetrics = computed(() => {
    const card = this.heroCard();
    return card ? calculateCardMetrics(card) : null;
  });

  readonly heroCardmarketUrl = computed(() => {
    const card = this.heroCard();
    if (!card) return '';
    return resolveCardmarketUrl({
      name: card.name,
      setName: card.setName,
      cardNumber: card.cardNumber,
      cardmarketProductId: this.catalog?.getCachedCardmarketProductId?.(card.cardId),
      notes: card.notes,
      language: card.language,
    });
  });

  readonly navIndex = computed(() => {
    const dex = this.activeDexNumber();
    return dex === null ? -1 : this.navDexNumbers().indexOf(dex);
  });

  readonly navTotal = computed(() => this.navDexNumbers().length);

  readonly prevNavDex = computed<number | null>(() => {
    const idx = this.navIndex();
    return idx > 0 ? (this.navDexNumbers()[idx - 1] ?? null) : null;
  });

  readonly nextNavDex = computed<number | null>(() => {
    const idx = this.navIndex();
    const list = this.navDexNumbers();
    return idx >= 0 && idx < list.length - 1 ? (list[idx + 1] ?? null) : null;
  });

  goToSlot(dexNumber: number | null): void {
    if (dexNumber === null) return;
    if (!this.store.pokedex().some((s) => s.dexNumber === dexNumber)) return;
    void this.haptics.light();
    this.showcaseCardKey.set(null);
    this.activeDexNumber.set(dexNumber);
  }

  /** Slaat "Upgrade gewenst" direct op bij aantikken (geen aparte bevestigknop). */
  async toggleUpgradeWanted(): Promise<void> {
    const slot = this.activeSlot();
    if (!slot) return;
    void this.haptics.light();
    await this.store.updatePokedexSlot({ dexNumber: slot.dexNumber, upgradeWanted: !slot.upgradeWanted });
  }

  /** Markeert het vakje direct als wel/niet in de fysieke binder geplaatst. */
  async toggleInBinder(): Promise<void> {
    const slot = this.activeSlot();
    if (!slot) return;
    void this.haptics.light();
    const next = !slot.inBinder;
    const hero = this.heroCard();
    await this.store.updatePokedexSlot({
      dexNumber: slot.dexNumber,
      inBinder: next,
      ...(next && !slot.selectedCard && hero ? { selectedCard: formatBinderChoice(hero) } : {}),
    });
  }

  /** Bewerken (aantal, conditie, verwijderen…) gebeurt op het Kaartdetail in de Collectie. */
  editInCollection(card: CollectionCard): void {
    void this.haptics.light();
    this.closeSlotSheet();
    void this.router.navigate(['/collectie/kaart', card.rowIndex, card.cardId]);
  }

  readonly showcaseSlotCards = computed(() =>
    this.activeSlotMatchingCards().filter((c) => isCollectionCardShowcaseEligible(c))
  );

  readonly activeShowcaseCard = computed<CollectionCard | null>(() => {
    const key = this.showcaseCardKey();
    if (!key) return null;
    return this.showcaseSlotCards().find((c) => `${c.rowIndex}:${c.cardId}` === key) ?? null;
  });

  readonly activeShowcaseIndex = computed(() => {
    const active = this.activeShowcaseCard();
    if (!active) return -1;
    return this.showcaseSlotCards().findIndex(
      (c) => c.rowIndex === active.rowIndex && c.cardId === active.cardId
    );
  });

  readonly activeShowcaseVm = computed<ShowcaseCardViewModel | null>(() => {
    const active = this.activeShowcaseCard();
    return active ? buildShowcaseFromCollectionCard(active) : null;
  });

  isShowcaseEligible(card: CollectionCard): boolean {
    return isCollectionCardShowcaseEligible(card);
  }

  openShowcase(card: CollectionCard): void {
    if (!this.isShowcaseEligible(card)) return;
    void this.haptics.light();
    this.showcaseCardKey.set(`${card.rowIndex}:${card.cardId}`);
  }

  closeShowcase(): void {
    this.showcaseCardKey.set(null);
  }

  showcasePrev(): void {
    const idx = this.activeShowcaseIndex();
    if (idx <= 0) return;
    const prev = this.showcaseSlotCards()[idx - 1];
    if (prev) this.showcaseCardKey.set(`${prev.rowIndex}:${prev.cardId}`);
  }

  showcaseNext(): void {
    const idx = this.activeShowcaseIndex();
    const list = this.showcaseSlotCards();
    if (idx < 0 || idx >= list.length - 1) return;
    const next = list[idx + 1];
    if (next) this.showcaseCardKey.set(`${next.rowIndex}:${next.cardId}`);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.activeShowcaseCard()) {
      this.closeShowcase();
      return;
    }
    if (this.activeSlot()) {
      this.closeSlotSheet();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.activeShowcaseCard() || isEditableEventTarget(event.target)) return;
    if (this.activeSlot()) {
      if (event.key === 'ArrowLeft' && this.prevNavDex() !== null) {
        event.preventDefault();
        this.goToSlot(this.prevNavDex());
      } else if (event.key === 'ArrowRight' && this.nextNavDex() !== null) {
        event.preventDefault();
        this.goToSlot(this.nextNavDex());
      }
      return;
    }
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const input = document.getElementById('dex-search-input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
      return;
    }
    if (this.viewMode() === 'binder') {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.prevPage();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.nextPage();
      }
    }
  }

  addMissingPokemon(slot: PokedexSlot): void {
    void this.haptics.light();
    this.closeSlotSheet();
    this.store.requestedQuickAddSearch.set({ mode: 'name', query: slot.pokemonName });
    void this.router.navigateByUrl('/toevoegen');
  }

  /** Wisselt direct naar een andere versie van deze Pokémon (1 tik, zonder bevestigen). */
  async chooseVariant(card: CollectionCard): Promise<void> {
    const slot = this.activeSlot();
    if (!slot) return;
    if (this.isChoiceSelected(card) && slot.inBinder) return;

    void this.haptics.light();
    await this.store.updatePokedexSlot({
      dexNumber: slot.dexNumber,
      inBinder: true,
      selectedCard: formatBinderChoice(card),
    });
  }

  isChoiceSelected(card: CollectionCard): boolean {
    const hero = this.heroCard();
    return Boolean(hero) && hero!.rowIndex === card.rowIndex && hero!.cardId === card.cardId;
  }

  async quickPlaceReadySlot(slot: PokedexSlot): Promise<void> {
    void this.haptics.success();
    const matches = this.store.getCardsForPokemon(slot.pokemonName);
    const choice = matches.length > 0 ? formatBinderChoice(matches[0]) : slot.selectedCard;
    await this.store.updatePokedexSlot({
      dexNumber: slot.dexNumber,
      inBinder: true,
      selectedCard: choice,
    });
    this.store.showToast(
      `${formatDexNumber(slot.dexNumber)} ${slot.pokemonName} in je Pokédex Binder geplaatst!`,
      'success'
    );
  }

  rarityShort(card: CollectionCard): string {
    switch (card.rarity) {
      case 'Special Illustration Rare':
        return 'SIR';
      case 'Illustration Rare':
        return 'IR';
      case 'Double Rare':
        return 'RR';
      case 'Ultra Rare':
        return 'UR';
      case 'Hyper Rare':
        return 'HR';
      case 'Vintage Holo':
        return 'VINTAGE';
      case 'Promo':
        return 'PROMO';
      default:
        return card.rarity.slice(0, 6).toUpperCase();
    }
  }
}
