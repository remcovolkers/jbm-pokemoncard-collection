import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { getDisplaySetCode } from '../../core/domain/card-id.utils';
import { calculateCardMetrics, formatEur, formatPercent, roundCurrency } from '../../core/domain/card-math.utils';
import { CollectionCard } from '../../core/domain/models';
import { HapticsService } from '../../core/platform/haptics.service';
import { isEditableEventTarget } from '../../core/platform/keyboard.utils';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';
import { CollectionViewStateService, filterAndSortCollection } from './collection-view-state.service';

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [FormsModule, RouterLink, CardArtworkComponent],
  templateUrl: './collection.component.html',
  styleUrl: './collection.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionComponent implements OnInit {
  readonly store = inject(CollectionStore);
  private readonly viewState = inject(CollectionViewStateService);
  private readonly router = inject(Router);
  private readonly haptics = inject(HapticsService);

  readonly formatEur = formatEur;
  readonly formatPercent = formatPercent;
  readonly getDisplaySetCode = getDisplaySetCode;

  readonly searchQuery = this.viewState.searchQuery;
  readonly viewMode = this.viewState.viewMode;
  readonly sortBy = this.viewState.sortBy;
  readonly selectedSet = this.viewState.selectedSet;
  readonly selectedLocation = this.viewState.selectedLocation;
  readonly selectedRarity = this.viewState.selectedRarity;
  readonly onlyForTrade = this.viewState.onlyForTrade;

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

  readonly filteredCards = computed(() =>
    filterAndSortCollection(this.store.collection(), {
      searchQuery: this.searchQuery(),
      selectedSet: this.selectedSet(),
      selectedLocation: this.selectedLocation(),
      selectedRarity: this.selectedRarity(),
      onlyForTrade: this.onlyForTrade(),
      sortBy: this.sortBy(),
    })
  );

  readonly filteredStats = computed(() => {
    const cards = this.filteredCards();
    let totalCopies = 0;
    let totalValue = 0;
    for (const card of cards) {
      const qty = Math.max(1, Number(card.quantity) || 1);
      totalCopies += qty;
      totalValue += (Number(card.marketPrice) || 0) * qty;
    }
    return {
      uniqueCards: cards.length,
      totalCopies,
      totalValue: roundCurrency(totalValue),
    };
  });

  readonly hasActiveFilters = computed(
    () =>
      this.searchQuery().trim().length > 0 ||
      this.selectedSet() !== 'ALL' ||
      this.selectedLocation() !== 'ALL' ||
      this.selectedRarity() !== 'ALL' ||
      this.onlyForTrade()
  );

  ngOnInit(): void {
    const requestedSet = this.store.requestedSetFilter();
    if (requestedSet) {
      this.selectedSet.set(requestedSet);
      this.store.requestedSetFilter.set(null);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditableEventTarget(event.target)) return;
    event.preventDefault();
    const input = document.getElementById('col-search-input') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }

  resetFilters(): void {
    this.viewState.resetFilters();
  }

  openDetail(card: CollectionCard): void {
    void this.haptics.light();
    void this.router.navigate(['/collectie/kaart', card.rowIndex, card.cardId]);
  }

  isHoloCard(card: CollectionCard): boolean {
    return (
      card.rarity === 'Special Illustration Rare' ||
      card.rarity === 'Illustration Rare' ||
      card.rarity === 'Hyper Rare' ||
      card.variant === 'Alt Art'
    );
  }

  hasPurchasePrice(card: Pick<CollectionCard, 'purchasePrice'>): boolean {
    return (Number(card.purchasePrice) || 0) > 0;
  }

  cardRoi(card: CollectionCard): number {
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
