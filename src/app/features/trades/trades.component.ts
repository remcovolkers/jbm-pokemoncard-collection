import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { getCardSetCode, getDisplaySetCode } from '../../core/domain/card-id.utils';
import { formatEur, roundCurrency } from '../../core/domain/card-math.utils';
import {
  ShowcaseCardViewModel,
  buildShowcaseFromCollectionCard,
  isCollectionCardShowcaseEligible,
} from '../../core/domain/card-showcase.utils';
import { CollectionCard } from '../../core/domain/models';
import { HapticsService } from '../../core/platform/haptics.service';
import { ModalScrollLockService } from '../../core/platform/modal-scroll-lock.service';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';
import { CardShowcaseComponent } from '../../shared/card-showcase/card-showcase.component';
import { PbSheetDismissDirective } from '../../shared/directives/sheet-dismiss.directive';

@Component({
  selector: 'app-trades',
  standalone: true,
  imports: [FormsModule, CardArtworkComponent, CardShowcaseComponent, PbSheetDismissDirective],
  templateUrl: './trades.component.html',
  styleUrl: './trades.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradesComponent {
  readonly store = inject(CollectionStore);
  private readonly router = inject(Router);
  private readonly scrollLock = inject(ModalScrollLockService);
  private readonly haptics = inject(HapticsService);

  readonly formatEur = formatEur;
  readonly getDisplaySetCode = getDisplaySetCode;
  readonly getCardSetCode = getCardSetCode;

  readonly showLogSheet = signal(false);
  readonly showcaseCardKey = signal<string | null>(null);

  constructor() {
    this.scrollLock.bind(() => this.showLogSheet(), () => this.closeLogSheet());
  }

  readonly showcaseTradeCards = computed(() =>
    this.store.tradeBinderCards().filter((c) => isCollectionCardShowcaseEligible(c))
  );

  readonly activeShowcaseCard = computed<CollectionCard | null>(() => {
    const key = this.showcaseCardKey();
    if (!key) return null;
    return this.showcaseTradeCards().find((c) => `${c.rowIndex}:${c.cardId}` === key) ?? null;
  });

  readonly activeShowcaseIndex = computed(() => {
    const active = this.activeShowcaseCard();
    if (!active) return -1;
    return this.showcaseTradeCards().findIndex(
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
    const prev = this.showcaseTradeCards()[idx - 1];
    if (prev) this.showcaseCardKey.set(`${prev.rowIndex}:${prev.cardId}`);
  }

  showcaseNext(): void {
    const idx = this.activeShowcaseIndex();
    const list = this.showcaseTradeCards();
    if (idx < 0 || idx >= list.length - 1) return;
    const next = list[idx + 1];
    if (next) this.showcaseCardKey.set(`${next.rowIndex}:${next.cardId}`);
  }

  openShowcaseTradeModal(): void {
    const active = this.activeShowcaseCard();
    if (!active) return;
    this.closeShowcase();
    this.openNewTradeModal(active);
  }

  openShowcaseDetail(): void {
    const active = this.activeShowcaseCard();
    if (!active) return;
    this.closeShowcase();
    this.openCardDetail(active);
  }

  // Formuliervelden voor nieuwe transactie
  readonly date = signal(new Date().toISOString().slice(0, 10));
  readonly cardName = signal('');
  readonly setName = signal('');
  readonly type = signal('Verkoop');
  readonly purchasePrice = signal<number>(0);
  readonly saleValue = signal<number>(0);
  readonly platformFees = signal<number>(0);
  readonly counterparty = signal('');
  readonly notes = signal('');

  readonly previewNetResult = computed(() =>
    roundCurrency((Number(this.saleValue()) || 0) - (Number(this.purchasePrice()) || 0) - (Number(this.platformFees()) || 0))
  );

  readonly totalTradeRevenue = computed(() =>
    roundCurrency(this.store.trades().reduce((acc, t) => acc + (t.saleValue || 0), 0))
  );

  tradableQty(card: CollectionCard): number {
    return card.forTrade ? card.quantity : Math.max(0, card.quantity - 1);
  }

  openCardDetail(card: CollectionCard): void {
    void this.haptics.light();
    void this.router.navigate(['/collectie/kaart', card.rowIndex, card.cardId]);
  }

  openNewTradeModal(prefillCard?: CollectionCard): void {
    this.date.set(new Date().toISOString().slice(0, 10));
    if (prefillCard) {
      this.cardName.set(`${prefillCard.name} (${prefillCard.cardNumber})`);
      this.setName.set(prefillCard.setName);
      this.purchasePrice.set(prefillCard.purchasePrice);
      this.saleValue.set(prefillCard.marketPrice);
      this.platformFees.set(0);
    } else {
      this.cardName.set('');
      this.setName.set('');
      this.purchasePrice.set(0);
      this.saleValue.set(0);
      this.platformFees.set(0);
    }
    this.type.set('Verkoop');
    this.counterparty.set('');
    this.notes.set('');
    this.showLogSheet.set(true);
  }

  closeLogSheet(): void {
    this.showLogSheet.set(false);
  }

  async submitTrade(): Promise<void> {
    const name = this.cardName().trim();
    if (!name) {
      this.store.showToast('Vul de kaartnaam in voor deze transactie.', 'warning');
      return;
    }

    await this.store.logTrade({
      date: this.date() || new Date().toISOString().slice(0, 10),
      cardName: name,
      setName: this.setName().trim() || 'Pokémon TCG',
      type: this.type(),
      purchasePrice: Number(this.purchasePrice()) || 0,
      saleValue: Number(this.saleValue()) || 0,
      platformFees: Number(this.platformFees()) || 0,
      counterparty: this.counterparty().trim() || 'Ruilavond / Cardmarket',
      notes: this.notes().trim(),
    });
    void this.haptics.success();
    this.showLogSheet.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.activeShowcaseCard()) {
      this.closeShowcase();
      return;
    }
    if (this.showLogSheet()) {
      this.showLogSheet.set(false);
    }
  }
}
