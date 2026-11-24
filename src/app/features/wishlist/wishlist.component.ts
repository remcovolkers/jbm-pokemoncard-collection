import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatEur } from '../../core/domain/card-math.utils';
import {
  ShowcaseCardViewModel,
  buildShowcaseFromWishlist,
  isWishlistItemShowcaseEligible,
} from '../../core/domain/card-showcase.utils';
import { WishlistItem } from '../../core/domain/models';
import { HapticsService } from '../../core/platform/haptics.service';
import { ModalScrollLockService } from '../../core/platform/modal-scroll-lock.service';
import { CARD_CATALOG_PORT } from '../../core/ports/card-catalog.port';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';
import { CardShowcaseComponent } from '../../shared/card-showcase/card-showcase.component';
import { PbSheetDismissDirective } from '../../shared/directives/sheet-dismiss.directive';

type WishlistFilter = 'open' | 'high' | 'in_budget' | 'found';

@Component({
  selector: 'app-wishlist',
  standalone: true,
  imports: [FormsModule, CardArtworkComponent, CardShowcaseComponent, PbSheetDismissDirective],
  templateUrl: './wishlist.component.html',
  styleUrl: './wishlist.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistComponent {
  readonly store = inject(CollectionStore);
  private readonly catalog = inject(CARD_CATALOG_PORT);
  private readonly scrollLock = inject(ModalScrollLockService);
  private readonly haptics = inject(HapticsService);

  readonly formatEur = formatEur;
  readonly Math = Math;

  readonly filter = signal<WishlistFilter>('open');
  readonly showAddSheet = signal(false);
  readonly editingItem = signal<WishlistItem | null>(null);
  readonly confirmDeleteKey = signal<string | null>(null);
  readonly showcaseWishKey = signal<string | null>(null);
  readonly catalogRarities = signal<Record<string, string>>({});
  private readonly resolvingRarityIds = new Set<string>();

  // Inline maandbudget bewerken
  readonly isEditingBudget = signal(false);
  readonly budgetDraft = signal<number>(this.store.config().monthlyBudget || 150);

  constructor() {
    this.scrollLock.bind(() => this.showAddSheet(), () => this.closeAddModal());
    effect(() => {
      const items = this.store.wishlist();
      if (items.some((w) => !w.imageUrl || !w.cardId)) {
        void this.store.hydrateWishlistArtworkFromCatalog();
      }
      void this.hydrateWishlistRarities(items);
    });
  }

  // TCGdex lookup & nieuwe wens formulier
  readonly lookupQuery = signal('');
  readonly isLookingUp = signal(false);
  readonly newCardId = signal('');
  readonly newCardName = signal('');
  readonly newSetName = signal('');
  readonly newCardNumber = signal('');
  readonly newDesiredVariant = signal('Full Art');
  readonly newMinCondition = signal('Near Mint (NM)');
  readonly newPriority = signal('Hoog');
  readonly newMaxBudget = signal<number>(25);
  readonly newMarketPrice = signal<number>(0);
  readonly newNotes = signal('');
  readonly newImageUrl = signal<string | undefined>(undefined);

  readonly openItems = computed(() => this.store.wishlist().filter((w) => !w.found));
  readonly foundItems = computed(() => this.store.wishlist().filter((w) => w.found));

  readonly highPriorityCount = computed(
    () => this.openItems().filter((w) => w.priority === 'Hoog' || w.priority === 'Grail').length
  );

  readonly inBudgetCount = computed(
    () => this.openItems().filter((w) => w.marketPrice > 0 && w.marketPrice <= w.maxBudget).length
  );

  readonly filteredItems = computed(() => {
    const f = this.filter();
    if (f === 'found') return this.foundItems();
    const open = this.openItems();
    if (f === 'high') {
      return open.filter((w) => w.priority === 'Hoog' || w.priority === 'Grail');
    }
    if (f === 'in_budget') {
      return open.filter((w) => w.marketPrice > 0 && w.marketPrice <= w.maxBudget);
    }
    return open;
  });

  // Maandbudget berekening (Fintech header banner uit Stitch)
  readonly budgetStats = computed(() => {
    const limit = Math.max(1, this.store.config().monthlyBudget || 150);
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const spentThisMonth = this.store
      .collection()
      .filter((c) => c.purchaseDate?.startsWith(currentMonthPrefix))
      .reduce((acc, c) => acc + (c.purchasePrice || 0) * Math.max(1, c.quantity || 1), 0);

    const remaining = Math.max(0, limit - spentThisMonth);
    const pct = Math.min(100, Math.round((spentThisMonth / limit) * 100));
    const listMarketValue = this.openItems().reduce((acc, w) => acc + (w.marketPrice || 0), 0);

    const monthLabel = now.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
    return {
      limit,
      spentThisMonth,
      remaining,
      pct,
      listMarketValue,
      activeCount: this.openItems().length,
      monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
    };
  });

  isWithinBudget(item: WishlistItem): boolean {
    return item.maxBudget > 0 && item.marketPrice <= item.maxBudget;
  }

  budgetDiff(item: WishlistItem): number {
    return item.maxBudget - item.marketPrice;
  }

  wishKey(item: WishlistItem): string {
    return `${item.rowIndex}|${item.cardName}`;
  }

  getResolvedRarity(item: WishlistItem): string | undefined {
    const cleanId = (item.cardId ?? '').trim().toLowerCase();
    if (!cleanId) return undefined;
    const fromCatalog = this.catalogRarities()[cleanId];
    if (fromCatalog) return fromCatalog;
    const fromCollection = this.store
      .collection()
      .find((c) => c.cardId.trim().toLowerCase() === cleanId);
    return fromCollection?.rarity || undefined;
  }

  isShowcaseEligible(item: WishlistItem): boolean {
    return isWishlistItemShowcaseEligible(item, this.getResolvedRarity(item));
  }

  readonly showcaseItems = computed(() =>
    this.filteredItems().filter((w) => this.isShowcaseEligible(w))
  );

  readonly activeShowcaseWish = computed<WishlistItem | null>(() => {
    const key = this.showcaseWishKey();
    if (!key) return null;
    return this.showcaseItems().find((w) => this.wishKey(w) === key) ?? null;
  });

  readonly activeShowcaseIndex = computed(() => {
    const active = this.activeShowcaseWish();
    if (!active) return -1;
    return this.showcaseItems().findIndex((w) => this.wishKey(w) === this.wishKey(active));
  });

  readonly activeShowcaseVm = computed<ShowcaseCardViewModel | null>(() => {
    const active = this.activeShowcaseWish();
    if (!active) return null;
    return buildShowcaseFromWishlist(active, this.getResolvedRarity(active));
  });

  openShowcase(item: WishlistItem): void {
    if (!this.isShowcaseEligible(item)) return;
    void this.haptics.light();
    this.showcaseWishKey.set(this.wishKey(item));
  }

  closeShowcase(): void {
    this.showcaseWishKey.set(null);
  }

  showcasePrev(): void {
    const idx = this.activeShowcaseIndex();
    if (idx <= 0) return;
    const target = this.showcaseItems()[idx - 1];
    if (target) this.showcaseWishKey.set(this.wishKey(target));
  }

  showcaseNext(): void {
    const idx = this.activeShowcaseIndex();
    const list = this.showcaseItems();
    if (idx < 0 || idx >= list.length - 1) return;
    const target = list[idx + 1];
    if (target) this.showcaseWishKey.set(this.wishKey(target));
  }

  editFromShowcase(): void {
    const active = this.activeShowcaseWish();
    if (!active) return;
    this.closeShowcase();
    this.openEditModal(active);
  }

  async markFoundFromShowcase(): Promise<void> {
    const active = this.activeShowcaseWish();
    if (!active || active.found) return;
    this.closeShowcase();
    await this.markFoundAndAdd(active);
  }

  private async hydrateWishlistRarities(items: readonly WishlistItem[]): Promise<void> {
    const known = this.catalogRarities();
    const ownedMap = new Map<string, string>();
    for (const c of this.store.collection()) {
      if (c.cardId && c.rarity) {
        ownedMap.set(c.cardId.trim().toLowerCase(), c.rarity);
      }
    }

    for (const item of items) {
      const id = (item.cardId ?? '').trim();
      const lower = id.toLowerCase();
      if (!id || known[lower] || ownedMap.has(lower) || this.resolvingRarityIds.has(lower)) {
        continue;
      }
      this.resolvingRarityIds.add(lower);
      try {
        const card = await this.catalog.getCardByExactId(id);
        if (card?.rarity) {
          this.catalogRarities.update((prev) => ({ ...prev, [lower]: card.rarity }));
        }
      } catch {
        // Offline of onbekende kaart: heuristiek in isWishlistItemShowcaseEligible vangt dit op
      } finally {
        this.resolvingRarityIds.delete(lower);
      }
    }
  }

  startBudgetEdit(): void {
    this.budgetDraft.set(this.store.config().monthlyBudget || 150);
    this.isEditingBudget.set(true);
  }

  cancelBudgetEdit(): void {
    this.isEditingBudget.set(false);
  }

  saveBudgetEdit(): void {
    this.store.updateMonthlyBudget(this.budgetDraft());
    this.isEditingBudget.set(false);
    void this.haptics.success();
  }

  openAddModal(): void {
    this.editingItem.set(null);
    this.lookupQuery.set('');
    this.newCardId.set('');
    this.newCardName.set('');
    this.newSetName.set('');
    this.newCardNumber.set('');
    this.newDesiredVariant.set('Full Art');
    this.newMinCondition.set('Near Mint (NM)');
    this.newPriority.set('Hoog');
    this.newMaxBudget.set(25);
    this.newMarketPrice.set(0);
    this.newNotes.set('');
    this.newImageUrl.set(undefined);
    this.showAddSheet.set(true);
  }

  openEditModal(item: WishlistItem): void {
    this.confirmDeleteKey.set(null);
    this.editingItem.set(item);
    this.lookupQuery.set('');
    this.newCardId.set(item.cardId || '');
    this.newCardName.set(item.cardName);
    this.newSetName.set(item.setName);
    this.newCardNumber.set(item.cardNumber);
    this.newDesiredVariant.set(item.desiredVariant || 'Normal');
    this.newMinCondition.set(item.minCondition || 'Near Mint (NM)');
    this.newPriority.set(item.priority || 'Gemiddeld');
    this.newMaxBudget.set(Number(item.maxBudget) || 0);
    this.newMarketPrice.set(Number(item.marketPrice) || 0);
    this.newNotes.set(item.notes || '');
    this.newImageUrl.set(item.imageUrl);
    this.showAddSheet.set(true);
  }

  closeAddModal(): void {
    this.showAddSheet.set(false);
    this.editingItem.set(null);
  }

  async lookupCardForWishlist(): Promise<void> {
    const q = this.lookupQuery().trim();
    if (!q) return;
    this.isLookingUp.set(true);
    try {
      let card = await this.catalog.lookupByCardId(q);
      if (!card) {
        const list = await this.catalog.searchByName(q, 1);
        if (list.length > 0) {
          card = await this.catalog.getCardByExactId(list[0].id);
        }
      }
      if (card) {
        this.newCardId.set(card.id);
        this.newCardName.set(card.name);
        this.newSetName.set(card.setName);
        this.newCardNumber.set(card.cardNumber);
        this.newMarketPrice.set(card.marketPriceEur || 0);
        this.newMaxBudget.set(card.marketPriceEur > 0 ? Math.ceil(card.marketPriceEur * 1.05) : 25);
        this.newImageUrl.set(card.imageUrl);
        this.store.showToast(`${card.name} opgehaald uit TCGdex!`, 'success');
      } else {
        this.store.showToast('Geen kaart gevonden in TCGdex — vul de velden handmatig in.', 'warning');
      }
    } finally {
      this.isLookingUp.set(false);
    }
  }

  async saveNewWish(): Promise<void> {
    const name = this.newCardName().trim();
    if (!name) {
      this.store.showToast('Vul minimaal een kaartnaam in.', 'warning');
      return;
    }

    const editing = this.editingItem();
    const payload = {
      cardId: this.newCardId().trim() || undefined,
      cardName: name,
      setName: this.newSetName().trim() || 'Onbekende set',
      cardNumber: this.newCardNumber().trim(),
      desiredVariant: this.newDesiredVariant(),
      minCondition: this.newMinCondition(),
      priority: this.newPriority(),
      maxBudget: Number(this.newMaxBudget()) || 0,
      marketPrice: Number(this.newMarketPrice()) || 0,
      notes: this.newNotes().trim(),
      imageUrl: this.newImageUrl(),
    };

    if (editing) {
      await this.store.updateWishlistItem(editing, payload);
    } else {
      await this.store.addWishlistItem(payload);
    }
    void this.haptics.success();
    this.closeAddModal();
  }

  requestDeleteItem(item: WishlistItem): void {
    this.confirmDeleteKey.set(this.wishKey(item));
  }

  cancelDeleteItem(): void {
    this.confirmDeleteKey.set(null);
  }

  async confirmDeleteItem(item: WishlistItem): Promise<void> {
    this.confirmDeleteKey.set(null);
    void this.haptics.light();
    await this.store.deleteWishlistItem(item);
  }

  async markFoundAndAdd(item: WishlistItem): Promise<void> {
    void this.haptics.success();
    await this.store.markWishlistFound(item, true);
  }

  async markFoundOnly(item: WishlistItem): Promise<void> {
    void this.haptics.success();
    await this.store.markWishlistFound(item, false);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.activeShowcaseWish()) {
      this.closeShowcase();
      return;
    }
    if (this.showAddSheet()) {
      this.showAddSheet.set(false);
    }
  }
}
