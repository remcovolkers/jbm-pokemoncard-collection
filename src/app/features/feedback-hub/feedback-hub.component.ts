import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FEEDBACK_PAGES,
  FeedbackCategory,
  FeedbackItem,
  FeedbackStatus,
} from '../../core/domain/models';
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
}
