import { describe, expect, it } from 'vitest';
import {
  RemoteVersionManifest,
  compareSemver,
  evaluateUpdateManifest,
  isNewerWebVersion,
} from './version.utils';

const BASE_REMOTE: RemoteVersionManifest = {
  webVersion: '1.0.0+12',
  minNativeVersion: '1.0.0',
  latestNativeVersion: '1.0.0',
  bundleUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/ota/web-bundle.zip',
  apkDownloadUrl:
    'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk',
  releasePageUrl: 'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest',
  releaseNotes: 'Snellere filters en bugfixes',
};

describe('version.utils (PWA + Capacitor OTA & APK evaluatie)', () => {
  it('vergelijkt SemVer-versies numeriek correct (1.10.0 > 1.2.0)', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1);
    expect(compareSemver('1.2.0', '1.10.0')).toBe(-1);
    expect(compareSemver('v2.0.0', '1.9.9')).toBe(1);
    expect(compareSemver('1.0.0+99', '1.0.0+1')).toBe(0);
  });

  it('detecteert nieuwere web-builds inclusief +build-nummer', () => {
    expect(isNewerWebVersion('1.0.0+12', '1.0.0+11')).toBe(true);
    expect(isNewerWebVersion('1.0.0+1', '1.0.0')).toBe(true);
    expect(isNewerWebVersion('1.1.0+1', '1.0.0+99')).toBe(true);
    expect(isNewerWebVersion('1.0.0+12', '1.0.0+12')).toBe(false);
    expect(isNewerWebVersion('1.0.0+5', '1.0.0+10')).toBe(false);
    expect(isNewerWebVersion('1.0.0', '1.0.0+2')).toBe(false);
  });

  it('biedt non-APK OTA update aan op zowel PWA als compatibele Android APK', () => {
    const pwaDecision = evaluateUpdateManifest(
      { webVersion: '1.0.0+10', nativeVersion: '1.0.0', isNative: false },
      BASE_REMOTE,
      BASE_REMOTE.apkDownloadUrl,
      BASE_REMOTE.releasePageUrl!
    );
    expect(pwaDecision.webUpdateAvailable).toBe(true);
    expect(pwaDecision.apkUpdateAvailable).toBe(false);
    expect(pwaDecision.apkMandatory).toBe(false);

    const apkDecision = evaluateUpdateManifest(
      { webVersion: '1.0.0+10', nativeVersion: '1.0.0', isNative: true },
      BASE_REMOTE,
      BASE_REMOTE.apkDownloadUrl,
      BASE_REMOTE.releasePageUrl!
    );
    expect(apkDecision.webUpdateAvailable).toBe(true);
    expect(apkDecision.apkUpdateAvailable).toBe(false);
    expect(apkDecision.apkMandatory).toBe(false);
  });

  it('detecteert optionele nieuwe APK én laat compatibele OTA web-update nog steeds toe', () => {
    const decision = evaluateUpdateManifest(
      { webVersion: '1.0.0+10', nativeVersion: '1.0.0', isNative: true },
      { ...BASE_REMOTE, latestNativeVersion: '1.1.0', minNativeVersion: '1.0.0' },
      BASE_REMOTE.apkDownloadUrl,
      BASE_REMOTE.releasePageUrl!
    );
    expect(decision.apkUpdateAvailable).toBe(true);
    expect(decision.apkMandatory).toBe(false);
    expect(decision.webUpdateAvailable).toBe(true);
  });

  it('blokkeert incompatibele OTA-bundle en markeert APK als verplicht wanneer nativeVersion < minNativeVersion', () => {
    const decision = evaluateUpdateManifest(
      { webVersion: '1.0.0+10', nativeVersion: '1.0.0', isNative: true },
      { ...BASE_REMOTE, webVersion: '1.1.0+15', latestNativeVersion: '1.1.0', minNativeVersion: '1.1.0' },
      BASE_REMOTE.apkDownloadUrl,
      BASE_REMOTE.releasePageUrl!
    );
    expect(decision.apkUpdateAvailable).toBe(true);
    expect(decision.apkMandatory).toBe(true);
    expect(decision.webUpdateAvailable).toBe(false);
  });

  it('rapporteert geen update wanneer lokale versie actueel is', () => {
    const decision = evaluateUpdateManifest(
      { webVersion: '1.0.0+12', nativeVersion: '1.0.0', isNative: true },
      BASE_REMOTE,
      BASE_REMOTE.apkDownloadUrl,
      BASE_REMOTE.releasePageUrl!
    );
    expect(decision.webUpdateAvailable).toBe(false);
    expect(decision.apkUpdateAvailable).toBe(false);
    expect(decision.apkMandatory).toBe(false);
  });
});
