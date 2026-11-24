import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { formatEur } from '../../core/domain/card-math.utils';
import { SheetProfileRole } from '../../core/domain/models';
import { AppUpdateService } from '../../core/platform/app-update.service';
import { PlatformService } from '../../core/platform/platform.service';
import {
  SHEET_TEMPLATE_CONFIG,
  copyTextToClipboard,
  generateSecureApiToken,
} from '../../core/platform/sheet-template-config';
import { isScriptUpdateAvailable } from '../../core/platform/version.utils';
import { ConnectionTestResult } from '../../core/ports/collection-repository.port';
import { CollectionStore } from '../../core/state/collection.store';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  readonly store = inject(CollectionStore);
  readonly platform = inject(PlatformService);
  readonly updates = inject(AppUpdateService);
  private readonly route = inject(ActivatedRoute, { optional: true });
  readonly formatEur = formatEur;
  readonly templateConfig = SHEET_TEMPLATE_CONFIG;

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
  readonly isCopyingScript = signal(false);
  readonly copiedScriptLines = signal<number | null>(null);
  readonly manualSetupOpen = signal<boolean | null>(null);

  readonly isLiveSheetConnected = computed(
    () => !this.store.config().demoMode && this.store.isSheetConfigured()
  );
  readonly connectedScriptVersion = computed(() => this.store.connectedScriptVersion());
  readonly latestScriptVersion = computed(() => this.updates.latestScriptVersion());
  readonly hasKnownSheetContact = computed(
    () =>
      this.store.legacyAppsScriptDetected() ||
      this.connectedScriptVersion() !== null ||
      Boolean(this.store.syncedAt())
  );
  readonly scriptUpdateAvailable = computed(
    () =>
      this.isLiveSheetConnected() &&
      this.hasKnownSheetContact() &&
      isScriptUpdateAvailable(
        this.connectedScriptVersion(),
        this.latestScriptVersion(),
        this.store.legacyAppsScriptDetected()
      )
  );
  readonly isSetupSectionExpanded = computed(() => {
    const manual = this.manualSetupOpen();
    if (manual !== null) return manual;
    return !this.isLiveSheetConnected() || this.scriptUpdateAvailable();
  });

  readonly syncedLabel = computed(() => {
    const iso = this.store.syncedAt();
    return iso ? new Date(iso).toLocaleString('nl-NL') : 'Nog nooit';
  });

  ngOnInit(): void {
    if (this.route?.snapshot?.fragment === 'sheet-setup') {
      this.manualSetupOpen.set(true);
      this.scrollToSheetSetup();
    }
    this.route?.fragment?.subscribe((frag) => {
      if (frag === 'sheet-setup') {
        this.manualSetupOpen.set(true);
        this.scrollToSheetSetup();
      }
    });
  }

  toggleSetupSection(): void {
    this.manualSetupOpen.set(!this.isSetupSectionExpanded());
  }

  async openTemplateCopy(): Promise<void> {
    await this.platform.openExternalUrl(this.templateConfig.copyUrl);
  }

  async copyTemplateLink(): Promise<void> {
    const ok = await copyTextToClipboard(this.templateConfig.copyUrl);
    if (ok) {
      this.store.showToast('Template-link gekopieerd naar klembord.', 'success');
    } else {
      this.store.showToast('Kon link niet kopiëren — open via de knop ernaast.', 'warning');
    }
  }

  async copyLatestAppsScript(): Promise<void> {
    if (this.isCopyingScript()) return;
    this.isCopyingScript.set(true);
    try {
      const code = await this.fetchLatestAppsScriptSource();
      const copied = await copyTextToClipboard(code);
      const lines = code.split(/\r?\n/).length;
      if (copied) {
        this.copiedScriptLines.set(lines);
        this.store.showToast(
          `Nieuwste Code.gs gekopieerd (${lines} regels) — plak in Apps Script en kies Nieuwe versie.`,
          'success'
        );
      } else {
        this.store.showToast('Klembord niet beschikbaar — bekijk Code.gs via GitHub.', 'warning');
      }
    } catch {
      this.store.showToast('Kon Code.gs niet ophalen. Open de code via GitHub.', 'warning');
    } finally {
      this.isCopyingScript.set(false);
    }
  }

  async openGithubScript(): Promise<void> {
    await this.platform.openExternalUrl(
      this.updates.scriptGithubUrl() || this.templateConfig.githubCodeUrl
    );
  }

  async generateAndCopyApiToken(): Promise<void> {
    const token = generateSecureApiToken(40);
    this.apiToken.set(token);
    this.showToken.set(true);
    const copied = await copyTextToClipboard(token);
    this.store.showToast(
      copied
        ? 'Veilig API-token gegenereerd en gekopieerd! Plak dit ook in Google Sheets (⚡ Pokémon API → API-token instellen).'
        : 'Veilig API-token gegenereerd! Kopieer het hieronder naar je Google Sheet.',
      'success'
    );
  }

  private async fetchLatestAppsScriptSource(): Promise<string> {
    const candidates = [
      this.templateConfig.bundledCodePath,
      this.updates.scriptCodeUrl(),
    ].filter((u): u is string => Boolean(u && u.trim()));

    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        const text = await res.text();
        if (text && !text.trim().startsWith('<') && text.includes('SCRIPT_VERSION')) {
          return text;
        }
      } catch {
        // Probeer volgende bron
      }
    }
    throw new Error('Code.gs broncode niet bereikbaar.');
  }

  private scrollToSheetSetup(): void {
    if (typeof document === 'undefined') return;
    setTimeout(() => {
      try {
        document.getElementById('sheet-setup')?.scrollIntoView?.({
          behavior: 'smooth',
          block: 'start',
        });
      } catch {
        // Negeer in omgevingen zonder scrollIntoView
      }
    }, 40);
  }

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
