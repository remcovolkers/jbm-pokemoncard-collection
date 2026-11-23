export interface RemoteVersionManifest {
  /** Nieuwste web/OTA-versie (verandert bij elke non-APK-update op main) */
  webVersion: string;
  /** Laagste native APK-versie die compatibel is met deze web-bundle */
  minNativeVersion: string;
  /** Nieuwste uitgebrachte native APK-versie */
  latestNativeVersion: string;
  /** Directe downloadlink voor de Capacitor OTA web-bundle zip */
  bundleUrl: string;
  /** Verplichte SHA-256 hex checksum van web-bundle.zip (vereist door @capgo/capacitor-updater v8.54+) */
  bundleChecksum?: string;
  /** Directe downloadlink naar de nieuwste Android APK */
  apkDownloadUrl: string;
  /** Optionele link naar GitHub Releases overzicht */
  releasePageUrl?: string;
  /** Korte toelichting bij de release */
  releaseNotes?: string;
  /** ISO-timestamp van uitgave */
  publishedAt?: string;
}

export interface LocalVersionState {
  webVersion: string;
  nativeVersion: string;
  isNative: boolean;
}

export interface UpdateEvaluation {
  /** Is er een nieuwe non-APK-changing web/OTA-versie beschikbaar die veilig toegepast kan worden? */
  webUpdateAvailable: boolean;
  /** Is er een nieuwere Android APK-versie uitgebracht? */
  apkUpdateAvailable: boolean;
  /** Vereist de nieuwste web-versie verplicht een nieuwe APK (bijv. nieuwe native plugins)? */
  apkMandatory: boolean;
  latestWebVersion: string;
  latestNativeVersion: string;
  bundleUrl: string;
  bundleChecksum: string;
  apkDownloadUrl: string;
  releasePageUrl: string;
  releaseNotes: string;
}

/**
 * Vergelijkt twee SemVer-strings (bijv. "1.2.0" vs "1.10.0" of "1.2.0+20261123.4").
 * Retourneert -1 als a < b, 0 als gelijk, +1 als a > b.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemverTuple(a);
  const pb = parseSemverTuple(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] > pb[i] ? 1 : -1;
    }
  }
  return 0;
}

function parseSemverTuple(raw: string): [number, number, number] {
  const clean = (raw || '').trim().replace(/^v/i, '').split(/[+-]/)[0] || '0.0.0';
  const parts = clean.split('.').map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Vergelijkt de volledige web-versie inclusief optionele build-suffix (bijv. 1.0.0+20261123.2).
 */
export function isNewerWebVersion(remoteWeb: string, localWeb: string): boolean {
  const r = (remoteWeb || '').trim();
  const l = (localWeb || '').trim();
  if (!r || r === l) return false;

  const semverCmp = compareSemver(r, l);
  if (semverCmp !== 0) return semverCmp > 0;

  // Gelijke SemVer maar verschillende build-tag (bijv. 1.0.0+42 vs 1.0.0+41 of 1.0.0)
  const rBuild = r.includes('+') ? r.split('+')[1] : '';
  const lBuild = l.includes('+') ? l.split('+')[1] : '';
  if (!rBuild) return false;
  if (!lBuild) return true;

  const rNum = Number(rBuild);
  const lNum = Number(lBuild);
  if (Number.isFinite(rNum) && Number.isFinite(lNum)) {
    return rNum > lNum;
  }
  return rBuild !== lBuild && rBuild > lBuild;
}

/**
 * Bepaalt op basis van lokale versie en remote version.json welke update-actie nodig is:
 *  - Non-APK update: direct beschikbaar via PWA reload of Capacitor OTA zip (mits compatibel met minNativeVersion)
 *  - Nieuwe APK: toont directe APK-downloadlink (en markeert verplicht als nativeVersion < minNativeVersion)
 */
export function evaluateUpdateManifest(
  local: LocalVersionState,
  remote: RemoteVersionManifest,
  fallbackApkUrl: string,
  fallbackReleaseUrl: string
): UpdateEvaluation {
  const apkDownloadUrl = remote.apkDownloadUrl?.trim() || fallbackApkUrl;
  const releasePageUrl = remote.releasePageUrl?.trim() || fallbackReleaseUrl;

  const apkMandatory =
    local.isNative && compareSemver(local.nativeVersion, remote.minNativeVersion || '1.0.0') < 0;

  const apkUpdateAvailable =
    apkMandatory ||
    compareSemver(remote.latestNativeVersion || '1.0.0', local.nativeVersion) > 0;

  // Op native alleen een OTA web-bundle aanbieden als de geïnstalleerde APK voldoet aan minNativeVersion
  const webUpdateAvailable =
    !apkMandatory && isNewerWebVersion(remote.webVersion, local.webVersion);

  return {
    webUpdateAvailable,
    apkUpdateAvailable,
    apkMandatory,
    latestWebVersion: remote.webVersion || local.webVersion,
    latestNativeVersion: remote.latestNativeVersion || local.nativeVersion,
    bundleUrl: remote.bundleUrl || '',
    bundleChecksum: (remote.bundleChecksum || '').trim().toLowerCase(),
    apkDownloadUrl,
    releasePageUrl,
    releaseNotes: remote.releaseNotes || '',
  };
}
