import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getDisplaySetCode } from '../../core/domain/card-id.utils';
import { formatEur, roundCurrency } from '../../core/domain/card-math.utils';
import { CollectionCard } from '../../core/domain/models';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';

@Component({
  selector: 'app-trades',
  standalone: true,
  imports: [FormsModule, CardArtworkComponent],
  templateUrl: './trades.component.html',
  styleUrl: './trades.component.scss',
})
export class TradesComponent {
  readonly store = inject(CollectionStore);

  readonly formatEur = formatEur;
  readonly getDisplaySetCode = getDisplaySetCode;

  readonly showLogSheet = signal(false);

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
    this.showLogSheet.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showLogSheet()) {
      this.showLogSheet.set(false);
    }
  }
}
