import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { compressScreenshotFile } from '../../core/domain/image-compress.utils';
import {
  FEEDBACK_PAGES,
  FeedbackCategory,
  FeedbackPage,
  FeedbackScreenshotUpload,
} from '../../core/domain/models';
import { ModalScrollLockService } from '../../core/platform/modal-scroll-lock.service';
import { CollectionStore } from '../../core/state/collection.store';
import { FeedbackStore } from '../../core/state/feedback.store';

@Component({
  selector: 'pb-feedback-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './feedback-modal.component.html',
  styleUrl: './feedback-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackModalComponent {
  readonly feedback = inject(FeedbackStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly router = inject(Router);
  private readonly scrollLock = inject(ModalScrollLockService);

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

  readonly pendingScreenshot = signal<FeedbackScreenshotUpload | null>(null);
  readonly existingScreenshotUrl = signal<string>('');
  readonly removeExistingScreenshot = signal<boolean>(false);
  readonly isCompressingImage = signal<boolean>(false);
  readonly isDragOver = signal<boolean>(false);

  readonly activeScreenshotPreviewUrl = computed(() => {
    const pending = this.pendingScreenshot();
    if (pending) return pending.dataUrl;
    if (!this.removeExistingScreenshot() && this.existingScreenshotUrl()) {
      return this.existingScreenshotUrl();
    }
    return '';
  });

  constructor() {
    this.scrollLock.bind(() => this.feedback.isComposerOpen());

    effect(() => {
      if (!this.feedback.isComposerOpen()) return;
      const editing = this.feedback.editingItem();
      this.pendingScreenshot.set(null);
      this.removeExistingScreenshot.set(false);
      this.isDragOver.set(false);
      if (editing) {
        this.selectedPage.set(editing.page || 'Algemeen / Hele app');
        this.category.set(editing.category || 'Idee');
        this.title.set(editing.title || '');
        this.description.set(editing.description || '');
        this.author.set(editing.author || this.feedback.savedAuthor());
        this.existingScreenshotUrl.set(editing.screenshotUrl || '');
      } else {
        this.selectedPage.set(this.feedback.composerDefaultPage());
        this.category.set('Idee');
        this.title.set('');
        this.description.set('');
        this.author.set(this.feedback.savedAuthor());
        this.existingScreenshotUrl.set('');
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

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (file) {
      await this.attachImageFile(file);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(): void {
    this.isDragOver.set(false);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isDragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      await this.attachImageFile(file);
    }
  }

  @HostListener('window:paste', ['$event'])
  async onWindowPaste(event: ClipboardEvent): Promise<void> {
    if (!this.feedback.isComposerOpen()) return;
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const entry = items[i];
      if (entry.type.startsWith('image/')) {
        const file = entry.getAsFile();
        if (file) {
          event.preventDefault();
          await this.attachImageFile(file);
          return;
        }
      }
    }
  }

  async attachImageFile(file: File): Promise<void> {
    this.isCompressingImage.set(true);
    try {
      const compressed = await compressScreenshotFile(file);
      this.pendingScreenshot.set(compressed);
      this.removeExistingScreenshot.set(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kon screenshot niet verwerken.';
      this.collectionStore.showToast(msg, 'warning');
    } finally {
      this.isCompressingImage.set(false);
    }
  }

  clearScreenshot(): void {
    if (this.pendingScreenshot()) {
      this.pendingScreenshot.set(null);
      if (!this.existingScreenshotUrl()) {
        this.removeExistingScreenshot.set(false);
      }
      return;
    }
    if (this.existingScreenshotUrl()) {
      this.removeExistingScreenshot.set(true);
    }
  }

  async submit(openGitHubIssue: boolean): Promise<void> {
    if (!this.title().trim() || this.isSubmitting() || this.isCompressingImage()) return;

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
          screenshot: this.pendingScreenshot(),
          removeScreenshot: this.removeExistingScreenshot(),
        });
      } else {
        await this.feedback.submitFeedback({
          page: this.selectedPage() as FeedbackPage,
          category: this.category() as FeedbackCategory,
          title: this.title(),
          description: this.description(),
          author: this.author(),
          openGitHubIssue,
          screenshot: this.pendingScreenshot(),
        });
      }
      this.title.set('');
      this.description.set('');
      this.pendingScreenshot.set(null);
      this.existingScreenshotUrl.set('');
      this.removeExistingScreenshot.set(false);
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
