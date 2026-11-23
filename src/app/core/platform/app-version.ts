export interface AppVersionInfo {
  /** Unieke web-releaseversie (bijv. 1.0.0+20261123.1) — verhoogt bij elke push naar main */
  webVersion: string;
  /** Native APK-versie (SemVer uit package.json / Android versionName) */
  nativeVersion: string;
  /** URL van het publieke version.json manifest op GitHub Pages */
  manifestUrl: string;
  /** Vaste directe downloadlink naar de nieuwste GitHub Release APK */
  defaultApkDownloadUrl: string;
  /** GitHub Releases overzichtspagina als fallback */
  defaultReleasePageUrl: string;
}

/**
 * Standaard versieconfiguratie (wordt tijdens CI-builds automatisch bijgewerkt door scripts/write-version.mjs).
 */
export const APP_VERSION: AppVersionInfo = {
  webVersion: '1.0.1',
  nativeVersion: '1.0.1',
  manifestUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/version.json',
  defaultApkDownloadUrl:
    'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk',
  defaultReleasePageUrl:
    'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest',
};
