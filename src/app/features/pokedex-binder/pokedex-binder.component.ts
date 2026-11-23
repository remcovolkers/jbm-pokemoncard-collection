import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getDisplaySetCode } from '../../core/domain/card-id.utils';
import {
  calculateBinderPosition,
  formatDexNumber,
  formatEur,
} from '../../core/domain/card-math.utils';
import { BinderSlotsPerPage, CollectionCard, PokedexSlot } from '../../core/domain/models';
import {
  GENERATIONS,
  extractCardIdFromChoice,
  formatBinderChoice,
} from '../../core/domain/pokedex-matching.utils';
import { HapticsService } from '../../core/platform/haptics.service';
import { ModalScrollLockService } from '../../core/platform/modal-scroll-lock.service';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';
import { PbBinderSwipeDirective } from '../../shared/directives/binder-swipe.directive';
import { PbSheetDismissDirective } from '../../shared/directives/sheet-dismiss.directive';

type StatusFilter = 'all' | 'missing' | 'in_collection' | 'in_binder' | 'upgrade';

@Component({
  selector: 'app-pokedex-binder',
  standalone: true,
  imports: [FormsModule, CardArtworkComponent, PbSheetDismissDirective, PbBinderSwipeDirective],
  templateUrl: './pokedex-binder.component.html',
  styleUrl: './pokedex-binder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PokedexBinderComponent implements OnInit {
  readonly store = inject(CollectionStore);
  private readonly scrollLock = inject(ModalScrollLockService);
  private readonly haptics = inject(HapticsService);

  readonly generations = GENERATIONS;
  readonly formatDexNumber = formatDexNumber;
  readonly formatEur = formatEur;
  readonly getDisplaySetCode = getDisplaySetCode;

  readonly selectedGen = signal<number>(1); // 0 = Alle, 1..9 = specifieke Gen
  readonly statusFilter = signal<StatusFilter>('all');
  readonly viewMode = signal<'binder' | 'checklist'>('binder');
  readonly searchQuery = signal('');
  readonly currentPage = signal<number>(1);
  readonly checklistLimit = signal<number>(60);

  // Bottom Sheet state voor slot-bewerking & variant-kiezer
  readonly activeSlot = signal<PokedexSlot | null>(null);
  readonly isSheetOpen = computed(() => this.activeSlot() !== null);
  readonly draftSelectedCard = signal<string>('');
  readonly draftInBinder = signal<boolean>(false);
  readonly draftUpgradeWanted = signal<boolean>(false);

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
      const code = getDisplaySetCode(card.cardId, card.setName);
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
    this.activeSlot.set(slot);
    this.draftInBinder.set(slot.inBinder);
    this.draftUpgradeWanted.set(slot.upgradeWanted);
    const matches = this.store.getCardsForPokemon(slot.pokemonName);
    if (slot.selectedCard) {
      this.draftSelectedCard.set(slot.selectedCard);
    } else if (matches.length > 0) {
      this.draftSelectedCard.set(formatBinderChoice(matches[0]));
    } else {
      this.draftSelectedCard.set('');
    }
  }

  closeSlotSheet(): void {
    this.activeSlot.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.activeSlot()) {
      this.closeSlotSheet();
    }
  }

  async chooseVariant(card: CollectionCard): Promise<void> {
    const slot = this.activeSlot();
    if (!slot) return;

    const alreadySelected =
      this.isChoiceSelected(card) &&
      slot.inBinder &&
      this.draftUpgradeWanted() === slot.upgradeWanted;
    if (alreadySelected) {
      this.closeSlotSheet();
      return;
    }

    this.draftSelectedCard.set(formatBinderChoice(card));
    this.draftInBinder.set(true);
    await this.confirmSlotSelection();
  }

  isChoiceSelected(card: CollectionCard): boolean {
    const choice = formatBinderChoice(card);
    if (this.draftSelectedCard() === choice) return true;
    const chosenId = extractCardIdFromChoice(this.draftSelectedCard()).toLowerCase();
    return Boolean(chosenId) && chosenId === card.cardId.toLowerCase();
  }

  async confirmSlotSelection(): Promise<void> {
    const slot = this.activeSlot();
    if (!slot) return;

    const payload = {
      dexNumber: slot.dexNumber,
      inBinder: this.draftInBinder(),
      selectedCard: this.draftSelectedCard(),
      upgradeWanted: this.draftUpgradeWanted(),
    };

    void this.haptics.success();
    this.closeSlotSheet();
    this.store.showToast(
      `${formatDexNumber(slot.dexNumber)} ${slot.pokemonName} bijgewerkt in Pokédex Binder.`,
      'success'
    );
    await this.store.updatePokedexSlot(payload);
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
