# Workspace Guidelines

## Feature Discovery (Business Analyst) bij Grote Features & Patroon-Consistentie
- Bij een grote of nieuwe feature (bijv. een nieuw scherm, ingrijpende workflow-uitbreiding, nieuwe datavelden/Google Sheets-kolommen of een open product-idee): begin **niet** direct met coderen.
- Gebruik de [`business-analyst`](.agents/agents/business-analyst.md) agent / [`feature-discovery`](.agents/skills/feature-discovery/SKILL.md) skill: check kort relevante bestaande code/modellen, **scan app-breed naar andere soortgelijke plekken of componenten met hetzelfde patroon** (want een wens op één item hoort vaak ook op zusterschermen, zoals swipen bij álle *Vorige/Volgende*-flows), stel zo nodig max 3–5 gerichte vragen, en schrijf eerst een gestructureerd Feature Brief-document in `docs/features/YYYY-MM-DD-<slug>.md` met keuze-checkboxes (soortgelijke plekken, V1 quick wins vs V2).
- Pauzeer voor gezamenlijke beoordeling en keuzes op het document voordat de bouw start. Ook bij kleinere losse UX-wensen op één item: benoem meteen welke soortgelijke schermen in de app ditzelfde patroon delen zodat ze desgewenst direct meegenomen worden. (Sla een analyse-document alleen over bij kleine bugfixes, losse styling-tweaks of als de gebruiker expliciet vraagt direct zonder analyse-document te bouwen.)

## Pre-Push Volledige UI/UX Review Gate
- Na elke UI-, CSS-, layout-, routing- of feature-wijziging — en **verplicht vóór elke push naar `main`**:
  1. Draai `npm run test:e2e` (echte headless Chromium op mobiel `390×844` en desktop `1440×900`, inclusief `e2e/ux-layout.spec.ts`, de interactieve scroll- en invul-walkthrough in `e2e/interactive-ui-walkthrough.spec.ts` en `e2e/visual-audit.spec.ts`).
  2. Voer de volledige [`ui-ux-reviewer`](.agents/agents/ui-ux-reviewer.md)-beoordeling uit: bekijk de relevante screenshots in `e2e/screenshots/mobile/` en `e2e/screenshots/desktop/` via `read_file` en voer bij grotere of nieuwe interactieve flows (zoals geopende modals, bottom sheets, scrollpositie of touch-target metingen) extra inspectie + screenshots uit in **headless Playwright Chromium** (via `e2e/interactive-ui-walkthrough.spec.ts`, `e2e/visual-audit.spec.ts` of een tijdelijke headless Playwright-check). Start tijdens pre-push QA **nooit** uit jezelf **Chrome DevTools MCP** of de `browser`-subagent (zodat de persoonlijke Chrome-browser van de gebruiker niet wordt overgenomen) — gebruik die alleen als de gebruiker er expliciet om vraagt of als een echte ingelogde Chrome/Google-sessie strikt vereist is.
  3. Toets streng en eerlijk op gebruiksvriendelijkheid en best practices (Apple HIG, MD3, WCAG 2.1 AA, touch-targets `>= 44 px`, nul horizontale overflow, geen onbedoelde micro-scrollbars op `/meer` of desktop `.sidebar`, werkende modals/formulieren en logische navigatie).
  4. Los blokkerende (`NO-GO`) bevindingen eerst op, herverifieer, commit en push daarna pas naar `origin main`, en geef de belangrijkste eerlijke UX-feedback en eventuele vervolgadviezen kort mee in je antwoord.

## APK vs WebView OTA Discipline
- Pas tijdens pure web-, UI-, UX- of QA-taken **nooit** `android/`, `capacitor.config.ts`, `package.json` (`version` / `pokebinder.minNativeVersion`) of native `@capacitor/*` / `@capgo/*` dependencies aan, zodat CI via `scripts/detect-apk-changes.mjs` netjes `apkChanged: false` houdt en alleen een lichte WebView OTA-update uitrolt.

## Git Workflow
- After completing a task and verifying that tests (`npm run test:all`) and the production build (`npm run build`) pass without errors, you may commit all changes (using Conventional Commits) and push directly to `origin main` without asking for confirmation first, unless the user explicitly asks not to push.
- Do not commit or push if tests or the build fail, or if unrelated sensitive files appear in `git status`.
