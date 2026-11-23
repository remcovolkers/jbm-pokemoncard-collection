import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FEEDBACK_PAGES,
  FeedbackCategory,
  FeedbackItem,
  FeedbackStatus,
} from '../../core/domain/models';
import { CollectionStore } from '../../core/state/collection.store';
import { FeedbackStore } from '../../core/state/feedback.store';

type StatusFilter = 'all' | FeedbackStatus;

@Component({
  selector: 'app-feedback-hub',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './feedback-hub.component.html',
  styleUrl: './feedback-hub.component.scss',
})
export class FeedbackHubComponent implements OnInit {
  readonly feedback = inject(FeedbackStore);
  private readonly store = inject(CollectionStore);

  readonly pages = FEEDBACK_PAGES;
  readonly categories: FeedbackCategory[] = ['Bug', 'Idee', 'Verbetering', 'UI / Design'];

  readonly statusFilter = signal<StatusFilter>('all');
  readonly pageFilter = signal<string>('ALL');
  readonly categoryFilter = signal<string>('ALL');
  readonly searchQuery = signal<string>('');

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

  ngOnInit(): void {
    void this.feedback.refreshPublicIssues(true);
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
    const lines = [
      `[${item.category}] ${item.page} — ${item.title} (status: ${this.statusLabel(item.status)}, stemmen: ${item.votes})`,
    ];
    if (item.description?.trim()) {
      lines.push(item.description.trim());
    }
    lines.push(`Ingediend door: ${item.author} (${this.sourceLabel(item.source)})`);
    return lines.join('\n');
  }

  buildFilteredPrompt(): string {
    const items = this.filteredItems();
    if (items.length === 0) return '';
    const header = `Kun je de volgende ${items.length === 1 ? 'feedback' : `${items.length} feedback-items`} uit PokéBinder oppakken en oplossen?\n`;
    return header + '\n' + items.map((item, idx) => `${idx + 1}. ${this.formatItemAsPrompt(item)}`).join('\n\n---\n\n');
  }

  async copyItemPrompt(item: FeedbackItem): Promise<void> {
    const text = `Kun je dit feedback-item uit PokéBinder oppakken?\n\n${this.formatItemAsPrompt(item)}`;
    const ok = await this.copyToClipboard(text);
    this.store.showToast(
      ok ? 'Feedback gekopieerd als prompt voor in de chat!' : 'Kopiëren mislukt — selecteer de tekst handmatig.',
      ok ? 'success' : 'warning'
    );
  }

  async copyFilteredPrompt(): Promise<void> {
    const text = this.buildFilteredPrompt();
    if (!text) {
      this.store.showToast('Geen zichtbare feedback-items om te kopiëren.', 'info');
      return;
    }
    const ok = await this.copyToClipboard(text);
    this.store.showToast(
      ok
        ? `${this.filteredItems().length} feedback-item(s) gekopieerd als prompt!`
        : 'Kopiëren mislukt — selecteer de tekst handmatig.',
      ok ? 'success' : 'warning'
    );
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
