import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { getDisplaySetCode, parseCardIdInput } from '../../core/domain/card-id.utils';
import { formatDexNumber, formatEur, formatPercent } from '../../core/domain/card-math.utils';
import {
  CatalogCard,
  CatalogCardSummary,
  CatalogSetDetail,
  CatalogSetSummary,
  DEFAULT_DROPDOWN_SETTINGS,
} from '../../core/domain/models';
import { NATIONAL_DEX_NAMES } from '../../core/domain/national-dex.data';
import { doesCardMatchPokemon } from '../../core/domain/pokedex-matching.utils';
import { CARD_CATALOG_PORT } from '../../core/ports/card-catalog.port';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';

@Component({
  selector: 'app-quick-add',
  standalone: true,
  imports: [FormsModule, CardArtworkComponent],
  templateUrl: './quick-add.component.html',
  styleUrl: './quick-add.component.scss',
})
export class QuickAddComponent implements OnDestroy {
  readonly store = inject(CollectionStore);
  private readonly catalog = inject(CARD_CATALOG_PORT);
  private readonly router = inject(Router);

  readonly formatEur = formatEur;
  readonly formatPercent = formatPercent;
  readonly formatDexNumber = formatDexNumber;
  readonly getDisplaySetCode = getDisplaySetCode;

  readonly inputMode = signal<'code' | 'name' | 'sets'>('code');
  readonly codeQuery = signal('');
  readonly nameQuery = signal('');

  readonly isSearching = signal(false);
  readonly lookupError = signal<string | null>(null);
  readonly nameResults = signal<CatalogCardSummary[]>([]);
  readonly previewCard = signal<CatalogCard | null>(null);

  // Alle Sets / Catalogus-browser (1 request per set + 24u cache + paginering per 24 kaarten)
  readonly allSets = signal<CatalogSetSummary[]>([]);
  readonly isLoadingSets = signal(false);
  readonly setSearchQuery = signal('');
  readonly selectedCatalogSetId = signal('');
  readonly activeSetDetail = signal<CatalogSetDetail | null>(null);
  readonly isLoadingSetCards = signal(false);
  readonly setCardFilter = signal('');
  readonly setCatalogPage = signal(1);
  readonly catalogPageSize = 24;

  readonly filteredCatalogSets = computed(() => {
    const q = this.setSearchQuery().trim().toLowerCase();
    const list = this.allSets();
    if (!q) return list;
    return list.filter(
      (s) =>
        (s.code ?? '').toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.series ?? '').toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    );
  });

  readonly filteredSetCards = computed(() => {
    const detail = this.activeSetDetail();
    if (!detail) return [];
    const q = this.setCardFilter().trim().toLowerCase();
    if (!q) return detail.cards;
    return detail.cards.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.localId.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
  });

  readonly catalogTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredSetCards().length / this.catalogPageSize))
  );

  readonly pagedSetCards = computed(() => {
    const page = Math.min(this.setCatalogPage(), this.catalogTotalPages());
    const start = (page - 1) * this.catalogPageSize;
    return this.filteredSetCards().slice(start, start + this.catalogPageSize);
  });

  readonly ownedCardIdSet = computed(
    () => new Set(this.store.collection().map((c) => c.cardId.toLowerCase()))
  );

  // Formuliervelden
  readonly variant = signal('Normal');
  readonly condition = signal(this.store.packDefaults().condition || 'Near Mint (NM)');
  readonly grading = signal('Raw');
  readonly grade = signal('');
  readonly storageLocation = signal(this.store.packDefaults().storageLocation || 'Hoofdbinder');
  readonly binderDetail = signal('');
  readonly language = signal(this.store.packDefaults().language || 'EN');
  readonly quantity = signal(1);
  readonly purchasePrice = signal<number | null>(null);
  readonly acquisitionMethod = signal<string>(
    this.store.packDefaults().enabled ? (this.store.packDefaults().acquisitionMethod || '') : ''
  );
  readonly acquisitionMethods = computed(
    () => this.store.settings().acquisitionMethods ?? DEFAULT_DROPDOWN_SETTINGS.acquisitionMethods ?? []
  );
  readonly forTrade = signal(false);
  readonly notes = signal('');
  readonly isSaving = signal(false);

  // Handmatige override wanneer kaart niet in TCGdex gevonden wordt of offline
  readonly manualName = signal('');
  readonly manualSet = signal('');
  readonly manualNumber = signal('');

  readonly packMode = computed(() => this.store.packDefaults().enabled);

  // Duplicaatdetectie op exact Kaart-ID
  readonly existingMatch = computed(() => {
    const card = this.previewCard();
    if (!card) return null;
    const target = card.id.toLowerCase();
    return this.store.collection().find((c) => c.cardId.toLowerCase() === target) ?? null;
  });

  // Automatische National Pokédex koppeling preview
  readonly matchedPokedexEntry = computed(() => {
    const card = this.previewCard();
    const cardName = card?.name || this.manualName();
    if (!cardName) return null;

    if (card?.dexIds && card.dexIds.length > 0) {
      const dexNum = card.dexIds[0];
      const name = NATIONAL_DEX_NAMES[dexNum - 1];
      if (name) return { dexNumber: dexNum, name };
    }

    for (let i = 0; i < NATIONAL_DEX_NAMES.length; i++) {
      if (doesCardMatchPokemon(cardName, NATIONAL_DEX_NAMES[i])) {
        return { dexNumber: i + 1, name: NATIONAL_DEX_NAMES[i] };
      }
    }
    return null;
  });

  readonly quickExamples = ['DLR 11', 'MEW 181', 'OBF 125', 'BS 44', 'EVS 215'];

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private focusTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.focusTimer) clearTimeout(this.focusTimer);
  }

  togglePackMode(): void {
    const next = !this.packMode();
    const parsed = parseCardIdInput(this.codeQuery());
    const nextMethod = next ? (this.acquisitionMethod() || 'Pack Pull') : this.acquisitionMethod();
    if (next && !this.acquisitionMethod()) {
      this.acquisitionMethod.set('Pack Pull');
    }
    this.store.updatePackDefaults({
      enabled: next,
      setCode: parsed?.inputSetCode || this.store.packDefaults().setCode,
      condition: this.condition(),
      storageLocation: this.storageLocation(),
      language: this.language(),
      acquisitionMethod: nextMethod,
    });
  }

  toggleAcquisitionMethod(method: string): void {
    this.acquisitionMethod.update((prev) => (prev === method ? '' : method));
  }

  onPurchasePriceChange(value: unknown): void {
    if (value === '' || value === null || value === undefined) {
      this.purchasePrice.set(null);
      return;
    }
    const num = Number(value);
    this.purchasePrice.set(Number.isFinite(num) ? Math.max(0, num) : null);
  }

  applyMarketPriceAsPurchase(): void {
    const market = this.previewCard()?.marketPriceEur;
    if (market && market > 0) {
      this.purchasePrice.set(market);
    }
  }

  onCodeInputChange(value: string): void {
    this.codeQuery.set(value);
    this.lookupError.set(null);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    const trimmed = value.trim();
    if (!trimmed) {
      this.previewCard.set(null);
      return;
    }

    this.debounceTimer = setTimeout(() => {
      void this.lookupByCode(trimmed);
    }, 360);
  }

  async lookupByCode(rawInput: string): Promise<void> {
    const parsed = parseCardIdInput(rawInput);
    if (!parsed) {
      this.lookupError.set('Gebruik een kaartcode + nummer, bijv. DLR 11, MEW 181, OBF 199/197 of BS 44.');
      return;
    }

    this.isSearching.set(true);
    this.lookupError.set(null);
    try {
      const found = await this.catalog.lookupByCardId(rawInput);
      if (found) {
        this.applyCatalogCard(found);
      } else {
        this.previewCard.set(null);
        this.lookupError.set(
          `Geen exacte match in TCGdex voor "${rawInput}" (geprobeerd: ${parsed.candidateIds.join(', ')}).`
        );
      }
    } finally {
      this.isSearching.set(false);
    }
  }

  onNameInputChange(value: string): void {
    this.nameQuery.set(value);
    this.lookupError.set(null);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      this.nameResults.set([]);
      return;
    }

    this.debounceTimer = setTimeout(() => {
      void this.searchByName(trimmed);
    }, 360);
  }

  async searchByName(query: string): Promise<void> {
    this.isSearching.set(true);
    this.lookupError.set(null);
    try {
      const results = await this.catalog.searchByName(query, 16);
      this.nameResults.set(results);
      if (results.length === 0) {
        this.lookupError.set(`Geen kaarten gevonden voor "${query}".`);
      }
    } finally {
      this.isSearching.set(false);
    }
  }

  async selectNameResult(item: CatalogCardSummary): Promise<void> {
    this.isSearching.set(true);
    try {
      const full = await this.catalog.getCardByExactId(item.id);
      if (full) {
        this.applyCatalogCard(full);
        const humanCode = getDisplaySetCode(full.id, full.setName);
        this.codeQuery.set(`${humanCode} ${full.localId}`);
      }
    } finally {
      this.isSearching.set(false);
    }
  }

  async openSetsCatalog(): Promise<void> {
    this.inputMode.set('sets');
    this.lookupError.set(null);
    if (this.allSets().length > 0 || !this.catalog.listAllSets) return;

    this.isLoadingSets.set(true);
    try {
      const sets = await this.catalog.listAllSets();
      this.allSets.set(sets);
      if (sets.length === 0) {
        this.lookupError.set('Kon het sets-overzicht niet ophalen (controleer je internetverbinding).');
      }
    } finally {
      this.isLoadingSets.set(false);
    }
  }

  async selectCatalogSet(setId: string): Promise<void> {
    this.selectedCatalogSetId.set(setId);
    this.setCardFilter.set('');
    this.setCatalogPage.set(1);
    this.lookupError.set(null);

    if (!setId || !this.catalog.getSetCards) {
      this.activeSetDetail.set(null);
      return;
    }

    this.isLoadingSetCards.set(true);
    try {
      const detail = await this.catalog.getSetCards(setId);
      this.activeSetDetail.set(detail);
      if (!detail) {
        this.lookupError.set(`Kon kaarten voor set "${setId}" niet laden.`);
      }
    } finally {
      this.isLoadingSetCards.set(false);
    }
  }

  onSetCardFilterChange(val: string): void {
    this.setCardFilter.set(val);
    this.setCatalogPage.set(1);
  }

  isCardOwned(cardId: string): boolean {
    return this.ownedCardIdSet().has(cardId.toLowerCase());
  }

  applyExample(code: string): void {
    this.inputMode.set('code');
    this.codeQuery.set(code);
    void this.lookupByCode(code);
  }

  private applyCatalogCard(card: CatalogCard): void {
    this.previewCard.set(card);
    this.lookupError.set(null);

    // Kies slimme standaard-variant op basis van rarity
    const r = card.rarity.toLowerCase();
    if (r.includes('special illustration') || r.includes('alt')) {
      this.variant.set('Alt Art');
    } else if (r.includes('illustration') || r.includes('ultra')) {
      this.variant.set('Full Art');
    } else if (r.includes('promo')) {
      this.variant.set('Stamped / Promo');
    } else if (r.includes('holo') || r.includes('double rare')) {
      this.variant.set('Holo');
    } else {
      this.variant.set('Normal');
    }
  }

  adjustQty(delta: number): void {
    this.quantity.update((q) => Math.max(1, q + delta));
  }

  async incrementDuplicate(): Promise<void> {
    const existing = this.existingMatch();
    if (!existing) return;
    await this.store.incrementExistingCard(existing, this.quantity());
    this.prepareNextCard(this.packMode());
  }

  async saveCard(stayOnPage: boolean, enablePackMode = false): Promise<void> {
    const card = this.previewCard();
    const parsed = parseCardIdInput(this.codeQuery());

    const cardId = card?.id || parsed?.normalizedId || this.codeQuery().trim();
    const name = card?.name || this.manualName().trim();
    const setName = card?.setName || this.manualSet().trim();

    if (!name) {
      this.store.showToast('Zoek eerst een kaart op of vul een kaartnaam in.', 'warning');
      return;
    }

    this.isSaving.set(true);
    try {
      const nextPackMode = enablePackMode ? true : this.packMode();
      // Onthoud voorkeuren voor Pack Opening Mode
      this.store.updatePackDefaults({
        enabled: nextPackMode,
        setCode: parsed?.inputSetCode || this.store.packDefaults().setCode,
        condition: this.condition(),
        storageLocation: this.storageLocation(),
        language: this.language(),
        acquisitionMethod: this.acquisitionMethod(),
      });

      await this.store.addCard({
        cardId: cardId || `manual-${Date.now()}`,
        name,
        setName: setName || 'Onbekende set',
        cardNumber: card?.cardNumber || this.manualNumber().trim() || parsed?.localNumber || '',
        language: this.language(),
        type: card?.type || 'Colorless',
        rarity: card?.rarity || 'Rare',
        variant: this.variant(),
        condition: this.condition(),
        grading: this.grading(),
        grade: this.grading() === 'Raw' ? '' : this.grade().trim(),
        quantity: this.quantity(),
        storageLocation: this.storageLocation(),
        binderDetail: this.binderDetail().trim(),
        purchasePrice: Number(this.purchasePrice()) || 0,
        marketPrice: card?.marketPriceEur ?? 0,
        acquisitionMethod: this.acquisitionMethod(),
        imageUrl: card?.imageUrl,
        trendPercent: card?.trendPercent,
        forTrade: this.forTrade(),
        notes: this.notes().trim(),
        seriesName: card?.seriesName,
        setTotalCards: card?.officialCardCount || card?.totalCardCount,
      });

      if (stayOnPage) {
        this.prepareNextCard(nextPackMode);
      } else {
        void this.router.navigateByUrl('/collectie');
      }
    } finally {
      this.isSaving.set(false);
    }
  }

  private prepareNextCard(rememberSet = this.packMode()): void {
    const rememberedSet = rememberSet ? this.store.packDefaults().setCode : '';
    this.previewCard.set(null);
    this.nameResults.set([]);
    this.lookupError.set(null);
    this.manualName.set('');
    this.manualSet.set('');
    this.manualNumber.set('');
    this.quantity.set(1);
    this.purchasePrice.set(null);
    this.acquisitionMethod.set(rememberSet ? (this.store.packDefaults().acquisitionMethod || '') : '');
    this.forTrade.set(false);
    this.grade.set('');
    this.notes.set('');
    this.codeQuery.set(rememberSet && this.inputMode() !== 'sets' && rememberedSet ? `${rememberedSet} ` : '');
    this.nameQuery.set('');

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      if (this.focusTimer) clearTimeout(this.focusTimer);
      this.focusTimer = setTimeout(() => {
        try {
          window.scrollTo?.({ top: 0, behavior: 'smooth' });
        } catch {
          // Negeer in omgevingen zonder scrollTo-implementatie (bijv. jsdom)
        }
        const targetId = this.inputMode() === 'name' ? 'qa-name-input' : 'qa-code-input';
        const el = document.getElementById(targetId) as HTMLInputElement | null;
        el?.focus();
      }, 0);
    }
  }

  closePage(): void {
    void this.router.navigateByUrl('/collectie');
  }

  shortCondCode(cond: string): string {
    const m = cond.match(/\(([A-Z]+)\)/);
    return m ? m[1] : cond.slice(0, 2).toUpperCase();
  }

  shortCondName(cond: string): string {
    return cond.replace(/\s*\([A-Z]+\)/, '');
  }
}
