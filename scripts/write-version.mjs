import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
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

function parseSemverTuple(raw) {
  const clean = (raw || '').trim().replace(/^v/i, '').split(/[+-]/)[0] || '0.0.0';
  const parts = clean.split('.').map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareSemver(a, b) {
  const pa = parseSemverTuple(a);
  const pb = parseSemverTuple(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] > pb[i] ? 1 : -1;
    }
  }
  return 0;
}

function getLatestReleaseTagVersion(cwd) {
  try {
    const output = execFileSync('git', ['tag', '--list', 'v*'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let best = '';
    for (const line of output.split(/\r?\n/)) {
      const match = line.trim().match(/^v?(\d+\.\d+\.\d+)$/);
      if (!match) continue;
      if (!best || compareSemver(match[1], best) > 0) {
        best = match[1];
      }
    }
    return best;
  } catch {
    return '';
  }
}

function getCommitEpochSeconds(cwd) {
  try {
    const ts = execFileSync('git', ['show', '-s', '--format=%ct', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^\d+$/.test(ts) ? ts : '';
  } catch {
    return '';
  }
}

const repoFull = argValue('--repo', process.env.GITHUB_REPOSITORY || 'remcovolkers/jbm-pokemoncard-collection');
const [owner, repo] = repoFull.split('/');

const explicitNative = argValue('--native-version', '').replace(/^v/i, '');
const pkgNative = (pkg.version || '1.0.0').replace(/^v/i, '');
const latestTagNative = explicitNative ? '' : getLatestReleaseTagVersion(root);
const nativeVersion = explicitNative
  ? explicitNative
  : latestTagNative && compareSemver(latestTagNative, pkgNative) > 0
    ? latestTagNative
    : pkgNative;

const minNativeVersion = argValue(
  '--min-native-version',
  pkg.pokebinder?.minNativeVersion || '1.0.0'
).replace(/^v/i, '');

const buildSeq =
  (process.env.WEB_BUILD_NUMBER || '').trim() ||
  getCommitEpochSeconds(root) ||
  (process.env.GITHUB_RUN_NUMBER || '').trim();
const webVersion = argValue(
  '--web-version',
  buildSeq ? `${nativeVersion}+${buildSeq}` : nativeVersion
);
const releaseNotes = argValue(
  '--notes',
  process.env.RELEASE_NOTES || 'Nieuwe verbeteringen en updates voor PokéBinder.'
);
const outManifestPath = argValue('--out-manifest', '');
const bundleFilePath = argValue('--bundle-file', '');
const stampTs = !process.argv.includes('--manifest-only');

const pagesBaseUrl = `https://${owner}.github.io/${repo}`;
const manifestUrl = `${pagesBaseUrl}/version.json`;
const bundleUrl = `${pagesBaseUrl}/ota/web-bundle.zip?v=${encodeURIComponent(webVersion)}`;
const apkDownloadUrl = `https://github.com/${owner}/${repo}/releases/latest/download/pokebinder-release.apk`;
const releasePageUrl = `https://github.com/${owner}/${repo}/releases/latest`;

let bundleChecksum = '';
if (bundleFilePath) {
  const resolvedBundle = path.resolve(root, bundleFilePath);
  if (!fs.existsSync(resolvedBundle)) {
    throw new Error(`OTA bundle niet gevonden voor SHA-256 checksum: ${resolvedBundle}`);
  }
  const zipBytes = fs.readFileSync(resolvedBundle);
  bundleChecksum = crypto.createHash('sha256').update(zipBytes).digest('hex');
  console.log(`Computed OTA bundle SHA-256 (${zipBytes.length} bytes): ${bundleChecksum}`);
}

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
    bundleChecksum,
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
