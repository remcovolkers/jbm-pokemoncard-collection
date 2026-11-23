import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getDisplaySetCode } from '../../core/domain/card-id.utils';
import {
  calculateCardMetrics,
  formatEur,
  formatInteger,
  formatPercent,
} from '../../core/domain/card-math.utils';
import { CollectionCard, SetProgress } from '../../core/domain/models';
import { GENERATIONS } from '../../core/domain/pokedex-matching.utils';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CardArtworkComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  readonly store = inject(CollectionStore);
  private readonly router = inject(Router);

  readonly formatEur = formatEur;
  readonly formatPercent = formatPercent;
  readonly formatInteger = formatInteger;
  readonly getDisplaySetCode = getDisplaySetCode;

  readonly generationSummaries = computed(() => {
    const slots = this.store.pokedex();
    return GENERATIONS.map((gen) => {
      const genSlots = slots.filter((s) => s.dexNumber >= gen.start && s.dexNumber <= gen.end);
      const total = gen.end - gen.start + 1;
      const owned = genSlots.filter((s) => s.inBinder).length;
      const pct = total > 0 ? Math.round((owned / total) * 1000) / 10 : 0;
      return { ...gen, total, owned, pct };
    });
  });

  readonly topMasterSets = computed(() => this.store.activeSets().slice(0, 4));

  readonly syncedTimeAgo = computed(() => {
    const iso = this.store.syncedAt();
    if (!iso) return 'zojuist';
    const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'zojuist';
    if (mins < 60) return `${mins}m geleden`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}u geleden`;
    return new Date(iso).toLocaleDateString('nl-NL');
  });

  cardRoi(card: CollectionCard): number {
    if (card.trendPercent !== undefined) return card.trendPercent;
    return calculateCardMetrics(card).roiPercent;
  }

  openSetInCollection(set: SetProgress): void {
    this.store.requestedSetFilter.set(set.setName);
    void this.router.navigateByUrl('/collectie');
  }

  openReadyForBinder(): void {
    this.store.requestedPokedexFilter.set('in_collection');
    void this.router.navigateByUrl('/pokedex');
  }

  openCardInCollection(card: CollectionCard): void {
    this.store.requestedSetFilter.set(card.setName);
    void this.router.navigateByUrl('/collectie');
  }

  badgeLabel(card: CollectionCard): string {
    if (card.grading && card.grading !== 'Raw') {
      return `${card.grading} ${card.grade || ''}`.trim();
    }
    if (card.rarity === 'Special Illustration Rare') return 'SIR ★★★';
    if (card.rarity === 'Illustration Rare') return 'IR ★';
    if (card.rarity === 'Hyper Rare') return 'HR ★★★';
    if (card.variant === 'Alt Art') return 'Alt Art';
    return card.rarity || 'Rare';
  }

  shortCondition(cond: string): string {
    const m = cond.match(/\(([A-Z]+)\)/);
    return m ? m[1] : cond.slice(0, 3).toUpperCase();
  }
}
