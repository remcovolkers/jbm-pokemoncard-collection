import fs from 'node:fs';
import path from 'node:path';
import { expect, Page, test } from '@playwright/test';

async function settleAndCapture(page: Page, screenshotPath: string): Promise<void> {
  await page.locator('.shell__main').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
  await page.waitForTimeout(350);
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false });
}

test('leg visuele audit screenshots vast op alle kernroutes', async ({ page }, testInfo) => {
  const outDir = path.join('e2e', 'screenshots', testInfo.project.name);

  const staticRoutes: Array<{ file: string; url: string; waitFor: string }> = [
    { file: '01-dashboard.png', url: '/dashboard', waitFor: '.hero-card, h1, h2' },
    { file: '02-collectie.png', url: '/collectie', waitFor: '.card-slab, .pb-empty' },
    { file: '05-toevoegen.png', url: '/toevoegen', waitFor: '#qa-code-input, .mode-tabs' },
    { file: '06-pokedex.png', url: '/pokedex', waitFor: '.binder-sheet, .checklist' },
    { file: '07-meer.png', url: '/meer', waitFor: '.hub-menu, app-more-hub' },
    { file: '08-sets.png', url: '/meer/sets', waitFor: '#sets-search-input' },
    { file: '09-verlanglijst.png', url: '/meer/verlanglijst', waitFor: '.wl-add-top-btn' },
    { file: '10-ruil-verkoop.png', url: '/meer/ruil-verkoop', waitFor: '.tr-summary' },
    { file: '11-instellingen.png', url: '/meer/instellingen', waitFor: '.shell__content section' },
    { file: '12-feedback.png', url: '/meer/feedback', waitFor: '#hub-search, .shell__content h1, .shell__content h2' },
  ];

  for (const route of staticRoutes) {
    await page.goto(route.url, { waitUntil: 'domcontentloaded' });
    await page.locator(route.waitFor).first().waitFor({ state: 'visible' });
    await settleAndCapture(page, path.join(outDir, route.file));
  }

  // Kaartdetail + Lightbox vastleggen vanuit Collectie
  await page.goto('/collectie', { waitUntil: 'domcontentloaded' });
  const firstCard = page.locator('.card-slab').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  await page.waitForURL(/\/collectie\/kaart\/\d+\//);
  await page.locator('.hero-card__art-btn').waitFor({ state: 'visible' });
  await settleAndCapture(page, path.join(outDir, '03-kaartdetail.png'));

  await page.locator('.hero-card__art-btn').click();
  await page.locator('.art-lightbox-backdrop').waitFor({ state: 'visible' });
  await settleAndCapture(page, path.join(outDir, '04-kaartdetail-lightbox.png'));
});
