import { expect, Page, test } from '@playwright/test';

interface CollectedErrors {
  pageErrors: string[];
  consoleErrors: string[];
}

function attachErrorCollectors(page: Page): CollectedErrors {
  const errors: CollectedErrors = {
    pageErrors: [],
    consoleErrors: [],
  };

  page.on('pageerror', (err) => {
    errors.pageErrors.push(err.message);
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    const locationUrl = msg.location()?.url || '';
    const isExternalAssetNoise =
      (locationUrl.startsWith('https://assets.tcgdex.net') || text.includes('tcgdex.net')) &&
      text.includes('Failed to load resource');
    if (!isExternalAssetNoise) {
      errors.consoleErrors.push(text);
    }
  });

  return errors;
}

async function scrollMainToBottomAndTop(page: Page, routeLabel: string): Promise<void> {
  const dimensions = await page.evaluate(async () => {
    const main = document.querySelector('.shell__main') as HTMLElement | null;
    const scroller =
      main && main.scrollHeight > main.clientHeight + 2
        ? main
        : (document.scrollingElement as HTMLElement | null) || document.documentElement;

    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (maxTop > 0) {
      scroller.scrollTo({ top: Math.round(maxTop / 2), behavior: 'instant' as ScrollBehavior });
      await new Promise((r) => setTimeout(r, 60));
      scroller.scrollTo({ top: maxTop, behavior: 'instant' as ScrollBehavior });
      await new Promise((r) => setTimeout(r, 80));
    }

    const overflowAtBottom = {
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      mainScrollWidth: main?.scrollWidth ?? 0,
      mainClientWidth: main?.clientWidth ?? 0,
    };

    scroller.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    await new Promise((r) => setTimeout(r, 60));

    return overflowAtBottom;
  });

  expect(
    dimensions.docScrollWidth,
    `Horizontale overflow na scroll op ${routeLabel}: ${dimensions.docScrollWidth} > ${dimensions.innerWidth}`
  ).toBeLessThanOrEqual(dimensions.innerWidth + 1);

  expect(
    dimensions.mainScrollWidth,
    `Horizontale .shell__main-overflow na scroll op ${routeLabel}: ${dimensions.mainScrollWidth} > ${dimensions.mainClientWidth}`
  ).toBeLessThanOrEqual(dimensions.mainClientWidth + 1);
}

const SCROLLABLE_ROUTES: Array<{ url: string; readySelector: string }> = [
  { url: '/dashboard', readySelector: '.hero-card, h1, h2' },
  { url: '/collectie', readySelector: '.card-slab, .pb-empty' },
  { url: '/pokedex', readySelector: '.binder-sheet, .checklist' },
  { url: '/meer/sets', readySelector: '#sets-search-input' },
  { url: '/meer/verlanglijst', readySelector: '.wl-add-top-btn' },
  { url: '/meer/ruil-verkoop', readySelector: '.tr-summary' },
  { url: '/meer/instellingen', readySelector: '.mode-card' },
  { url: '/meer/feedback', readySelector: '.hub-hero' },
];

test('volledige scroll-doorloop op alle scrollbare schermen zonder overflow of JS-fouten', async ({ page }) => {
  const errors = attachErrorCollectors(page);

  for (const route of SCROLLABLE_ROUTES) {
    await page.goto(route.url, { waitUntil: 'domcontentloaded' });
    await page.locator('.shell__main').waitFor({ state: 'visible' });
    await page.locator(route.readySelector).first().waitFor({ state: 'visible' });
    await scrollMainToBottomAndTop(page, route.url);
  }

  expect(errors.pageErrors, `Onverwachte pageErrors: ${errors.pageErrors.join(' | ')}`).toEqual([]);
  expect(errors.consoleErrors, `Onverwachte console.errors: ${errors.consoleErrors.join(' | ')}`).toEqual([]);
});

test('Collectie: zoeken, lijstweergave wisselen, wissen en filter resetten', async ({ page }) => {
  const errors = attachErrorCollectors(page);

  await page.goto('/collectie', { waitUntil: 'domcontentloaded' });
  const searchInput = page.locator('#col-search-input');
  await expect(searchInput).toBeVisible();

  await searchInput.fill('Charizard');
  const firstCard = page.locator('.card-slab').first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard).toContainText('Charizard');

  await page.locator('button[aria-label="Lijstweergave"]').click();
  await expect(page.locator('.list-row').first()).toBeVisible();

  await page.locator('button[aria-label="Kaartengallery"]').click();
  await expect(page.locator('.card-slab').first()).toBeVisible();

  await page.locator('.search-wrap__clear').click();
  await expect(searchInput).toHaveValue('');

  await page.locator('button:has-text("Te ruil / verkoop")').click();
  const resetBtn = page.locator('.filter-reset');
  await expect(resetBtn).toBeVisible();
  await resetBtn.click();
  await expect(resetBtn).toBeHidden();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Kaart Toevoegen: alle 3 modi, set-picker zoeken & handmatig formulier invullen', async ({ page }) => {
  const errors = attachErrorCollectors(page);

  await page.goto('/toevoegen', { waitUntil: 'domcontentloaded' });
  await page.locator('#qa-code-input').waitFor({ state: 'visible' });

  // Tab 2: Op Naam
  await page.locator('button[role="tab"]:has-text("Op Naam")').click();
  const nameInput = page.locator('#qa-name-input');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('Pikachu');
  await expect(nameInput).toHaveValue('Pikachu');

  // Tab 3: Alle Sets -> doorzoekbare set-picker openen en filteren
  await page.locator('button[role="tab"]:has-text("Alle Sets")').click();
  const setSelectBtn = page.locator('#qa-set-select');
  await expect(setSelectBtn).toBeVisible();
  await setSelectBtn.click();

  const setSearchInput = page.locator('#qa-set-search-input');
  await expect(setSearchInput).toBeVisible();
  await setSearchInput.fill('151');
  await expect(page.locator('.set-picker__option').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // Tab 1: Code / ID -> Pack Opening Mode schakelen + handmatig formulier invullen
  await page.locator('button[role="tab"]:has-text("Code / ID")').click();
  const packSwitch = page.locator('.pack-card button[role="switch"]');
  await expect(packSwitch).toBeVisible();
  await packSwitch.click();
  await packSwitch.click();

  const manualSummary = page.locator('details.manual-box summary');
  await manualSummary.click();
  await page.locator('#m-name').fill('Test Dragonair');
  await page.locator('#m-set').fill('151');
  await page.locator('#m-num').fill('181/165');

  await expect(page.locator('#m-name')).toHaveValue('Test Dragonair');
  await expect(page.locator('.qa-dock .pb-btn--primary')).toBeVisible();

  await scrollMainToBottomAndTop(page, '/toevoegen');

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Kaartdetail: doorscrollen, prijs bewerken en Herstellen', async ({ page }) => {
  const errors = attachErrorCollectors(page);

  await page.goto('/collectie', { waitUntil: 'domcontentloaded' });
  await page.locator('.card-slab').first().click();
  await page.waitForURL(/\/collectie\/kaart\/\d+\//);
  await page.locator('#edit-buy').waitFor({ state: 'visible' });

  await scrollMainToBottomAndTop(page, '/collectie/kaart');

  const buyInput = page.locator('#edit-buy');
  await buyInput.fill('99.5');
  await expect(page.locator('.detail-unsaved-badge')).toBeVisible();

  await page.locator('.detail-dock__reset').click();
  await expect(page.locator('.detail-unsaved-badge')).toBeHidden();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Modals & Bottom Sheets invullen zonder overflow: Verlanglijst, Ruil & Verkoop en Feedback', async ({ page }) => {
  const errors = attachErrorCollectors(page);

  // 1. Verlanglijst modal openen en invullen
  await page.goto('/meer/verlanglijst', { waitUntil: 'domcontentloaded' });
  await page.locator('.wl-add-top-btn').click();
  await expect(page.locator('.pb-sheet')).toBeVisible();

  await page.locator('#wl-name').fill('Umbreon Test');
  await page.locator('#wl-set').fill('151');
  await page.locator('#wl-num').fill('100/165');

  const wlOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(wlOverflow, 'Horizontale overflow met Verlanglijst modal open').toBe(true);

  await page.locator('.pb-sheet button[aria-label="Sluiten"]').click();
  await expect(page.locator('.pb-sheet')).toBeHidden();

  // 2. Ruil & Verkoop Log deal openen vanaf ruilkaart (stopPropagation check) en invullen
  await page.goto('/meer/ruil-verkoop', { waitUntil: 'domcontentloaded' });
  const logBtn = page.locator('.trade-card__log-btn').first();
  await expect(logBtn).toBeVisible();
  await logBtn.click();

  expect(page.url()).toContain('/meer/ruil-verkoop');
  await expect(page.locator('.pb-sheet')).toBeVisible();
  const tradeCardVal = await page.locator('#tr-card').inputValue();
  expect(tradeCardVal.trim().length).toBeGreaterThan(0);

  await page.locator('#tr-sell').fill('55');
  await page.locator('.pb-sheet button[aria-label="Sluiten"]').click();
  await expect(page.locator('.pb-sheet')).toBeHidden();

  // 3. Feedback modal openen, formulier invullen en sluiten
  await page.goto('/meer/feedback', { waitUntil: 'domcontentloaded' });
  await page.locator('.hub-hero__actions button:has-text("Nieuwe feedback")').click();
  const fbTitle = page.locator('#fb-title');
  await expect(fbTitle).toBeVisible();

  await fbTitle.fill('UI walkthrough testonderwerp');
  await page.locator('#fb-desc').fill('Automatische interactieve formuliercheck op mobiel en desktop.');
  await page.locator('#fb-author').fill('UI Critic');

  const fbOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(fbOverflow, 'Horizontale overflow met Feedback modal open').toBe(true);

  await page.locator('.fb-sheet button[aria-label="Sluiten"]').click();
  await expect(fbTitle).toBeHidden();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('mobiele touch-target ergonomie op primaire knoppen en bottom nav', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Touch-target check alleen op mobiel');

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  const navItems = page.locator('.bottom-nav__item');
  const count = await navItems.count();
  expect(count).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < count; i++) {
    const box = await navItems.nth(i).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height, `Bottom nav item ${i} te laag`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `Bottom nav item ${i} te smal`).toBeGreaterThanOrEqual(44);
  }

  await page.goto('/meer/verlanglijst', { waitUntil: 'domcontentloaded' });
  const wishBtnBox = await page.locator('.wl-add-top-btn').boundingBox();
  expect(wishBtnBox).not.toBeNull();
  expect(wishBtnBox!.height).toBeGreaterThanOrEqual(42);

  await page.goto('/toevoegen', { waitUntil: 'domcontentloaded' });
  const qaSaveBox = await page.locator('.qa-dock .pb-btn--primary').boundingBox();
  expect(qaSaveBox).not.toBeNull();
  expect(qaSaveBox!.height).toBeGreaterThanOrEqual(42);
});
