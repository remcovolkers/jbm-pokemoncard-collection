---
name: visual-qa
description: Run headless mobile and desktop visual QA on PokéBinder using isolated Playwright Chromium before releasing UI changes (without taking over personal Chrome).
---

# PokéBinder Visual QA Runbook

Gebruik deze procedure na elke wijziging aan UI, styling, layout, navigatie of interactieve UX om veranderingen zelfstandig in een echte browser te controleren voordat er gecommit/gepusht wordt.

## 1. Geautomatiseerde Playwright Layout-, Scroll-, Invul- & Screenshot-audit

1. Draai de volledige browser-suite vóór elke push naar `main` (start automatisch `ng serve` op `http://127.0.0.1:4200` als die nog niet draait):
   ```powershell
   npm run test:e2e
   ```
   Dit voert op zowel mobiel (`390×844`) als desktop (`1440×900`) drie lagen uit:
   - `e2e/ux-layout.spec.ts`: overflow, navigatie-chroom, `/meer` fit zonder micro-scroll, desktop `1280×768` zijbalk en vaste routes.
   - `e2e/interactive-ui-walkthrough.spec.ts`: op alle scrollbare schermen volledig op en neer scrollen, filters/weergaven wisselen, tabs & sets doorzoeken en alle formulieren/modals (*Kaartdetail*, *Toevoegen*, *Verlanglijst*, *Ruil & Verkoop*, *Feedback*) echt invullen en sluiten.
   - `e2e/visual-audit.spec.ts`: genereert verse screenshots in `e2e/screenshots/mobile/` en `e2e/screenshots/desktop/`.
   *(Los draaien kan ook met `npm run test:e2e:walkthrough` of `npm run test:visual`.)*
2. Inspecteer de gegenereerde viewport-screenshots in `e2e/screenshots/mobile/` en `e2e/screenshots/desktop/` met `read_file` op opvallende defecten (witruimte, afgeknipte tekst, overlappende knoppen, verkeerd uitgelijnde docks, zwak contrast of visuele ruis).

## 2. Eerlijke UI/UX Critic (`ui-ux-reviewer`) & Headless Diepte-inspectie

- Schakel waar nodig de custom agent [`ui-ux-reviewer`](../../agents/ui-ux-reviewer.md) in (of voer diens checklist zelf uit) om met de blik van een kritische Senior UX Developer feedback op **knopplaatsing, CTA-hiërarchie, progressive disclosure, dubbele controls, technisch jargon, mobiel vs. desktop schermruimte en best practices** op te leveren met een helder **`GO` / `NO-GO`**-oordeel.
- Wanneer een scherm, modal of bottom sheet extra CSS/DOM-onderzoek, `scrollTop`-controle of extra screenshots vereist, voer dat dan volledig geïsoleerd uit met **headless Playwright Chromium** op `http://127.0.0.1:4200` (en bekijk eventuele extra screenshots met `read_file`). Gebruik de `browser`-subagent / **Chrome DevTools MCP** uitsluitend op expliciet verzoek van de gebruiker (of wanneer een echte ingelogde Google-sessie strikt nodig is), zodat de persoonlijke Chrome-browser nooit ongevraagd wordt overgenomen.
- Vergeet niet op Windows `127.0.0.1:4200` te gebruiken als `localhost` naar IPv6 `::1` zou wijzen.

## 3. Verplicht Pre-Push UX Rapportformaat
Sluit elke pre-push UI-review af met:
- **Verdict:** `GO` of `NO-GO (eerst fixen)`
- **Blokkerende issues:** exacte route + oorzaak + fix (moeten opgelost zijn vóór push)
- **UX Developer Advies ("Dit kan logischer"):** concrete verbetervoorstellen volgens *Nu → Logischer voorstel (waarom)*
- **Gebruiksvriendelijkheid & Best-Practice Feedback:** eerlijke observaties + 1–3 concrete UX-verbeterkansen voor mobiel en desktop.

## 3. PokéBinder-specifieke Visuele Checklist

Controleer altijd de volgende UX-invariants:
- **Nul horizontale overflow:** Op alle 10+ routes geldt `document.documentElement.scrollWidth <= window.innerWidth` en `.shell__main.scrollWidth <= .shell__main.clientWidth`.
- **Nul onnodige micro-scroll op `/meer`:** Op zowel mobiel (`390×844`) als desktop (`1440×900`) past `/meer` zonder extra verticale scrollruimte.
- **Gerichte flows verbergen bottom nav:** Op `/toevoegen` en `/collectie/kaart/:rowIndex/:cardId` zijn `.bottom-nav` en `.topbar__profile-btn` verborgen op mobiel, terwijl `.topbar__icon-btn[aria-label="Terug"]` zichtbaar is.
- **Desktop 1280×768 zijbalk:** Alle navigatielinks en de footer `Sync` pill passen in `.sidebar` zonder interne verticale scrollbar.
- **Geen WebView tap-flicker:** Grote scrollbare grids (zoals Pokédex-pockets en checklistrijen) gebruiken geen `transform`-animaties bij `:active`.
- **Nul JS-crashes / Angular errors:** Geen `pageerror` of onverwachte `console.error` meldingen tijdens navigeren en klikken.
