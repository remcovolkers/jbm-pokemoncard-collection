import { Injectable, signal } from '@angular/core';

export type CollectionSortOption = 'value_desc' | 'value_asc' | 'number_asc' | 'name_asc' | 'qty_desc';

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
