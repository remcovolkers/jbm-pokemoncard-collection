import { Component, ElementRef, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { getDisplaySetCode, isKnownNoScanSet, parseCardIdInput } from '../../core/domain/card-id.utils';
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
import { HapticsService } from '../../core/platform/haptics.service';
import { MobileViewportService } from '../../core/platform/mobile-viewport.service';
import { ModalScrollLockService } from '../../core/platform/modal-scroll-lock.service';
import { PlatformService } from '../../core/platform/platform.service';
import { CollectionStore } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';

const SERIES_SORT_PRIORITY: Record<string, number> = {
  me: 10,
  sv: 20,
  swsh: 30,
  sm: 40,
  xy: 50,
  bw: 60,
  col: 70,
  hgss: 80,
  pl: 90,
  dp: 100,
  ex: 110,
  ecard: 120,
  lc: 130,
  neo: 140,
  gym: 150,
  base: 160,
  mc: 200,
  tk: 210,
  pop: 220,
  misc: 230,
};

function getSeriesSortPriority(seriesId?: string): number {
  const key = (seriesId ?? '').trim().toLowerCase();
  if (!key) return 240;
  return SERIES_SORT_PRIORITY[key] ?? -1;
}

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
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly scrollLock = inject(ModalScrollLockService);
  private readonly mobileViewport = inject(MobileViewportService);
  private readonly platform = inject(PlatformService);
  private readonly haptics = inject(HapticsService);

  constructor() {
    this.scrollLock.registerDismissHandler(() => this.isSetDropdownOpen(), () => this.closeSetDropdown());
  }

  readonly formatEur = formatEur;
  readonly formatPercent = formatPercent;
  readonly formatDexNumber = formatDexNumber;
  readonly getDisplaySetCode = getDisplaySetCode;
  readonly isKnownNoScanSet = isKnownNoScanSet;

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
  readonly isSetDropdownOpen = signal(false);
  readonly setSortMode = signal<'series' | 'newest' | 'az'>('series');
  readonly highlightedSetIndex = signal(0);
  readonly selectedCatalogSetId = signal('');
  readonly activeSetDetail = signal<CatalogSetDetail | null>(null);
  readonly isLoadingSetCards = signal(false);
  readonly setCardFilter = signal('');
  readonly setCatalogPage = signal(1);
  readonly catalogPageSize = 24;

  readonly selectedCatalogSet = computed(
    () => this.allSets().find((s) => s.id === this.selectedCatalogSetId()) ?? null
  );

  readonly activeSetHasNoScans = computed(() => {
    const detail = this.activeSetDetail();
    return Boolean(
      detail &&
        detail.cards.length > 0 &&
        isKnownNoScanSet(detail.id) &&
        detail.cards.every((c) => !c.imageBase)
    );
  });

  readonly filteredCatalogSets = computed(() => {
    const q = this.setSearchQuery().trim().toLowerCase();
    const mode = this.setSortMode();
    const list = this.allSets();

    const filtered = !q
      ? [...list]
      : list.filter(
          (s) =>
            (s.code ?? '').toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            (s.series ?? '').toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q) ||
            (s.releaseDate ?? '').toLowerCase().includes(q)
        );

    const compareByMode = (a: CatalogSetSummary, b: CatalogSetSummary): number => {
      if (mode === 'az') {
        return a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' });
      }
      if (mode === 'newest') {
        return (
          (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') ||
          a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' })
        );
      }
      // 'series': nieuwste hoofd-era eerst, zijseries onderaan, binnen era op releasedatum desc
      const prioDiff = getSeriesSortPriority(a.seriesId) - getSeriesSortPriority(b.seriesId);
      if (prioDiff !== 0) return prioDiff;
      return (
        (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') ||
        a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' })
      );
    };

    if (!q) {
      return filtered.sort(compareByMode);
    }

    const matchScore = (s: CatalogSetSummary): number => {
      const code = (s.code || getDisplaySetCode(s.id, s.name)).toLowerCase();
      const id = s.id.toLowerCase();
      const name = s.name.toLowerCase();
      if (code === q || id === q) return 0;
      if (name === q) return 1;
      if (code.startsWith(q) || name.startsWith(q)) return 2;
      return 3;
    };

    return filtered.sort((a, b) => {
      const scoreDiff = matchScore(a) - matchScore(b);
      return scoreDiff !== 0 ? scoreDiff : compareByMode(a, b);
    });
  });

  readonly flatSetIndexMap = computed(() => {
    const map = new Map<string, number>();
    this.filteredCatalogSets().forEach((s, idx) => map.set(s.id, idx));
    return map;
  });

  readonly groupedCatalogSets = computed(() => {
    const groups: { series: string; sets: CatalogSetSummary[] }[] = [];
    const bySeries = new Map<string, CatalogSetSummary[]>();

    for (const s of this.filteredCatalogSets()) {
      const label = s.series?.trim() || 'Overige sets';
      let bucket = bySeries.get(label);
      if (!bucket) {
        bucket = [];
        bySeries.set(label, bucket);
        groups.push({ series: label, sets: bucket });
      }
      bucket.push(s);
    }
    return groups;
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
  readonly purchasePrice = signal<number>(0);
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
  private setSearchFocusTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.focusTimer) clearTimeout(this.focusTimer);
    if (this.setSearchFocusTimer) clearTimeout(this.setSearchFocusTimer);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isSetDropdownOpen()) return;
    const target = event.target as Node | null;
    const pickerEl = this.hostEl.nativeElement.querySelector('.set-picker');
    if (pickerEl && target && !pickerEl.contains(target)) {
      this.closeSetDropdown();
    }
  }

  togglePackMode(): void {
    void this.haptics.light();
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
      this.purchasePrice.set(0);
      return;
    }
    const num = Number(value);
    this.purchasePrice.set(Number.isFinite(num) ? Math.max(0, num) : 0);
  }

  normalizePurchasePriceInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (input) {
      input.value = String(this.purchasePrice());
    }
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
      } else {
        this.lookupError.set(`Kon kaartdetails voor "${item.name}" (${item.id}) niet ophalen.`);
      }
    } finally {
      this.isSearching.set(false);
    }
  }

  toggleSetDropdown(): void {
    if (this.isSetDropdownOpen()) {
      this.closeSetDropdown();
    } else {
      this.openSetDropdown();
    }
  }

  openSetDropdown(): void {
    const selectedId = this.selectedCatalogSetId();
    const activeIdx = selectedId ? (this.flatSetIndexMap().get(selectedId) ?? 0) : 0;
    this.highlightedSetIndex.set(activeIdx);
    this.isSetDropdownOpen.set(true);

    if (typeof document !== 'undefined') {
      if (this.setSearchFocusTimer) clearTimeout(this.setSearchFocusTimer);
      this.setSearchFocusTimer = setTimeout(() => {
        const input = document.getElementById('qa-set-search-input') as HTMLInputElement | null;
        if (input) {
          this.mobileViewport.ensureElementVisible(input);
          input.focus();
          input.select();
        }
      }, 0);
    }
  }

  closeSetDropdown(): void {
    this.isSetDropdownOpen.set(false);
  }

  setSetSortMode(mode: 'series' | 'newest' | 'az'): void {
    this.setSortMode.set(mode);
    this.highlightedSetIndex.set(0);
  }

  onSetSearchQueryChange(val: string): void {
    this.setSearchQuery.set(val);
    this.highlightedSetIndex.set(0);
  }

  onSetSearchKeydown(event: KeyboardEvent): void {
    const sets = this.filteredCatalogSets();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSetDropdown();
      return;
    }
    if (sets.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.min(sets.length - 1, this.highlightedSetIndex() + 1);
      this.highlightedSetIndex.set(next);
      this.scrollHighlightedSetIntoView(next);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = Math.max(0, this.highlightedSetIndex() - 1);
      this.highlightedSetIndex.set(prev);
      this.scrollHighlightedSetIntoView(prev);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = sets[this.highlightedSetIndex()] ?? sets[0];
      if (target) {
        this.chooseCatalogSet(target.id);
      }
    }
  }

  chooseCatalogSet(setId: string): void {
    this.closeSetDropdown();
    void this.selectCatalogSet(setId);
  }

  formatReleaseYear(releaseDate?: string): string {
    const match = (releaseDate ?? '').match(/^(\d{4})/);
    return match ? match[1] : '';
  }

  private scrollHighlightedSetIntoView(index: number): void {
    if (typeof document === 'undefined') return;
    const el = this.hostEl.nativeElement.querySelector(
      `[data-set-option-index="${index}"]`
    ) as HTMLElement | null;
    el?.scrollIntoView?.({ block: 'nearest' });
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
    void this.haptics.light();
    this.quantity.update((q) => Math.max(1, q + delta));
  }

  async incrementDuplicate(): Promise<void> {
    const existing = this.existingMatch();
    if (!existing) return;
    void this.haptics.success();
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
      void this.haptics.success();

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
    this.purchasePrice.set(0);
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
          document.querySelector('.shell__main')?.scrollTo?.({ top: 0, behavior: 'smooth' });
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
    this.platform.goBackFromStack();
  }

  shortCondCode(cond: string): string {
    const m = cond.match(/\(([A-Z]+)\)/);
    return m ? m[1] : cond.slice(0, 2).toUpperCase();
  }

  shortCondName(cond: string): string {
    return cond.replace(/\s*\([A-Z]+\)/, '');
  }
}
