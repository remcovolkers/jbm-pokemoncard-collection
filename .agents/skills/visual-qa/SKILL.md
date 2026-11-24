---
name: visual-qa
description: Run real-browser mobile and desktop visual QA on PokéBinder using Playwright and Chrome DevTools before releasing UI changes.
---

# PokéBinder Visual QA Runbook

Gebruik deze procedure na elke wijziging aan UI, styling, layout, navigatie of interactieve UX om veranderingen zelfstandig in een echte browser te controleren voordat er gecommit/gepusht wordt.

## 1. Geautomatiseerde Playwright Layout- & Screenshot-audit

1. Draai de volledige browser-suite (start automatisch `ng serve` op `http://127.0.0.1:4200` als die nog niet draait):
   ```powershell
   npm run test:e2e
   ```
   Of maak alleen verse screenshots:
   ```powershell
   npm run test:visual
   ```
2. Inspecteer de gegenereerde viewport-screenshots in `e2e/screenshots/mobile/` (`390×844`) en `e2e/screenshots/desktop/` (`1440×900`) met `read_file` op opvallende defecten (witruimte, afgeknipte tekst, overlappende knoppen, verkeerd uitgelijnde docks, zwak contrast of visuele ruis).

## 2. Interactieve Chrome DevTools MCP Inspectie

Wanneer een scherm extra live CSS/DOM-onderzoek nodig heeft:
- Gebruik de `chrome_devtools` MCP-tools (`new_page`, `resize_page`, `take_snapshot`, `take_screenshot`, `get_css_styles`, `evaluate_script`, `list_console_messages`) op `http://127.0.0.1:4200`.
- Vergeet niet op Windows `127.0.0.1:4200` te gebruiken als `localhost` naar IPv6 `::1` zou wijzen.

## 3. PokéBinder-specifieke Visuele Checklist

Controleer altijd de volgende UX-invariants:
- **Nul horizontale overflow:** Op alle 10+ routes geldt `document.documentElement.scrollWidth <= window.innerWidth` en `.shell__main.scrollWidth <= .shell__main.clientWidth`.
- **Nul onnodige micro-scroll op `/meer`:** Op zowel mobiel (`390×844`) als desktop (`1440×900`) past `/meer` zonder extra verticale scrollruimte.
- **Gerichte flows verbergen bottom nav:** Op `/toevoegen` en `/collectie/kaart/:rowIndex/:cardId` zijn `.bottom-nav` en `.topbar__profile-btn` verborgen op mobiel, terwijl `.topbar__icon-btn[aria-label="Terug"]` zichtbaar is.
- **Desktop 1280×768 zijbalk:** Alle navigatielinks en de footer `Sync` pill passen in `.sidebar` zonder interne verticale scrollbar.
- **Geen WebView tap-flicker:** Grote scrollbare grids (zoals Pokédex-pockets en checklistrijen) gebruiken geen `transform`-animaties bij `:active`.
- **Nul JS-crashes / Angular errors:** Geen `pageerror` of onverwachte `console.error` meldingen tijdens navigeren en klikken.
