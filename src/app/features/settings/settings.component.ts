import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { formatEur } from '../../core/domain/card-math.utils';
import { SheetProfileRole } from '../../core/domain/models';
import { AppUpdateService } from '../../core/platform/app-update.service';
import { PlatformService } from '../../core/platform/platform.service';
import { ConnectionTestResult } from '../../core/ports/collection-repository.port';
import { CollectionStore } from '../../core/state/collection.store';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  readonly store = inject(CollectionStore);
  readonly platform = inject(PlatformService);
  readonly updates = inject(AppUpdateService);
  readonly formatEur = formatEur;

  readonly selectedProfileId = signal<string>(this.store.config().activeProfileId ?? '');
  readonly profileName = signal<string>(
    this.store.activeProfile()?.name ?? (this.store.config().webAppUrl ? 'Mijn Spreadsheet' : '')
  );
  readonly profileRole = signal<SheetProfileRole>(this.store.activeProfile()?.role ?? 'live');
  readonly webAppUrl = signal(this.store.config().webAppUrl);
  readonly apiToken = signal(this.store.config().apiToken);
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
    });
  }

  async onProfileSelect(profileId: string): Promise<void> {
    if (!profileId) {
      this.startNewProfile();
      return;
    }
    const found = this.store.sheetProfiles().find((p) => p.id === profileId);
    if (!found) return;

    this.selectedProfileId.set(found.id);
    this.profileName.set(found.name);
    this.profileRole.set(found.role);
    this.webAppUrl.set(found.webAppUrl);
    this.apiToken.set(found.apiToken);
    this.testResult.set(null);

    await this.store.switchSheetProfile(found.id);
    this.cacheSizeKb.set(this.store.getEstimatedCacheKb());
  }

  startNewProfile(): void {
    // Bewaar een eventuele losse bestaande koppeling automatisch als 1e profiel vóórdat we een nieuwe invoeren
    const currentUrl = this.webAppUrl().trim();
    const currentToken = this.apiToken().trim();
    if (!this.selectedProfileId() && currentUrl && currentToken) {
      this.store.saveSheetProfile(
        {
          name: this.profileName().trim() || 'Mijn Spreadsheet',
          role: this.profileRole(),
          webAppUrl: currentUrl,
          apiToken: currentToken,
          monthlyBudget: Math.max(1, Number(this.store.config().monthlyBudget) || 150),
        },
        { activate: false }
      );
    }

    const hasExisting = this.store.sheetProfiles().length > 0;
    this.selectedProfileId.set('');
    this.profileName.set(hasExisting ? '' : 'Mijn Spreadsheet');
    this.profileRole.set(hasExisting ? 'test' : 'live');
    this.webAppUrl.set('');
    this.apiToken.set('');
    this.testResult.set(null);
  }

  deleteSelectedProfile(): void {
    const id = this.selectedProfileId();
    if (!id) return;
    this.store.deleteSheetProfile(id);

    const nextActive = this.store.activeProfile();
    if (nextActive) {
      this.selectedProfileId.set(nextActive.id);
      this.profileName.set(nextActive.name);
      this.profileRole.set(nextActive.role);
      this.webAppUrl.set(nextActive.webAppUrl);
      this.apiToken.set(nextActive.apiToken);
    } else {
      this.selectedProfileId.set('');
      this.profileName.set('');
      this.profileRole.set('live');
      this.webAppUrl.set('');
      this.apiToken.set('');
    }
    this.cacheSizeKb.set(this.store.getEstimatedCacheKb());
    this.store.showToast('Spreadsheet-profiel verwijderd.', 'info');
  }

  saveConnectionOnly(): void {
    const cleanUrl = this.webAppUrl().trim();
    const cleanToken = this.apiToken().trim();
    const cleanBudget = Math.max(1, Number(this.store.config().monthlyBudget) || 150);

    if (cleanUrl && cleanToken) {
      const saved = this.store.saveSheetProfile(
        {
          id: this.selectedProfileId() || undefined,
          name: this.profileName().trim() || 'Mijn Spreadsheet',
          role: this.profileRole(),
          webAppUrl: cleanUrl,
          apiToken: cleanToken,
          monthlyBudget: cleanBudget,
        },
        { activate: true, disableDemo: false }
      );
      this.selectedProfileId.set(saved.id);
      this.profileName.set(saved.name);
    } else {
      this.store.updateConfig({
        webAppUrl: cleanUrl,
        apiToken: cleanToken,
      });
    }
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
        monthlyBudget: this.store.config().monthlyBudget || 150,
      });
      this.testResult.set(result);
    } finally {
      this.isTesting.set(false);
    }
  }

  async saveAndSync(): Promise<void> {
    const cleanUrl = this.webAppUrl().trim();
    const cleanToken = this.apiToken().trim();
    const cleanBudget = Math.max(1, Number(this.store.config().monthlyBudget) || 150);

    if (cleanUrl && cleanToken) {
      const saved = this.store.saveSheetProfile(
        {
          id: this.selectedProfileId() || undefined,
          name: this.profileName().trim() || 'Mijn Spreadsheet',
          role: this.profileRole(),
          webAppUrl: cleanUrl,
          apiToken: cleanToken,
          monthlyBudget: cleanBudget,
        },
        { activate: true, disableDemo: true }
      );
      this.selectedProfileId.set(saved.id);
      this.profileName.set(saved.name);
    } else {
      this.store.updateConfig({
        webAppUrl: cleanUrl,
        apiToken: cleanToken,
        demoMode: false,
      });
    }

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
