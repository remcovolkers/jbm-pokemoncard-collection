import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  extractCardmarketUrlFromNotes,
  getDisplaySetCode,
  resolveCardmarketUrl,
} from '../../core/domain/card-id.utils';
import { calculateCardMetrics, formatEur, formatPercent } from '../../core/domain/card-math.utils';
import { CollectionCard, DEFAULT_DROPDOWN_SETTINGS } from '../../core/domain/models';
import { HapticsService } from '../../core/platform/haptics.service';
import { isEditableEventTarget } from '../../core/platform/keyboard.utils';
import { ModalScrollLockService } from '../../core/platform/modal-scroll-lock.service';
import { PlatformService } from '../../core/platform/platform.service';
import { CARD_CATALOG_PORT } from '../../core/ports/card-catalog.port';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';
import { CollectionViewStateService, filterAndSortCollection } from './collection-view-state.service';

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
  private readonly router = inject(Router);
  readonly store = inject(CollectionStore);
  private readonly viewState = inject(CollectionViewStateService);
  private readonly catalog = inject(CARD_CATALOG_PORT);
  private readonly scrollLock = inject(ModalScrollLockService);
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

  readonly orderedCards = computed<CollectionCard[]>(() => {
    const all = this.store.collection();
    const filtered = filterAndSortCollection(all, {
      searchQuery: this.viewState.searchQuery(),
      selectedSet: this.viewState.selectedSet(),
      selectedLocation: this.viewState.selectedLocation(),
      selectedRarity: this.viewState.selectedRarity(),
      onlyForTrade: this.viewState.onlyForTrade(),
      sortBy: this.viewState.sortBy(),
    });
    const current = this.activeCard();
    if (
      current &&
      filtered.some((c) => c.rowIndex === current.rowIndex && c.cardId === current.cardId)
    ) {
      return filtered;
    }
    return all;
  });

  readonly currentCardIndex = computed(() => {
    const current = this.activeCard();
    if (!current) return -1;
    const list = this.orderedCards();
    const exactIdx = list.findIndex(
      (c) => c.rowIndex === current.rowIndex && c.cardId === current.cardId
    );
    if (exactIdx !== -1) return exactIdx;
    return list.findIndex((c) => c.cardId === current.cardId);
  });

  readonly prevCard = computed<CollectionCard | null>(() => {
    const idx = this.currentCardIndex();
    if (idx <= 0) return null;
    return this.orderedCards()[idx - 1] ?? null;
  });

  readonly nextCard = computed<CollectionCard | null>(() => {
    const idx = this.currentCardIndex();
    const list = this.orderedCards();
    if (idx < 0 || idx >= list.length - 1) return null;
    return list[idx + 1] ?? null;
  });

  readonly editDraft = signal<CollectionCard | null>(null);
  readonly activeCardmarketProductId = signal<number | undefined>(undefined);
  readonly confirmDelete = signal(false);
  readonly isLightboxOpen = signal(false);

  private loadedCardKey: string | null = null;

  constructor() {
    this.scrollLock.bind(() => this.isLightboxOpen(), () => this.closeLightbox());

    effect(() => {
      const card = this.activeCard();
      if (!card) {
        this.loadedCardKey = null;
        this.editDraft.set(null);
        this.activeCardmarketProductId.set(undefined);
        this.confirmDelete.set(false);
        this.isLightboxOpen.set(false);
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
      this.isLightboxOpen.set(false);

      const cachedId = this.catalog.getCachedCardmarketProductId?.(card.cardId);
      this.activeCardmarketProductId.set(cachedId);

      if (!cachedId && card.cardId && !extractCardmarketUrlFromNotes(card.notes)) {
        void this.resolveProductIdForDetail(card.cardId);
      }
    });
  }

  readonly hasUnsavedChanges = computed<boolean>(() => {
    const orig = this.activeCard();
    const draft = this.editDraft();
    if (!orig || !draft) return false;
    const origGrade = orig.grading === 'Raw' ? '' : (orig.grade ?? '');
    const draftGrade = draft.grading === 'Raw' ? '' : (draft.grade ?? '');
    return (
      draft.quantity !== orig.quantity ||
      draft.variant !== orig.variant ||
      draft.condition !== orig.condition ||
      draft.grading !== orig.grading ||
      draftGrade !== origGrade ||
      draft.storageLocation !== orig.storageLocation ||
      (draft.binderDetail ?? '') !== (orig.binderDetail ?? '') ||
      (Number(draft.purchasePrice) || 0) !== Math.max(0, Number(orig.purchasePrice) || 0) ||
      (Number(draft.marketPrice) || 0) !== (Number(orig.marketPrice) || 0) ||
      (draft.acquisitionMethod ?? '').trim() !== (orig.acquisitionMethod ?? '').trim() ||
      Boolean(draft.forTrade) !== Boolean(orig.forTrade) ||
      (draft.notes ?? '') !== (orig.notes ?? '')
    );
  });

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

  openLightbox(): void {
    void this.haptics.light();
    this.isLightboxOpen.set(true);
  }

  closeLightbox(): void {
    this.isLightboxOpen.set(false);
  }

  goToAdjacentCard(card: CollectionCard | null): void {
    if (!card) return;
    void this.haptics.light();
    void this.router.navigate(['/collectie/kaart', card.rowIndex, card.cardId], { replaceUrl: true });
  }

  resetDraft(): void {
    const orig = this.activeCard();
    if (!orig) return;
    void this.haptics.light();
    this.editDraft.set({
      ...orig,
      purchasePrice: Math.max(0, Number(orig.purchasePrice) || 0),
    });
    this.confirmDelete.set(false);
  }

  goBack(): void {
    this.platform.goBackFromStack();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isLightboxOpen()) {
      this.closeLightbox();
      return;
    }
    this.goBack();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.isLightboxOpen() || isEditableEventTarget(event.target)) return;
    if (event.key === 'ArrowLeft') {
      const prev = this.prevCard();
      if (prev) {
        event.preventDefault();
        this.goToAdjacentCard(prev);
      }
    } else if (event.key === 'ArrowRight') {
      const next = this.nextCard();
      if (next) {
        event.preventDefault();
        this.goToAdjacentCard(next);
      }
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
