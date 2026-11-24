# Feature Brief: UX Slag A — Rustige Shell, Slimme Detail-dock, Klikbaar Dashboard & Opschoning Beheerschermen

- **Datum:** 2026-11-24
- **Status:** Gebouwd (2026-11-24)
- **Impactniveau:** Groot / App-brede UX & Informatiearchitectuur-verbetering
- **Release-type verwachting:** WebView OTA (`apkChanged: false`) *(alle onderdelen puur web/UI; optioneel bewerken/verwijderen op Verlanglijst voegt daarnaast 2 lichte acties toe in `apps-script/Code.gs`)*

---

## 1. Samenvatting & Doel
- **Kernvraag van gebruiker:** Alle schermen opschonen vanuit het oogpunt van een ervaren UX developer: onlogische knopplaatsing, dubbele toegangspunten, overlappende knoppen, dode KPI-tegels, uitgegrijsde actie-docks, foutief geplaatste instellingen en technisch Google Sheets-jargon wegnemen.
- **Gebruikersprobleem:** Hoewel de basislayout klopt, voelen sommige schermen nog te veel als een technisch prototype doordat knoppen met gelijke prioriteit concurreren, een zware *Feedback*-FAB formulieren bedekt, je op Dashboard niet kunt doorklikken vanuit KPI's of Gen 1–9, en je op Kaartdetail steeds naar een uitgeschakelde *Geen wijzigingen*-balk kijkt.
- **Belangrijkste gebruiksmomenten:**
  - *Mobiel (kijken, navigeren, snelle updates):* Rustigere topbar, meer kijkruimte op Dashboard en Kaartdetail tijdens bladeren/swipen, budget direct aanpassen op Verlanglijst.
  - *Desktop (beheer, ruilen & instellingen):* Geen overlappende rechtsonder-FAB over invoervelden/bedragen, heldere knophiërarchie zonder concurrerende roze knoppen.

---

## 2. Gebruikersverhalen & Kernflows
1. Als verzamelaar wil ik op desktop feedback kunnen geven vanuit de **zijbalk** zonder dat een zwevende knop over mijn *Grade cijfer* of *Transactielogboek* ligt.
2. Als ik op het **Dashboard** tik op *Unieke kaarten*, *Gerealiseerde winst* of *Gen 4*, wil ik direct doorgaan naar precies dat overzicht (Collectie, Ruil & Verkoop of Gen 4 in Pokédex Binder).
3. Als ik door kaarten op **Kaartdetail** swipe, wil ik genieten van een schone onderkant zonder permanente *Geen wijzigingen*-balk — en pas de *Opslaan / Herstellen*-dock zien zodra ik iets aanpas.
4. Als ik op **Verlanglijst**, **Ruil & Verkoop**, **Instellingen** of **Feedback Hub** zit, wil ik directe logische acties zonder Sheet-jargon (`Sheet rij 22+`) of verdwaalde instellingen.

---

## 3. Must-Have Scope (UX Slag A — per blok aan/uit te vinken)
- [x] **1. Shell opschonen ([`app.html`](../../src/app/app.html), [`app.scss`](../../src/app/app.scss)):**
  - Verwijder dubbele *Instellingen*-knop (`.topbar__profile-btn`) uit de mobiele topbar (Instellingen zit al één tap verder in `Meer`).
  - Verplaats `.desktop-feedback-fab` van rechtsonder over de content heen naar een vaste compacte link/knop onderaan in de linker desktop-zijbalk (boven de sync-pil).
- [x] **2. Dashboard opschonen & klikbaar maken ([`dashboard.component.html`](../../src/app/features/dashboard/dashboard.component.html), [`collection.store.ts`](../../src/app/core/state/collection.store.ts)):**
  - Verberg dubbele `.sync-strip` zodra status `synced` of `demo` is (toon alleen bij actie nodig: `unconfigured`, `offline` met wachtrij, of `error`).
  - Maak KPI-tegels klikbare drill-downs (*Unieke kaarten / Exemplaren* → `/collectie`, *Gerealiseerde winst* → `/meer/ruil-verkoop`, *Openstaand verlanglijst-budget* → `/meer/verlanglijst`).
  - Geef `Gen 1`–`Gen 9` tegels een echte selectie door aan Pokédex Binder (`requestedPokedexGen` in `CollectionStore`) zodat klikken op `Gen 4` ook echt `Gen 4` opent.
- [x] **3. Slimme Kaartdetail-dock ([`card-detail.component.html`](../../src/app/features/collection/card-detail.component.html), [`.scss`](../../src/app/features/collection/card-detail.component.scss)):**
  - Toon `.detail-dock` pas wanneer `hasUnsavedChanges()` `true` is (met zachte animatie); tijdens normaal bekijken/swipen blijft onderaan 74 px extra ruimte vrij.
- [x] **4. Verlanglijst, Ruil & Verkoop, Instellingen & Feedback Hub opschonen:**
  - **Verlanglijst ([`wishlist.component.html`](../../src/app/features/wishlist/wishlist.component.html)):** Voeg direct naast het maandbudget (`€ 150,00`) een potloodje/bewerkactie toe om het maandbudget ter plekke te wijzigen; maak *Gevonden → Toevoegen* op kaarten secundair/groen i.p.v. knalroze zodat `+ Nieuwe wens` de enige primaire CTA is.
  - **Ruil & Verkoop ([`trades.component.html`](../../src/app/features/trades/trades.component.html)):** Maak *Verkoop of Ruil Loggen* een compacte primaire knop rechts naast de paginatitel/header (net als `+ Nieuwe wens`) i.p.v. een schermbrede rode balk; vervang technisch jargon `Sheet rij 22+` in de sectie-header en modal-subtitel door begrijpelijke info (*bijv. `3 transacties · netto +€ 47,55`*).
  - **Instellingen ([`settings.component.html`](../../src/app/features/settings/settings.component.html)):** Verwijder het dubbele *Feedback & To-Do Hub*-blok; zet *App-versie & Updates* bovenaan zodra een update klaarstaat; maak *Android APK direct downloaden* secundair wanneer geen nieuwe APK beschikbaar is (`!updates.apkUpdateAvailable()`); haal *Maandbudget* weg uit het API-tokenformulier naar een nette *Voorkeuren*-vermelding met link naar Verlanglijst.
  - **Feedback Hub ([`feedback-hub.component.html`](../../src/app/features/feedback-hub/feedback-hub.component.html)):** Verberg `Copy to prompt (0)` wanneer er 0 items zijn (of verklein tot subtiel icoonknopje).

---

## 4. Ideeën van de Business Analyst ("Wat past hier logisch bij?")

### Consistentie-scan: Soortgelijke plekken in de app
*Andere schermen/onderdelen waar ditzelfde patroon terugkomt:*
- [x] **Technisch Sheet-jargon in andere modals & labels:** Controleer bij het opschonen van `Sheet rij 22+` meteen *alle* subtitels en labels in `src/app/` (bijv. *Koppelt aan Sheet*, cel-/kolomverwijzingen in gebruikergerichte meldingen) zodat alleen het ingebouwde help-uitlegblok op *Instellingen* echte kolomletters noemt.
- [x] **Primaire vs. secundaire CTA-regel app-breed:** Controleer naast Verlanglijst ook *Instellingen* en *Feedback Hub* zodat elke kaart/pagina maximaal één felle primaire CTA heeft en de rest kalm blijft.

### Aanbevolen om direct mee te nemen (V1 Quick Wins)
- [x] **Verlanglijst-items kunnen bewerken & verwijderen:** Voeg naast *Gevonden* op elke verlanglijstkaart een compact menu/potlood + prullenbak toe (doelprijs, prioriteit of notitie bijwerken of wens wissen; met veilige `updateWishlist` & `deleteWishlist` acties in [`apps-script/Code.gs`](../../apps-script/Code.gs) zonder `I:J` formules te raken + demo-support).
- [x] **Contextuele actie rechtsboven op mobiel (na weghalen Instellingen-icoon):** Zet op `/dashboard` of `/collectie` op die vrije plek optioneel een snelle **Zoeken**-knop (of laat bewust leeg voor maximale rust naast de `Demo/Live`-syncpil). *(Optie A toegepast: bewust leeg gelaten voor maximale rust naast de syncpil.)*

### Logische vervolgstappen (V2 / Later)
- [ ] **5-seconden "Ongedaan maken" (Undo) in delete-toast:** Voor kaarten op Kaartdetail én verlanglijst-items zodat per ongeluk wissen in één tik hersteld kan worden.
- [ ] **Dashboard mini-portfoliotrend:** Eenvoudige historische waardelijn bovenin Dashboard zodra periodieke snapshots beschikbaar zijn.

### Bewust Buiten Scope (V1)
- Ingrijpende mobiele filter-bottom-sheet op Collectie, Quick Add *Progressive Disclosure* en Pokédex 3×3 viewport-fit — die vormen samen het losse [UX Slag B Feature Brief](./2026-11-24-ux-slag-b-mobiele-focus-quick-add-collectie-binder.md) zodat we beide slagen schoon kunnen reviewen en testen.
- Wijzigingen aan `android/`, `capacitor.config.ts` of APK dependencies.

---

## 5. UX- & Schermimpact (Mobiel & Desktop)
- **Routes / Navigatie:** Geen route-verwijdering; wel klikbare tegels en nieuwe store-handover `requestedPokedexGen` van Dashboard naar `/pokedex`.
- **Mobiel (`390×844`):** Rustigere topbar, ~60 px gewonnen op Dashboard en ~74 px gewonnen op Kaartdetail tijdens bladeren.
- **Desktop (`1440×900` & `1280×768`):** Controleer in Playwright expliciet dat `.sidebar` op `1280×768` mét de nieuwe Feedback-knop linksonder nog steeds zonder verticale scrollbar past!
- **Demo- en offline-modus:** Maandbudget en eventuele verlanglijst-bewerkingen werken direct lokaal in Demo-modus én via Google Sheets Live Sync.

---

## 6. Data-, Google Sheets- & Sync-impact
- **Zonder optionele wens-edit:** 0% Apps Script-wijziging; maandbudget wordt al lokaal en per profiel bewaard in `CollectionStore`.
- **Met optionele wens bewerken/verwijderen:** Nieuwe acties `updateWishlist` (`A:H`, `K:M`) en `deleteWishlist` in [`apps-script/Code.gs`](../../apps-script/Code.gs) + [`apps-script-sheets.adapter.ts`](../../src/app/core/adapters/apps-script-sheets.adapter.ts), strikt met behoud van formule-kolommen `I:J` en gedekt door nieuwe `node --test` unit tests.
- **Release-impact:** Zuiver WebView OTA (`apkChanged: false`).

---

## 7. Acceptatiecriteria & Testplan (`ui-ux-reviewer` + Playwright)
1. **Desktop `1280×768` & `1440×900`:** Feedback-knop staat in linker `.sidebar` zonder scrollbar; `.desktop-feedback-fab` overlapt nergens invoervelden of logboekbedragen.
2. **Dashboard:** Tik op `Gen 4` opent `/pokedex` op Generatie 4; KPI-tegels navigeren naar Collectie / Ruil & Verkoop / Verlanglijst.
3. **Kaartdetail:** `.detail-dock` is standaard verborgen (`is-hidden` / niet gerenderd) zolang `hasUnsavedChanges() === false`, en verschijnt direct bij aanpassing (`Niet opgeslagen` + `Herstellen` + `Wijzigingen opslaan`).
4. **Beheerschermen:** Geen `Sheet rij 22+` meer op Ruil & Verkoop; maandbudget aanpasbaar direct in Verlanglijst; geen dubbele Feedback-kaart in Instellingen.
5. **Tests:** `npm run test:all` (incl. Apps Script tests indien wens-edit gekozen) + `npm run test:e2e` + screenshot-review op `GO`.

---

## 8. Open Beslispunten voor Samen Beoordelen
1. **Neem je de optionele BA-uitbreiding *"Verlanglijst-items kunnen bewerken & verwijderen"* direct mee in UX Slag A?**
   - *Aanbevolen:* Ja — nu je het budget al direct op Verlanglijst beheert, voelt kunnen aanpassen/verwijderen van een wens (met Apps Script formule-behoud) het scherm helemaal af.
2. **Wat wil je op de vrijgekomen plek rechtsboven in de mobiele topbar (nu het Instellingen-icoon verhuist naar `Meer`)?**
   - *Optie A (Aanbevolen):* Bewust leeg laten zodat topbar enkel logo + pagina + `Demo/Live` pill toont (maximale rust).
   - *Optie B:* Alleen op Dashboard/Collectie een snelle `Zoek`-knop tonen.
3. **Moeten alle 4 blokken uit sectie 3 van UX Slag A in één keer gebouwd worden?**
   - *Aanbevolen:* Ja, ze zijn klein en versterken elkaar als één visueel schone UX-ronde.
