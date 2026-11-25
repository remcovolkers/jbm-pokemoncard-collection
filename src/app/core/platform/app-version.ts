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
  /** Nieuwste PokéBinder Apps Script (Code.gs) versie */
  latestScriptVersion: string;
  /** Korte toelichting van de nieuwste Code.gs wijzigingen */
  scriptChangelog: string;
  /** CORS-vrije URL van de actuele Code.gs op GitHub Pages */
  scriptCodeUrl: string;
  /** GitHub-bronpagina van Code.gs */
  scriptGithubUrl: string;
}

/**
 * Standaard versieconfiguratie (wordt tijdens CI-builds automatisch bijgewerkt door scripts/write-version.mjs).
 */
export const APP_VERSION: AppVersionInfo = {
  webVersion: '1.0.2',
  nativeVersion: '1.0.2',
  manifestUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/version.json',
  defaultApkDownloadUrl:
    'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk',
  defaultReleasePageUrl:
    'https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest',
  latestScriptVersion: '2.2.2',
  scriptChangelog:
    'Kaartnummers als platte tekst (geen 5/11-datum meer) met zelfherstel, Chinese setcodes in Set Voortgang, taalkolom op Verlanglijst en CHS/ZHT in de taallijst.',
  scriptCodeUrl: 'https://remcovolkers.github.io/jbm-pokemoncard-collection/apps-script/Code.gs',
  scriptGithubUrl: 'https://github.com/remcovolkers/jbm-pokemoncard-collection/blob/main/apps-script/Code.gs',
};
