import fs from 'node:fs';
import path from 'node:path';
import { expect, Page, test } from '@playwright/test';

// Houd de e2e onafhankelijk van het live version.json op GitHub Pages (anders verschijnt een update-banner met
// wisselende hoogte/tekst en verandert de verwachte Code.gs-versie na elke deploy).
test.beforeEach(async ({ page }) => {
  await page.route('**/version.json*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        webVersion: '0.0.1',
        latestNativeVersion: '0.0.1',
        latestScriptVersion: '2.2.0',
        releaseNotes: '',
      }),
    })
  );
});

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

  // Verlanglijst 3D Grail Showcase vastleggen
  await page.goto('/meer/verlanglijst', { waitUntil: 'domcontentloaded' });
  const wishArt = page.locator('.wl-card__art--showcase').first();
  await expect(wishArt).toBeVisible();
  await wishArt.click();
  await page.locator('.pb-showcase').waitFor({ state: 'visible' });
  await settleAndCapture(page, path.join(outDir, '09b-verlanglijst-showcase.png'));

  // Instellingen — Kaartspot Binder Sync met geladen preview vastleggen
  await page.route('https://kaartspot.nl/api/binder-publiek/jellybeanmels', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({
        formaat: 2,
        berekendOp: '2026-11-25T10:39:57.268Z',
        eigenaar: { username: 'jellybeanmels' },
        binders: [
          { id: 'c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8', name: 'Pokedex', grid_size: 20 },
          { id: 'a8df6b01-9f25-471a-910c-6199f8a07933', name: 'Shrouded Fable Masterset', grid_size: 9 },
        ],
        teksten: [
          'https://images.scrydex.com/pokemon/',
          'Stellar Crown',
          'Illustration Rare',
          'NM',
          'holofoil',
          'EN',
          'Mega Evolution Black Star Promos',
          'Promo',
        ],
        kolommen: [
          'id', 'binder', 'soort', 'spel', 'kaartId', 'naam', 'fotoBegin', 'fotoRest',
          'set', 'nummer', 'zeldzaamheid', 'conditie', 'druk', 'grader', 'cijfer',
          'blackLabel', 'taal', 'aantal', 'bod', 'nogNodig', 'volgorde', 'vakje',
          'waardeCents', 'eigenSoort', 'eigenWaarde',
        ],
        items: [
          [
            '2c69167c-dd1a-476d-9eca-33c7cc4504b9', 0, 0, 0, 'c1', 'Bulbasaur',
            0, 'sv7-143/small', 1, '143', 2, 3, 4, null, null, 0, 5, 1, 0, 0, 1, 0, 7499, null, 0,
          ],
          [
            '5fec1c84-935a-40e6-bc82-bd644f6e0ede', 0, 0, 0, 'c2', 'Treecko',
            0, 'mep-55/small', 6, '55', 7, 3, 4, null, null, 0, 5, 1, 0, 1, 252, 251, 1102, null, 0,
          ],
          [
            '01251e31-56ce-4dc2-a01f-eb27ea2e39ff', 1, 0, 0, 'c3', 'Meowth',
            0, 'sv6pt5-48/small', 1, '48', 2, 3, 4, null, null, 0, 5, 1, 0, 0, 1, 0, 18677, null, 0,
          ],
        ],
      }),
    });
  });

  await page.goto('/meer/instellingen', { waitUntil: 'domcontentloaded' });
  const ksCard = page.locator('#kaartspot-sync');
  await ksCard.scrollIntoViewIfNeeded();
  await page
    .locator('#ks-source-input')
    .fill('https://kaartspot.nl/wrapped/jellybeanmels?cat=c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8');
  await ksCard.locator('button:has-text("Binders ophalen")').click();
  await ksCard.locator('.ks-preview').waitFor({ state: 'visible' });
  await ksCard.scrollIntoViewIfNeeded();
  await settleAndCapture(page, path.join(outDir, '11b-instellingen-kaartspot-sync.png'));
});
