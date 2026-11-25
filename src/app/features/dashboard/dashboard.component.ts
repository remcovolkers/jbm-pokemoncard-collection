import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getCardSetCode, getDisplaySetCode } from '../../core/domain/card-id.utils';
import {
  calculateCardMetrics,
  formatEur,
  formatInteger,
  formatPercent,
} from '../../core/domain/card-math.utils';
import {
  ShowcaseCardViewModel,
  buildShowcaseFromCollectionCard,
  isCollectionCardShowcaseEligible,
} from '../../core/domain/card-showcase.utils';
import { CollectionCard, SetProgress } from '../../core/domain/models';
import { GENERATIONS } from '../../core/domain/pokedex-matching.utils';
import { HapticsService } from '../../core/platform/haptics.service';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';
import { CardShowcaseComponent } from '../../shared/card-showcase/card-showcase.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CardArtworkComponent, CardShowcaseComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  readonly store = inject(CollectionStore);
  private readonly router = inject(Router);
  private readonly haptics = inject(HapticsService);

  readonly formatEur = formatEur;
  readonly formatPercent = formatPercent;
  readonly formatInteger = formatInteger;
  readonly getDisplaySetCode = getDisplaySetCode;
  readonly getCardSetCode = getCardSetCode;

  readonly showcaseCardKey = signal<string | null>(null);

  readonly showcaseTopCards = computed(() =>
    this.store.topValuableCards().filter((c) => isCollectionCardShowcaseEligible(c))
  );

  readonly activeShowcaseCard = computed<CollectionCard | null>(() => {
    const key = this.showcaseCardKey();
    if (!key) return null;
    return this.showcaseTopCards().find((c) => `${c.rowIndex}:${c.cardId}` === key) ?? null;
  });

  readonly activeShowcaseIndex = computed(() => {
    const active = this.activeShowcaseCard();
    if (!active) return -1;
    return this.showcaseTopCards().findIndex(
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
    const prev = this.showcaseTopCards()[idx - 1];
    if (prev) this.showcaseCardKey.set(`${prev.rowIndex}:${prev.cardId}`);
  }

  showcaseNext(): void {
    const idx = this.activeShowcaseIndex();
    const list = this.showcaseTopCards();
    if (idx < 0 || idx >= list.length - 1) return;
    const next = list[idx + 1];
    if (next) this.showcaseCardKey.set(`${next.rowIndex}:${next.cardId}`);
  }

  openActiveShowcaseDetail(): void {
    const active = this.activeShowcaseCard();
    if (!active) return;
    this.closeShowcase();
    this.openCardInCollection(active);
  }

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

  readonly showSyncStrip = computed(() => {
    const status = this.store.syncStatus();
    return (
      status === 'unconfigured' ||
      status === 'offline' ||
      status === 'error' ||
      this.store.pendingQueue().length > 0
    );
  });

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

  hasPurchasePrice(card: CollectionCard): boolean {
    return (Number(card.purchasePrice) || 0) > 0;
  }

  cardRoi(card: CollectionCard): number {
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

  openGenInBinder(genId: number): void {
    this.store.requestedPokedexGen.set(genId);
    void this.router.navigateByUrl('/pokedex');
  }

  openCardInCollection(card: CollectionCard): void {
    void this.router.navigate(['/collectie/kaart', card.rowIndex, card.cardId]);
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
