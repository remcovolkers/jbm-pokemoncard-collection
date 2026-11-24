import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { getDisplaySetCode, parseCardIdInput } from '../../core/domain/card-id.utils';
import { calculateCardMetrics, compareCardNumbers, formatEur, formatPercent } from '../../core/domain/card-math.utils';
import { CollectionCard } from '../../core/domain/models';
import { HapticsService } from '../../core/platform/haptics.service';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';
import { CollectionViewStateService } from './collection-view-state.service';

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

  ngOnInit(): void {
    const requestedSet = this.store.requestedSetFilter();
    if (requestedSet) {
      this.selectedSet.set(requestedSet);
      this.store.requestedSetFilter.set(null);
    }
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
