import { Injectable } from '@angular/core';
import {
  AppConnectionConfig,
  AppSnapshot,
  CollectionCard,
  FeedbackItem,
  FeedbackStatus,
  TradeEntry,
  WishlistItem,
} from '../domain/models';
import {
  AddCardPayload,
  CollectionRepository,
  ConnectionTestResult,
  MarkWishlistFoundPayload,
  RefreshPricesResult,
  UpdatePokedexSlotPayload,
} from '../ports/collection-repository.port';

interface AppsScriptResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: AppSnapshot;
  result?: T;
  spreadsheetName?: string;
  syncedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class AppsScriptSheetsAdapter implements CollectionRepository {
  async testConnection(config: AppConnectionConfig): Promise<ConnectionTestResult> {
    this.assertConfigured(config);
    const url = this.buildGetUrl(config.webAppUrl, 'ping', config.apiToken);
    try {
      const response = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = (await response.json()) as AppsScriptResponse;
      if (!json.ok) {
        return { ok: false, error: json.error ?? 'Onbekende fout van Apps Script.' };
      }
      return {
        ok: true,
        spreadsheetName: json.spreadsheetName,
        syncedAt: json.syncedAt,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Kan geen verbinding maken met de Google Apps Script URL.',
      };
    }
  }

  async bootstrap(config: AppConnectionConfig): Promise<AppSnapshot> {
    this.assertConfigured(config);
    const url = this.buildGetUrl(config.webAppUrl, 'bootstrap', config.apiToken);
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} bij ophalen van Google Sheets data.`);
    }
    const json = (await response.json()) as AppsScriptResponse;
    if (!json.ok || !json.data) {
      throw new Error(json.error ?? 'Ongeldig antwoord van Google Apps Script.');
    }
    return json.data;
  }

  async addCard(config: AppConnectionConfig, payload: AddCardPayload): Promise<AppSnapshot> {
    const res = await this.postAction(config, 'addCard', payload as Record<string, unknown>);
    return res.data!;
  }

  async updateCard(
    config: AppConnectionConfig,
    payload: Partial<CollectionCard> & { rowIndex?: number; cardId?: string }
  ): Promise<AppSnapshot> {
    const res = await this.postAction(config, 'updateCard', payload as Record<string, unknown>);
    return res.data!;
  }

  async deleteCard(
    config: AppConnectionConfig,
    payload: { rowIndex?: number; cardId?: string }
  ): Promise<AppSnapshot> {
    const res = await this.postAction(config, 'deleteCard', payload as Record<string, unknown>);
    return res.data!;
  }

  async updatePokedexSlot(config: AppConnectionConfig, payload: UpdatePokedexSlotPayload): Promise<AppSnapshot> {
    const res = await this.postAction(config, 'updatePokedexSlot', payload as Record<string, unknown>);
    return res.data!;
  }

  async addWishlist(
    config: AppConnectionConfig,
    payload: Omit<WishlistItem, 'rowIndex' | 'found'>
  ): Promise<AppSnapshot> {
    const res = await this.postAction(config, 'addWishlist', payload as Record<string, unknown>);
    return res.data!;
  }

  async markWishlistFound(config: AppConnectionConfig, payload: MarkWishlistFoundPayload): Promise<AppSnapshot> {
    const res = await this.postAction(config, 'markWishlistFound', payload as unknown as Record<string, unknown>);
    return res.data!;
  }

  async logTrade(
    config: AppConnectionConfig,
    payload: Omit<TradeEntry, 'rowIndex' | 'netResult'>
  ): Promise<AppSnapshot> {
    const res = await this.postAction(config, 'logTrade', payload as Record<string, unknown>);
    return res.data!;
  }

  async addFeedback(
    config: AppConnectionConfig,
    payload: Omit<FeedbackItem, 'source' | 'rowIndex'>
  ): Promise<AppSnapshot> {
    const res = await this.postAction(config, 'addFeedback', payload as Record<string, unknown>);
    return res.data!;
  }

  async updateFeedback(
    config: AppConnectionConfig,
    payload: { id: string; status?: FeedbackStatus; votes?: number }
  ): Promise<AppSnapshot> {
    const res = await this.postAction(config, 'updateFeedback', payload as Record<string, unknown>);
    return res.data!;
  }

  async deleteFeedback(
    config: AppConnectionConfig,
    payload: { id: string }
  ): Promise<AppSnapshot> {
    const res = await this.postAction(config, 'deleteFeedback', payload as Record<string, unknown>);
    return res.data!;
  }

  async refreshPrices(config: AppConnectionConfig): Promise<RefreshPricesResult> {
    const res = await this.postAction<{ updated: number; total: number }>(config, 'refreshPrices', {});
    return {
      updated: res.result?.updated ?? 0,
      total: res.result?.total ?? 0,
      snapshot: res.data!,
    };
  }

  /**
   * CORS-veilige POST via Content-Type: text/plain;charset=utf-8 (voorkomt OPTIONS preflight bij Apps Script).
   */
  private async postAction<T = unknown>(
    config: AppConnectionConfig,
    action: string,
    payload: Record<string, unknown>
  ): Promise<AppsScriptResponse<T>> {
    this.assertConfigured(config);
    const response = await fetch(config.webAppUrl.trim(), {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        token: config.apiToken.trim(),
        action,
        payload,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} bij uitvoeren van actie "${action}".`);
    }

    const json = (await response.json()) as AppsScriptResponse<T>;
    if (!json.ok || !json.data) {
      throw new Error(json.error ?? `Actie "${action}" is mislukt in Apps Script.`);
    }
    return json;
  }

  private buildGetUrl(baseUrl: string, action: string, token: string): string {
    const url = new URL(baseUrl.trim());
    url.searchParams.set('action', action);
    url.searchParams.set('token', token.trim());
    return url.toString();
  }

  private assertConfigured(config: AppConnectionConfig): void {
    if (!config.webAppUrl.trim()) {
      throw new Error('Google Apps Script Web App URL is nog niet ingesteld.');
    }
    if (!config.apiToken.trim()) {
      throw new Error('Persoonlijk API-token is nog niet ingesteld.');
    }
  }
}
