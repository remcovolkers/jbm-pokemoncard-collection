import { Component, HostListener, effect, inject, signal } from '@angular/core';
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

  readonly selectedPage = signal<FeedbackPage>('Algemeen / Hele app');
  readonly category = signal<FeedbackCategory>('Idee');
  readonly title = signal('');
  readonly description = signal('');
  readonly author = signal(this.feedback.savedAuthor());
  readonly isSubmitting = signal(false);

  constructor() {
    effect(() => {
      if (this.feedback.isComposerOpen()) {
        this.selectedPage.set(this.feedback.composerDefaultPage());
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
      await this.feedback.submitFeedback({
        page: this.selectedPage(),
        category: this.category(),
        title: this.title(),
        description: this.description(),
        author: this.author(),
        openGitHubIssue,
      });
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
