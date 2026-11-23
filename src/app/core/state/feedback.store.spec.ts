import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppsScriptSheetsAdapter } from '../adapters/apps-script-sheets.adapter';
import { createDemoSnapshot } from '../adapters/demo-data';
import { FeedbackHubAdapter } from '../adapters/feedback-hub.adapter';
import { FeedbackItem } from '../domain/models';
import { TcgdexAdapter } from '../adapters/tcgdex.adapter';
import { FEEDBACK_HUB_ENDPOINT } from '../platform/feedback-hub-config';
import { PlatformService } from '../platform/platform.service';
import { CARD_CATALOG_PORT } from '../ports/card-catalog.port';
import { COLLECTION_REPOSITORY, CollectionRepository } from '../ports/collection-repository.port';
import { CollectionStore } from './collection.store';
import { FeedbackStore } from './feedback.store';

const DISABLED_HUB = { provide: FEEDBACK_HUB_ENDPOINT, useValue: { endpointUrl: '', appKey: '' } };

describe('FeedbackStore', () => {
  let store: FeedbackStore;
  let collectionStore: CollectionStore;
  let platform: PlatformService;

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        DISABLED_HUB,
        { provide: COLLECTION_REPOSITORY, useExisting: AppsScriptSheetsAdapter },
        { provide: CARD_CATALOG_PORT, useExisting: TcgdexAdapter },
      ],
    });
    store = TestBed.inject(FeedbackStore);
    collectionStore = TestBed.inject(CollectionStore);
    platform = TestBed.inject(PlatformService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('start schoon zonder demo-data en verwijdert eventuele oude seed-items uit localStorage', () => {
    expect(store.items().length).toBe(0);

    // Simuleer oude seed-items in localStorage van een eerdere versie
    window.localStorage.setItem(
      'pokebinder_feedback_v1',
      JSON.stringify([
        { id: 'seed-old-demo', title: 'Oude demo', page: 'Dashboard', category: 'Idee', status: 'open', votes: 2, author: 'Team', platform: 'Web', createdAt: '2026-01-01', description: '', source: 'local' },
        { id: 'fb-real-1', title: 'Echte feedback', page: 'Collectie', category: 'Bug', status: 'open', votes: 1, author: 'Remco', platform: 'Web', createdAt: '2026-11-23', description: '', source: 'local' },
      ])
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DISABLED_HUB,
        { provide: COLLECTION_REPOSITORY, useExisting: AppsScriptSheetsAdapter },
        { provide: CARD_CATALOG_PORT, useExisting: TcgdexAdapter },
      ],
    });
    const freshStore = TestBed.inject(FeedbackStore);
    expect(freshStore.items().length).toBe(1);
    expect(freshStore.items()[0].id).toBe('fb-real-1');
  });

  it('mapt alle routes naar de juiste Nederlandse paginanaam', () => {
    expect(store.mapUrlToFeedbackPage('/dashboard')).toBe('Dashboard');
    expect(store.mapUrlToFeedbackPage('/collectie?set=151')).toBe('Collectie');
    expect(store.mapUrlToFeedbackPage('/toevoegen')).toBe('Snel Toevoegen');
    expect(store.mapUrlToFeedbackPage('/pokedex')).toBe('Pokédex Binder');
    expect(store.mapUrlToFeedbackPage('/meer/sets')).toBe('Set Voortgang');
    expect(store.mapUrlToFeedbackPage('/meer/verlanglijst')).toBe('Verlanglijst');
    expect(store.mapUrlToFeedbackPage('/meer/ruil-verkoop')).toBe('Ruil & Verkoop');
    expect(store.mapUrlToFeedbackPage('/meer/instellingen')).toBe('Instellingen');
    expect(store.mapUrlToFeedbackPage('/meer/feedback')).toBe('Feedback Hub');
    expect(store.mapUrlToFeedbackPage('/feedback')).toBe('Feedback Hub');
    expect(store.mapUrlToFeedbackPage('/onbekend')).toBe('Algemeen / Hele app');
  });

  it('opent en sluit de feedback-modal met de gevraagde standaardpagina', () => {
    expect(store.isComposerOpen()).toBe(false);
    store.openComposer('Collectie');
    expect(store.isComposerOpen()).toBe(true);
    expect(store.composerDefaultPage()).toBe('Collectie');

    store.closeComposer();
    expect(store.isComposerOpen()).toBe(false);
  });

  it('voegt nieuwe feedback toe, slaat auteur op, stemt automatisch mee en opent optioneel GitHub Issue', async () => {
    const openSpy = vi.spyOn(platform, 'openExternalUrl').mockResolvedValue();
    const beforeTotal = store.stats().total;

    const created = await store.submitFeedback({
      page: 'Verlanglijst',
      category: 'Idee',
      title: 'Prijsalert bij daling',
      description: 'Stuur melding onder doelprijs',
      author: 'Remco',
      openGitHubIssue: true,
    });

    expect(created.page).toBe('Verlanglijst');
    expect(created.status).toBe('open');
    expect(created.votes).toBe(1);
    expect(store.savedAuthor()).toBe('Remco');
    expect(store.hasUpvoted(created.id)).toBe(true);
    expect(store.stats().total).toBe(beforeTotal + 1);
    expect(openSpy).toHaveBeenCalledTimes(1);
    const issueUrl = openSpy.mock.calls[0][0];
    expect(issueUrl).toContain('https://github.com/remcovolkers/jbm-pokemoncard-collection/issues/new?');
    expect(issueUrl).toContain('labels=feedback');
    expect(issueUrl).toContain('Verlanglijst');
  });

  it('cycled status (open -> in_progress -> done -> open), verwerkt upvotes en verwijdert items', async () => {
    const item = await store.submitFeedback({
      page: 'Dashboard',
      category: 'Bug',
      title: 'Grafiek uitlijning',
      description: 'Test',
    });

    await store.cycleStatus(item);
    let current = store.items().find((i) => i.id === item.id)!;
    expect(current.status).toBe('in_progress');

    await store.cycleStatus(current);
    current = store.items().find((i) => i.id === item.id)!;
    expect(current.status).toBe('done');

    await store.cycleStatus(current);
    current = store.items().find((i) => i.id === item.id)!;
    expect(current.status).toBe('open');

    // Auto-upvoted (1) -> toggle haalt stem weg (0) -> nogmaals toggle zet terug naar 1
    await store.toggleUpvote(current);
    current = store.items().find((i) => i.id === item.id)!;
    expect(current.votes).toBe(0);
    expect(store.hasUpvoted(item.id)).toBe(false);

    await store.toggleUpvote(current);
    current = store.items().find((i) => i.id === item.id)!;
    expect(current.votes).toBe(1);
    expect(store.hasUpvoted(item.id)).toBe(true);

    await store.deleteItem(current);
    expect(store.items().some((i) => i.id === item.id)).toBe(false);
  });

  it('haalt publieke GitHub Issues met label feedback op, filtert PRs en parseert pagina/categorie/status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            number: 12,
            title: '[Verbetering] (Collectie) Bulk selectie kaarten',
            body: '**Pagina:** Collectie\n**Categorie:** Verbetering\n**Platform:** Android App\n\nMeerdere kaarten tegelijk verplaatsen.',
            state: 'open',
            html_url: 'https://github.com/remcovolkers/jbm-pokemoncard-collection/issues/12',
            created_at: '2026-11-23T12:00:00Z',
            user: { login: 'ash' },
            labels: [{ name: 'feedback' }, { name: 'in-progress' }],
            reactions: { '+1': 7 },
          },
          {
            number: 13,
            title: 'Opgeloste bug',
            body: '**Pagina:** Instellingen\n**Categorie:** Bug\n\nFix is live.',
            state: 'closed',
            html_url: 'https://github.com/remcovolkers/jbm-pokemoncard-collection/issues/13',
            created_at: '2026-11-22T10:00:00Z',
            user: { login: 'misty' },
            labels: [{ name: 'feedback' }],
            reactions: { '+1': 2 },
          },
          {
            number: 14,
            title: 'PR negeren',
            state: 'open',
            html_url: 'https://github.com/remcovolkers/jbm-pokemoncard-collection/pull/14',
            created_at: '2026-11-23T12:00:00Z',
            pull_request: {},
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await store.refreshPublicIssues(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const gh12 = store.items().find((i) => i.id === 'gh-12')!;
    expect(gh12).toBeDefined();
    expect(gh12.page).toBe('Collectie');
    expect(gh12.category).toBe('Verbetering');
    expect(gh12.title).toBe('Bulk selectie kaarten');
    expect(gh12.status).toBe('in_progress');
    expect(gh12.votes).toBe(8);
    expect(gh12.source).toBe('github');

    const gh13 = store.items().find((i) => i.id === 'gh-13')!;
    expect(gh13.status).toBe('done');
    expect(gh13.page).toBe('Instellingen');

    // PR #14 mag niet in de lijst verschijnen
    expect(store.items().some((i) => i.id === 'gh-14')).toBe(false);

    // Optimistische upvote op GitHub item werkt direct in UI
    await store.toggleUpvote(gh12);
    expect(store.items().find((i) => i.id === 'gh-12')?.votes).toBe(9);
  });

  it('synchroniseert nieuwe feedback, statuswijzigingen en deletes naar Google Sheets in live-modus', async () => {
    const addFeedbackSpy = vi.fn(async (_cfg, payload) => ({
      ...createDemoSnapshot(),
      feedback: [
        {
          id: payload.id,
          createdAt: payload.createdAt,
          page: payload.page,
          category: payload.category,
          title: payload.title,
          description: payload.description,
          status: payload.status,
          votes: payload.votes,
          author: payload.author,
          platform: payload.platform,
          source: 'sheets' as const,
        },
      ],
    }));
    const updateFeedbackSpy = vi.fn(async (_cfg, payload) => ({
      ...createDemoSnapshot(),
      feedback: [
        {
          id: payload.id,
          createdAt: '2026-11-23T12:00:00Z',
          page: 'Pokédex Binder',
          category: 'Idee',
          title: 'Sheets sync test',
          description: '',
          status: payload.status ?? 'done',
          votes: payload.votes ?? 2,
          author: 'Remco',
          platform: 'Web App',
          source: 'sheets' as const,
        },
      ],
    }));
    const deleteFeedbackSpy = vi.fn(async () => ({
      ...createDemoSnapshot(),
      feedback: [],
    }));

    const repoMock: Partial<CollectionRepository> = {
      bootstrap: vi.fn(async () => createDemoSnapshot()),
      addFeedback: addFeedbackSpy,
      updateFeedback: updateFeedbackSpy,
      deleteFeedback: deleteFeedbackSpy,
    };

    TestBed.resetTestingModule();
    window.localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        DISABLED_HUB,
        { provide: COLLECTION_REPOSITORY, useValue: repoMock },
        { provide: CARD_CATALOG_PORT, useExisting: TcgdexAdapter },
      ],
    });

    collectionStore = TestBed.inject(CollectionStore);
    store = TestBed.inject(FeedbackStore);
    collectionStore.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/test/exec',
      apiToken: 'secret-token',
    });

    const created = await store.submitFeedback({
      page: 'Pokédex Binder',
      category: 'Idee',
      title: 'Sheets sync test',
      description: '',
      author: 'Remco',
    });

    expect(addFeedbackSpy).toHaveBeenCalledTimes(1);
    expect(created.source).toBe('sheets');

    await store.setStatus(created, 'done');
    expect(updateFeedbackSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiToken: 'secret-token' }),
      expect.objectContaining({ id: created.id, status: 'done' })
    );

    await store.deleteItem(created);
    expect(deleteFeedbackSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiToken: 'secret-token' }),
      { id: created.id }
    );
  });

  it('opent de editor voor een feedback-item en werkt titel, pagina, categorie, beschrijving en auteur bij (lokaal & Sheets)', async () => {
    const localItem = await store.submitFeedback({
      page: 'Collectie',
      category: 'Bug',
      title: 'Oude titel',
      description: 'Oude omschrijving',
      author: 'Melli',
    });

    store.openEditor(localItem);
    expect(store.isComposerOpen()).toBe(true);
    expect(store.editingItem()?.id).toBe(localItem.id);
    expect(store.composerDefaultPage()).toBe('Collectie');

    const editedLocal = await store.editFeedback(localItem, {
      page: 'Snel Toevoegen',
      category: 'Verbetering',
      title: 'Nieuwe titel',
      description: 'Duidelijkere omschrijving',
      author: 'Mel',
    });
    expect(editedLocal.title).toBe('Nieuwe titel');
    expect(editedLocal.page).toBe('Snel Toevoegen');
    expect(editedLocal.category).toBe('Verbetering');
    expect(editedLocal.description).toBe('Duidelijkere omschrijving');
    expect(editedLocal.author).toBe('Mel');
    expect(store.items().find((i) => i.id === localItem.id)?.title).toBe('Nieuwe titel');

    store.closeComposer();
    expect(store.isComposerOpen()).toBe(false);
    expect(store.editingItem()).toBeNull();

    // Live Sheets sync bij editFeedback
    const updateFeedbackSpy = vi.fn(async (_cfg, payload) => ({
      ...createDemoSnapshot(),
      feedback: [
        {
          id: payload.id,
          createdAt: '2026-11-23T12:00:00Z',
          page: String(payload.page ?? 'Collectie'),
          category: String(payload.category ?? 'Verbetering'),
          title: String(payload.title ?? ''),
          description: String(payload.description ?? ''),
          status: 'open' as const,
          votes: 1,
          author: String(payload.author ?? 'Melli'),
          platform: 'Web App',
          source: 'sheets' as const,
        },
      ],
    }));

    const repoMock: Partial<CollectionRepository> = {
      bootstrap: vi.fn(async () => createDemoSnapshot()),
      updateFeedback: updateFeedbackSpy,
    };

    TestBed.resetTestingModule();
    window.localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        DISABLED_HUB,
        { provide: COLLECTION_REPOSITORY, useValue: repoMock },
        { provide: CARD_CATALOG_PORT, useExisting: TcgdexAdapter },
      ],
    });
    const liveCollection = TestBed.inject(CollectionStore);
    const liveFeedback = TestBed.inject(FeedbackStore);
    liveCollection.updateConfig({
      demoMode: false,
      webAppUrl: 'https://script.google.com/macros/s/test/exec',
      apiToken: 'secret-token',
    });
    await liveCollection.syncFromRemote(true);

    const sheetItem = {
      id: 'fb-sheet-1',
      createdAt: '2026-11-23T12:00:00Z',
      page: 'Collectie',
      category: 'Verbetering',
      title: 'Aankoopwaarde ingevuld',
      description: 'Bij 4 van 9 kaarten',
      status: 'open' as const,
      votes: 1,
      author: 'Melli',
      platform: 'Google Sheets',
      source: 'sheets' as const,
    };
    liveCollection.snapshot.update((snap) => ({ ...snap, feedback: [sheetItem] }));

    await liveFeedback.editFeedback(sheetItem, {
      page: 'Snel Toevoegen',
      category: 'Bug',
      title: 'Aankoopwaarde niet automatisch vullen',
      description: 'Alleen bij Single gekocht invullen',
      author: 'Melli',
    });

    expect(updateFeedbackSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiToken: 'secret-token' }),
      expect.objectContaining({
        id: 'fb-sheet-1',
        page: 'Snel Toevoegen',
        category: 'Bug',
        title: 'Aankoopwaarde niet automatisch vullen',
        description: 'Alleen bij Single gekocht invullen',
        author: 'Melli',
      })
    );
    expect(liveFeedback.items().find((i) => i.id === 'fb-sheet-1')?.title).toBe(
      'Aankoopwaarde niet automatisch vullen'
    );
  });

  it('draait onafhankelijk van collectie-spreadsheets (ook in Demo-modus) en uploadt/vervangt Drive-screenshots via centrale Hub', async () => {
    let serverList: FeedbackItem[] = [
      {
        id: 'fb-remote-1',
        createdAt: '2026-11-23T12:00:00Z',
        page: 'Dashboard',
        category: 'Idee',
        title: 'Bestaand Hub item',
        description: 'Centraal opgeslagen',
        status: 'open',
        votes: 3,
        author: 'Remco',
        platform: 'Web App',
        source: 'hub',
      },
    ];

    const hubMock: Partial<FeedbackHubAdapter> = {
      isConfigured: () => true,
      listItems: vi.fn(async () => serverList),
      addItem: vi.fn(async (payload) => {
        const created = {
          id: payload.id,
          createdAt: payload.createdAt,
          page: payload.page,
          category: payload.category,
          title: payload.title,
          description: payload.description,
          status: 'open' as const,
          votes: payload.votes,
          author: payload.author,
          platform: payload.platform,
          source: 'hub' as const,
          screenshotUrl: 'https://drive.google.com/thumbnail?id=drive123&sz=w1600',
          screenshotFileId: 'drive123',
        };
        serverList = [created, ...serverList];
        return { item: created, items: serverList };
      }),
      updateItem: vi.fn(async (payload) => {
        serverList = serverList.map((i) =>
          i.id === payload.id
            ? {
                ...i,
                title: payload.title ?? i.title,
                status: (payload.status as 'open' | 'in_progress' | 'done') ?? i.status,
                votes: payload.votes ?? i.votes,
                screenshotUrl: payload.removeScreenshot ? '' : i.screenshotUrl,
                screenshotFileId: payload.removeScreenshot ? '' : i.screenshotFileId,
              }
            : i
        );
        return serverList;
      }),
      deleteItem: vi.fn(async (id) => {
        serverList = serverList.filter((i) => i.id !== id);
        return serverList;
      }),
    };

    TestBed.resetTestingModule();
    window.localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: FeedbackHubAdapter, useValue: hubMock },
        { provide: COLLECTION_REPOSITORY, useExisting: AppsScriptSheetsAdapter },
        { provide: CARD_CATALOG_PORT, useExisting: TcgdexAdapter },
      ],
    });

    const demoCol = TestBed.inject(CollectionStore);
    const hubStore = TestBed.inject(FeedbackStore);
    expect(demoCol.config().demoMode).toBe(true); // Demo-modus staat AAN (geen collectie-sheet gekoppeld)

    await hubStore.refreshHub(true);
    expect(hubStore.items().some((i) => i.id === 'fb-remote-1' && i.source === 'hub')).toBe(true);

    const created = await hubStore.submitFeedback({
      page: 'Collectie',
      category: 'Bug',
      title: 'Kaartmodaal screenshot',
      description: 'Zie bijlage',
      author: 'Melli',
      screenshot: {
        base64: 'YWJj',
        mimeType: 'image/webp',
        fileName: 'bug.webp',
        dataUrl: 'data:image/webp;base64,YWJj',
        sizeKb: 12,
      },
    });
    expect(created.source).toBe('hub');
    expect(created.screenshotUrl).toContain('drive123');
    expect(hubMock.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        screenshot: { base64: 'YWJj', mimeType: 'image/webp', fileName: 'bug.webp' },
      })
    );

    await hubStore.editFeedback(created, {
      page: 'Collectie',
      category: 'Bug',
      title: 'Aangepaste titel',
      description: 'Screenshot verwijderd',
      author: 'Melli',
      removeScreenshot: true,
    });
    expect(hubMock.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: created.id, title: 'Aangepaste titel', removeScreenshot: true })
    );

    await hubStore.setStatus(created, 'done');
    expect(hubStore.items().find((i) => i.id === created.id)?.status).toBe('done');

    await hubStore.deleteItem(created);
    expect(hubStore.items().some((i) => i.id === created.id)).toBe(false);
  });
});
