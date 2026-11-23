import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  extractCardmarketUrlFromNotes,
  getDisplaySetCode,
  parseCardIdInput,
  resolveCardmarketUrl,
} from '../../core/domain/card-id.utils';
import {
  calculateCardMetrics,
  compareCardNumbers,
  formatEur,
  formatPercent,
} from '../../core/domain/card-math.utils';
import { CollectionCard, DEFAULT_DROPDOWN_SETTINGS } from '../../core/domain/models';
import { CARD_CATALOG_PORT } from '../../core/ports/card-catalog.port';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';

type SortOption = 'value_desc' | 'value_asc' | 'number_asc' | 'name_asc' | 'qty_desc';

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [FormsModule, RouterLink, CardArtworkComponent],
  templateUrl: './collection.component.html',
  styleUrl: './collection.component.scss',
})
export class CollectionComponent implements OnInit {
  readonly store = inject(CollectionStore);
  private readonly catalog = inject(CARD_CATALOG_PORT);

  readonly formatEur = formatEur;
  readonly formatPercent = formatPercent;
  readonly getDisplaySetCode = getDisplaySetCode;

  readonly searchQuery = signal('');
  readonly viewMode = signal<'grid' | 'list'>('grid');
  readonly sortBy = signal<SortOption>('value_desc');
  readonly selectedSet = signal<string>('ALL');
  readonly selectedLocation = signal<string>('ALL');
  readonly selectedRarity = signal<string>('ALL');
  readonly onlyForTrade = signal<boolean>(false);

  // Detail Bottom Sheet state
  readonly activeCard = signal<CollectionCard | null>(null);
  readonly editDraft = signal<CollectionCard | null>(null);
  readonly activeCardmarketProductId = signal<number | undefined>(undefined);
  readonly confirmDelete = signal(false);

  readonly activeCardmarketUrl = computed(() => {
    const d = this.editDraft();
    if (!d) return '';
    return resolveCardmarketUrl({
      name: d.name,
      setName: d.setName,
      cardNumber: d.cardNumber,
      cardmarketProductId: this.activeCardmarketProductId(),
      notes: d.notes,
    });
  });

  readonly availableSets = computed(() => {
    const sets = new Set(this.store.collection().map((c) => c.setName).filter(Boolean));
    return Array.from(sets).sort((a, b) => a.localeCompare(b, 'nl'));
  });

  readonly availableRarities = computed(() => {
    const rarities = new Set(this.store.collection().map((c) => c.rarity).filter(Boolean));
    return Array.from(rarities).sort((a, b) => a.localeCompare(b, 'nl'));
  });

  readonly availableLocations = computed(() => {
    const locs = new Set([
      ...this.store.settings().storageLocations,
      ...this.store.collection().map((c) => c.storageLocation).filter(Boolean),
    ]);
    return Array.from(locs);
  });

  readonly filteredCards = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const setFilter = this.selectedSet();
    const locFilter = this.selectedLocation();
    const rarityFilter = this.selectedRarity();
    const tradeOnly = this.onlyForTrade();
    const sort = this.sortBy();

    const parsedCodeQuery = query ? parseCardIdInput(query) : null;

    const list = this.store.collection().filter((card) => {
      if (setFilter !== 'ALL' && card.setName !== setFilter) return false;
      if (locFilter !== 'ALL' && card.storageLocation !== locFilter) return false;
      if (rarityFilter !== 'ALL' && card.rarity !== rarityFilter) return false;
      if (tradeOnly && !card.forTrade) return false;
      if (query) {
        const hay = `${card.name} ${card.cardId} ${card.setName} ${card.cardNumber} ${card.storageLocation} ${card.rarity} ${card.acquisitionMethod ?? ''}`.toLowerCase();
        const matchesParsedCode =
          parsedCodeQuery !== null &&
          parsedCodeQuery.candidateIds.some((cid) => cid.toLowerCase() === card.cardId.toLowerCase());
        if (!hay.includes(query) && !matchesParsedCode) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      switch (sort) {
        case 'number_asc': {
          const setCmp = a.setName.localeCompare(b.setName, 'nl');
          return setCmp !== 0 ? setCmp : compareCardNumbers(a.cardNumber, b.cardNumber);
        }
        case 'value_asc':
          return a.marketPrice - b.marketPrice;
        case 'name_asc':
          return a.name.localeCompare(b.name, 'nl');
        case 'qty_desc':
          return b.quantity - a.quantity || b.marketPrice - a.marketPrice;
        case 'value_desc':
        default:
          return b.marketPrice - a.marketPrice || compareCardNumbers(a.cardNumber, b.cardNumber);
      }
    });
  });

  readonly hasActiveFilters = computed(
    () =>
      this.searchQuery().trim().length > 0 ||
      this.selectedSet() !== 'ALL' ||
      this.selectedLocation() !== 'ALL' ||
      this.selectedRarity() !== 'ALL' ||
      this.onlyForTrade()
  );

  readonly activeDraftMetrics = computed(() => {
    const draft = this.editDraft();
    return draft ? calculateCardMetrics(draft) : null;
  });

  readonly acquisitionMethods = computed(
    () => this.store.settings().acquisitionMethods ?? DEFAULT_DROPDOWN_SETTINGS.acquisitionMethods ?? []
  );

  ngOnInit(): void {
    const requestedSet = this.store.requestedSetFilter();
    if (requestedSet) {
      this.selectedSet.set(requestedSet);
      this.store.requestedSetFilter.set(null);
    }
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedSet.set('ALL');
    this.selectedLocation.set('ALL');
    this.selectedRarity.set('ALL');
    this.onlyForTrade.set(false);
  }

  openDetail(card: CollectionCard): void {
    this.activeCard.set(card);
    this.editDraft.set({ ...card });
    this.confirmDelete.set(false);
    const cachedId = this.catalog.getCachedCardmarketProductId?.(card.cardId);
    this.activeCardmarketProductId.set(cachedId);

    if (!cachedId && card.cardId && !extractCardmarketUrlFromNotes(card.notes)) {
      void this.resolveProductIdForDetail(card.cardId);
    }
  }

  private async resolveProductIdForDetail(cardId: string): Promise<void> {
    try {
      const found =
        (await this.catalog.getCardByExactId(cardId)) ??
        (await this.catalog.lookupByCardId(cardId));
      if (found?.cardmarketProductId && this.activeCard()?.cardId === cardId) {
        this.activeCardmarketProductId.set(found.cardmarketProductId);
      }
    } catch {
      // Offline of onbekend ID: Singles-zoeklink blijft als fallback actief
    }
  }

  closeDetail(): void {
    this.activeCard.set(null);
    this.editDraft.set(null);
    this.activeCardmarketProductId.set(undefined);
    this.confirmDelete.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.activeCard()) {
      this.closeDetail();
    }
  }

  patchDraft(patch: Partial<CollectionCard>): void {
    this.editDraft.update((prev) => (prev ? { ...prev, ...patch } : null));
  }

  toggleDraftAcquisitionMethod(method: string): void {
    this.editDraft.update((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        acquisitionMethod: prev.acquisitionMethod === method ? '' : method,
      };
    });
  }

  onDraftPurchasePriceChange(value: unknown): void {
    const num = Number(value);
    const nextPrice =
      value === '' || value === null || value === undefined || !Number.isFinite(num)
        ? 0
        : Math.max(0, num);
    this.patchDraft({ purchasePrice: nextPrice });
  }

  adjustDraftQty(delta: number): void {
    this.editDraft.update((prev) =>
      prev ? { ...prev, quantity: Math.max(1, (prev.quantity || 1) + delta) } : null
    );
  }

  async saveDraft(): Promise<void> {
    const orig = this.activeCard();
    const draft = this.editDraft();
    if (!orig || !draft) return;

    await this.store.updateCard(orig.rowIndex, orig.cardId, {
      quantity: draft.quantity,
      variant: draft.variant,
      condition: draft.condition,
      grading: draft.grading,
      grade: draft.grading === 'Raw' ? '' : draft.grade,
      storageLocation: draft.storageLocation,
      binderDetail: draft.binderDetail,
      purchasePrice: Number(draft.purchasePrice) || 0,
      marketPrice: Number(draft.marketPrice) || 0,
      acquisitionMethod: (draft.acquisitionMethod ?? '').trim(),
      forTrade: draft.forTrade,
      notes: draft.notes,
    });
    this.store.showToast(`${draft.name} bijgewerkt.`, 'success');
    this.closeDetail();
  }

  async deleteActiveCard(): Promise<void> {
    const card = this.activeCard();
    if (!card) return;
    await this.store.deleteCard(card);
    this.closeDetail();
  }

  isHoloCard(card: CollectionCard): boolean {
    return (
      card.rarity === 'Special Illustration Rare' ||
      card.rarity === 'Illustration Rare' ||
      card.rarity === 'Hyper Rare' ||
      card.variant === 'Alt Art'
    );
  }

  cardRoi(card: CollectionCard): number {
    if (card.trendPercent !== undefined) return card.trendPercent;
    return calculateCardMetrics(card).roiPercent;
  }

  shortCondition(cond: string): string {
    const m = cond.match(/\(([A-Z]+)\)/);
    return m ? m[1] : cond.slice(0, 2).toUpperCase();
  }

  shortCardNumber(num: string): string {
    return num.split('/')[0] || num;
  }
}
