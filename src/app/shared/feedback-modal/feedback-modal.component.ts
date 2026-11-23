import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FEEDBACK_PAGES, FeedbackCategory, FeedbackPage } from '../../core/domain/models';
import { FeedbackStore } from '../../core/state/feedback.store';

@Component({
  selector: 'pb-feedback-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './feedback-modal.component.html',
  styleUrl: './feedback-modal.component.scss',
})
export class FeedbackModalComponent {
  readonly feedback = inject(FeedbackStore);
  private readonly router = inject(Router);

  readonly pages = FEEDBACK_PAGES;
  readonly categories: FeedbackCategory[] = ['Bug', 'Idee', 'Verbetering', 'UI / Design'];

  readonly isEditMode = computed(() => this.feedback.editingItem() !== null);
  readonly availablePages = computed<string[]>(() => {
    const edit = this.feedback.editingItem();
    const list: string[] = [...FEEDBACK_PAGES];
    if (edit?.page && !list.includes(edit.page)) {
      list.unshift(edit.page);
    }
    return list;
  });
  readonly availableCategories = computed<string[]>(() => {
    const edit = this.feedback.editingItem();
    const list: string[] = [...this.categories];
    if (edit?.category && !list.includes(edit.category)) {
      list.unshift(edit.category);
    }
    return list;
  });

  readonly selectedPage = signal<string>('Algemeen / Hele app');
  readonly category = signal<string>('Idee');
  readonly title = signal('');
  readonly description = signal('');
  readonly author = signal(this.feedback.savedAuthor());
  readonly isSubmitting = signal(false);

  constructor() {
    effect(() => {
      if (!this.feedback.isComposerOpen()) return;
      const editing = this.feedback.editingItem();
      if (editing) {
        this.selectedPage.set(editing.page || 'Algemeen / Hele app');
        this.category.set(editing.category || 'Idee');
        this.title.set(editing.title || '');
        this.description.set(editing.description || '');
        this.author.set(editing.author || this.feedback.savedAuthor());
      } else {
        this.selectedPage.set(this.feedback.composerDefaultPage());
        this.category.set('Idee');
        this.title.set('');
        this.description.set('');
        this.author.set(this.feedback.savedAuthor());
      }
    });
  }

  close(): void {
    this.feedback.closeComposer();
  }

  openHub(): void {
    this.close();
    void this.router.navigateByUrl('/meer/feedback');
  }

  async submit(openGitHubIssue: boolean): Promise<void> {
    if (!this.title().trim() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    try {
      const editing = this.feedback.editingItem();
      if (editing) {
        await this.feedback.editFeedback(editing, {
          page: this.selectedPage(),
          category: this.category(),
          title: this.title(),
          description: this.description(),
          author: this.author(),
        });
      } else {
        await this.feedback.submitFeedback({
          page: this.selectedPage() as FeedbackPage,
          category: this.category() as FeedbackCategory,
          title: this.title(),
          description: this.description(),
          author: this.author(),
          openGitHubIssue,
        });
      }
      this.title.set('');
      this.description.set('');
      this.close();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.feedback.isComposerOpen()) {
      this.close();
    }
  }
}
