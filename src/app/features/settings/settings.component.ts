import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { formatEur } from '../../core/domain/card-math.utils';
import {
  KaartspotBinderSummary,
  KaartspotProfileData,
  computeKaartspotSyncPlan,
  parseKaartspotInput,
  selectDefaultBinderIds,
} from '../../core/domain/kaartspot-sync.utils';
import { SheetProfileRole } from '../../core/domain/models';
import { AppUpdateService } from '../../core/platform/app-update.service';
import { PlatformService } from '../../core/platform/platform.service';
import {
  SHEET_TEMPLATE_CONFIG,
  copyTextToClipboard,
  extractAppsScriptDeploymentId,
  formatDeploymentIdShort,
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
export class SettingsComponent implements OnInit, OnDestroy {
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
  readonly isVerifyingScript = signal(false);
  readonly testResult = signal<ConnectionTestResult | null>(null);
  readonly cacheSizeKb = signal(this.store.getEstimatedCacheKb());
  readonly isCopyingScript = signal(false);
  readonly copiedScriptLines = signal<number | null>(null);
  readonly manualSetupOpen = signal<boolean | null>(null);
  private lastAutoVerifyAt = 0;

  // Kaartspot Sync state (centraal in Instellingen & Sync, gekoppeld per Sheet-profiel)
  readonly ksSourceInput = signal<string>(this.store.activeKaartspotConfig()?.sourceInput ?? '');
  readonly ksLoadedProfile = signal<KaartspotProfileData | null>(null);
  readonly ksSelectedBinderIds = signal<string[]>(
    this.store.activeKaartspotConfig()?.selectedBinderIds ?? []
  );
  readonly ksWishlistWanted = signal<boolean>(
    this.store.activeKaartspotConfig()?.wishlistWanted ?? true
  );
  readonly ksSyncLayout = signal<boolean>(
    this.store.activeKaartspotConfig()?.syncLayout ?? true
  );
  readonly ksIsFetching = signal<boolean>(false);
  readonly ksIsSyncing = signal<boolean>(false);
  readonly ksError = signal<string | null>(null);
  readonly ksNeedsScriptUpdate = signal<boolean>(false);
  readonly ksShowJsonFallback = signal<boolean>(false);
  readonly ksPastedJson = signal<string>('');

  readonly ksParsedInput = computed(() => parseKaartspotInput(this.ksSourceInput()));
  readonly ksSelectableBinders = computed<KaartspotBinderSummary[]>(() => {
    const prof = this.ksLoadedProfile();
    if (!prof) return [];
    return prof.binders.filter((b) => b.ownedCardCount + b.wantedCardCount > 0);
  });
  readonly ksSelectedDexLayout = computed(() => {
    const prof = this.ksLoadedProfile();
    if (!prof) return null;
    const selected = new Set(this.ksSelectedBinderIds());
    const dex = prof.binders.find(
      (b) => selected.has(b.id) && b.isPokedexBinder && b.supportedSlotsPerPage !== null
    );
    if (!dex?.supportedSlotsPerPage) return null;
    return dex.supportedSlotsPerPage !== this.store.binderSlotsPerPage()
      ? dex.supportedSlotsPerPage
      : null;
  });
  readonly ksSyncPlan = computed(() => {
    const prof = this.ksLoadedProfile();
    if (!prof) return null;
    return computeKaartspotSyncPlan(
      prof,
      {
        selectedBinderIds: this.ksSelectedBinderIds(),
        wishlistWanted: this.ksWishlistWanted(),
        syncLayout: this.ksSyncLayout(),
      },
      this.store.snapshot()
    );
  });
  readonly ksLastSyncedLabel = computed(() => {
    const iso = this.store.activeKaartspotConfig()?.lastSyncedAt;
    return iso ? new Date(iso).toLocaleString('nl-NL') : null;
  });

  private readonly onWindowFocus = (): void => {
    this.maybeAutoVerifyScriptOnReturn();
  };

  private readonly onVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.maybeAutoVerifyScriptOnReturn();
    }
  };

  readonly isLiveSheetConnected = computed(
    () => !this.store.config().demoMode && this.store.isSheetConfigured()
  );
  readonly activeDeploymentId = computed(() =>
    extractAppsScriptDeploymentId(this.store.config().webAppUrl)
  );
  readonly activeDeploymentShortId = computed(() =>
    formatDeploymentIdShort(this.activeDeploymentId())
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

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.onWindowFocus);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onWindowFocus);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  toggleSetupSection(): void {
    this.manualSetupOpen.set(!this.isSetupSectionExpanded());
  }

  async verifyScriptVersion(silent = false): Promise<void> {
    if (!this.isLiveSheetConnected() || this.isVerifyingScript()) return;
    const wasOutdated = this.scriptUpdateAvailable();
    if (this.isSetupSectionExpanded()) {
      this.manualSetupOpen.set(true);
    }

    this.isVerifyingScript.set(true);
    try {
      const res = await this.store.testConnection();
      if (!res.ok) {
        if (!silent) {
          this.store.showToast(res.error || 'Kon Google Sheet niet bereiken.', 'error');
        }
        return;
      }

      if (!this.scriptUpdateAvailable()) {
        if (!silent || wasOutdated) {
          this.store.showToast(
            `Script-versie gecontroleerd: v${res.scriptVersion || this.latestScriptVersion()} — helemaal up-to-date!`,
            'success'
          );
        }
      } else if (!silent) {
        const depHint = this.activeDeploymentShortId();
        const detectedLabel = res.scriptVersion ? `v${res.scriptVersion}` : 'v1.x';
        this.store.showToast(
          depHint
            ? `Gekoppelde URL (${depHint}) draait nog op ${detectedLabel}. Kies links bij Implementaties beheren exact deze implementatie!`
            : `Deze Web App URL draait nog op ${detectedLabel}. Kies bij Implementaties beheren → Bewerken → Nieuwe versie.`,
          'warning'
        );
      }
    } finally {
      this.isVerifyingScript.set(false);
    }
  }

  private maybeAutoVerifyScriptOnReturn(): void {
    if (!this.isLiveSheetConnected() || this.isVerifyingScript() || this.isTesting()) return;
    if (!this.scriptUpdateAvailable() && this.copiedScriptLines() === null) return;
    const now = Date.now();
    if (now - this.lastAutoVerifyAt < 4000) return;
    this.lastAutoVerifyAt = now;
    void this.verifyScriptVersion(true);
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
    this.syncKaartspotSignalsFromActiveProfile();
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
    this.syncKaartspotSignalsFromActiveProfile();
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
    this.resetKaartspotDraft();
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
    this.syncKaartspotSignalsFromActiveProfile();
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

  // ==========================================================================
  // KAARTSPOT BINDER SYNC ACTIES
  // ==========================================================================

  private syncKaartspotSignalsFromActiveProfile(): void {
    const saved = this.store.activeKaartspotConfig();
    this.ksSourceInput.set(saved?.sourceInput ?? '');
    this.ksSelectedBinderIds.set(saved?.selectedBinderIds ?? []);
    this.ksWishlistWanted.set(saved?.wishlistWanted ?? true);
    this.ksSyncLayout.set(saved?.syncLayout ?? true);
    this.ksLoadedProfile.set(null);
    this.ksError.set(null);
    this.ksNeedsScriptUpdate.set(false);
    this.ksShowJsonFallback.set(false);
    this.ksPastedJson.set('');
  }

  private resetKaartspotDraft(): void {
    this.ksSourceInput.set('');
    this.ksSelectedBinderIds.set([]);
    this.ksWishlistWanted.set(true);
    this.ksSyncLayout.set(true);
    this.ksLoadedProfile.set(null);
    this.ksError.set(null);
    this.ksNeedsScriptUpdate.set(false);
    this.ksShowJsonFallback.set(false);
    this.ksPastedJson.set('');
  }

  async loadKaartspotPreview(usePastedJson = false): Promise<boolean> {
    if (this.ksIsFetching() || this.ksIsSyncing()) return false;
    const raw = this.ksSourceInput().trim();
    if (!raw) {
      this.ksError.set('Plak eerst je Kaartspot wrapped-link of @gebruikersnaam.');
      return false;
    }

    this.ksIsFetching.set(true);
    this.ksError.set(null);
    this.ksNeedsScriptUpdate.set(false);

    try {
      const { input, profile } = await this.store.fetchKaartspotProfileData(
        raw,
        usePastedJson ? this.ksPastedJson() : undefined
      );
      this.ksLoadedProfile.set(profile);

      // Behoud eerder opgeslagen mapselectie als die voor ditzelfde account geldig is, anders kies op basis van ?cat= / Pokedex
      const saved = this.store.activeKaartspotConfig();
      const validIds = new Set(
        profile.binders
          .filter((b) => b.ownedCardCount + b.wantedCardCount > 0)
          .map((b) => b.id)
      );

      if (input.targetBinderId && validIds.has(input.targetBinderId)) {
        this.ksSelectedBinderIds.set([input.targetBinderId]);
      } else if (
        saved &&
        saved.username.toLowerCase() === profile.username.toLowerCase() &&
        saved.selectedBinderIds.some((id) => validIds.has(id))
      ) {
        this.ksSelectedBinderIds.set(saved.selectedBinderIds.filter((id) => validIds.has(id)));
      } else {
        this.ksSelectedBinderIds.set(selectDefaultBinderIds(profile, input.targetBinderId));
      }

      if (usePastedJson) {
        this.ksShowJsonFallback.set(false);
      }
      return true;
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      if (rawMsg.startsWith('SCRIPT_UPDATE_REQUIRED:')) {
        this.ksNeedsScriptUpdate.set(true);
        this.ksError.set(rawMsg.replace(/^SCRIPT_UPDATE_REQUIRED:\s*/, ''));
      } else if (rawMsg.startsWith('CORS_PASTE_NEEDED:')) {
        this.ksShowJsonFallback.set(true);
        this.ksError.set(rawMsg.replace(/^CORS_PASTE_NEEDED:\s*/, ''));
      } else {
        this.ksError.set(rawMsg);
      }
      return false;
    } finally {
      this.ksIsFetching.set(false);
    }
  }

  toggleKaartspotBinder(binderId: string): void {
    const current = this.ksSelectedBinderIds();
    if (current.includes(binderId)) {
      this.ksSelectedBinderIds.set(current.filter((id) => id !== binderId));
    } else {
      this.ksSelectedBinderIds.set([...current, binderId]);
    }
  }

  isKaartspotBinderSelected(binderId: string): boolean {
    return this.ksSelectedBinderIds().includes(binderId);
  }

  formatGridLabel(spp: number): string {
    if (spp === 4) return '2×2 (4 vakjes)';
    if (spp === 9) return '3×3 (9 vakjes)';
    if (spp === 12) return '4×3 (12 vakjes)';
    if (spp === 16) return '4×4 (16 vakjes)';
    if (spp === 20) return '5×4 (20 vakjes)';
    return `${spp} vakjes`;
  }

  async applyKaartspotSync(): Promise<void> {
    const plan = this.ksSyncPlan();
    const prof = this.ksLoadedProfile();
    if (!plan || !prof || this.ksIsSyncing()) return;

    this.ksIsSyncing.set(true);
    this.ksError.set(null);
    try {
      const ok = await this.store.executeKaartspotSync(plan, {
        sourceInput: this.ksSourceInput().trim(),
        username: prof.username,
        selectedBinderIds: this.ksSelectedBinderIds(),
        wishlistWanted: this.ksWishlistWanted(),
        syncLayout: this.ksSyncLayout(),
      });
      if (ok) {
        this.cacheSizeKb.set(this.store.getEstimatedCacheKb());
      }
    } finally {
      this.ksIsSyncing.set(false);
    }
  }

  async quickResyncSavedKaartspot(): Promise<void> {
    const saved = this.store.activeKaartspotConfig();
    if (!saved || this.ksIsFetching() || this.ksIsSyncing()) return;
    this.ksSourceInput.set(saved.sourceInput);
    this.ksWishlistWanted.set(saved.wishlistWanted);
    this.ksSyncLayout.set(saved.syncLayout);
    const loaded = await this.loadKaartspotPreview(false);
    if (loaded) {
      await this.applyKaartspotSync();
    }
  }

  unlinkKaartspot(): void {
    this.store.saveKaartspotConfig(undefined);
    this.resetKaartspotDraft();
    this.store.showToast('Kaartspot-koppeling verwijderd van dit profiel.', 'info');
  }

  async openKaartspotPublicDataTab(): Promise<void> {
    const parsed = this.ksParsedInput();
    if (!parsed) {
      this.ksError.set('Vul eerst een geldige Kaartspot-link of @gebruikersnaam in.');
      return;
    }
    await this.platform.openExternalUrl(parsed.apiUrl);
  }

  async jumpToScriptUpdate(): Promise<void> {
    this.manualSetupOpen.set(true);
    await this.copyLatestAppsScript();
    this.scrollToSheetSetup();
  }
}
