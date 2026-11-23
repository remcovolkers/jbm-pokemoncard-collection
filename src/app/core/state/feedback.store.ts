import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  FEEDBACK_PAGES,
  FeedbackCategory,
  FeedbackItem,
  FeedbackPage,
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

const SEED_ROADMAP_ITEMS: FeedbackItem[] = [
  {
    id: 'seed-notifications',
    createdAt: '2026-11-23T11:00:00Z',
    page: 'Verlanglijst',
    category: 'Idee',
    title: 'Android pushnotificatie bij prijsdaling onder doelbudget',
    description:
      'Stuur via Capacitor Local Notifications een seintje zodra een kaart op de verlanglijst onder het ingestelde max. budget zakt.',
    status: 'open',
    votes: 4,
    author: 'PokéBinder Team',
    platform: 'Android App (APK)',
    source: 'local',
  },
  {
    id: 'seed-widget',
    createdAt: '2026-11-23T11:05:00Z',
    page: 'Dashboard',
    category: 'Idee',
    title: 'Android Home Screen Widget met portfoliowaarde & Pokédex %',
    description:
      'Compacte startscherm-widget die live de totale collectiewaarde en het National Pokédex percentage toont.',
    status: 'open',
    votes: 3,
    author: 'PokéBinder Team',
    platform: 'Android App (APK)',
    source: 'local',
  },
  {
    id: 'seed-camera-ocr',
    createdAt: '2026-11-23T11:10:00Z',
    page: 'Snel Toevoegen',
    category: 'Verbetering',
    title: 'Kaartcode scannen met telefooncamera in Pack Opening Mode',
    description:
      'Gebruik de camera om setcode + kaartnummer onderaan de kaart direct uit te lezen tijdens het openen van packs.',
    status: 'in_progress',
    votes: 5,
    author: 'PokéBinder Team',
    platform: 'Web App (PWA)',
    source: 'local',
  },
  {
    id: 'seed-capacitor-ota',
    createdAt: '2026-11-23T11:15:00Z',
    page: 'Instellingen',
    category: 'Verbetering',
    title: 'Android APK wrapper + automatische OTA in-app updates',
    description:
      'Installeerbare Android APK via Capacitor met automatische "Nieuwe versie beschikbaar" updates en directe APK downloadlink.',
    status: 'done',
    votes: 6,
    author: 'PokéBinder Team',
    platform: 'Android App (APK)',
    source: 'local',
  },
];

@Injectable({ providedIn: 'root' })
export class FeedbackStore {
  private readonly collectionStore = inject(CollectionStore);
  private readonly repo = inject(COLLECTION_REPOSITORY);
  private readonly platform = inject(PlatformService);

  // Composer Modal state (gedeeld over elke pagina)
  readonly isComposerOpen = signal<boolean>(false);
  readonly composerDefaultPage = signal<FeedbackPage>('Algemeen / Hele app');

  // Data signals
  readonly localItems = signal<FeedbackItem[]>(this.loadLocalItems());
  readonly githubItems = signal<FeedbackItem[]>([]);
  readonly upvotedIds = signal<string[]>(this.loadUpvotedIds());
  readonly savedAuthor = signal<string>(this.loadSavedAuthor());
  readonly isLoadingPublic = signal<boolean>(false);
  readonly lastSyncedPublicAt = signal<string | null>(null);

  /**
   * Gecombineerde to-do lijst zichtbaar voor iedereen:
   *  1. Publieke GitHub Issues (label `feedback`) — zichtbaar voor elke bezoeker zonder login
   *  2. Google Sheets `Feedback`-tabblad (wanneer live gekoppeld)
   *  3. Lokale feedback-items (of initieel roadmap-overzicht wanneer nog leeg)
   */
  readonly items = computed<FeedbackItem[]>(() => {
    const sheetsItems = this.collectionStore.snapshot().feedback ?? [];
    const gh = this.githubItems();
    const local = this.localItems();

    const merged = new Map<string, FeedbackItem>();
    for (const item of gh) merged.set(item.id, item);
    for (const item of sheetsItems) merged.set(item.id, { ...item, source: 'sheets' });
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
    this.composerDefaultPage.set(page ?? 'Algemeen / Hele app');
    this.isComposerOpen.set(true);
  }

  closeComposer(): void {
    this.isComposerOpen.set(false);
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
  }): Promise<FeedbackItem> {
    const author = (input.author || '').trim() || 'Verzamelaar';
    if (input.author?.trim()) {
      this.savedAuthor.set(input.author.trim());
    }

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
      source: this.isSheetsLive() ? 'sheets' : 'local',
    };

    this.localItems.update((list) => [item, ...list]);
    this.upvotedIds.update((ids) => (ids.includes(item.id) ? ids : [...ids, item.id]));

    if (this.isSheetsLive() && this.repo.addFeedback) {
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

    if (input.openGitHubIssue) {
      const ghUrl = this.buildGitHubIssueUrl(item);
      await this.platform.openExternalUrl(ghUrl);
    }

    this.collectionStore.showToast('Bedankt! Je feedback staat op de Feedback Hub to-do lijst.', 'success');
    return item;
  }

  async setStatus(item: FeedbackItem, nextStatus: FeedbackStatus): Promise<void> {
    if (item.source === 'github') {
      this.githubItems.update((list) =>
        list.map((i) => (i.id === item.id ? { ...i, status: nextStatus } : i))
      );
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
      if (typeof window === 'undefined') return [...SEED_ROADMAP_ITEMS];
      const raw = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
      if (!raw) return [...SEED_ROADMAP_ITEMS];
      const parsed = JSON.parse(raw) as FeedbackItem[];
      return Array.isArray(parsed) ? parsed : [...SEED_ROADMAP_ITEMS];
    } catch {
      return [...SEED_ROADMAP_ITEMS];
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
