import { Injectable, inject } from '@angular/core';
import { FeedbackItem } from '../domain/models';
import { FEEDBACK_HUB_ENDPOINT } from '../platform/feedback-hub-config';

export interface HubScreenshotPayload {
  base64: string;
  mimeType: string;
  fileName: string;
}

export interface HubAddFeedbackPayload {
  id: string;
  createdAt: string;
  page: string;
  category: string;
  title: string;
  description: string;
  status: string;
  votes: number;
  author: string;
  platform: string;
  screenshot?: HubScreenshotPayload;
}

export interface HubUpdateFeedbackPayload {
  id: string;
  page?: string;
  category?: string;
  title?: string;
  description?: string;
  status?: string;
  votes?: number;
  author?: string;
  screenshot?: HubScreenshotPayload;
  removeScreenshot?: boolean;
}

interface HubResponse {
  ok: boolean;
  error?: string;
  item?: FeedbackItem;
  items?: FeedbackItem[];
  syncedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class FeedbackHubAdapter {
  private readonly cfg = inject(FEEDBACK_HUB_ENDPOINT);

  isConfigured(): boolean {
    return Boolean(this.cfg.endpointUrl?.trim() && this.cfg.appKey?.trim());
  }

  async listItems(): Promise<FeedbackItem[]> {
    this.assertConfigured();
    const url = new URL(this.cfg.endpointUrl.trim());
    url.searchParams.set('action', 'list');
    url.searchParams.set('appKey', this.cfg.appKey.trim());

    const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} bij ophalen van centrale Feedback Hub.`);
    }
    const json = (await res.json()) as HubResponse;
    if (!json.ok) {
      throw new Error(json.error ?? 'Kon Feedback Hub niet laden.');
    }
    return this.normalizeItems(json.items);
  }

  async addItem(payload: HubAddFeedbackPayload): Promise<{ item: FeedbackItem; items: FeedbackItem[] }> {
    const json = await this.postAction('addFeedback', payload as unknown as Record<string, unknown>);
    const items = this.normalizeItems(json.items);
    const created = json.item
      ? { ...json.item, source: 'hub' as const }
      : items.find((i) => i.id === payload.id) ?? {
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
        };
    return { item: created, items };
  }

  async updateItem(payload: HubUpdateFeedbackPayload): Promise<FeedbackItem[]> {
    const json = await this.postAction('updateFeedback', payload as unknown as Record<string, unknown>);
    return this.normalizeItems(json.items);
  }

  async deleteItem(id: string): Promise<FeedbackItem[]> {
    const json = await this.postAction('deleteFeedback', { id });
    return this.normalizeItems(json.items);
  }

  private normalizeItems(raw?: FeedbackItem[]): FeedbackItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => ({ ...item, source: 'hub' as const }));
  }

  private async postAction(action: string, payload: Record<string, unknown>): Promise<HubResponse> {
    this.assertConfigured();
    const res = await fetch(this.cfg.endpointUrl.trim(), {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        appKey: this.cfg.appKey.trim(),
        action,
        payload,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} bij versturen naar Feedback Hub.`);
    }

    const json = (await res.json()) as HubResponse;
    if (!json.ok) {
      throw new Error(json.error ?? `Feedback Hub actie "${action}" mislukt.`);
    }
    return json;
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('Feedback Hub endpoint is niet geconfigureerd.');
    }
  }
}
