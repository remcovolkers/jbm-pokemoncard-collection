import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEEDBACK_HUB_ENDPOINT } from '../platform/feedback-hub-config';
import { FeedbackHubAdapter } from './feedback-hub.adapter';

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('FeedbackHubAdapter', () => {
  let adapter: FeedbackHubAdapter;
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FEEDBACK_HUB_ENDPOINT,
          useValue: {
            endpointUrl: 'https://script.google.com/macros/s/feedback-hub-test/exec',
            appKey: 'test-app-key',
          },
        },
      ],
    });
    adapter = TestBed.inject(FeedbackHubAdapter);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('haalt items op via GET ?action=list&appKey=... en markeert source als hub', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonRes({
        ok: true,
        items: [
          {
            id: 'fb-1',
            createdAt: '2026-11-23T12:00:00Z',
            page: 'Collectie',
            category: 'Bug',
            title: 'Test item',
            description: 'Beschrijving',
            status: 'open',
            votes: 2,
            author: 'Melli',
            platform: 'Android App',
            screenshotUrl: 'https://drive.google.com/thumbnail?id=xyz&sz=w1600',
            screenshotFileId: 'xyz',
          },
        ],
      })
    );

    const items = await adapter.listItems();
    expect(items.length).toBe(1);
    expect(items[0].source).toBe('hub');
    expect(items[0].screenshotFileId).toBe('xyz');

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('action=list');
    expect(url).toContain('appKey=test-app-key');
  });

  it('verstuurt addItem, updateItem en deleteItem CORS-veilig met text/plain en appKey', async () => {
    fetchSpy.mockImplementation(async () =>
      jsonRes({
        ok: true,
        item: {
          id: 'fb-2',
          createdAt: '2026-11-23T12:00:00Z',
          page: 'Dashboard',
          category: 'Idee',
          title: 'Screenshot test',
          description: '',
          status: 'open',
          votes: 1,
          author: 'Remco',
          platform: 'Web App',
          screenshotUrl: 'https://drive.google.com/thumbnail?id=file1&sz=w1600',
          screenshotFileId: 'file1',
        },
        items: [],
      })
    );

    await adapter.addItem({
      id: 'fb-2',
      createdAt: '2026-11-23T12:00:00Z',
      page: 'Dashboard',
      category: 'Idee',
      title: 'Screenshot test',
      description: '',
      status: 'open',
      votes: 1,
      author: 'Remco',
      platform: 'Web App',
      screenshot: { base64: 'YWJj', mimeType: 'image/webp', fileName: 'shot.webp' },
    });

    const addInit = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(addInit.method).toBe('POST');
    expect((addInit.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=utf-8');
    const body = JSON.parse(String(addInit.body));
    expect(body.appKey).toBe('test-app-key');
    expect(body.action).toBe('addFeedback');
    expect(body.payload.screenshot.mimeType).toBe('image/webp');

    await adapter.updateItem({ id: 'fb-2', status: 'done', removeScreenshot: true });
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body)).action).toBe('updateFeedback');

    await adapter.deleteItem('fb-2');
    expect(JSON.parse(String(fetchSpy.mock.calls[2][1]?.body)).action).toBe('deleteFeedback');
  });
});
