import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  extractCardmarketUrlFromNotes,
  getDisplaySetCode,
  resolveCardmarketUrl,
} from '../../core/domain/card-id.utils';
import { calculateCardMetrics, formatEur, formatPercent } from '../../core/domain/card-math.utils';
import { CollectionCard, DEFAULT_DROPDOWN_SETTINGS } from '../../core/domain/models';
import { HapticsService } from '../../core/platform/haptics.service';
import { PlatformService } from '../../core/platform/platform.service';
import { CARD_CATALOG_PORT } from '../../core/ports/card-catalog.port';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';

@Component({
  selector: 'app-card-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, CardArtworkComponent],
  templateUrl: './card-detail.component.html',
  styleUrl: './card-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardDetailComponent {
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(CollectionStore);
  private readonly catalog = inject(CARD_CATALOG_PORT);
  private readonly haptics = inject(HapticsService);
  private readonly platform = inject(PlatformService);

  readonly formatEur = formatEur;
  readonly formatPercent = formatPercent;
  readonly getDisplaySetCode = getDisplaySetCode;

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly activeCard = computed<CollectionCard | null>(() => {
    const params = this.paramMap();
    const rowParam = Number(params.get('rowIndex'));
    const cardId = params.get('cardId') ?? '';
    const cards = this.store.collection();

    if (!cardId) return null;

    if (Number.isFinite(rowParam)) {
      const exact = cards.find((c) => c.rowIndex === rowParam && c.cardId === cardId);
      if (exact) return exact;
    }

    return cards.find((c) => c.cardId === cardId) ?? null;
  });

  readonly editDraft = signal<CollectionCard | null>(null);
  readonly activeCardmarketProductId = signal<number | undefined>(undefined);
  readonly confirmDelete = signal(false);

  private loadedCardKey: string | null = null;

  constructor() {
    effect(() => {
      const card = this.activeCard();
      if (!card) {
        this.loadedCardKey = null;
        this.editDraft.set(null);
        this.activeCardmarketProductId.set(undefined);
        this.confirmDelete.set(false);
        return;
      }

      const key = `${card.rowIndex}:${card.cardId}`;
      if (this.loadedCardKey === key) return;
      this.loadedCardKey = key;

      this.editDraft.set({
        ...card,
        purchasePrice: Math.max(0, Number(card.purchasePrice) || 0),
      });
      this.confirmDelete.set(false);

      const cachedId = this.catalog.getCachedCardmarketProductId?.(card.cardId);
      this.activeCardmarketProductId.set(cachedId);

      if (!cachedId && card.cardId && !extractCardmarketUrlFromNotes(card.notes)) {
        void this.resolveProductIdForDetail(card.cardId);
      }
    });
  }

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

  readonly activeDraftMetrics = computed(() => {
    const draft = this.editDraft();
    return draft ? calculateCardMetrics(draft) : null;
  });

  readonly acquisitionMethods = computed(
    () => this.store.settings().acquisitionMethods ?? DEFAULT_DROPDOWN_SETTINGS.acquisitionMethods ?? []
  );

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

  goBack(): void {
    this.platform.goBackFromStack();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.goBack();
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

  normalizeDraftPurchasePriceInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const draft = this.editDraft();
    if (input && draft) {
      input.value = String(draft.purchasePrice);
    }
  }

  adjustDraftQty(delta: number): void {
    void this.haptics.light();
    this.editDraft.update((prev) =>
      prev ? { ...prev, quantity: Math.max(1, (prev.quantity || 1) + delta) } : null
    );
  }

  async saveDraft(): Promise<void> {
    const orig = this.activeCard();
    const draft = this.editDraft();
    if (!orig || !draft) return;

    void this.haptics.success();
    const cardName = draft.name;
    const patch: Partial<CollectionCard> = {
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
    };

    this.goBack();
    this.store.showToast(`${cardName} bijgewerkt.`, 'success');
    await this.store.updateCard(orig.rowIndex, orig.cardId, patch);
  }

  async deleteActiveCard(): Promise<void> {
    const card = this.activeCard();
    if (!card) return;
    void this.haptics.warning();
    this.goBack();
    await this.store.deleteCard(card);
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

  shortCondition(cond: string): string {
    const m = cond.match(/\(([A-Z]+)\)/);
    return m ? m[1] : cond.slice(0, 2).toUpperCase();
  }
}
