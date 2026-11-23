import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppsScriptSheetsAdapter } from '../adapters/apps-script-sheets.adapter';
import { TcgdexAdapter } from '../adapters/tcgdex.adapter';
import { CARD_CATALOG_PORT } from '../ports/card-catalog.port';
import { COLLECTION_REPOSITORY } from '../ports/collection-repository.port';
import { AppUpdateService } from './app-update.service';
import { PlatformService } from './platform.service';

describe('AppUpdateService (PWA SwUpdate + Native OTA & Direct APK Download)', () => {
  let service: AppUpdateService;
  let platform: PlatformService;
  let versionUpdates$: Subject<VersionEvent>;
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    window.localStorage.clear();
    versionUpdates$ = new Subject<VersionEvent>();
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);

    const mockSwUpdate = {
      isEnabled: true,
      versionUpdates: versionUpdates$.asObservable(),
      checkForUpdate: vi.fn(async () => false),
      activateUpdate: vi.fn(async () => true),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: mockSwUpdate },
        { provide: COLLECTION_REPOSITORY, useExisting: AppsScriptSheetsAdapter },
        { provide: CARD_CATALOG_PORT, useExisting: TcgdexAdapter },
      ],
    });

    platform = TestBed.inject(PlatformService);
    service = TestBed.inject(AppUpdateService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('toont direct de update-banner wanneer PWA SwUpdate VERSION_READY meldt', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Not found', { status: 404 }));
    await service.initialize();
    expect(service.showUpdateBanner()).toBe(false);

    versionUpdates$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'old' },
      latestVersion: { hash: 'new' },
    });

    expect(service.webUpdateAvailable()).toBe(true);
    expect(service.showUpdateBanner()).toBe(true);

    service.dismissBanner();
    expect(service.showUpdateBanner()).toBe(false);
  });

  it('detecteert nieuwe web-versie uit version.json en opent directe APK-link via PlatformService', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          webVersion: '1.0.0+99',
          minNativeVersion: '1.0.0',
          latestNativeVersion: '1.0.0',
          bundleUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/ota/web-bundle.zip',
          apkDownloadUrl:
            'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk',
          releaseNotes: 'Nieuwe filters',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await service.checkForUpdates(true);

    expect(service.webUpdateAvailable()).toBe(true);
    expect(service.latestWebVersion()).toBe('1.0.0+99');
    expect(service.releaseNotes()).toBe('Nieuwe filters');
    expect(service.showUpdateBanner()).toBe(true);

    const openSpy = vi.spyOn(platform, 'openExternalUrl').mockResolvedValue();
    await service.downloadLatestApk();
    expect(openSpy).toHaveBeenCalledWith(
      'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk'
    );
  });

  it('vergrendelt banner op Android bij verplichte nieuwe APK (nativeVersion < minNativeVersion)', async () => {
    platform.isNative.set(true);
    platform.platform.set('android');
    service.currentNativeVersion.set('1.0.0');

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          webVersion: '1.1.0+12',
          minNativeVersion: '1.1.0',
          latestNativeVersion: '1.1.0',
          bundleUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/ota/web-bundle.zip',
          apkDownloadUrl:
            'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk',
          releaseNotes: 'Native notificaties toegevoegd!',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await service.checkForUpdates(true);

    expect(service.apkUpdateAvailable()).toBe(true);
    expect(service.apkMandatory()).toBe(true);
    expect(service.webUpdateAvailable()).toBe(false);
    expect(service.showUpdateBanner()).toBe(true);

    // Verplichte APK-banner blijft zichtbaar na dismissBanner()
    service.dismissBanner();
    expect(service.showUpdateBanner()).toBe(true);
  });
});
