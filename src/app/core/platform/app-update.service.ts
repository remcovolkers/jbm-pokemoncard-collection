import { Injectable, computed, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { App as CapApp } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { filter } from 'rxjs';
import { CollectionStore } from '../state/collection.store';
import { APP_VERSION } from './app-version';
import { PlatformService } from './platform.service';
import { RemoteVersionManifest, evaluateUpdateManifest } from './version.utils';

export type OtaDownloadState = 'idle' | 'downloading' | 'ready' | 'applying' | 'error';

/**
 * Beheert automatische in-app updates voor zowel PWA als Capacitor Android APK:
 *  1. Non-APK-changing updates:
 *     - PWA: Angular SwUpdate + version.json -> banner "Nieuwe versie beschikbaar" -> direct herladen.
 *     - Android APK: @capgo/capacitor-updater downloadt ota/web-bundle.zip vanaf GitHub Pages
 *       op de achtergrond en past deze met 1 tik toe (zonder nieuwe APK, blijft 100% offline werken).
 *  2. APK-changing updates:
 *     - Detecteert nieuwere native release via version.json en biedt een directe 1-klik downloadknop
 *       naar de nieuwste GitHub Release APK.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly platform = inject(PlatformService);
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly store = inject(CollectionStore);

  readonly currentWebVersion = signal<string>(APP_VERSION.webVersion);
  readonly currentNativeVersion = signal<string>(APP_VERSION.nativeVersion);

  readonly isChecking = signal<boolean>(false);
  readonly lastCheckedAt = signal<string | null>(null);
  readonly checkError = signal<string | null>(null);

  // Non-APK (Web / OTA) update state
  readonly webUpdateAvailable = signal<boolean>(false);
  readonly latestWebVersion = signal<string>(APP_VERSION.webVersion);
  readonly otaState = signal<OtaDownloadState>('idle');
  readonly otaBundleUrl = signal<string>('');
  private readyBundleId: string | null = null;

  // APK (Native) update state
  readonly apkUpdateAvailable = signal<boolean>(false);
  readonly apkMandatory = signal<boolean>(false);
  readonly latestNativeVersion = signal<string>(APP_VERSION.nativeVersion);
  readonly apkDownloadUrl = signal<string>(APP_VERSION.defaultApkDownloadUrl);
  readonly releasePageUrl = signal<string>(APP_VERSION.defaultReleasePageUrl);
  readonly releaseNotes = signal<string>('');

  readonly bannerDismissed = signal<boolean>(false);

  /** Toon de in-app update-banner voor non-APK update óf nieuwe APK-versie */
  readonly showUpdateBanner = computed(() => {
    if (this.apkMandatory()) return true;
    if (this.bannerDismissed()) return false;
    if (this.webUpdateAvailable()) return true;
    if (this.platform.isNative() && this.apkUpdateAvailable()) return true;
    return false;
  });

  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (this.platform.isNative()) {
      await this.initNativeUpdater();
    } else {
      this.initPwaUpdater();
    }

    // Controleer stilletjes op updates bij opstarten (alleen als online)
    if (this.store.isOnline()) {
      void this.checkForUpdates(true);
    }
  }

  private async initNativeUpdater(): Promise<void> {
    // Bevestig aan @capgo/capacitor-updater dat deze bundle gezond is opgestart (voorkomt rollback)
    try {
      await CapacitorUpdater.notifyAppReady();
    } catch {
      // Negeer als plugin niet beschikbaar is
    }

    // Lees geïnstalleerde native APK-versie en eventueel actieve OTA-bundle uit
    try {
      const info = await CapApp.getInfo();
      if (info?.version) {
        this.currentNativeVersion.set(info.version);
      }
    } catch {
      // Val terug op APP_VERSION.nativeVersion
    }

    try {
      const current = await CapacitorUpdater.current();
      if (current?.bundle?.version && current.bundle.version !== 'builtin') {
        this.currentWebVersion.set(current.bundle.version);
      }
    } catch {
      // Val terug op APP_VERSION.webVersion
    }

    // Controleer automatisch opnieuw wanneer de app terugkomt uit de achtergrond
    try {
      await CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive && this.store.isOnline()) {
          void this.checkForUpdates(true);
        }
      });
    } catch {
      // Negeer
    }
  }

  private initPwaUpdater(): void {
    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
        .subscribe(() => {
          this.webUpdateAvailable.set(true);
          this.bannerDismissed.set(false);
        });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.store.isOnline()) {
          void this.checkForUpdates(true);
        }
      });
    }
  }

  /**
   * Controleert `version.json` op GitHub Pages (en triggert SwUpdate op PWA).
   * Op Android APK wordt een compatibele non-APK OTA-bundle direct stil gedownload.
   */
  async checkForUpdates(silent = false): Promise<void> {
    if (this.isChecking()) return;
    if (!this.store.isOnline()) {
      if (!silent) this.store.showToast('Offline: kan nu niet op updates controleren.', 'warning');
      return;
    }

    this.isChecking.set(true);
    this.checkError.set(null);

    try {
      // Op PWA ook direct Service Worker laten checken
      if (!this.platform.isNative() && this.swUpdate?.isEnabled) {
        try {
          const hasSwUpdate = await this.swUpdate.checkForUpdate();
          if (hasSwUpdate) {
            this.webUpdateAvailable.set(true);
            this.bannerDismissed.set(false);
          }
        } catch {
          // Ga gewoon door met version.json check
        }
      }

      const manifest = await this.fetchRemoteManifest();
      this.lastCheckedAt.set(new Date().toISOString());

      if (!manifest) {
        if (!silent) {
          this.store.showToast('Geen versie-manifest bereikbaar — je draait de lokale versie.', 'info');
        }
        return;
      }

      const decision = evaluateUpdateManifest(
        {
          webVersion: this.currentWebVersion(),
          nativeVersion: this.currentNativeVersion(),
          isNative: this.platform.isNative(),
        },
        manifest,
        APP_VERSION.defaultApkDownloadUrl,
        APP_VERSION.defaultReleasePageUrl
      );

      this.latestWebVersion.set(decision.latestWebVersion);
      this.latestNativeVersion.set(decision.latestNativeVersion);
      this.otaBundleUrl.set(decision.bundleUrl);
      this.apkDownloadUrl.set(decision.apkDownloadUrl);
      this.releasePageUrl.set(decision.releasePageUrl);
      this.releaseNotes.set(decision.releaseNotes);
      this.apkUpdateAvailable.set(decision.apkUpdateAvailable);
      this.apkMandatory.set(decision.apkMandatory);

      if (decision.webUpdateAvailable) {
        this.webUpdateAvailable.set(true);
        this.bannerDismissed.set(false);

        // Op native Android downloaden we de non-APK web-bundle direct op de achtergrond
        if (this.platform.isNative() && decision.bundleUrl && this.otaState() === 'idle') {
          void this.preloadNativeOtaBundle(decision.bundleUrl, decision.latestWebVersion);
        }
      }

      if (!silent) {
        if (decision.apkMandatory) {
          this.store.showToast(
            `Nieuwe Android APK (v${decision.latestNativeVersion}) vereist — tik op downloaden.`,
            'warning'
          );
        } else if (decision.webUpdateAvailable) {
          this.store.showToast(
            `Nieuwe versie beschikbaar (v${decision.latestWebVersion})!`,
            'success'
          );
        } else if (decision.apkUpdateAvailable && this.platform.isNative()) {
          this.store.showToast(
            `Nieuwe Android APK beschikbaar (v${decision.latestNativeVersion})!`,
            'info'
          );
        } else {
          this.store.showToast('Je gebruikt al de nieuwste versie van PokéBinder.', 'success');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update-controle mislukt.';
      this.checkError.set(msg);
      if (!silent) this.store.showToast(msg, 'error');
    } finally {
      this.isChecking.set(false);
    }
  }

  /**
   * Past een beschikbare non-APK update direct toe:
   *  - Android APK: activeert de gedownloade OTA-bundle via CapacitorUpdater.set()
   *  - PWA: activeert de nieuwe Service Worker en herlaadt de pagina
   */
  async applyWebUpdate(): Promise<void> {
    if (this.platform.isNative()) {
      await this.applyNativeOtaUpdate();
      return;
    }

    if (this.swUpdate?.isEnabled) {
      try {
        await this.swUpdate.activateUpdate();
      } catch {
        // Herlaad alsnog om nieuwe assets op te halen
      }
    }

    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  /**
   * Opent de directe downloadlink van de nieuwste Android APK.
   */
  async downloadLatestApk(): Promise<void> {
    const url = this.apkDownloadUrl() || APP_VERSION.defaultApkDownloadUrl;
    await this.platform.openExternalUrl(url);
  }

  dismissBanner(): void {
    if (!this.apkMandatory()) {
      this.bannerDismissed.set(true);
    }
  }

  private async preloadNativeOtaBundle(url: string, version: string): Promise<void> {
    this.otaState.set('downloading');
    try {
      const bundle = await CapacitorUpdater.download({ url, version });
      this.readyBundleId = bundle.id;
      this.otaState.set('ready');
    } catch {
      this.otaState.set('error');
    }
  }

  private async applyNativeOtaUpdate(): Promise<void> {
    try {
      if (!this.readyBundleId && this.otaBundleUrl()) {
        this.otaState.set('downloading');
        const bundle = await CapacitorUpdater.download({
          url: this.otaBundleUrl(),
          version: this.latestWebVersion(),
        });
        this.readyBundleId = bundle.id;
      }

      if (!this.readyBundleId) {
        this.store.showToast('Update-pakket niet gevonden. Probeer opnieuw te controleren.', 'error');
        return;
      }

      this.otaState.set('applying');
      await CapacitorUpdater.set({ id: this.readyBundleId });
    } catch (err) {
      this.otaState.set('error');
      const msg = err instanceof Error ? err.message : 'Kon update niet toepassen.';
      this.store.showToast(msg, 'error');
    }
  }

  private async fetchRemoteManifest(): Promise<RemoteVersionManifest | null> {
    const sep = APP_VERSION.manifestUrl.includes('?') ? '&' : '?';
    const url = `${APP_VERSION.manifestUrl}${sep}t=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return (await res.json()) as RemoteVersionManifest;
    } catch {
      return null;
    }
  }
}
