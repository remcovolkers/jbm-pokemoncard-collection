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
    // Externe TCGdex/CDN artwork-404s mogen een offline/lokale audit niet breken, app/Angular crashes wel.
    const isExternalAssetNoise =
      (locationUrl.startsWith('https://assets.tcgdex.net') || text.includes('tcgdex.net')) &&
      text.includes('Failed to load resource');
    if (!isExternalAssetNoise) {
      errors.consoleErrors.push(text);
    }
  });

  return errors;
}

const ALL_CORE_ROUTES: Array<{ url: string; readySelector: string }> = [
  { url: '/dashboard', readySelector: '.hero-card, h1, h2' },
  { url: '/collectie', readySelector: '.card-slab, .pb-empty' },
  { url: '/toevoegen', readySelector: '#qa-code-input, .mode-tabs' },
  { url: '/pokedex', readySelector: '.binder-sheet, .checklist' },
  { url: '/meer', readySelector: '.hub-menu' },
  { url: '/meer/sets', readySelector: '#sets-search-input' },
  { url: '/meer/verlanglijst', readySelector: '.wl-add-top-btn' },
  { url: '/meer/ruil-verkoop', readySelector: '.tr-summary' },
  { url: '/meer/instellingen', readySelector: '.mode-card' },
  { url: '/meer/feedback', readySelector: '.hub-hero' },
];

test('alle 10 kernroutes renderen zonder JS-fouten en zonder horizontale overflow', async ({ page }) => {
  const errors = attachErrorCollectors(page);

  for (const route of ALL_CORE_ROUTES) {
    await page.goto(route.url, { waitUntil: 'domcontentloaded' });
    await page.locator('.shell__main').waitFor({ state: 'visible' });
    await page.locator(route.readySelector).first().waitFor({ state: 'visible' });
    await page.waitForTimeout(250);

    const overflow = await page.evaluate(() => {
      const main = document.querySelector('.shell__main') as HTMLElement | null;
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        mainScrollWidth: main?.scrollWidth ?? 0,
        mainClientWidth: main?.clientWidth ?? 0,
      };
    });

    expect(
      overflow.docScrollWidth,
      `Horizontale document-overflow op ${route.url}: ${overflow.docScrollWidth} > ${overflow.innerWidth}`
    ).toBeLessThanOrEqual(overflow.innerWidth + 1);

    expect(
      overflow.mainScrollWidth,
      `Horizontale .shell__main-overflow op ${route.url}: ${overflow.mainScrollWidth} > ${overflow.mainClientWidth}`
    ).toBeLessThanOrEqual(overflow.mainClientWidth + 1);
  }

  expect(errors.pageErrors, `Onverwachte pageErrors: ${errors.pageErrors.join(' | ')}`).toEqual([]);
  expect(errors.consoleErrors, `Onverwachte console.errors: ${errors.consoleErrors.join(' | ')}`).toEqual([]);
});

test('/meer hub past zonder onnodige verticale micro-scroll', async ({ page }) => {
  await page.goto('/meer', { waitUntil: 'domcontentloaded' });
  await page.locator('.hub-menu').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);

  const metrics = await page.evaluate(() => {
    const main = document.querySelector('.shell__main') as HTMLElement | null;
    return {
      mainScrollHeight: main?.scrollHeight ?? 0,
      mainClientHeight: main?.clientHeight ?? 0,
      docScrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    };
  });

  expect(
    metrics.mainScrollHeight,
    `/meer .shell__main scrollHeight (${metrics.mainScrollHeight}) > clientHeight (${metrics.mainClientHeight})`
  ).toBeLessThanOrEqual(metrics.mainClientHeight + 2);

  expect(
    metrics.docScrollHeight,
    `/meer docScrollHeight (${metrics.docScrollHeight}) > innerHeight (${metrics.innerHeight})`
  ).toBeLessThanOrEqual(metrics.innerHeight + 2);
});

test('mobiele navigatie-chroom: tabbladen vs gerichte focus-routes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobiele chrome-check alleen op mobile viewport');

  for (const tabUrl of ['/dashboard', '/collectie', '/pokedex', '/meer']) {
    await page.goto(tabUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('.shell__main').waitFor({ state: 'visible' });
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(page.locator('button[aria-label="Terug"]')).toBeHidden();
  }

  await page.goto('/toevoegen', { waitUntil: 'domcontentloaded' });
  await page.locator('#qa-code-input').waitFor({ state: 'visible' });
  await expect(page.locator('.bottom-nav')).toBeHidden();
  await expect(page.locator('button[aria-label="Terug"]')).toBeVisible();
  await expect(page.locator('.topbar__profile-btn')).toHaveCount(0);

  await page.goto('/meer/sets', { waitUntil: 'domcontentloaded' });
  await page.locator('#sets-search-input').waitFor({ state: 'visible' });
  await expect(page.locator('button[aria-label="Terug"]')).toBeVisible();
});

test('Collectie -> Kaartdetail -> Lightbox -> Vorige/Volgende -> Dirty-state & Herstellen', async ({ page }, testInfo) => {
  await page.goto('/collectie', { waitUntil: 'domcontentloaded' });
  const countPill = page.locator('.filters-bar__count');
  await expect(countPill).toBeVisible();
  await expect(countPill).toContainText('€');

  // Unieke kaarten verbergen ×1 badge; dubbele kaarten tonen wel ×2/×3
  const qtyTexts = await page.locator('.card-slab .overlay-pill--qty').allInnerTexts();
  expect(qtyTexts.length).toBeGreaterThan(0);
  expect(qtyTexts.every((t) => t.trim() !== '×1')).toBe(true);

  await page.locator('.card-slab').first().click();
  await page.waitForURL(/\/collectie\/kaart\/\d+\//);
  await page.locator('.hero-card__art-btn').waitFor({ state: 'visible' });

  const detailOverflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  expect(detailOverflow.scrollW).toBeLessThanOrEqual(detailOverflow.innerW + 1);

  if (testInfo.project.name === 'mobile') {
    await expect(page.locator('.bottom-nav')).toBeHidden();
    await expect(page.locator('.topbar__profile-btn')).toHaveCount(0);
  }
  await expect(page.locator('.detail-dock')).toHaveCount(0);

  // Fullscreen 3D Showcase openen (katana-reveal, géén rommelige info/vorige/volgende), en sluiten met Escape
  const firstUrl = page.url();
  await page.locator('.hero-card__art-btn').click();
  await expect(page.locator('.art-lightbox-backdrop')).toBeVisible();
  await expect(page.locator('.card3d')).toBeVisible();
  await expect(page.locator('.pb-showcase__panel')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.locator('.art-lightbox-backdrop')).toBeHidden();
  expect(page.url()).toMatch(/\/collectie\/kaart\/\d+\//);

  // Volgende kaart via stepper
  const nextBtn = page.locator('button[aria-label="Volgende kaart"]');
  await expect(nextBtn).toBeEnabled();
  await nextBtn.click();
  await page.waitForFunction((prev) => window.location.href !== prev, firstUrl);
  const secondUrl = page.url();
  expect(secondUrl).toMatch(/\/collectie\/kaart\/\d+\//);

  // Dirty-state blokkeert per ongeluk doorbladeren en Herstellen maakt hem weer schoon
  await page.locator('button[aria-label="Aantal vermeerderen"]').click();
  await expect(page.locator('.detail-unsaved-badge')).toBeVisible();
  await expect(page.locator('.detail-dock__reset')).toBeVisible();

  await page.locator('button[aria-label="Volgende kaart"]').click();
  expect(page.url()).toBe(secondUrl);
  await expect(page.locator('.toast--warning')).toBeVisible();

  await page.locator('.detail-dock__reset').click();
  await expect(page.locator('.detail-dock')).toHaveCount(0);
});

test('Dashboard klikbare Gen 4 tegel en KPI drill-downs navigeren direct juist door', async ({ page }, testInfo) => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.sync-strip')).toHaveCount(0);

  await page.locator('.gen-chip:has-text("Gen 4")').click();
  await page.waitForURL(/\/pokedex/);
  if (testInfo.project.name === 'mobile') {
    await expect(page.locator('.dex-mobile-selects__gen')).toHaveValue('4');
  } else {
    await expect(page.locator('.gen-pills button:has-text("Gen 4")')).toHaveClass(/is-active/);
  }

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('.kpi-tile--link:has-text("Gerealiseerde winst")').click();
  await page.waitForURL(/\/meer\/ruil-verkoop/);
});

test('mobiele Pokédex 3x3 binder past volledig in één schermhoogte boven bottom-nav', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobiele 3x3 single-screen fit alleen op 390x844');

  await page.goto('/pokedex', { waitUntil: 'domcontentloaded' });
  await page.locator('.binder-sheet .pocket').nth(8).waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
  await page.waitForTimeout(250);

  // Eventuele update-banner sluiten zodat we de normale dagelijkse binderweergave meten
  const bannerClose = page.locator('.update-banner__close');
  if (await bannerClose.isVisible().catch(() => false)) {
    await bannerClose.click();
    await page.waitForTimeout(100);
  }

  const metrics = await page.evaluate(() => {
    const pockets = document.querySelectorAll('.binder-sheet .pocket');
    const lastPocket = pockets.item(8)?.getBoundingClientRect();
    const bottomNav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
    return {
      pocketCount: pockets.length,
      lastPocketBottom: lastPocket ? lastPocket.y + lastPocket.height : 0,
      bottomNavTop: bottomNav ? bottomNav.y : window.innerHeight,
    };
  });

  expect(metrics.pocketCount).toBe(9);
  expect(
    metrics.lastPocketBottom,
    `9e Pokédex vakje onderkant (${metrics.lastPocketBottom}) valt achter bottom-nav (${metrics.bottomNavTop})`
  ).toBeLessThanOrEqual(metrics.bottomNavTop + 2);
});

test('Pokédex Binder -> ontbrekende Pokémon doorzetten naar Quick Add', async ({ page }) => {
  await page.goto('/pokedex', { waitUntil: 'domcontentloaded' });
  const missingFilterBtn = page.locator('.status-pills button:has-text("Ontbrekend")');
  await missingFilterBtn.click();
  await expect(missingFilterBtn).toHaveClass(/is-active/);
  await expect(page.locator('.pocket--filled')).toHaveCount(0);

  const firstEmptyPocket = page.locator('.pocket').first();
  await expect(firstEmptyPocket).toBeVisible();
  const slotName = (await firstEmptyPocket.locator('.pocket__name').innerText()).trim();
  await firstEmptyPocket.click();

  const ctaBtn = page.locator('.no-variants-note button');
  await expect(ctaBtn).toBeVisible();
  await ctaBtn.click();

  await page.waitForURL(/\/toevoegen/);
  const nameInput = page.locator('#qa-name-input');
  await expect(nameInput).toBeVisible();
  await expect(nameInput).toHaveValue(slotName);
});

test('Verlanglijst top-CTA, Set Voortgang wissen en Ruil & Verkoop -> Kaartdetail', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile';

  // Verlanglijst "+ Nieuwe wens" bovenin zonder omlaag te hoeven scrollen
  await page.goto('/meer/verlanglijst', { waitUntil: 'domcontentloaded' });
  const addWishBtn = page.locator('.wl-add-top-btn');
  await expect(addWishBtn).toBeVisible();
  const btnBox = await addWishBtn.boundingBox();
  const viewportHeight = page.viewportSize()?.height ?? 844;
  expect(btnBox).not.toBeNull();
  expect(btnBox!.y + btnBox!.height).toBeLessThanOrEqual(viewportHeight);
  if (!isMobile) {
    expect(btnBox!.y).toBeLessThan(380);
  }

  // Set Voortgang zoekveld + wis-knop
  await page.goto('/meer/sets', { waitUntil: 'domcontentloaded' });
  const setsSearch = page.locator('#sets-search-input');
  await setsSearch.fill('151');
  const clearBtn = page.locator('.sets-search-wrap__clear');
  await expect(clearBtn).toBeVisible();
  await clearBtn.click();
  await expect(setsSearch).toHaveValue('');

  // Ruil & Verkoop klikbare ruilkaart
  await page.goto('/meer/ruil-verkoop', { waitUntil: 'domcontentloaded' });
  const firstTradeCard = page.locator('.trade-card').first();
  await expect(firstTradeCard).toBeVisible();
  await firstTradeCard.locator('h3').click();
  await page.waitForURL(/\/collectie\/kaart\/\d+\//);
});

test('desktop sneltoets / en 1280x768 zijbalk zonder verticale scrollbar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Alleen relevant voor desktop');

  await page.goto('/collectie', { waitUntil: 'domcontentloaded' });
  await page.locator('.card-slab').first().waitFor({ state: 'visible' });
  await page.locator('.filters-bar__count').click();
  await page.keyboard.press('/');
  await expect(page.locator('#col-search-input')).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 768 });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('.sidebar').waitFor({ state: 'visible' });
  await page.waitForTimeout(200);

  const sidebarOverflow = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar') as HTMLElement | null;
    return {
      scrollHeight: sidebar?.scrollHeight ?? 0,
      clientHeight: sidebar?.clientHeight ?? 0,
    };
  });
  expect(
    sidebarOverflow.scrollHeight,
    `.sidebar scrollHeight (${sidebarOverflow.scrollHeight}) > clientHeight (${sidebarOverflow.clientHeight})`
  ).toBeLessThanOrEqual(sidebarOverflow.clientHeight + 2);
});
