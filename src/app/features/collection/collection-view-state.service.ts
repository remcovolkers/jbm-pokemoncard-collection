import { Injectable, signal } from '@angular/core';
import { parseCardIdInput } from '../../core/domain/card-id.utils';
import { compareCardNumbers } from '../../core/domain/card-math.utils';
import { CollectionCard } from '../../core/domain/models';

export type CollectionSortOption = 'value_desc' | 'value_asc' | 'number_asc' | 'name_asc' | 'qty_desc';

export interface CollectionFilterCriteria {
  searchQuery: string;
  selectedSet: string;
  selectedLocation: string;
  selectedRarity: string;
  onlyForTrade: boolean;
  sortBy: CollectionSortOption;
}

/**
 * Filtert en sorteert Collectie-kaarten op een uniforme manier zodat Collectie en Kaartdetail
 * exact dezelfde volgorde delen (voor Vorige/Volgende kaart-navigatie).
 */
export function filterAndSortCollection(
  cards: readonly CollectionCard[],
  filters: CollectionFilterCriteria
): CollectionCard[] {
  const query = filters.searchQuery.trim().toLowerCase();
  const parsedCodeQuery = query ? parseCardIdInput(query) : null;

  const list = cards.filter((card) => {
    if (filters.selectedSet !== 'ALL' && card.setName !== filters.selectedSet) return false;
    if (filters.selectedLocation !== 'ALL' && card.storageLocation !== filters.selectedLocation) return false;
    if (filters.selectedRarity !== 'ALL' && card.rarity !== filters.selectedRarity) return false;
    if (filters.onlyForTrade && !card.forTrade) return false;
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
    switch (filters.sortBy) {
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
}

/**
 * Houdt de actieve zoek-, filter-, sorteer- en weergavekeuzes van het Collectie-overzicht vast
 * wanneer de gebruiker naar een kaartdetailpagina gaat en weer terugkeert.
 */
@Injectable({ providedIn: 'root' })
export class CollectionViewStateService {
  readonly searchQuery = signal('');
  readonly viewMode = signal<'grid' | 'list'>('grid');
  readonly sortBy = signal<CollectionSortOption>('value_desc');
  readonly selectedSet = signal<string>('ALL');
  readonly selectedLocation = signal<string>('ALL');
  readonly selectedRarity = signal<string>('ALL');
  readonly onlyForTrade = signal<boolean>(false);

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedSet.set('ALL');
    this.selectedLocation.set('ALL');
    this.selectedRarity.set('ALL');
    this.onlyForTrade.set(false);
  }
}
