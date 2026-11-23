import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConnectionTestResult } from '../../core/ports/collection-repository.port';
import { CollectionStore } from '../../core/state/collection.store';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  readonly store = inject(CollectionStore);

  readonly webAppUrl = signal(this.store.config().webAppUrl);
  readonly apiToken = signal(this.store.config().apiToken);
  readonly monthlyBudget = signal(this.store.config().monthlyBudget || 150);
  readonly showToken = signal(false);

  readonly isTesting = signal(false);
  readonly testResult = signal<ConnectionTestResult | null>(null);
  readonly cacheSizeKb = signal(this.store.getEstimatedCacheKb());

  readonly syncedLabel = computed(() => {
    const iso = this.store.syncedAt();
    return iso ? new Date(iso).toLocaleString('nl-NL') : 'Nog nooit';
  });

  toggleDemoMode(): void {
    const next = !this.store.config().demoMode;
    this.store.updateConfig({
      demoMode: next,
      webAppUrl: this.webAppUrl().trim(),
      apiToken: this.apiToken().trim(),
      monthlyBudget: Number(this.monthlyBudget()) || 150,
    });
  }

  saveConnectionOnly(): void {
    this.store.updateConfig({
      webAppUrl: this.webAppUrl().trim(),
      apiToken: this.apiToken().trim(),
      monthlyBudget: Math.max(1, Number(this.monthlyBudget()) || 150),
    });
    this.store.showToast('Instellingen opgeslagen in dit apparaat.', 'success');
  }

  async testConnection(): Promise<void> {
    this.isTesting.set(true);
    this.testResult.set(null);
    try {
      const result = await this.store.testConnection({
        webAppUrl: this.webAppUrl().trim(),
        apiToken: this.apiToken().trim(),
        demoMode: false,
        monthlyBudget: Number(this.monthlyBudget()) || 150,
      });
      this.testResult.set(result);
    } finally {
      this.isTesting.set(false);
    }
  }

  async saveAndSync(): Promise<void> {
    this.store.updateConfig({
      webAppUrl: this.webAppUrl().trim(),
      apiToken: this.apiToken().trim(),
      demoMode: false,
      monthlyBudget: Math.max(1, Number(this.monthlyBudget()) || 150),
    });
    await this.store.syncFromRemote();
    this.cacheSizeKb.set(this.store.getEstimatedCacheKb());
  }

  async refreshPrices(): Promise<void> {
    await this.store.refreshPrices();
    this.cacheSizeKb.set(this.store.getEstimatedCacheKb());
  }

  async flushQueue(): Promise<void> {
    await this.store.flushOfflineQueue();
  }

  clearCache(): void {
    this.store.clearOfflineCache();
    this.cacheSizeKb.set(this.store.getEstimatedCacheKb());
  }
}
