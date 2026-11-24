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

const { mockUpdaterDownload, mockUpdaterNext, mockUpdaterSet, mockUpdaterGetNextBundle } = vi.hoisted(() => ({
  mockUpdaterDownload: vi.fn(),
  mockUpdaterNext: vi.fn(),
  mockUpdaterSet: vi.fn(),
  mockUpdaterGetNextBundle: vi.fn(async () => null),
}));

vi.mock('@capgo/capacitor-updater', () => ({
  CapacitorUpdater: {
    notifyAppReady: vi.fn(async () => ({})),
    current: vi.fn(async () => ({ bundle: { version: 'builtin' } })),
    getNextBundle: mockUpdaterGetNextBundle,
    download: mockUpdaterDownload,
    next: mockUpdaterNext,
    set: mockUpdaterSet,
  },
}));

describe('AppUpdateService (PWA SwUpdate + Native OTA & Direct APK Download)', () => {
  let service: AppUpdateService;
  let platform: PlatformService;
  let versionUpdates$: Subject<VersionEvent>;
  let mockSwUpdate: {
    isEnabled: boolean;
    versionUpdates: ReturnType<Subject<VersionEvent>['asObservable']>;
    checkForUpdate: ReturnType<typeof vi.fn>;
    activateUpdate: ReturnType<typeof vi.fn>;
  };
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    window.localStorage.clear();
    versionUpdates$ = new Subject<VersionEvent>();
    fetchSpy.mockReset();
    mockUpdaterDownload.mockReset();
    mockUpdaterNext.mockReset();
    mockUpdaterNext.mockResolvedValue({ id: 'bundle-123' });
    mockUpdaterSet.mockReset();
    mockUpdaterGetNextBundle.mockReset();
    mockUpdaterGetNextBundle.mockResolvedValue(null);
    vi.stubGlobal('fetch', fetchSpy);

    mockSwUpdate = {
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
    service.currentWebVersion.set('1.0.0');
    service.currentNativeVersion.set('1.0.0');
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          webVersion: '1.0.0+99',
          minNativeVersion: '1.0.0',
          latestNativeVersion: '1.0.0',
          bundleUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/ota/web-bundle.zip',
          bundleChecksum: 'c'.repeat(64),
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

  it('geeft de verplichte SHA-256 bundleChecksum mee aan CapacitorUpdater.download() op Android', async () => {
    platform.isNative.set(true);
    platform.platform.set('android');
    service.currentNativeVersion.set('1.0.1');
    service.currentWebVersion.set('1.0.1+1');

    const fakeChecksum = 'a'.repeat(64);
    mockUpdaterDownload.mockResolvedValue({
      id: 'bundle-123',
      version: '1.0.1+2',
      downloaded: '2026-11-23T12:00:00Z',
      checksum: fakeChecksum,
      status: 'pending',
    });
    mockUpdaterSet.mockResolvedValue(undefined);

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          webVersion: '1.0.1+2',
          minNativeVersion: '1.0.1',
          latestNativeVersion: '1.0.1',
          bundleUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/ota/web-bundle.zip?v=1.0.1%2B2',
          bundleChecksum: fakeChecksum,
          apkDownloadUrl:
            'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk',
          releaseNotes: 'Snelle OTA fix',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await service.checkForUpdates(true);
    expect(service.otaBundleChecksum()).toBe(fakeChecksum);
    expect(mockUpdaterDownload).toHaveBeenCalledWith({
      url: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/ota/web-bundle.zip?v=1.0.1%2B2',
      version: '1.0.1+2',
      checksum: fakeChecksum,
    });
    await vi.waitFor(() => {
      expect(mockUpdaterNext).toHaveBeenCalledWith({ id: 'bundle-123' });
      expect(service.otaState()).toBe('ready');
    });

    await service.applyWebUpdate();
    expect(mockUpdaterSet).toHaveBeenCalledWith({ id: 'bundle-123' });
  });

  it('probeert een mislukte Android OTA-download automatisch opnieuw bij een volgende controle', async () => {
    platform.isNative.set(true);
    platform.platform.set('android');
    service.currentNativeVersion.set('1.0.2');
    service.currentWebVersion.set('1.0.2+10');

    const fakeChecksum = 'd'.repeat(64);
    const manifestPayload = JSON.stringify({
      webVersion: '1.0.2+20',
      minNativeVersion: '1.0.1',
      latestNativeVersion: '1.0.2',
      bundleUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/ota/web-bundle.zip?v=1.0.2%2B20',
      bundleChecksum: fakeChecksum,
      apkDownloadUrl:
        'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk',
    });

    mockUpdaterDownload
      .mockRejectedValueOnce(new Error('Tijdelijke netwerkfout'))
      .mockResolvedValueOnce({
        id: 'bundle-retry',
        version: '1.0.2+20',
        downloaded: '2026-11-24T00:00:00Z',
        checksum: fakeChecksum,
        status: 'pending',
      });

    fetchSpy.mockResolvedValueOnce(
      new Response(manifestPayload, { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    await service.checkForUpdates(true);
    await vi.waitFor(() => {
      expect(service.otaState()).toBe('error');
    });
    expect(service.otaError()).toBe('Tijdelijke netwerkfout');

    fetchSpy.mockResolvedValueOnce(
      new Response(manifestPayload, { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    await service.checkForUpdates(true);
    await vi.waitFor(() => {
      expect(service.otaState()).toBe('ready');
    });
    expect(mockUpdaterDownload).toHaveBeenCalledTimes(2);
    expect(mockUpdaterNext).toHaveBeenCalledWith({ id: 'bundle-retry' });
  });

  it('downloadt en activeert een nog nieuwere OTA-bundle zodra deze uitkomt', async () => {
    platform.isNative.set(true);
    platform.platform.set('android');
    service.currentNativeVersion.set('1.0.2');
    service.currentWebVersion.set('1.0.2+50');

    const checksum1 = 'e'.repeat(64);
    const checksum2 = 'f'.repeat(64);

    mockUpdaterDownload
      .mockResolvedValueOnce({ id: 'bundle-100', version: '1.0.2+100' })
      .mockResolvedValueOnce({ id: 'bundle-200', version: '1.0.2+200' });

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          webVersion: '1.0.2+100',
          minNativeVersion: '1.0.1',
          latestNativeVersion: '1.0.2',
          bundleUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/ota/web-bundle.zip?v=1.0.2%2B100',
          bundleChecksum: checksum1,
          apkDownloadUrl:
            'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await service.checkForUpdates(true);
    await vi.waitFor(() => {
      expect(service.otaState()).toBe('ready');
    });
    expect(mockUpdaterNext).toHaveBeenCalledWith({ id: 'bundle-100' });

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          webVersion: '1.0.2+200',
          minNativeVersion: '1.0.1',
          latestNativeVersion: '1.0.2',
          bundleUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/ota/web-bundle.zip?v=1.0.2%2B200',
          bundleChecksum: checksum2,
          apkDownloadUrl:
            'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await service.checkForUpdates(true);
    await vi.waitFor(() => {
      expect(mockUpdaterNext).toHaveBeenCalledWith({ id: 'bundle-200' });
    });
    expect(mockUpdaterDownload).toHaveBeenCalledTimes(2);
  });

  it('controleert eerst SwUpdate voordat activateUpdate wordt aangeroepen bij PWA applyWebUpdate', async () => {
    const callOrder: string[] = [];
    mockSwUpdate.checkForUpdate.mockImplementation(async () => {
      callOrder.push('checkForUpdate');
      return true;
    });
    mockSwUpdate.activateUpdate.mockImplementation(async () => {
      callOrder.push('activateUpdate');
      return true;
    });

    await service.applyWebUpdate();

    expect(callOrder).toEqual(['checkForUpdate', 'activateUpdate']);
  });

  it('houdt zowel webUpdateAvailable als apkUpdateAvailable true bij compatibele optionele APK-update', async () => {
    platform.isNative.set(true);
    platform.platform.set('android');
    service.currentNativeVersion.set('1.0.2');
    service.currentWebVersion.set('1.0.2+10');

    const fakeChecksum = 'b'.repeat(64);
    mockUpdaterDownload.mockResolvedValue({
      id: 'bundle-opt',
      version: '1.0.5+99',
      downloaded: '2026-11-24T00:00:00Z',
      checksum: fakeChecksum,
      status: 'pending',
    });

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          webVersion: '1.0.5+99',
          minNativeVersion: '1.0.1',
          latestNativeVersion: '1.0.5',
          bundleUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/ota/web-bundle.zip?v=1.0.5%2B99',
          bundleChecksum: fakeChecksum,
          apkDownloadUrl:
            'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await service.checkForUpdates(true);

    expect(service.webUpdateAvailable()).toBe(true);
    expect(service.apkUpdateAvailable()).toBe(true);
    expect(service.apkMandatory()).toBe(false);
    expect(service.showUpdateBanner()).toBe(true);
  });

  it('toont foutboodschappen van niet-Error plugin rejections in otaError', async () => {
    platform.isNative.set(true);
    platform.platform.set('android');
    service.currentNativeVersion.set('1.0.2');
    service.currentWebVersion.set('1.0.2+10');

    mockUpdaterDownload.mockRejectedValueOnce({ message: 'Checksum failed' });

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          webVersion: '1.0.2+99',
          minNativeVersion: '1.0.1',
          latestNativeVersion: '1.0.2',
          bundleUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/ota/web-bundle.zip?v=1.0.2%2B99',
          bundleChecksum: 'a'.repeat(64),
          apkDownloadUrl:
            'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await service.checkForUpdates(true);

    await vi.waitFor(() => {
      expect(service.otaState()).toBe('error');
    });
    expect(service.otaError()).toBe('Checksum failed');
  });
});
