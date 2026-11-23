import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function argValue(flag, fallback = '') {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

const repoFull = argValue('--repo', process.env.GITHUB_REPOSITORY || 'remcovolkers/jbm-pokemoncard-collection');
const [owner, repo] = repoFull.split('/');
const nativeVersion = argValue('--native-version', pkg.version || '1.0.0').replace(/^v/i, '');
const minNativeVersion = argValue(
  '--min-native-version',
  pkg.pokebinder?.minNativeVersion || '1.0.0'
).replace(/^v/i, '');
const runNumber = process.env.GITHUB_RUN_NUMBER || '';
const webVersion = argValue(
  '--web-version',
  runNumber ? `${nativeVersion}+${runNumber}` : nativeVersion
);
const releaseNotes = argValue(
  '--notes',
  process.env.RELEASE_NOTES || 'Nieuwe verbeteringen en updates voor PokéBinder.'
);
const outManifestPath = argValue('--out-manifest', '');
const stampTs = !process.argv.includes('--manifest-only');

const pagesBaseUrl = `https://${owner}.github.io/${repo}`;
const manifestUrl = `${pagesBaseUrl}/version.json`;
const bundleUrl = `${pagesBaseUrl}/ota/web-bundle.zip`;
const apkDownloadUrl = `https://github.com/${owner}/${repo}/releases/latest/download/pokebinder-release.apk`;
const releasePageUrl = `https://github.com/${owner}/${repo}/releases/latest`;

if (stampTs) {
  const versionTsPath = path.join(root, 'src', 'app', 'core', 'platform', 'app-version.ts');
  const tsContent = `export interface AppVersionInfo {
  /** Unieke web-releaseversie (bijv. 1.0.0+42) — verhoogt bij elke push naar main */
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

export const APP_VERSION: AppVersionInfo = {
  webVersion: ${JSON.stringify(webVersion)},
  nativeVersion: ${JSON.stringify(nativeVersion)},
  manifestUrl: ${JSON.stringify(manifestUrl)},
  defaultApkDownloadUrl: ${JSON.stringify(apkDownloadUrl)},
  defaultReleasePageUrl: ${JSON.stringify(releasePageUrl)},
};
`;
  fs.writeFileSync(versionTsPath, tsContent, 'utf8');
  console.log(`Stamped app-version.ts (web=${webVersion}, native=${nativeVersion})`);
}

if (outManifestPath) {
  const manifest = {
    webVersion,
    minNativeVersion,
    latestNativeVersion: nativeVersion,
    bundleUrl,
    apkDownloadUrl,
    releasePageUrl,
    releaseNotes,
    publishedAt: new Date().toISOString(),
  };
  const resolved = path.resolve(root, outManifestPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Wrote version manifest to ${resolved}`);
}
