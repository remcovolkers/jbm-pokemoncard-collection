import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { buildDriveViewUrl } from '../../core/domain/image-compress.utils';
import {
  FEEDBACK_PAGES,
  FeedbackCategory,
  FeedbackItem,
  FeedbackStatus,
} from '../../core/domain/models';
import { ModalScrollLockService } from '../../core/platform/modal-scroll-lock.service';
import { isEditableEventTarget } from '../../core/platform/keyboard.utils';
import { CollectionStore } from '../../core/state/collection.store';
import { FeedbackStore } from '../../core/state/feedback.store';

type StatusFilter = 'all' | FeedbackStatus;

@Component({
  selector: 'app-feedback-hub',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './feedback-hub.component.html',
  styleUrl: './feedback-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackHubComponent implements OnInit, OnDestroy {
  readonly feedback = inject(FeedbackStore);
  private readonly store = inject(CollectionStore);
  private readonly scrollLock = inject(ModalScrollLockService);

  readonly pages = FEEDBACK_PAGES;
  readonly categories: FeedbackCategory[] = ['Bug', 'Idee', 'Verbetering', 'UI / Design'];
  readonly buildDriveViewUrl = buildDriveViewUrl;

  readonly statusFilter = signal<StatusFilter>('all');
  readonly pageFilter = signal<string>('ALL');
  readonly categoryFilter = signal<string>('ALL');
  readonly searchQuery = signal<string>('');
  readonly copiedKey = signal<string | null>(null);
  readonly activeLightboxItem = signal<FeedbackItem | null>(null);
  readonly isLightboxOpen = computed(() => this.activeLightboxItem() !== null);

  private copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.scrollLock.bind(() => this.isLightboxOpen(), () => this.closeLightbox());
  }

  readonly filteredItems = computed(() => {
    const status = this.statusFilter();
    const page = this.pageFilter();
    const cat = this.categoryFilter();
    const q = this.searchQuery().trim().toLowerCase();

    return this.feedback.items().filter((item) => {
      if (status !== 'all' && item.status !== status) return false;
      if (page !== 'ALL' && item.page !== page) return false;
      if (cat !== 'ALL' && item.category !== cat) return false;
      if (q) {
        const hay = `${item.title} ${item.description} ${item.page} ${item.category} ${item.author}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  /**
   * Items voor de bulk "Copy to prompt"-knop: op tabblad Alle slaan we afgeronde
   * items over zolang er nog open/bezig items in de huidige selectie staan.
   */
  readonly promptTargetItems = computed(() => {
    const list = this.filteredItems();
    if (this.statusFilter() !== 'all') return list;
    const active = list.filter((i) => i.status !== 'done');
    return active.length > 0 ? active : list;
  });

  ngOnInit(): void {
    void this.feedback.refreshHub(true);
    void this.feedback.refreshPublicIssues(true);
  }

  ngOnDestroy(): void {
    if (this.copyResetTimer) clearTimeout(this.copyResetTimer);
  }

  async refreshAll(): Promise<void> {
    await Promise.all([
      this.feedback.refreshHub(false),
      this.feedback.refreshPublicIssues(true),
    ]);
  }

  openLightbox(item: FeedbackItem): void {
    if (!item.screenshotUrl) return;
    this.activeLightboxItem.set(item);
  }

  closeLightbox(): void {
    this.activeLightboxItem.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.activeLightboxItem()) {
      this.closeLightbox();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if (this.activeLightboxItem() || isEditableEventTarget(event.target)) return;
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const input = document.getElementById('hub-search') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }
  }

  openNewFeedback(): void {
    const activePage = this.pageFilter();
    this.feedback.openComposer(
      activePage !== 'ALL' ? (activePage as (typeof FEEDBACK_PAGES)[number]) : 'Algemeen / Hele app'
    );
  }

  statusLabel(status: FeedbackStatus): string {
    switch (status) {
      case 'in_progress':
        return 'Bezig';
      case 'done':
        return 'Afgerond';
      default:
        return 'Open';
    }
  }

  sourceLabel(source: FeedbackItem['source']): string {
    switch (source) {
      case 'hub':
        return 'PokéBinder Hub';
      case 'github':
        return 'Publiek (GitHub)';
      case 'sheets':
        return 'Google Sheets';
      default:
        return 'Lokaal';
    }
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  }

  formatItemAsPrompt(item: FeedbackItem): string {
    const dateStr = this.formatDate(item.createdAt);
    const metaParts = [item.author, dateStr, this.sourceLabel(item.source)].filter(Boolean);
    const lines = [
      `### [${item.category}] ${item.page} — ${item.title}`,
      `Status: ${this.statusLabel(item.status)} | Stemmen: ${item.votes} | Ingediend door: ${metaParts.join(' · ')}`,
    ];
    if (item.description?.trim()) {
      lines.push('', item.description.trim());
    }
    if (item.screenshotUrl?.trim()) {
      lines.push('', `Screenshot: ${item.screenshotUrl.trim()}`);
    }
    return lines.join('\n');
  }

  buildFilteredPrompt(): string {
    const items = this.promptTargetItems();
    if (items.length === 0) return '';
    const header =
      items.length === 1
        ? 'Kun je het volgende feedback-item uit PokéBinder oppakken en oplossen?'
        : `Kun je de volgende ${items.length} feedback-items uit PokéBinder oppakken en oplossen?`;
    return `${header}\n\n${items.map((item, idx) => `${idx + 1}. ${this.formatItemAsPrompt(item)}`).join('\n\n---\n\n')}`;
  }

  async copyItemPrompt(item: FeedbackItem): Promise<void> {
    const text = `Kun je dit feedback-item uit PokéBinder oppakken?\n\n${this.formatItemAsPrompt(item)}`;
    const ok = await this.copyToClipboard(text);
    if (ok) this.markCopied(item.id);
    this.store.showToast(
      ok ? 'Feedback gekopieerd als prompt voor in de chat!' : 'Kopiëren mislukt — selecteer de tekst handmatig.',
      ok ? 'success' : 'warning'
    );
  }

  async copyFilteredPrompt(): Promise<void> {
    const items = this.promptTargetItems();
    const text = this.buildFilteredPrompt();
    if (!text) {
      this.store.showToast('Geen feedback-items om te kopiëren.', 'info');
      return;
    }
    const ok = await this.copyToClipboard(text);
    if (ok) this.markCopied('bulk');
    this.store.showToast(
      ok
        ? `${items.length} feedback-item(s) gekopieerd als prompt!`
        : 'Kopiëren mislukt — selecteer de tekst handmatig.',
      ok ? 'success' : 'warning'
    );
  }

  private markCopied(key: string): void {
    this.copiedKey.set(key);
    if (this.copyResetTimer) clearTimeout(this.copyResetTimer);
    this.copyResetTimer = setTimeout(() => {
      this.copiedKey.set(null);
    }, 2000);
  }

  private async copyToClipboard(text: string): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Val terug op textarea-methode (bijv. in oudere WebViews)
    }

    try {
      if (typeof document === 'undefined') return false;
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(ta);
      return copied;
    } catch {
      return false;
    }
  }
}
