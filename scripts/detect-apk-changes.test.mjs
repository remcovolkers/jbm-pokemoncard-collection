import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { analyzeApkChanges } from './detect-apk-changes.mjs';

const BASE_PKG = {
  version: '1.0.2',
  pokebinder: {
    minNativeVersion: '1.0.1',
  },
  dependencies: {
    '@angular/core': '^21.2.0',
    '@capacitor/android': '^8.6.2',
    '@capacitor/app': '^8.1.2',
    '@capacitor/core': '^8.6.2',
    '@capgo/capacitor-updater': '^8.54.2',
  },
  devDependencies: {
    prettier: '^3.8.1',
  },
};

describe('detect-apk-changes.mjs (APK vs WebView OTA beslisser)', () => {
  it('kiest alleen WebView OTA bij pure web-, assets- of Apps Script-wijzigingen', () => {
    const headPkg = {
      ...BASE_PKG,
      dependencies: {
        ...BASE_PKG.dependencies,
        '@angular/core': '^21.2.1',
      },
      devDependencies: {
        prettier: '^3.8.2',
      },
    };

    const result = analyzeApkChanges({
      changedFiles: [
        'src/app/app.html',
        'src/app/core/platform/app-update.service.ts',
        'public/sets-catalog.json',
        'apps-script/Code.gs',
        'package.json',
      ],
      basePkg: BASE_PKG,
      headPkg,
      latestTagVersion: '1.0.2',
    });

    assert.equal(result.apkChanged, false);
    assert.equal(result.targetNativeVersion, '1.0.2');
    assert.deepEqual(result.reasons, []);
  });

  it('triggert automatische APK-release met patch-bump wanneer android/ bestanden zijn gewijzigd', () => {
    const result = analyzeApkChanges({
      changedFiles: [
        'src/app/app.scss',
        'android/app/src/main/java/io/github/remcovolkers/pokebinder/MainActivity.java',
      ],
      basePkg: BASE_PKG,
      headPkg: BASE_PKG,
      latestTagVersion: '1.0.2',
    });

    assert.equal(result.apkChanged, true);
    assert.equal(result.targetNativeVersion, '1.0.3');
    assert.ok(result.reasons.some((r) => r.includes('MainActivity.java')));
  });

  it('triggert automatische APK-release wanneer capacitor.config.ts is gewijzigd', () => {
    const result = analyzeApkChanges({
      changedFiles: ['capacitor.config.ts'],
      basePkg: BASE_PKG,
      headPkg: BASE_PKG,
      latestTagVersion: '1.0.2',
    });

    assert.equal(result.apkChanged, true);
    assert.equal(result.targetNativeVersion, '1.0.3');
    assert.ok(result.reasons.some((r) => r.includes('capacitor.config')));
  });

  it('triggert automatische APK-release wanneer een native Capacitor/Capgo dependency is toegevoegd of bijgewerkt', () => {
    const headPkg = {
      ...BASE_PKG,
      dependencies: {
        ...BASE_PKG.dependencies,
        '@capacitor/local-notifications': '^8.0.0',
      },
    };

    const result = analyzeApkChanges({
      changedFiles: ['package.json', 'package-lock.json'],
      basePkg: BASE_PKG,
      headPkg,
      latestTagVersion: '1.0.2',
    });

    assert.equal(result.apkChanged, true);
    assert.equal(result.targetNativeVersion, '1.0.3');
    assert.ok(result.reasons.some((r) => r.includes('@capacitor/local-notifications')));
  });

  it('triggert automatische APK-release wanneer pokebinder.minNativeVersion wijzigt', () => {
    const headPkg = {
      ...BASE_PKG,
      pokebinder: {
        minNativeVersion: '1.0.3',
      },
    };

    const result = analyzeApkChanges({
      changedFiles: ['package.json'],
      basePkg: BASE_PKG,
      headPkg,
      latestTagVersion: '1.0.2',
    });

    assert.equal(result.apkChanged, true);
    assert.equal(result.targetNativeVersion, '1.0.3');
    assert.ok(result.reasons.some((r) => r.includes('minNativeVersion')));
  });

  it('respecteert een handmatige versie-verhoging in package.json als nieuwe APK-versie', () => {
    const headPkg = {
      ...BASE_PKG,
      version: '1.1.0',
    };

    const result = analyzeApkChanges({
      changedFiles: ['package.json'],
      basePkg: BASE_PKG,
      headPkg,
      latestTagVersion: '1.0.2',
    });

    assert.equal(result.apkChanged, true);
    assert.equal(result.targetNativeVersion, '1.1.0');
    assert.ok(result.reasons.some((r) => r.includes('1.1.0')));
  });

  it('triggert geen APK-release wanneer er sinds de laatste tag geen wijzigingen zijn', () => {
    const result = analyzeApkChanges({
      changedFiles: [],
      basePkg: BASE_PKG,
      headPkg: BASE_PKG,
      latestTagVersion: '1.0.2',
    });

    assert.equal(result.apkChanged, false);
    assert.equal(result.targetNativeVersion, '1.0.2');
    assert.deepEqual(result.reasons, []);
  });

  it('voert Pages deploy job altijd uit na succesvolle build ook als release-apk is overgeslagen', () => {
    const workflowPath = path.resolve(import.meta.dirname, '..', '.github', 'workflows', 'deploy.yml');
    const yaml = fs.readFileSync(workflowPath, 'utf8');
    const deploySectionMatch = yaml.match(/^\s{2}deploy:\r?\n([\s\S]*)$/m);
    assert.ok(deploySectionMatch, 'deploy job ontbreekt in .github/workflows/deploy.yml');
    const deployBlock = deploySectionMatch[1];
    assert.match(deployBlock, /needs:\s*build/);
    assert.match(deployBlock, /if:\s*always\(\)\s*&&\s*needs\.build\.result\s*==\s*'success'/);
  });
});
