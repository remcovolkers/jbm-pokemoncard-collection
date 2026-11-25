import { Component, ElementRef, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  extractArtworkUrlFromNotes,
  getDisplaySetCode,
  isKnownNoScanSet,
  parseCardIdInput,
} from '../../core/domain/card-id.utils';
import { getLanguageLabel, normalizeLanguageCode } from '../../core/domain/card-language.utils';
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
import { isEditableEventTarget } from '../../core/platform/keyboard.utils';
import { MobileViewportService } from '../../core/platform/mobile-viewport.service';
import { ModalScrollLockService } from '../../core/platform/modal-scroll-lock.service';
import { PlatformService } from '../../core/platform/platform.service';
import { CollectionStore, BatchCardCommitItem } from '../../core/state/collection.store';
import { CardArtworkComponent } from '../../shared/card-artwork/card-artwork.component';
import { PbBinderSwipeDirective } from '../../shared/directives/binder-swipe.directive';
import { PbSheetDismissDirective } from '../../shared/directives/sheet-dismiss.directive';

const RECENT_SET_CODES_KEY = 'pokebinder_recent_set_codes_v1';
const MULTI_SELECT_PREF_KEY = 'pokebinder_qa_multiselect_v1';

export interface BatchSelectedCard {
  id: string;
  localId: string;
  name: string;
  imageUrl: string;
  setId?: string;
  setName: string;
  seriesName?: string;
  setTotalCount?: number;
  quantity: number;
  variantOverride: string;
  cardDetail?: CatalogCard | null;
  isLoadingDetail?: boolean;
}

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
  imports: [FormsModule, CardArtworkComponent, PbBinderSwipeDirective, PbSheetDismissDirective],
  templateUrl: './quick-add.component.html',
  styleUrl: './quick-add.component.scss',
})
export class QuickAddComponent implements OnInit, OnDestroy {
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
    this.scrollLock.bind(() => this.showBatchSheet(), () => this.closeBatchSheet());
  }

  ngOnInit(): void {
    const requested = this.store.requestedQuickAddSearch();
    if (requested) {
      this.store.requestedQuickAddSearch.set(null);
      if (requested.mode === 'sets') {
        void this.openSetByQuery(requested.query);
      } else if (requested.mode === 'name') {
        this.inputMode.set('name');
        this.nameQuery.set(requested.query);
        void this.searchByName(requested.query);
      } else {
        this.inputMode.set('code');
        this.codeQuery.set(requested.query);
        void this.lookupByCode(requested.query);
      }
    }
  }

  readonly formatEur = formatEur;
  readonly formatPercent = formatPercent;
  readonly formatDexNumber = formatDexNumber;
  readonly getDisplaySetCode = getDisplaySetCode;
  readonly isKnownNoScanSet = isKnownNoScanSet;
  readonly getLanguageLabel = getLanguageLabel;
  readonly isNonEnglish = (lang: string): boolean => normalizeLanguageCode(lang) !== 'EN';

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
    const onlyMissing = this.onlyMissingInSet();
    const q = this.setCardFilter().trim().toLowerCase();
    return detail.cards.filter((c) => {
      if (onlyMissing && this.isCardOwned(c.id)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.localId.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    });
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

  // Multi-select batch modus (Alle Sets & Op Naam)
  readonly multiSelectMode = signal<boolean>(this.loadMultiSelectPref());
  readonly onlyMissingInSet = signal<boolean>(false);
  readonly selectedBatchCards = signal<BatchSelectedCard[]>([]);
  readonly showBatchSheet = signal<boolean>(false);
  readonly batchVariantMode = signal<string>('auto');
  readonly batchDuplicateMode = signal<'increment' | 'separate'>('increment');

  readonly selectedBatchMap = computed(() => {
    const map = new Map<string, BatchSelectedCard>();
    for (const item of this.selectedBatchCards()) {
      map.set(item.id.toLowerCase(), item);
    }
    return map;
  });

  readonly batchUniqueCount = computed(() => this.selectedBatchCards().length);
  readonly batchTotalCopies = computed(() =>
    this.selectedBatchCards().reduce((acc, item) => acc + Math.max(1, item.quantity), 0)
  );

  readonly activeSetOwnedCount = computed(() => {
    const detail = this.activeSetDetail();
    if (!detail) return 0;
    const owned = this.ownedCardIdSet();
    return detail.cards.filter((c) => owned.has(c.id.toLowerCase())).length;
  });

  readonly activeSetMissingCount = computed(() => {
    const detail = this.activeSetDetail();
    if (!detail) return 0;
    return Math.max(0, detail.cards.length - this.activeSetOwnedCount());
  });

  readonly isBatchDockActive = computed(() => {
    const mode = this.inputMode();
    if (mode !== 'sets' && mode !== 'name') return false;
    return this.multiSelectMode() || (this.batchUniqueCount() > 0 && !this.previewCard() && !this.manualName().trim());
  });

  readonly batchSaveLabel = computed(() => {
    const unique = this.batchUniqueCount();
    const copies = this.batchTotalCopies();
    if (unique === 0) return 'Selecteer kaarten';
    const base = unique === 1 ? '1 kaart' : `${unique} kaarten`;
    return copies > unique ? `${base} (${copies}×) toevoegen` : `${base} toevoegen`;
  });

  readonly batchDefaultsSummary = computed(() => {
    const variantText = this.batchVariantMode() === 'auto' ? 'Slim per kaart' : this.batchVariantMode();
    const parts = [this.shortCondCode(this.condition()), this.storageLocation(), `Variant: ${variantText}`];
    if (this.batchDuplicateMode() === 'separate') {
      parts.push('Aparte rij bij duplicaat');
    }
    return parts.join(' · ');
  });

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
  readonly showMoreOptions = signal(false);

  // Handmatige override wanneer kaart niet in TCGdex gevonden wordt of offline
  readonly manualName = signal('');
  readonly manualSet = signal('');
  readonly manualNumber = signal('');

  readonly packMode = computed(() => this.store.packDefaults().enabled);

  readonly storedRecentSetCodes = signal<string[]>(this.loadRecentSetCodes());
  readonly recentSetCodes = computed(() => {
    const list: string[] = [];
    const pushCode = (raw: string) => {
      const clean = raw.trim().toUpperCase();
      if (clean && !list.includes(clean)) list.push(clean);
    };
    for (const c of this.storedRecentSetCodes()) pushCode(c);
    for (const card of this.store.collection()) {
      if (list.length >= 3) break;
      pushCode(getDisplaySetCode(card.cardId, card.setName));
    }
    return list.slice(0, 3);
  });

  readonly moreOptionsSummary = computed(() => {
    const parts: string[] = [];
    const gradingLabel =
      this.grading() === 'Raw'
        ? 'Raw'
        : `${this.grading()}${this.grade().trim() ? ' ' + this.grade().trim() : ''}`;
    parts.push(gradingLabel);
    parts.push(this.language());
    if (this.acquisitionMethod()) parts.push(this.acquisitionMethod());
    if (Number(this.purchasePrice()) > 0) parts.push(formatEur(Number(this.purchasePrice())));
    parts.push(this.forTrade() ? 'Te ruil' : 'Niet te ruil');
    if (this.notes().trim()) parts.push('Notitie');
    return parts.join(' · ');
  });

  // Duplicaatdetectie op exact Kaart-ID
  readonly existingMatch = computed(() => {
    const card = this.previewCard();
    if (!card) return null;
    const target = card.id.toLowerCase();
    const lang = normalizeLanguageCode(this.language());
    return (
      this.store
        .collection()
        .find((c) => c.cardId.toLowerCase() === target && normalizeLanguageCode(c.language) === lang) ?? null
    );
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

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.showBatchSheet()) {
      event.preventDefault();
      this.closeBatchSheet();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      if (this.isBatchDockActive()) {
        if (this.isSaving() || this.batchUniqueCount() === 0) return;
        event.preventDefault();
        void this.saveBatchSelection();
        return;
      }
      if (this.isSaving() || (!this.previewCard() && !this.manualName().trim())) return;
      event.preventDefault();
      void this.saveCard(true);
      return;
    }

    if (
      this.inputMode() === 'sets' &&
      !this.isSetDropdownOpen() &&
      !this.showBatchSheet() &&
      this.catalogTotalPages() > 1 &&
      !isEditableEventTarget(event.target)
    ) {
      if (event.key === 'ArrowLeft' && this.setCatalogPage() > 1) {
        event.preventDefault();
        this.prevSetCatalogPage();
      } else if (event.key === 'ArrowRight' && this.setCatalogPage() < this.catalogTotalPages()) {
        event.preventDefault();
        this.nextSetCatalogPage();
      }
    }
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

  toggleMoreOptions(): void {
    this.showMoreOptions.update((open) => !open);
  }

  applyRecentSetCode(code: string): void {
    this.inputMode.set('code');
    this.codeQuery.set(`${code} `);
    this.previewCard.set(null);
    this.lookupError.set(null);
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        const input = document.getElementById('qa-code-input') as HTMLInputElement | null;
        input?.focus();
      }, 0);
    }
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
      const found = await this.catalog.lookupByCardId(rawInput, this.language());
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
      const results = await this.catalog.searchByName(query, 16, this.language());
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
      const full = await this.catalog.getCardByExactId(item.id, this.language());
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

  async openSetByQuery(query: string): Promise<void> {
    await this.openSetsCatalog();
    const needle = query.trim().toLowerCase();
    if (!needle) return;
    const sets = this.allSets();
    const match =
      sets.find((s) => s.name.toLowerCase() === needle || s.id.toLowerCase() === needle) ??
      sets.find((s) => (s.code ?? '').toLowerCase() === needle) ??
      sets.find((s) => s.name.toLowerCase().includes(needle));
    if (match) {
      await this.selectCatalogSet(match.id);
    } else {
      this.setSearchQuery.set(query);
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

  prevSetCatalogPage(): void {
    const prev = Math.max(1, this.setCatalogPage() - 1);
    if (prev === this.setCatalogPage()) return;
    void this.haptics.light();
    this.setCatalogPage.set(prev);
    this.scrollSetCatalogTop();
  }

  nextSetCatalogPage(): void {
    const next = Math.min(this.catalogTotalPages(), this.setCatalogPage() + 1);
    if (next === this.setCatalogPage()) return;
    void this.haptics.light();
    this.setCatalogPage.set(next);
    this.scrollSetCatalogTop();
  }

  private scrollSetCatalogTop(): void {
    if (typeof document === 'undefined') return;
    const header = this.hostEl.nativeElement.querySelector('.sets-browser__header') as HTMLElement | null;
    try {
      header?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    } catch {
      // Negeer in omgevingen zonder scrollIntoView-opties
    }
  }

  isCardOwned(cardId: string): boolean {
    return this.ownedCardIdSet().has(cardId.toLowerCase());
  }

  getSelectedBatchItem(cardId: string): BatchSelectedCard | undefined {
    return this.selectedBatchMap().get(cardId.toLowerCase());
  }

  toggleMultiSelectMode(): void {
    void this.haptics.light();
    const next = !this.multiSelectMode();
    this.multiSelectMode.set(next);
    this.saveMultiSelectPref(next);
    if (next) {
      this.previewCard.set(null);
    }
  }

  toggleOnlyMissingInSet(): void {
    void this.haptics.light();
    this.onlyMissingInSet.update((prev) => !prev);
    this.setCatalogPage.set(1);
  }

  onCatalogTileClick(item: CatalogCardSummary, sourceSet?: CatalogSetDetail | null): void {
    if (this.multiSelectMode()) {
      this.toggleBatchCardSelection(item, sourceSet);
      return;
    }
    void this.selectNameResult(item);
  }

  toggleBatchCardSelection(item: CatalogCardSummary, sourceSet?: CatalogSetDetail | null): void {
    void this.haptics.light();
    const key = item.id.toLowerCase();
    const existing = this.selectedBatchMap().get(key);
    if (existing) {
      this.selectedBatchCards.update((list) => list.filter((c) => c.id.toLowerCase() !== key));
      return;
    }

    const setInfo = sourceSet ?? this.selectedCatalogSet();
    const inferredSetName =
      item.setName?.trim() ||
      (sourceSet?.name ?? (this.inputMode() === 'sets' ? setInfo?.name : '') ?? '') ||
      'Onbekende set';

    const newItem: BatchSelectedCard = {
      id: item.id,
      localId: item.localId,
      name: item.name,
      imageUrl: item.imageUrl,
      setId: sourceSet?.id ?? (this.inputMode() === 'sets' ? setInfo?.id : undefined),
      setName: inferredSetName,
      seriesName: sourceSet?.seriesName ?? (this.inputMode() === 'sets' ? setInfo?.series : undefined),
      setTotalCount:
        sourceSet?.officialCount ||
        sourceSet?.totalCount ||
        (this.inputMode() === 'sets' ? setInfo?.officialCount || setInfo?.totalCount : undefined),
      quantity: 1,
      variantOverride: '',
      isLoadingDetail: true,
    };

    this.selectedBatchCards.update((list) => [...list, newItem]);
    void this.prefetchBatchCardDetail(item.id);
  }

  adjustBatchCardQty(cardId: string, delta: number, event?: Event): void {
    event?.stopPropagation();
    void this.haptics.light();
    const key = cardId.toLowerCase();
    this.selectedBatchCards.update((list) =>
      list
        .map((c) => (c.id.toLowerCase() === key ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  }

  setBatchCardVariant(cardId: string, variantOverride: string): void {
    const key = cardId.toLowerCase();
    this.selectedBatchCards.update((list) =>
      list.map((c) => (c.id.toLowerCase() === key ? { ...c, variantOverride } : c))
    );
  }

  removeBatchCard(cardId: string): void {
    const key = cardId.toLowerCase();
    this.selectedBatchCards.update((list) => list.filter((c) => c.id.toLowerCase() !== key));
  }

  clearBatchSelection(): void {
    this.selectedBatchCards.set([]);
    this.showBatchSheet.set(false);
  }

  openBatchSheet(): void {
    void this.haptics.light();
    this.showBatchSheet.set(true);
  }

  closeBatchSheet(): void {
    this.showBatchSheet.set(false);
  }

  private async prefetchBatchCardDetail(cardId: string): Promise<void> {
    try {
      const detail = await this.catalog.getCardByExactId(cardId, this.language());
      const key = cardId.toLowerCase();
      this.selectedBatchCards.update((list) =>
        list.map((c) =>
          c.id.toLowerCase() === key
            ? {
                ...c,
                cardDetail: detail,
                isLoadingDetail: false,
                setName: detail?.setName || c.setName,
                seriesName: detail?.seriesName || c.seriesName,
                setTotalCount: detail?.officialCardCount || detail?.totalCardCount || c.setTotalCount,
                imageUrl: detail?.imageUrl || c.imageUrl,
              }
            : c
        )
      );
    } catch {
      const key = cardId.toLowerCase();
      this.selectedBatchCards.update((list) =>
        list.map((c) => (c.id.toLowerCase() === key ? { ...c, isLoadingDetail: false } : c))
      );
    }
  }

  async saveBatchSelection(): Promise<void> {
    const selected = this.selectedBatchCards();
    if (selected.length === 0 || this.isSaving()) return;

    this.isSaving.set(true);
    try {
      const resolvedDetails = new Map<string, CatalogCard | null>();
      const missing = selected.filter((item) => item.cardDetail === undefined);
      for (let i = 0; i < missing.length; i += 4) {
        const chunk = missing.slice(i, i + 4);
        const fetched = await Promise.all(
          chunk.map(async (item) => {
            try {
              const card = await this.catalog.getCardByExactId(item.id, this.language());
              return { id: item.id.toLowerCase(), card };
            } catch {
              return { id: item.id.toLowerCase(), card: null };
            }
          })
        );
        for (const entry of fetched) {
          resolvedDetails.set(entry.id, entry.card);
        }
      }

      const duplicateStrategy = this.batchDuplicateMode();
      const variantMode = this.batchVariantMode();
      const seenSetCodes = new Set<string>();

      const commitItems: BatchCardCommitItem[] = selected.map((item) => {
        const detail = item.cardDetail ?? resolvedDetails.get(item.id.toLowerCase()) ?? null;
        const setName = detail?.setName || item.setName || 'Onbekende set';
        const setCode = getDisplaySetCode(detail?.id || item.id, setName);
        if (setCode && !seenSetCodes.has(setCode)) {
          seenSetCodes.add(setCode);
          this.recordRecentSetCode(setCode);
        }

        const resolvedVariant =
          item.variantOverride ||
          (variantMode === 'auto' ? this.inferDefaultVariant(detail) : variantMode);
        const fallbackCardNumber =
          item.setTotalCount && item.setTotalCount > 0
            ? `${item.localId}/${item.setTotalCount}`
            : item.localId;

        return {
          duplicateStrategy,
          payload: {
            cardId: detail?.id || item.id,
            name: detail?.name || item.name,
            setName,
            cardNumber: detail?.cardNumber || fallbackCardNumber,
            language: this.language(),
            type: detail?.type || 'Colorless',
            rarity: detail?.rarity || 'Rare',
            variant: resolvedVariant,
            condition: this.condition(),
            grading: this.grading(),
            grade: this.grading() === 'Raw' ? '' : this.grade().trim(),
            quantity: item.quantity,
            storageLocation: this.storageLocation(),
            binderDetail: this.binderDetail().trim(),
            purchasePrice: Number(this.purchasePrice()) || 0,
            marketPrice: detail?.marketPriceEur ?? 0,
            acquisitionMethod: this.acquisitionMethod(),
            imageUrl: detail?.imageUrl || item.imageUrl,
            trendPercent: detail?.trendPercent,
            forTrade: this.forTrade(),
            notes: this.withLocalizedImageNote(this.notes().trim(), detail?.imageUrl, detail?.language),
            seriesName: detail?.seriesName || item.seriesName,
            setTotalCards: detail?.officialCardCount || detail?.totalCardCount || item.setTotalCount,
          },
        };
      });

      this.store.updatePackDefaults({
        enabled: this.packMode(),
        setCode: Array.from(seenSetCodes)[0] || this.store.packDefaults().setCode,
        condition: this.condition(),
        storageLocation: this.storageLocation(),
        language: this.language(),
        acquisitionMethod: this.acquisitionMethod(),
      });

      await this.store.addCardsBatch(commitItems);
      void this.haptics.success();
      this.selectedBatchCards.set([]);
      this.showBatchSheet.set(false);
    } finally {
      this.isSaving.set(false);
    }
  }

  applyExample(code: string): void {
    this.inputMode.set('code');
    this.codeQuery.set(code);
    void this.lookupByCode(code);
  }

  /**
   * Wijzigt de kaarttaal: ververst direct de actieve zoekopdracht zodat resultaten, scans en
   * Cardmarket-link in de gekozen taal verschijnen (FR, DE, JP, CHS…).
   */
  onLanguageChange(lang: string): void {
    if (normalizeLanguageCode(lang) === normalizeLanguageCode(this.language())) return;
    this.language.set(lang);
    this.previewCard.set(null);
    this.lookupError.set(null);
    if (this.inputMode() === 'code' && this.codeQuery().trim()) {
      void this.lookupByCode(this.codeQuery().trim());
    } else if (this.inputMode() === 'name' && this.nameQuery().trim().length >= 2) {
      void this.searchByName(this.nameQuery().trim());
    }
  }

  /** Bewaar anderstalige scan-URL in de notities (`[IMG:…]`) zodat die ook na een sync zichtbaar blijft. */
  private withLocalizedImageNote(notes: string, imageUrl?: string, cardLanguage?: string): string {
    if (!imageUrl || !cardLanguage || normalizeLanguageCode(cardLanguage) === 'EN') return notes;
    if (extractArtworkUrlFromNotes(notes)) return notes;
    return [notes, `[IMG:${imageUrl}]`].filter(Boolean).join(' ').trim();
  }

  private applyCatalogCard(card: CatalogCard): void {
    this.previewCard.set(card);
    this.lookupError.set(null);
    this.variant.set(this.inferDefaultVariant(card));
  }

  inferDefaultVariant(card?: CatalogCard | null): string {
    const r = (card?.rarity ?? '').toLowerCase();
    if (r.includes('special illustration') || r.includes('alt')) {
      return 'Alt Art';
    }
    if (r.includes('illustration') || r.includes('ultra')) {
      return 'Full Art';
    }
    if (r.includes('promo')) {
      return 'Stamped / Promo';
    }
    if (r.includes('holo') || r.includes('double rare')) {
      return 'Holo';
    }
    return 'Normal';
  }

  adjustQty(delta: number): void {
    void this.haptics.light();
    this.quantity.update((q) => Math.max(1, q + delta));
  }

  async incrementDuplicate(): Promise<void> {
    const existing = this.existingMatch();
    if (!existing) return;
    void this.haptics.success();
    this.recordRecentSetCode(getDisplaySetCode(existing.cardId, existing.setName));
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
      const usedSetCode =
        parsed?.inputSetCode || (card ? getDisplaySetCode(card.id, card.setName) : '');
      if (usedSetCode) {
        this.recordRecentSetCode(usedSetCode);
      }

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
        notes: this.withLocalizedImageNote(this.notes().trim(), card?.imageUrl, card?.language),
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
    const keepNameResults = this.inputMode() === 'name';
    this.previewCard.set(null);
    if (!keepNameResults) {
      this.nameResults.set([]);
      this.nameQuery.set('');
    }
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
    this.codeQuery.set(rememberSet && this.inputMode() === 'code' && rememberedSet ? `${rememberedSet} ` : '');

    // Geen automatische scrollTo({ top: 0 }) of ongevraagd toetsenbord-focus op mobiel:
    // houd het scherm exact op de huidige positie. Alleen op desktop in Code / ID + Pack Mode
    // klaarzetten als het invoerveld al zichtbaar in de viewport staat.
    if (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      rememberSet &&
      this.inputMode() === 'code' &&
      window.innerWidth >= 768
    ) {
      if (this.focusTimer) clearTimeout(this.focusTimer);
      this.focusTimer = setTimeout(() => {
        const el = document.getElementById('qa-code-input') as HTMLInputElement | null;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
          el.focus({ preventScroll: true });
        }
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

  private recordRecentSetCode(rawCode: string): void {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    const next = [code, ...this.storedRecentSetCodes().filter((c) => c !== code)].slice(0, 5);
    this.storedRecentSetCodes.set(next);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RECENT_SET_CODES_KEY, JSON.stringify(next));
      }
    } catch {
      // negeer opslagfout
    }
  }

  private loadRecentSetCodes(): string[] {
    try {
      if (typeof window === 'undefined') return [];
      const raw = window.localStorage.getItem(RECENT_SET_CODES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private loadMultiSelectPref(): boolean {
    try {
      if (typeof window === 'undefined') return false;
      return window.localStorage.getItem(MULTI_SELECT_PREF_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private saveMultiSelectPref(enabled: boolean): void {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(MULTI_SELECT_PREF_KEY, String(enabled));
      }
    } catch {
      // negeer opslagfout
    }
  }
}
