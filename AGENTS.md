# Workspace Guidelines

## Visual & Browser Verification
- Na elke UI-, CSS-, layout-, routing- of UX-wijziging: draai `npm run test:e2e` (echte headless Chromium op mobiel `390×844` en desktop `1440×900`) en bekijk de relevante screenshots in `e2e/screenshots/mobile/` en `e2e/screenshots/desktop/` (via `read_file`) — of inspecteer interactief live op `http://127.0.0.1:4200` via de **Chrome DevTools** MCP / `browser`-subagent.
- Controleer expliciet op horizontale overflow (`scrollWidth <= innerWidth`), onbedoelde micro-scrollbars (zoals op `/meer` of desktop `.sidebar`), afgeknipte/overlappende vaste docks of bottom-navigatie, zwak contrast en runtime console-fouten.
- Los gevonden visuele of layout-problemen eerst op en herverifieer voordat je commit en pusht.

## APK vs WebView OTA Discipline
- Pas tijdens pure web-, UI-, UX- of QA-taken **nooit** `android/`, `capacitor.config.ts`, `package.json` (`version` / `pokebinder.minNativeVersion`) of native `@capacitor/*` / `@capgo/*` dependencies aan, zodat CI via `scripts/detect-apk-changes.mjs` netjes `apkChanged: false` houdt en alleen een lichte WebView OTA-update uitrolt.

## Git Workflow
- After completing a task and verifying that tests (`npm run test:all`) and the production build (`npm run build`) pass without errors, you may commit all changes (using Conventional Commits) and push directly to `origin main` without asking for confirmation first, unless the user explicitly asks not to push.
- Do not commit or push if tests or the build fail, or if unrelated sensitive files appear in `git status`.
