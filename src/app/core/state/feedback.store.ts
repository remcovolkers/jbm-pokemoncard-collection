import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { FeedbackHubAdapter } from '../adapters/feedback-hub.adapter';
import {
  FEEDBACK_PAGES,
  FeedbackCategory,
  FeedbackItem,
  FeedbackPage,
  FeedbackScreenshotUpload,
  FeedbackStatus,
} from '../domain/models';
import { APP_VERSION } from '../platform/app-version';
import { PlatformService } from '../platform/platform.service';
import { COLLECTION_REPOSITORY } from '../ports/collection-repository.port';
import { CollectionStore } from './collection.store';

const FEEDBACK_STORAGE_KEY = 'pokebinder_feedback_v1';
const FEEDBACK_UPVOTES_KEY = 'pokebinder_feedback_upvotes_v1';
const FEEDBACK_AUTHOR_KEY = 'pokebinder_feedback_author_v1';

const GITHUB_REPO = 'remcovolkers/jbm-pokemoncard-collection';
const GITHUB_ISSUES_API = `https://api.github.com/repos/${GITHUB_REPO}/issues?state=all&labels=feedback&per_page=100`;

interface GitHubIssueDto {
  number: number;
  title: string;
  body?: string | null;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  user?: { login?: string };
  labels?: Array<{ name?: string }>;
  reactions?: { '+1'?: number; total_count?: number };
  pull_request?: unknown;
}

@Injectable({ providedIn: 'root' })
export class FeedbackStore {
  private readonly collectionStore = inject(CollectionStore);
  private readonly repo = inject(COLLECTION_REPOSITORY);
  private readonly hub = inject(FeedbackHubAdapter);
  private readonly platform = inject(PlatformService);

  // Composer Modal state (gedeeld over elke pagina)
  readonly isComposerOpen = signal<boolean>(false);
  readonly composerDefaultPage = signal<FeedbackPage>('Algemeen / Hele app');
  readonly editingItem = signal<FeedbackItem | null>(null);

  // Data signals
  readonly hubItems = signal<FeedbackItem[]>([]);
  readonly localItems = signal<FeedbackItem[]>(this.loadLocalItems());
  readonly githubItems = signal<FeedbackItem[]>([]);
  readonly upvotedIds = signal<string[]>(this.loadUpvotedIds());
  readonly savedAuthor = signal<string>(this.loadSavedAuthor());
  readonly isLoadingHub = signal<boolean>(false);
  readonly isLoadingPublic = signal<boolean>(false);
  readonly lastSyncedHubAt = signal<string | null>(null);
  readonly lastSyncedPublicAt = signal<string | null>(null);

  /**
   * Gecombineerde to-do lijst onafhankelijk van collectie-spreadsheets:
   *  1. Centrale PokéBinder Feedback Hub (vast gekoppeld aan app + Google Drive screenshots)
   *  2. Publieke GitHub Issues (label `feedback`)
   *  3. Eventuele oudere Google Sheets `Feedback`-items
   *  4. Lokale / offline wachtrij-items
   */
  readonly items = computed<FeedbackItem[]>(() => {
    const hub = this.hubItems();
    const sheetsItems = this.collectionStore.snapshot().feedback ?? [];
    const gh = this.githubItems();
    const local = this.localItems();

    const merged = new Map<string, FeedbackItem>();
    for (const item of gh) merged.set(item.id, item);
    for (const item of sheetsItems) {
      if (!merged.has(item.id)) {
        merged.set(item.id, { ...item, source: 'sheets' });
      }
    }
    for (const item of hub) merged.set(item.id, { ...item, source: 'hub' });
    for (const item of local) {
      if (!merged.has(item.id)) {
        merged.set(item.id, item);
      }
    }

    const list = Array.from(merged.values());
    const statusOrder: Record<FeedbackStatus, number> = { in_progress: 0, open: 1, done: 2 };
    return list.sort((a, b) => {
      const s = statusOrder[a.status] - statusOrder[b.status];
      if (s !== 0) return s;
      if (b.votes !== a.votes) return b.votes - a.votes;
      return b.createdAt.localeCompare(a.createdAt);
    });
  });

  readonly stats = computed(() => {
    const all = this.items();
    const open = all.filter((i) => i.status === 'open').length;
    const inProgress = all.filter((i) => i.status === 'in_progress').length;
    const done = all.filter((i) => i.status === 'done').length;
    const total = all.length;
    const donePercent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, open, inProgress, done, active: open + inProgress, donePercent };
  });

  constructor() {
    effect(() => {
      this.writeStorage(FEEDBACK_STORAGE_KEY, this.localItems());
    });
    effect(() => {
      this.writeStorage(FEEDBACK_UPVOTES_KEY, this.upvotedIds());
    });
    effect(() => {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(FEEDBACK_AUTHOR_KEY, this.savedAuthor());
        }
      } catch {
        // negeer
      }
    });
  }

  openComposer(page?: FeedbackPage): void {
    this.editingItem.set(null);
    this.composerDefaultPage.set(page ?? 'Algemeen / Hele app');
    this.isComposerOpen.set(true);
  }

  openEditor(item: FeedbackItem): void {
    this.editingItem.set(item);
    if ((FEEDBACK_PAGES as readonly string[]).includes(item.page)) {
      this.composerDefaultPage.set(item.page as FeedbackPage);
    }
    this.isComposerOpen.set(true);
  }

  closeComposer(): void {
    this.isComposerOpen.set(false);
    this.editingItem.set(null);
  }

  mapUrlToFeedbackPage(url: string): FeedbackPage {
    const clean = (url || '').toLowerCase();
    if (clean.startsWith('/dashboard')) return 'Dashboard';
    if (clean.startsWith('/collectie')) return 'Collectie';
    if (clean.startsWith('/toevoegen')) return 'Snel Toevoegen';
    if (clean.startsWith('/pokedex')) return 'Pokédex Binder';
    if (clean.startsWith('/meer/sets')) return 'Set Voortgang';
    if (clean.startsWith('/meer/verlanglijst')) return 'Verlanglijst';
    if (clean.startsWith('/meer/ruil-verkoop')) return 'Ruil & Verkoop';
    if (clean.startsWith('/meer/instellingen')) return 'Instellingen';
    if (clean.startsWith('/meer/feedback') || clean.startsWith('/feedback')) return 'Feedback Hub';
    return 'Algemeen / Hele app';
  }

  async refreshHub(silent = true): Promise<void> {
    if (!this.hub.isConfigured() || this.isLoadingHub() || !this.collectionStore.isOnline()) return;
    this.isLoadingHub.set(true);
    try {
      const items = await this.hub.listItems();
      this.hubItems.set(items);
      const syncedIds = new Set(items.map((i) => i.id));
      this.localItems.update((list) => list.filter((i) => !syncedIds.has(i.id)));
      this.lastSyncedHubAt.set(new Date().toISOString());
      if (!silent) {
        this.collectionStore.showToast(
          `Centrale Feedback Hub gesynchroniseerd (${items.length} items).`,
          'info'
        );
      }
    } catch {
      if (!silent) {
        this.collectionStore.showToast(
          'Kon centrale Feedback Hub niet laden — controleer internet of autorisatie.',
          'warning'
        );
      }
    } finally {
      this.isLoadingHub.set(false);
    }
  }

  async refreshPublicIssues(silent = true): Promise<void> {
    if (this.isLoadingPublic() || !this.collectionStore.isOnline()) return;
    this.isLoadingPublic.set(true);
    try {
      const res = await fetch(GITHUB_ISSUES_API, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return;
      const raw = (await res.json()) as GitHubIssueDto[];
      if (!Array.isArray(raw)) return;

      const parsed = raw
        .filter((issue) => !issue.pull_request)
        .map((issue) => this.mapGitHubIssue(issue));

      this.githubItems.set(parsed);
      this.lastSyncedPublicAt.set(new Date().toISOString());
      if (!silent) {
        this.collectionStore.showToast(
          `Feedback Hub ververst (${parsed.length} publieke GitHub items).`,
          'info'
        );
      }
    } catch {
      if (!silent) {
        this.collectionStore.showToast('Kon publieke GitHub feedback niet ophalen (offline).', 'warning');
      }
    } finally {
      this.isLoadingPublic.set(false);
    }
  }

  async submitFeedback(input: {
    page: FeedbackPage;
    category: FeedbackCategory;
    title: string;
    description: string;
    author?: string;
    openGitHubIssue?: boolean;
    screenshot?: FeedbackScreenshotUpload | null;
  }): Promise<FeedbackItem> {
    const author = (input.author || '').trim() || 'Verzamelaar';
    if (input.author?.trim()) {
      this.savedAuthor.set(input.author.trim());
    }

    const useHub = this.hub.isConfigured();
    const item: FeedbackItem = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      page: input.page,
      category: input.category,
      title: input.title.trim(),
      description: input.description.trim(),
      status: 'open',
      votes: 1,
      author,
      platform: `${this.platform.runtimeLabel()} · v${APP_VERSION.webVersion}`,
      source: useHub ? 'hub' : this.isSheetsLive() ? 'sheets' : 'local',
      screenshotUrl: input.screenshot?.dataUrl,
    };

    this.upvotedIds.update((ids) => (ids.includes(item.id) ? ids : [...ids, item.id]));

    let resultItem = item;
    if (useHub && this.collectionStore.isOnline()) {
      this.hubItems.update((list) => [item, ...list]);
      try {
        const res = await this.hub.addItem({
          id: item.id,
          createdAt: item.createdAt,
          page: item.page,
          category: item.category,
          title: item.title,
          description: item.description,
          status: item.status,
          votes: item.votes,
          author: item.author,
          platform: item.platform,
          screenshot: input.screenshot
            ? {
                base64: input.screenshot.base64,
                mimeType: input.screenshot.mimeType,
                fileName: input.screenshot.fileName,
              }
            : undefined,
        });
        this.hubItems.set(res.items);
        this.localItems.update((list) => list.filter((i) => i.id !== item.id));
        resultItem = res.item;
        this.collectionStore.showToast(
          input.screenshot
            ? 'Feedback + screenshot opgeslagen in centrale Feedback Hub!'
            : 'Bedankt! Je feedback staat in de centrale Feedback Hub.',
          'success'
        );
      } catch {
        this.hubItems.update((list) => list.filter((i) => i.id !== item.id));
        const fallbackLocal: FeedbackItem = { ...item, source: 'local' };
        this.localItems.update((list) => [fallbackLocal, ...list]);
        resultItem = fallbackLocal;
        this.collectionStore.showToast(
          'Feedback lokaal bewaard (centrale Hub reageerde niet — controleer verbinding).',
          'warning'
        );
      }
    } else {
      this.localItems.update((list) => [item, ...list]);

      if (!useHub && this.isSheetsLive() && this.repo.addFeedback) {
        try {
          const snap = await this.repo.addFeedback(this.collectionStore.config(), {
            id: item.id,
            createdAt: item.createdAt,
            page: item.page,
            category: item.category,
            title: item.title,
            description: item.description,
            status: item.status,
            votes: item.votes,
            author: item.author,
            platform: item.platform,
          });
          this.collectionStore.snapshot.set(snap);
        } catch {
          // Lokaal item blijft behouden
        }
      }
      this.collectionStore.showToast('Bedankt! Je feedback staat op de Feedback Hub to-do lijst.', 'success');
    }

    if (input.openGitHubIssue) {
      const ghUrl = this.buildGitHubIssueUrl(resultItem);
      await this.platform.openExternalUrl(ghUrl);
    }

    return resultItem;
  }

  async editFeedback(
    item: FeedbackItem,
    input: {
      page: FeedbackPage | string;
      category: FeedbackCategory | string;
      title: string;
      description: string;
      author?: string;
      screenshot?: FeedbackScreenshotUpload | null;
      removeScreenshot?: boolean;
    }
  ): Promise<FeedbackItem> {
    const nextAuthor = (input.author || '').trim() || item.author || 'Verzamelaar';
    if (input.author?.trim()) {
      this.savedAuthor.set(input.author.trim());
    }

    const nextScreenshotUrl = input.screenshot
      ? input.screenshot.dataUrl
      : input.removeScreenshot
        ? undefined
        : item.screenshotUrl;

    const updated: FeedbackItem = {
      ...item,
      page: input.page,
      category: input.category,
      title: input.title.trim(),
      description: input.description.trim(),
      author: nextAuthor,
      screenshotUrl: nextScreenshotUrl,
      screenshotFileId: input.removeScreenshot ? undefined : item.screenshotFileId,
    };

    if (item.source === 'hub') {
      this.hubItems.update((list) => list.map((i) => (i.id === item.id ? updated : i)));
      if (this.hub.isConfigured() && this.collectionStore.isOnline()) {
        try {
          const syncedList = await this.hub.updateItem({
            id: item.id,
            page: updated.page,
            category: updated.category,
            title: updated.title,
            description: updated.description,
            author: updated.author,
            screenshot: input.screenshot
              ? {
                  base64: input.screenshot.base64,
                  mimeType: input.screenshot.mimeType,
                  fileName: input.screenshot.fileName,
                }
              : undefined,
            removeScreenshot: input.removeScreenshot,
          });
          this.hubItems.set(syncedList);
        } catch {
          // Optimistische update blijft zichtbaar
        }
      }
      this.collectionStore.showToast('Feedback-item bijgewerkt!', 'success');
      return this.hubItems().find((i) => i.id === item.id) ?? updated;
    }

    if (item.source === 'sheets') {
      this.collectionStore.snapshot.update((snap) => ({
        ...snap,
        feedback: (snap.feedback ?? []).map((i) => (i.id === item.id ? updated : i)),
      }));
    }

    this.localItems.update((list) => {
      const exists = list.some((i) => i.id === item.id);
      if (exists) {
        return list.map((i) => (i.id === item.id ? updated : i));
      }
      return item.source === 'local' ? [updated, ...list] : list;
    });

    if (item.source === 'sheets' && this.isSheetsLive() && this.repo.updateFeedback) {
      try {
        const snap = await this.repo.updateFeedback(this.collectionStore.config(), {
          id: item.id,
          page: updated.page,
          category: updated.category,
          title: updated.title,
          description: updated.description,
          author: updated.author,
        });
        this.collectionStore.snapshot.set(snap);
      } catch {
        // Blijft lokaal/optimistisch bijgewerkt
      }
    }

    this.collectionStore.showToast('Feedback-item bijgewerkt!', 'success');
    return updated;
  }

  async setStatus(item: FeedbackItem, nextStatus: FeedbackStatus): Promise<void> {
    if (item.source === 'github') {
      this.githubItems.update((list) =>
        list.map((i) => (i.id === item.id ? { ...i, status: nextStatus } : i))
      );
      return;
    }

    if (item.source === 'hub') {
      this.hubItems.update((list) =>
        list.map((i) => (i.id === item.id ? { ...i, status: nextStatus } : i))
      );
      if (this.hub.isConfigured() && this.collectionStore.isOnline()) {
        try {
          const syncedList = await this.hub.updateItem({ id: item.id, status: nextStatus });
          this.hubItems.set(syncedList);
        } catch {
          // Blijft optimistisch bijgewerkt
        }
      }
      return;
    }

    if (item.source === 'sheets') {
      this.collectionStore.snapshot.update((snap) => ({
        ...snap,
        feedback: (snap.feedback ?? []).map((i) =>
          i.id === item.id ? { ...i, status: nextStatus } : i
        ),
      }));
    }

    this.localItems.update((list) => {
      const exists = list.some((i) => i.id === item.id);
      if (exists) {
        return list.map((i) => (i.id === item.id ? { ...i, status: nextStatus } : i));
      }
      return item.source === 'local' ? [{ ...item, status: nextStatus }, ...list] : list;
    });

    if (item.source === 'sheets' && this.isSheetsLive() && this.repo.updateFeedback) {
      try {
        const snap = await this.repo.updateFeedback(this.collectionStore.config(), {
          id: item.id,
          status: nextStatus,
        });
        this.collectionStore.snapshot.set(snap);
      } catch {
        // Blijft lokaal/optimistisch bijgewerkt
      }
    }
  }

  async cycleStatus(item: FeedbackItem): Promise<void> {
    const next: FeedbackStatus =
      item.status === 'open' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'open';
    await this.setStatus(item, next);
  }

  hasUpvoted(id: string): boolean {
    return this.upvotedIds().includes(id);
  }

  async toggleUpvote(item: FeedbackItem): Promise<void> {
    const already = this.hasUpvoted(item.id);
    const nextVotes = Math.max(0, item.votes + (already ? -1 : 1));

    this.upvotedIds.update((ids) =>
      already ? ids.filter((x) => x !== item.id) : [...ids, item.id]
    );

    if (item.source === 'github') {
      this.githubItems.update((list) =>
        list.map((i) => (i.id === item.id ? { ...i, votes: nextVotes } : i))
      );
      return;
    }

    if (item.source === 'hub') {
      this.hubItems.update((list) =>
        list.map((i) => (i.id === item.id ? { ...i, votes: nextVotes } : i))
      );
      if (this.hub.isConfigured() && this.collectionStore.isOnline()) {
        try {
          const syncedList = await this.hub.updateItem({ id: item.id, votes: nextVotes });
          this.hubItems.set(syncedList);
        } catch {
          // Blijft optimistisch bijgewerkt
        }
      }
      return;
    }

    if (item.source === 'sheets') {
      this.collectionStore.snapshot.update((snap) => ({
        ...snap,
        feedback: (snap.feedback ?? []).map((i) =>
          i.id === item.id ? { ...i, votes: nextVotes } : i
        ),
      }));
    }

    this.localItems.update((list) => {
      const exists = list.some((i) => i.id === item.id);
      if (exists) {
        return list.map((i) => (i.id === item.id ? { ...i, votes: nextVotes } : i));
      }
      return item.source === 'local' ? [{ ...item, votes: nextVotes }, ...list] : list;
    });

    if (item.source === 'sheets' && this.isSheetsLive() && this.repo.updateFeedback) {
      try {
        const snap = await this.repo.updateFeedback(this.collectionStore.config(), {
          id: item.id,
          votes: nextVotes,
        });
        this.collectionStore.snapshot.set(snap);
      } catch {
        // Blijft lokaal/optimistisch bijgewerkt
      }
    }
  }

  async deleteItem(item: FeedbackItem): Promise<void> {
    this.localItems.update((list) => list.filter((i) => i.id !== item.id));
    if (item.source === 'hub') {
      this.hubItems.update((list) => list.filter((i) => i.id !== item.id));
      if (this.hub.isConfigured() && this.collectionStore.isOnline()) {
        try {
          const syncedList = await this.hub.deleteItem(item.id);
          this.hubItems.set(syncedList);
        } catch {
          // Negeer
        }
      }
      this.collectionStore.showToast('Feedback-item verwijderd.', 'info');
      return;
    }
    if (item.source === 'sheets') {
      this.collectionStore.snapshot.update((snap) => ({
        ...snap,
        feedback: (snap.feedback ?? []).filter((i) => i.id !== item.id),
      }));
    }
    if (item.source === 'sheets' && this.isSheetsLive() && this.repo.deleteFeedback) {
      try {
        const snap = await this.repo.deleteFeedback(this.collectionStore.config(), { id: item.id });
        this.collectionStore.snapshot.set(snap);
      } catch {
        // Negeer
      }
    }
    this.collectionStore.showToast('Feedback-item verwijderd.', 'info');
  }

  buildGitHubIssueUrl(item: Pick<FeedbackItem, 'page' | 'category' | 'title' | 'description' | 'platform'>): string {
    const title = `[${item.category}] (${item.page}) ${item.title}`;
    const body = [
      `**Pagina:** ${item.page}`,
      `**Categorie:** ${item.category}`,
      `**Platform:** ${item.platform}`,
      '',
      item.description || '_Geen extra toelichting opgegeven._',
    ].join('\n');

    const params = new URLSearchParams({
      labels: 'feedback',
      title,
      body,
    });
    return `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`;
  }

  private mapGitHubIssue(issue: GitHubIssueDto): FeedbackItem {
    const labelNames = (issue.labels ?? []).map((l) => (l.name ?? '').toLowerCase());
    const status: FeedbackStatus =
      issue.state === 'closed'
        ? 'done'
        : labelNames.some((n) => n.includes('progress') || n.includes('bezig'))
          ? 'in_progress'
          : 'open';

    const body = issue.body ?? '';
    const pageMatch = body.match(/\*\*Pagina:\*\*\s*(.+)/i);
    const catMatch = body.match(/\*\*Categorie:\*\*\s*(.+)/i);
    const platformMatch = body.match(/\*\*Platform:\*\*\s*(.+)/i);

    const parsedPage = pageMatch?.[1]?.trim();
    const page: string =
      parsedPage && (FEEDBACK_PAGES as readonly string[]).includes(parsedPage)
        ? parsedPage
        : 'Algemeen / Hele app';

    const category =
      catMatch?.[1]?.trim() ||
      (labelNames.includes('bug') ? 'Bug' : labelNames.includes('enhancement') ? 'Verbetering' : 'Idee');

    const cleanDescription = body
      .replace(/^\*\*(Pagina|Categorie|Platform):\*\*.+$/gim, '')
      .trim();

    return {
      id: `gh-${issue.number}`,
      createdAt: issue.created_at,
      page,
      category,
      title: issue.title.replace(/^\[[^\]]+\]\s*(\([^)]+\)\s*)?/, '').trim() || issue.title,
      description: cleanDescription,
      status,
      votes: Math.max(1, (issue.reactions?.['+1'] ?? 0) + 1),
      author: issue.user?.login ?? 'GitHub',
      platform: platformMatch?.[1]?.trim() || 'GitHub',
      source: 'github',
      externalUrl: issue.html_url,
    };
  }

  private isSheetsLive(): boolean {
    const cfg = this.collectionStore.config();
    return !cfg.demoMode && Boolean(cfg.webAppUrl && cfg.apiToken) && this.collectionStore.isOnline();
  }

  private loadLocalItems(): FeedbackItem[] {
    try {
      if (typeof window === 'undefined') return [];
      const raw = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as FeedbackItem[];
      if (!Array.isArray(parsed)) return [];
      // Verwijder eventuele oude seed/demo-items uit eerdere versies
      return parsed.filter((item) => item && !String(item.id || '').startsWith('seed-'));
    } catch {
      return [];
    }
  }

  private loadUpvotedIds(): string[] {
    try {
      if (typeof window === 'undefined') return [];
      const raw = window.localStorage.getItem(FEEDBACK_UPVOTES_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  private loadSavedAuthor(): string {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem(FEEDBACK_AUTHOR_KEY) ?? '' : '';
    } catch {
      return '';
    }
  }

  private writeStorage(key: string, value: unknown): void {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      // negeer
    }
  }
}
