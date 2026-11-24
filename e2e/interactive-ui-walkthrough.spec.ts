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

test('Collectie: zoeken, lijstweergave wisselen, wissen en filter resetten', async ({ page }, testInfo) => {
  const errors = attachErrorCollectors(page);
  const isMobile = testInfo.project.name === 'mobile';

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

  if (isMobile) {
    await page.locator('.mobile-filter-btn').click();
    await expect(page.locator('.col-filter-sheet')).toBeVisible();
    await page.locator('button[aria-label="Alleen te ruil of verkoop tonen"]').click();
    await page.locator('.col-filter-sheet__footer .pb-btn--primary').click();
    await expect(page.locator('.col-filter-sheet')).toBeHidden();

    const resetMobile = page.locator('.filter-reset--mobile');
    await expect(resetMobile).toBeVisible();
    await resetMobile.click();
    await expect(resetMobile).toBeHidden();
  } else {
    await page.locator('.filters-bar__desktop button:has-text("Te ruil / verkoop")').click();
    const resetBtn = page.locator('.filters-bar__desktop .filter-reset');
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();
    await expect(resetBtn).toBeHidden();
  }

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

  // Tab 1: Code / ID -> Pack Opening Mode + Meer opties accordeon + handmatig formulier
  await page.locator('button[role="tab"]:has-text("Code / ID")').click();
  await expect(page.locator('.qa-dock .pb-btn--primary')).toContainText('Opslaan');

  const packSwitch = page.locator('.pack-card button[role="switch"]');
  await expect(packSwitch).toBeVisible();
  await packSwitch.click();
  await expect(page.locator('.qa-dock .pb-btn--primary')).toContainText('Opslaan & Volgende kaart');
  await packSwitch.click();

  await page.locator('.qa-more-toggle').click();
  await expect(page.locator('#qa-price')).toBeVisible();
  await page.locator('.qa-more-toggle').click();
  await expect(page.locator('.qa-more-panel')).toHaveCount(0);

  const manualSummary = page.locator('details.manual-box summary');
  await manualSummary.click();
  await page.locator('#m-name').fill('Test Dragonair');
  await page.locator('#m-set').fill('151');
  await page.locator('#m-num').fill('181/165');

  await expect(page.locator('#m-name')).toHaveValue('Test Dragonair');
  await expect(page.locator('.qa-dock .pb-btn--primary')).toBeVisible();

  await scrollMainToBottomAndTop(page, '/toevoegen');

  // Feedback #3: scrollpositie blijft behouden na toevoegen via "Nog één" (geen automatische opscroll)
  const scrollBeforeAdd = await page.evaluate(() => {
    const main = document.querySelector('.shell__main') as HTMLElement | null;
    if (!main) return 0;
    const maxTop = Math.max(0, main.scrollHeight - main.clientHeight);
    const target = Math.min(260, maxTop);
    main.scrollTop = target;
    return main.scrollTop;
  });
  await page.locator('.qa-dock__more').click();
  await page.waitForTimeout(120);
  const scrollAfterAdd = await page.evaluate(() => {
    const main = document.querySelector('.shell__main') as HTMLElement | null;
    return main ? main.scrollTop : 0;
  });
  if (scrollBeforeAdd > 40) {
    expect(scrollAfterAdd, 'Snel Toevoegen mag na opslaan niet terug naar boven scrollen').toBeGreaterThan(20);
  }

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Snel Toevoegen: Alle Sets multi-select, Alleen ontbrekende, Selectie-sheet & batch toevoegen', async ({ page }) => {
  const errors = attachErrorCollectors(page);

  // Mock TCGdex set detail en kaart-metadata deterministisch voor offline-veilige E2E
  await page.route('https://api.tcgdex.net/v2/en/sets/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'sv03.5',
        name: '151',
        tcgOnline: 'MEW',
        serie: { id: 'sv', name: 'Scarlet & Violet' },
        cardCount: { official: 165, total: 207 },
        cards: [
          { id: 'sv03.5-001', localId: '001', name: 'Bulbasaur' },
          { id: 'sv03.5-004', localId: '004', name: 'Charmander' },
          { id: 'sv03.5-199', localId: '199', name: 'Charizard ex' },
        ],
      }),
    });
  });

  await page.route('https://api.tcgdex.net/v2/en/cards/*', async (route) => {
    const url = route.request().url();
    const id = decodeURIComponent(url.split('/cards/')[1] || 'sv03.5-001');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id,
        localId: id.split('-')[1] || '001',
        name: id.endsWith('004') ? 'Charmander' : id.endsWith('199') ? 'Charizard ex' : 'Bulbasaur',
        category: 'Pokemon',
        rarity: id.endsWith('199') ? 'Special Illustration Rare' : 'Common',
        types: ['Grass'],
        set: {
          id: 'sv03.5',
          name: '151',
          serie: { id: 'sv', name: 'Scarlet & Violet' },
          cardCount: { official: 165, total: 207 },
        },
        pricing: { cardmarket: { trend: 1.5 } },
      }),
    });
  });

  await page.goto('/toevoegen', { waitUntil: 'domcontentloaded' });
  await page.locator('button[role="tab"]:has-text("Alle Sets")').click();
  await page.locator('#qa-set-select').click();
  await page.locator('#qa-set-search-input').fill('151');
  await page.locator('.set-picker__option').first().click();

  await expect(page.locator('.result-tile').first()).toBeVisible();

  // Zet Meerdere selecteren aan
  await page.locator('.batch-toolbar button:has-text("Meerdere selecteren")').click();
  await page.locator('.result-tile__main').nth(0).click();
  await page.locator('.result-tile__main').nth(1).click();
  await page.locator('.result-tile__plus').first().click();

  await expect(page.locator('.qa-dock__select-btn')).toContainText('Selectie (2)');
  await expect(page.locator('.qa-dock .pb-btn--primary')).toContainText('2 kaarten (3×) toevoegen');

  // Open Selectie-sheet en controleer op horizontale overflow
  await page.locator('.qa-dock__select-btn').click();
  await expect(page.locator('.qa-batch-sheet')).toBeVisible();
  const sheetOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(sheetOverflow, 'Horizontale overflow met Selectie-sheet open').toBe(true);

  await page.locator('.qa-batch-sheet__footer .pb-btn--primary').click();
  await expect(page.locator('.qa-batch-sheet')).toBeHidden();
  await expect(page.locator('.toast--success')).toBeVisible();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Instellingen: barebones template-sectie, token generator & Code.gs kopiëren zonder overflow', async ({
  page,
  context,
}) => {
  const errors = attachErrorCollectors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);

  let mockedScriptVersion: string | undefined = undefined;
  await page.route('https://script.google.com/macros/s/**', async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl.includes('action=ping')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          spreadsheetName: 'Live Pokemon Kaarten Collectie',
          ...(mockedScriptVersion ? { scriptVersion: mockedScriptVersion } : {}),
          syncedAt: '2026-11-24T22:35:00Z',
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          ...(mockedScriptVersion ? { scriptVersion: mockedScriptVersion } : {}),
          collection: [],
          setProgress: [],
          pokedex: [],
          binderSlotsPerPage: 9,
          wishlist: [],
          trades: [],
          feedback: [],
          settings: {
            variants: ['Normal', 'Reverse Holo', 'Holo'],
            conditions: ['Near Mint (NM)'],
            gradings: ['Raw'],
            binders: ['Hoofdbinder'],
          },
          syncedAt: '2026-11-24T22:35:00Z',
        },
      }),
    });
  });

  await page.goto('/meer/instellingen', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#sheet-setup')).toBeVisible();
  await expect(page.locator('button:has-text("Kopieer naar eigen Google Drive")')).toBeVisible();
  await expect(page.locator('#sheet-setup')).toContainText(
    'Implementaties beheren (maak geen nieuwe implementatie aan'
  );

  await page.locator('.token-gen-btn').click();
  await expect(page.locator('#cfg-token')).toHaveValue(/^[A-Za-z0-9]{24,}$/);

  await page.locator('button:has-text("Kopieer nieuwste Code.gs")').click();
  await expect(page.locator('.toast--success').last()).toBeVisible();

  // Simuleer gekoppelde v1.x Sheet -> toont Deployment ID hint & Controleer script-versie knop -> upgrade naar v2.1.0
  await page
    .locator('#cfg-url')
    .fill(
      'https://script.google.com/macros/s/AKfycbw9HJg8tJQeL9guRHL51gg1c8bOs-15QUNXmUOSKjNPNXm8dMpCKkLavxZQ/exec'
    );
  await page.locator('button:has-text("Opslaan & Live Sync")').click();
  await expect(page.locator('#sheet-setup')).toContainText('AKfycbw9HJg8tJQe…LavxZQ');
  await expect(page.locator('button:has-text("Controleer script-versie")')).toBeVisible();

  mockedScriptVersion = '2.1.0';
  await page.locator('button:has-text("Controleer script-versie")').click();
  await expect(page.locator('#sheet-setup')).toContainText('Je Google Sheet script is up-to-date (v2.1.0)');

  const overflowOk = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(overflowOk, 'Horizontale overflow op Instellingen').toBe(true);

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
  await expect(page.locator('.detail-dock')).toHaveCount(0);
  await buyInput.fill('99.5');
  await expect(page.locator('.detail-unsaved-badge')).toBeVisible();

  await page.locator('.detail-dock__reset').click();
  await expect(page.locator('.detail-dock')).toHaveCount(0);

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
