# Feature Brief: Snel Toevoegen — Multi-Select Batch Toevoegen & Rustig Scrollgedrag

- **Datum:** 2026-11-24
- **Status:** Gebouwd (2026-11-24) — alle V1-onderdelen + aangevinkte BA Quick Wins geïmplementeerd
- **Impactniveau:** Groot / Workflow-uitbreiding & UX-bugfix (Snel Toevoegen)
- **Release-type verwachting:** WebView OTA (`apkChanged: false`)

---

## 1. Samenvatting & Doel
- **Kernvraag van gebruiker:**
  1. *(Feedback #2 — Snel Toevoegen)* Bij het toevoegen van veel kaarten binnen 1 set voelt 1 kaart tegelijk veel te traag: meerdere kaarten tegelijk kunnen selecteren en opslaan moet mogelijk zijn.
  2. *(Feedback #3 — Snel Toevoegen)* De pagina scrollt na het toevoegen van een kaart irritant automatisch helemaal terug omhoog.
- **Waarom het nu misgaat in de codebase:**
  - **Automatische opscroll (`prepareNextCard()`):** In [`quick-add.component.ts#L827-L840`](../../src/app/features/quick-add/quick-add.component.ts#L827-L840) roepen zowel `saveCard(true)` als `incrementDuplicate()` na het opslaan `prepareNextCard()` aan, die hard `window.scrollTo({ top: 0, behavior: 'smooth' })` en `document.querySelector('.shell__main')?.scrollTo({ top: 0, behavior: 'smooth' })` uitvoert — óók als je in `Alle Sets` midden in pagina 2 van een set zit! Direct daarna roept `el?.focus()` (zonder `{ preventScroll: true }`) op mobiel bovendien [`MobileViewportService.onFocusIn()`](../../src/app/core/platform/mobile-viewport.service.ts#L44-L64) aan, wat de viewport nogmaals laat springen en het virtuele toetsenbord opentrekt.
  - **Enkelvoudige kaartflow:** Zowel `Alle Sets` ([`quick-add.component.html#L454-L472`](../../src/app/features/quick-add/quick-add.component.html#L454-L472)) als `Op Naam` ([`quick-add.component.html#L175-L186`](../../src/app/features/quick-add/quick-add.component.html#L175-L186)) werken nu met één `previewCard`-signal. Bij elke tik op een kaarttegel moet de gebruiker eerst wachten/scrollen naar de formuliervelden onderaan, opslaan, en daarna opnieuw de volgende kaart kiezen.
  - **Nevenbugje gevonden bij scan:** In [`quick-add.component.html#L166-L174`](../../src/app/features/quick-add/quick-add.component.html#L166-L174) staat `pbSwipeNav` in `Op Naam`-modus per ongeluk gekoppeld aan de pagineringssignalen van `Alle Sets` (`catalogTotalPages()` / `setCatalogPage()`).
- **Belangrijkste gebruiksmomenten:**
  - *Mobiel (booster box, ETB of bulk uit een set verwerken):* Kies je set in *Alle Sets*, schakel *Meerdere selecteren* in, tik in één flow 10–30 kaarten aan over meerdere setpagina's zonder dat het scherm verspringt, controleer optioneel een dubbele of Reverse Holo in het selectie-overzicht en tik één keer op **`X kaarten toevoegen`**.
  - *Desktop (thuis snel een binder of grote partij kaarten invoeren):* Blader door het 4-koloms setoverzicht, klik met één vinger/muis alle gepullde kaarten aan, pas in de review-sheet eventueel specifieke aantallen of varianten aan en sla alles in één `batchMutations`-call op.

---

## 2. Gebruikersverhalen & Kernflows
1. Als verzamelaar wil ik in **Snel Toevoegen → Alle Sets** meerdere kaarten tegelijk kunnen selecteren (ook verspreid over verschillende pagina's van de set) en ze in één klik allemaal toevoegen.
2. Als ik een kaart of een selectie toevoeg, wil ik op exact dezelfde scrollpositie blijven staan zodat ik direct verder kan kijken/selecteren waar ik gebleven was.
3. Als ik tijdens het selecteren van een stapel kaarten van één kaart bijvoorbeeld 2 exemplaren heb of één kaart een *Reverse Holo* is, wil ik dat snel in een compact overzicht kunnen bijstellen voordat ik definitief opsla.

---

## 3. Must-Have Scope (V1)
- [x] **1. Opscroll na toevoegen volledig verhelpen (Feedback #3):**
  - Gedwongen `window.scrollTo({ top: 0 })` en `.shell__main.scrollTo({ top: 0 })` uit [`prepareNextCard()`](../../src/app/features/quick-add/quick-add.component.ts) verwijderd.
  - `Alle Sets` en `Op Naam` houden hun huidige resultaatlijst, setpagina (`setCatalogPage`) en scrollpositie exact vast na opslaan.
  - Ongevraagd focussen op mobiel (en in `Alle Sets` / `Op Naam`) uitgeschakeld; op desktop `Code / ID` + `Pack Opening Mode` alleen `focus({ preventScroll: true })` wanneer het invoerveld al binnen de viewport zichtbaar is.
- [x] **2. Multi-Select & Batch Toevoegen in `Alle Sets` (Feedback #2):**
  - **Duidelijke toggle *"Meerdere selecteren"*:** Pill in `.batch-toolbar` van `Alle Sets` en `Op Naam` (lokaal onthouden).
  - **Selecteren over pagina's & filters heen:** 1e tik selecteert (`1×`), 2e tik deselecteert, `+1`-knopje op geselecteerde tegels; selectie blijft behouden over pagina's, filters, sets en zoekopdrachten heen.
  - **Slimme achtergrond-prefetch:** Haalt per geselecteerde kaart automatisch detailmetadata op (met offline-veilige fallback op basisgegevens).
  - **Aangepaste zwevende actiebalk (`.qa-dock`) + Bottom Sheet (`Selectie (X)`):** Per-kaart `− 1× +` stepper, per-kaart variant-override en gedeelde instellingen, opgeslagen in één atomische `addCardsBatch`-actie.
- [x] **3. Variant- & Duplicaatgedrag voor de Batch:**
  - Standaard *"Slim per kaart (op zeldzaamheid)"* of vaste batch-variant + keuze *+1 bij bestaande kaart (zelfde variant)* vs *Altijd als aparte rij toevoegen*.

---

## 4. Ideeën van de Business Analyst ("Wat past hier logisch bij?")

### Consistentie-scan: Soortgelijke plekken in de app
*Andere schermen/onderdelen in `src/app/` met ditzelfde selectie- of rasterpatroon:*
- [x] **Snel Toevoegen → `Op Naam` ([`quick-add.component.html`](../../src/app/features/quick-add/quick-add.component.html)):** Zelfde Multi-select & `+1`-tegels geactiveerd en foutieve `pbSwipeNav`-binding op `Op Naam` opgeruimd.
- [x] **Set Voortgang → `+ Kaarten toevoegen` ([`set-progress.component.html`](../../src/app/features/set-progress/set-progress.component.html)):** Sluit naadloos aan op `Alle Sets` Multi-select.
- [ ] **Collectie (`/collectie`) bulk-selectie *(V2)*:** Meerdere bestaande kaarten in je Collectie aanvinken om ze tegelijk naar een andere binder te verplaatsen of als *Te ruil* te markeren (bewust voor V2 geparkeerd).

### Aanbevolen om direct mee te nemen (V1 Quick Wins)
- [x] **Snelfilter *"Alleen ontbrekende"* in `Alle Sets`:** Verbergt `✓ In bezit` kaarten met één tik.
- [x] **Compacte set-teller (`X / Y in bezit`) in `.sets-browser__header`:** Loopt live mee na elke opgeslagen batch.
- [x] **Compacte `+1`-knop op al geselecteerde tegels:** Direct extra exemplaren meetellen in het grid.
- [x] **Set-overstijgend selectiemandje:** Selectie blijft bewaard tussen sets en tussen `Alle Sets` ↔ `Op Naam`.

### Logische vervolgstappen (V2 / Later)
- [ ] **Komma-gescheiden reeks in `Code / ID`-modus:** Bijv. `MEW 1, 4, 7, 15, 181` intypen → alle gevonden kaarten als batch klaarzetten om in één klik toe te voegen.
- [ ] **"Hele pagina selecteren (24)"-knop in `Alle Sets`:** Handig als je een complete common/uncommon stapel in één keer koopt en alleen de paar missende kaarten uitvinkt.
- [ ] **Bulk-selectie & multi-edit in Collectie (`/collectie`):** Meerdere eigen kaarten tegelijk verplaatsen, op *Te ruil* zetten of verwijderen.

### Bewust Buiten Scope (V1)
- Camera / OCR-batchscanner (vereist native Capacitor plugin en een nieuwe APK-build).
- Aanpassingen aan Google Sheets-kolommen of `apps-script/Code.gs` (de huidige `batchMutations` API ondersteunt al willekeurig veel kaarten in één netwerkverzoek).

---

## 5. UX- & Schermimpact (Mobiel & Desktop)
- **Routes / Navigatie:** Blijft volledig binnen `/toevoegen` (`QuickAddComponent`).
- **Mobiel (`390×844`):**
  - Kaarttegels in `.search-results` behouden minimaal `44 px` touch-targets; de selectie-indicator staat rechtsboven vrij van de `✓ In bezit`-badge.
  - `.qa-dock` houdt op `390 px` voldoende ademruimte voor **`X kaarten toevoegen`** + **`Selectie (X)`** zonder dat knoppen over twee regels breken of horizontaal overlopen.
  - Het *Selectie (X)*-overzicht gebruikt het standaard `pb-sheet`-patroon met `ModalScrollLockService` en `pbSheetDismiss`.
- **Desktop (`1440×900` & `1280×768`):**
  - `Ctrl/Cmd+Enter` slaat in Multi-select modus direct de actieve batch op; `Escape` sluit eerst een open *Selectie*-sheet voordat iets anders gebeurt.
  - Het scrollgedrag op `.shell__main` en `window` blijft in alle modi (`Code / ID`, `Op Naam`, `Alle Sets`) stabiel op de actieve scrollpositie.
- **Lege-, laad- & foutstaten + Demo-modus:**
  - In Demo-modus en Offline-modus werkt Multi-select identiek; zonder internet gebruikt de app gecachete of basis-setcatalogusgegevens en zet mutaties veilig in de lokale outbox.

---

## 6. Data-, Google Sheets- & Sync-impact
- **Domain modellen (`models.ts`):** Geen wijzigingen nodig.
- **Store ([`collection.store.ts`](../../src/app/core/state/collection.store.ts)):**
  - Voeg een geoptimaliseerde `addCardsBatch(...)` (of batch-commit helper) toe die meerdere kaarten + eventuele duplicaat-verhogingen in **één** synchrone `snapshot.update(...)`, **één** `localStorage`-write en **één** outbox-enqueue verwerkt → dat voorkomt N losse signal-recomputes op grote collecties en bundelt alles automatisch in één `batchMutations`-call richting Google Sheets.
- **Google Sheets & [`apps-script/Code.gs`](../../apps-script/Code.gs):**
  - Nul schema- of formulewijzigingen (`Collectie R:T`, `Set Voortgang D:H`, `Pokédex Binder E:H`, `Verlanglijst I:J`, `Ruil & Verkoop H` blijven volledig intact).

---

## 7. Acceptatiecriteria & Testplan (`ui-ux-reviewer` + Playwright)
1. **Scrollstabiliteit (Feedback #3):**
   - Scroll naar beneden op `/toevoegen` (zowel in `Alle Sets` als onderaan bij de actieknoppen), sla een kaart op met *Nog één* / *Opslaan & Volgende kaart* / *+1 bij bestaande kaart* én sla een multi-select batch op → `.shell__main.scrollTop` en `window.scrollY` springen **niet** terug naar `0`.
2. **Multi-select & Batch Opslaan (Feedback #2):**
   - Selecteer meerdere kaarten uit een set (inclusief over 2+ setpagina's heen), pas optioneel één kaart naar `2×` aan in *Selectie (X)*, sla de batch op → alle geselecteerde kaarten verschijnen direct in de Collectie, krijgen direct `✓ In bezit` in het setoverzicht, en versturen in live-modus één `batchMutations`-request.
3. **Mobiele & Desktop UX:**
   - Nul horizontale overflow op `390×844` en `1440×900`, alle badges en knoppen leesbaar zonder overlap, werkende *Selectie (X)* bottom-sheet, geen ongewenste toetsenbord-popups.
4. **Tests:**
   - Vitest tests voor `CollectionStore` batch-add + duplicaatsamenvoeging, `QuickAddComponent` scroll-stabiliteit en multi-select (`features.integration.spec.ts`, `collection.store.spec.ts`, `mobile-ui.spec.ts`).
   - Uitbreiding van `e2e/interactive-ui-walkthrough.spec.ts` + visuele goedkeuring door `ui-ux-reviewer` (`GO`).

---

## 8. Open Beslispunten voor Samen Beoordelen
1. **Tweede keer tikken op een al geselecteerde kaarttegel in Multi-select:**
   - *Aanbevolen:* 1e tik = selecteren (`1×`), 2e tik = weer uitselecteren (makkelijk om een mistik te herstellen); aantal verhogen (`2×`, `3×`) via een klein `+`-knopje op de geselecteerde tegel of in de *Selectie (X)*-sheet.
   - *Alternatief:* Elke tik telt op (`1× → 2× → 3×`), met een los `×`-knopje om te deselecteren.
2. **Multi-select standaard UIT (toggle *"Meerdere selecteren"*) of standaard AAN in `Alle Sets`?**
   - *Aanbevolen:* Duidelijke toggle **"Meerdere selecteren"** bovenaan `Alle Sets` (waarvan we je voorkeur onthouden), zodat 1 kaart bekijken met grote Cardmarket-prijs/preview altijd mogelijk blijft en bulk-modus in één tik aan staat.
   - *Alternatief:* Altijd standaard op Multi-select staan zodra je *Alle Sets* opent (met een oog-/detail-icoontje per kaart als je de preview wilt openen).
3. **Mogen deze V1 Quick Wins direct meegebouwd worden?**
   - `[ ]` Multi-select ook aanzetten in **Op Naam**-modus (zelfde kaarttegels + opruimen foutieve `pbSwipeNav`-binding)
   - `[ ]` Snelfilter **"Alleen ontbrekende"** + live teller (`X / Y in bezit`) in *Alle Sets*
   - `[ ]` **Set-overstijgend selectiemandje** (selectie blijft bewaard als je nog een kaart uit een andere set toevoegt)
4. **Focusgedrag na opslaan (Feedback #3):**
   - *Aanbevolen:* Nooit meer automatisch naar boven scrollen (`scrollTo({ top: 0 })` helemaal verwijderen) en op mobiel nooit ongevraagd focussen na opslaan. Alleen op desktop in `Code / ID` + *Pack Opening Mode* het invoerveld via `focus({ preventScroll: true })` klaarzetten als het al zichtbaar is.
