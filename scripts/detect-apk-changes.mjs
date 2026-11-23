import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');

export function parseSemverTuple(raw) {
  const clean = (raw || '').trim().replace(/^v/i, '').split(/[+-]/)[0] || '0.0.0';
  const parts = clean.split('.').map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function compareSemver(a, b) {
  const pa = parseSemverTuple(a);
  const pb = parseSemverTuple(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] > pb[i] ? 1 : -1;
    }
  }
  return 0;
}

export function maxSemver(a, b) {
  const cleanA = (a || '').trim().replace(/^v/i, '') || '0.0.0';
  const cleanB = (b || '').trim().replace(/^v/i, '') || '0.0.0';
  return compareSemver(cleanA, cleanB) >= 0 ? cleanA : cleanB;
}

export function bumpPatchVersion(ver) {
  const [maj, min, patch] = parseSemverTuple(ver);
  return `${maj}.${min}.${patch + 1}`;
}

export function isNativePluginDep(name) {
  return /^(@capacitor\/|@capgo\/|capacitor-|cordova-)/.test(name || '');
}

export function hasNativePackageJsonChange(basePkg, headPkg, latestTagVersion) {
  const reasons = [];

  const baseDeps = basePkg?.dependencies || {};
  const headDeps = headPkg?.dependencies || {};
  const nativeKeys = new Set(
    [...Object.keys(baseDeps), ...Object.keys(headDeps)].filter(isNativePluginDep)
  );
  const changedDeps = [];
  for (const key of [...nativeKeys].sort()) {
    if (baseDeps[key] !== headDeps[key]) {
      changedDeps.push(key);
    }
  }
  if (changedDeps.length > 0) {
    reasons.push(`native dependencies gewijzigd (${changedDeps.join(', ')})`);
  }

  const baseMinNative = (basePkg?.pokebinder?.minNativeVersion || '').trim();
  const headMinNative = (headPkg?.pokebinder?.minNativeVersion || '').trim();
  if (baseMinNative !== headMinNative) {
    reasons.push(`minNativeVersion gewijzigd (${baseMinNative || '-'} -> ${headMinNative || '-'})`);
  }

  const headVersion = (headPkg?.version || '').trim().replace(/^v/i, '');
  if (latestTagVersion && headVersion && compareSemver(headVersion, latestTagVersion) > 0) {
    reasons.push(`package.json version handmatig verhoogd (${latestTagVersion} -> ${headVersion})`);
  }

  return {
    changed: reasons.length > 0,
    reasons,
  };
}

export function analyzeApkChanges({ changedFiles = [], basePkg = {}, headPkg = {}, latestTagVersion = '' }) {
  const headVersion = (headPkg?.version || '1.0.0').trim().replace(/^v/i, '') || '1.0.0';

  if (!latestTagVersion) {
    return {
      apkChanged: true,
      latestTagVersion: '',
      targetNativeVersion: headVersion,
      reasons: ['eerste APK-release (geen eerdere v*-tag)'],
    };
  }

  const reasons = [];
  const androidFiles = changedFiles.filter((file) => /^android\//.test(file));
  if (androidFiles.length > 0) {
    const preview = androidFiles.slice(0, 3).map((f) => path.basename(f)).join(', ');
    const suffix = androidFiles.length > 3 ? `, +${androidFiles.length - 3} meer` : '';
    reasons.push(`native Android bestanden gewijzigd (${preview}${suffix})`);
  }

  const capacitorConfigFiles = changedFiles.filter((file) =>
    /^capacitor\.config\.(ts|js|mjs|cjs|json)$/.test(file)
  );
  if (capacitorConfigFiles.length > 0) {
    reasons.push('capacitor.config gewijzigd');
  }

  const packageTouched =
    changedFiles.includes('package.json') || compareSemver(headVersion, latestTagVersion) > 0;
  if (packageTouched) {
    const pkgCheck = hasNativePackageJsonChange(basePkg, headPkg, latestTagVersion);
    if (pkgCheck.changed) {
      reasons.push(...pkgCheck.reasons);
    }
  }

  if (reasons.length > 0) {
    const targetNativeVersion =
      compareSemver(headVersion, latestTagVersion) > 0
        ? headVersion
        : bumpPatchVersion(latestTagVersion);
    return {
      apkChanged: true,
      latestTagVersion,
      targetNativeVersion,
      reasons,
    };
  }

  return {
    apkChanged: false,
    latestTagVersion,
    targetNativeVersion: maxSemver(headVersion, latestTagVersion),
    reasons: [],
  };
}

function getLatestReleaseTag(cwd) {
  try {
    const output = execFileSync('git', ['tag', '--list', 'v*'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let bestTag = '';
    let bestVersion = '';
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      const match = trimmed.match(/^v(\d+\.\d+\.\d+)$/);
      if (!match) continue;
      if (!bestVersion || compareSemver(match[1], bestVersion) > 0) {
        bestVersion = match[1];
        bestTag = trimmed;
      }
    }
    return { tag: bestTag, version: bestVersion };
  } catch {
    return { tag: '', version: '' };
  }
}

function getChangedFilesSinceTag(cwd, tag) {
  if (!tag) return [];
  try {
    const output = execFileSync('git', ['diff', '--name-only', `${tag}..HEAD`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readPackageJsonAtTag(cwd, tag) {
  if (!tag) return {};
  try {
    const raw = execFileSync('git', ['show', `${tag}:package.json`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getCommitEpochSeconds(cwd) {
  try {
    const ts = execFileSync('git', ['show', '-s', '--format=%ct', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^\d+$/.test(ts) ? ts : String(Math.floor(Date.now() / 1000));
  } catch {
    return String(Math.floor(Date.now() / 1000));
  }
}

function argValue(flag, fallback = '') {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function sanitizeOutputValue(val) {
  return String(val ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function runCli() {
  const headPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const { tag: latestTag, version: latestTagVersion } = getLatestReleaseTag(root);
  const changedFiles = getChangedFilesSinceTag(root, latestTag);
  const basePkg = readPackageJsonAtTag(root, latestTag);
  const commitTs = getCommitEpochSeconds(root);

  const result = analyzeApkChanges({
    changedFiles,
    basePkg,
    headPkg,
    latestTagVersion,
  });

  const payload = {
    ...result,
    latestTag,
    commitTs,
    changedFileCount: changedFiles.length,
  };

  const githubOutputPath = argValue('--github-output', '');
  if (githubOutputPath) {
    const lines = [
      `apk_changed=${result.apkChanged ? 'true' : 'false'}`,
      `latest_tag_version=${sanitizeOutputValue(result.latestTagVersion)}`,
      `target_native_version=${sanitizeOutputValue(result.targetNativeVersion)}`,
      `reasons=${sanitizeOutputValue(result.reasons.join('; '))}`,
      `commit_ts=${sanitizeOutputValue(commitTs)}`,
    ];
    fs.appendFileSync(githubOutputPath, lines.join('\n') + '\n', 'utf8');
  }

  console.log(JSON.stringify(payload, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
