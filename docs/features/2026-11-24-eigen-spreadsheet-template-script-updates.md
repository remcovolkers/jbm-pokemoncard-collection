# Feature Brief: Eigen Spreadsheet Template & Apps Script Updates (Instellingen)

- **Datum:** 2026-11-24
- **Status:** Gebouwd (2026-11-24) — alle V1-onderdelen + aangevinkte BA Quick Wins geïmplementeerd
- **Impactniveau:** Groot / Onboarding, Instellingen & Apps Script Update-architectuur
- **Release-type verwachting:** WebView OTA (`apkChanged: false`) *(plus update van [`apps-script/Code.gs`](../../apps-script/Code.gs) en een eenmalige publieke barebones Template Google Sheet)*

---

## 1. Samenvatting & Doel
- **Kernvraag van gebruiker:** *(Feedback #1 — Instellingen)* Een optie toevoegen om de barebones PokéBinder spreadsheet over te nemen naar iemands eigen Google Drive, inclusief duidelijke instructies (API-key / `API_TOKEN` instellen en script aanzetten) én een gemakkelijke update-mogelijkheid zodat gebruikers bij wijzigingen in [`apps-script/Code.gs`](../../apps-script/Code.gs) zelf de nieuwste updates kunnen binnenhalen.
- **Gebruikersprobleem:**
  - Nieuwe gebruikers of medeverzamelaars moeten nu zelf een Google Sheet met alle 6 tabbladen (`Collectie`, `Set Voortgang`, `Pokédex Binder` met `#0001–#1025` en formules, `Verlanglijst`, `Ruil & Verkoop`, `Instellingen`) opbouwen of handmatig kopiëren, daarna handmatig `apps-script/Code.gs` op GitHub openen, plakken, `API_TOKEN` zoeken en de Web App implementeren.
  - Bestaande gebruikers zien nergens op welke versie hun gekoppelde `Code.gs` draait (behalve de smalle `legacyAppsScriptDetected`-melding specifiek voor `batchMutations` in [`settings.component.html`](../../src/app/features/settings/settings.component.html#L446-L458)), en weten zonder uitleg niet hoe ze een update moeten plaatsen zonder dat hun `/exec`-URL of collectiedata verloren gaat.
- **Belangrijkste gebruiksmomenten:**
  - *Desktop (eerste keer instellen & updaten):* De gebruiker klikt in **Meer → Instellingen** op **"Kopieer barebones spreadsheet naar eigen Google Drive"**, volgt de compacte 4-staps gids (menu `⚡ Pokémon API / PokéBinder` → API-token + Auto-sync → Web-app `/exec` plakken), en gebruikt later de **Script-update**-kaart om met één klik de nieuwste `Code.gs` te kopiëren.
  - *Mobiel (status checken & link doorsturen):* Direct zichtbaar of de gekoppelde Sheet up-to-date is of een update beschikbaar heeft, plus een knop om de kopieer-URL en korte instructie naar zichzelf te kopiëren/delen omdat Google's Apps Script editor op een laptop/desktop het prettigst werkt.

---

## 2. Gebruikersverhalen & Kernflows
1. Als nieuwe gebruiker wil ik vanuit **Instellingen** met één klik een lege (**barebones**) kopie van de PokéBinder Google Sheet in mijn eigen Google Drive kunnen maken, waarin alle tabbladen, formules en het script al klaarstaan.
2. Als gebruiker die net een kopie heeft gemaakt wil ik stap voor stap (met exacte menunamen en waarschuwing voor Google's toestemmingsscherm) zien hoe ik mijn `API_TOKEN` instel, Auto-sync activeer en de `/exec`-URL koppel aan PokéBinder.
3. Als bestaande gebruiker wil ik in **Instellingen** automatisch melding krijgen wanneer `Code.gs` is verbeterd en mijn eigen script veilig kunnen **updaten** zonder dat mijn data, formules, `API_TOKEN` of Web-app `/exec`-URL veranderen.

---

## 3. Must-Have Scope (V1)
- [x] **1. Barebones Spreadsheet Kopiëren naar Eigen Google Drive:**
  - Nieuwe prominente kaart/sectie in [`settings.component.html`](../../src/app/features/settings/settings.component.html) (*"Eigen PokéBinder Spreadsheet starten & updaten"*) met primaire actie **"Kopieer naar eigen Google Drive"** die de officiële template-URL (`https://docs.google.com/spreadsheets/d/<TEMPLATE_ID>/copy`, centraal vastgelegd in bijv. `src/app/core/platform/sheet-template-config.ts`) opent.
  - **Waarom `/copy` zo sterk is:** Zodra een gebruiker op *Kopie maken* klikt in Google Drive, kopieert Google automatisch **zowel** alle vooraf ingerichte tabbladen en beschermde formules (`Collectie R:T`, `Set Voortgang D:H`, `Pokédex Binder E:H`, `Verlanglijst I:J`, `Ruil & Verkoop H`, keuzelijsten in `Instellingen`) **als** het gekoppelde (*container-bound*) [`apps-script/Code.gs`](../../apps-script/Code.gs) mee naar de privé-Drive van die gebruiker. Iedere gebruiker start dus met een schone, persoonlijke Sheet zonder code te hoeven aanmaken.
  - *(Fallback als Template-ID nog leeg is of gebruiker een eigen lege sheet wil opbouwen: directe link naar handleiding + `Code.gs` broncode.)*
- [x] **2. Heldere Stap-voor-Stap Setup- & API-Key Instructies:**
  - Vervangt/upgradet de huidige ingeklapte `<details class="sheet-guide">` ([`settings.component.html#L327-L402`](../../src/app/features/settings/settings.component.html#L327-L402)) door een overzichtelijke visuele stappen-gids voor eerste installatie:
    1. **Kopieer template naar eigen Drive:** Klik *Kopieer naar eigen Google Drive* en kies *Kopie maken*.
    2. **Herlaad & zet API-token + Auto-sync aan:** Wacht 5 seconden na openen of ververs de pagina zodat het menu **⚡ Pokémon API / PokéBinder** verschijnt. Klik op **🔑 PokéBinder App API-token instellen / bekijken** (laat leeg voor automatisch sterk token, of plak je zelf gegenereerde sleutel) en klik eenmalig op **⚙️ Auto-sync aanzetten** (geef bij Google's *"Deze app is niet geverifieerd door Google"* melding via *Geavanceerd → Ga naar ... (onveilig)* toestemming — het draait immers uitsluitend op je eigen Drive-account).
    3. **Publiceer als Web-app:** Ga naar **Extensies → Apps Script → Implementeren → Nieuwe implementatie → Type: Web-app** (*Uitvoeren als: Ik*, *Wie heeft toegang: Iedereen*) en kopieer de `/exec`-URL. *(Korte toelichting erbij waarom "Iedereen" veilig is dankzij de verplichte persoonlijke `API_TOKEN`-controle in `isAuthorized_`.)*
    4. **Koppelen & testen:** Plak de `/exec`-URL en je `API_TOKEN` in het formulier eronder → tik **Verbinding testen** → **Opslaan & Live Sync**.
- [x] **3. `Code.gs` Versiebeheer & In-App Update-flow:**
  - **Versie-handshake in [`apps-script/Code.gs`](../../apps-script/Code.gs):** Voeg `var SCRIPT_VERSION = '2.1.0';` (plus optionele `SCRIPT_UPDATED_AT`) toe en stuur `scriptVersion` mee in zowel `doGet?action=ping` ([`Code.gs#L600-L606`](../../apps-script/Code.gs#L600-L606)) als `buildBootstrapPayload_()` ([`Code.gs#L723-L736`](../../apps-script/Code.gs#L723-L736)). Oudere sheets die nog geen `scriptVersion` meesturen blijven 100% werken en worden automatisch herkend als verouderd (`< 2.1.0`).
  - **Publicatie via GitHub Pages:** Kopieer `apps-script/Code.gs` mee tijdens [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) (naar bijv. `dist/pokebinder/browser/apps-script/Code.gs`) en neem `latestScriptVersion`, `scriptCodeUrl` en `scriptChangelog` op in [`scripts/write-version.mjs`](../../scripts/write-version.mjs) (`version.json` + `app-version.ts`). Zo is de actuele scriptcode altijd direct en zonder CORS-problemen opvraagbaar in zowel de PWA als de Android APK.
  - **Live Update-kaart in Instellingen:**
    - Vergelijkt automatisch de verbonden `scriptVersion` van je Sheet met `latestScriptVersion`.
    - Toont bij nieuwere versie direct een opvallende banner/kaart: *"Script-update beschikbaar (`v1.x` → `v2.1.0`)"* met korte uitleg wat er nieuw is.
    - **1-klik knop "Kopieer nieuwste Code.gs":** Haalt de live `Code.gs` op en zet die met één klik op het klembord (met nette fallback als Clipboard API geblokkeerd is) + secundaire knop **"Open Code.gs op GitHub"**.
    - **Compacte 4-staps Update-instructie (belangrijk voor `/exec`-URL behoud!):**
      1. Open je Google Sheet → **Extensies → Apps Script**.
      2. Selecteer alles in `Code.gs` (`Ctrl+A` / `Cmd+A`), plak (`Ctrl+V`) en sla op (`Ctrl+S`).
      3. Klik **Implementeren → Implementaties beheren** *(belangrijk: geen "Nieuwe implementatie" aanmaken!)*.
      4. Klik op het **potloodje (Bewerken)** → kies bij *Versie* voor **Nieuwe versie** → **Implementeren**. Klaar — je `/exec`-URL, `API_TOKEN` en collectie blijven exact behouden!

---

## 4. Ideeën van de Business Analyst ("Wat past hier logisch bij?")

### Consistentie-scan: Soortgelijke plekken in de app
*Andere schermen/onderdelen waar onboarding, sheet-koppeling of update-status terugkomt:*
- [x] **Dashboard onboarding-banner ([`dashboard.component.html#L13-L29`](../../src/app/features/dashboard/dashboard.component.html#L13-L29)):** Wanneer `syncStatus() === 'unconfigured'` toont het Dashboard al *"Nog geen Google Sheet gekoppeld · Koppelen"*. Richt die knop slim op de nieuwe template/setup-sectie (en noem daar kort *"Maak gratis je eigen Google Sheet of koppel een bestaande"*).
- [x] **Bestaande `legacyAppsScriptDetected`-melding ([`settings.component.html#L446-L458`](../../src/app/features/settings/settings.component.html#L446-L458) & [`collection.store.ts#L89`](../../src/app/core/state/collection.store.ts#L89)):** Voeg deze bestaande waarschuwing voor oudere scripts zonder `batchMutations` samen met het nieuwe algemene `scriptVersion`-overzicht, zodat gebruikers altijd één duidelijke plek zien voor script-updates in plaats van twee losse banners.
- [x] **App-versie & Updates kaart ([`settings.component.html#L46-L150`](../../src/app/features/settings/settings.component.html#L46-L150)):** Laat tikken op **Controleer op updates** ook `latestScriptVersion` uit `version.json` meecontroleren, zodat web-app, Android APK en Google Sheet-backend op één uniforme manier versies controleren.

### Aanbevolen om direct mee te nemen (V1 Quick Wins)
- [x] **`--target template` in [`scripts/deploy-gas.mjs`](../../scripts/deploy-gas.mjs):** Voeg naast `test`, `live` en `feedback` ook een optioneel `.clasp.template.json` target toe (`npm run gas:deploy:all`), zodat zodra jij `Code.gs` uitrolt ook de publieke barebones Template Sheet in één commando automatisch bijgewerkt blijft voor nieuwe kopieerders!
- [x] **Google Sheets menu-item *"🔄 Controleren op PokéBinder Script-update"* in [`apps-script/Code.gs#L240-L252`](../../apps-script/Code.gs#L240-L252):** Laat het menu in Google Sheets zelf `version.json` ophalen via `UrlFetchApp.fetch` en melden of er een nieuwere `Code.gs` beschikbaar is (met link naar de code).
- [x] **1-klik "Genereer & kopieer veilig API-token" in PokéBinder Instellingen:** Voor gebruikers die vanuit de app starten: genereer met één klik een sterke sleutel, vul hem desgewenst alvast in het `API_TOKEN`-veld in en kopieer hem voor het plakken in Google Sheets (als aanvulling op de generator in het Sheets-menu).
- [x] **Compacte inklap-logica in Instellingen:** Wanneer Demo-modus uit staat én de actieve Sheet gekoppeld en up-to-date is, klap de Setup-handleiding voor nieuwe gebruikers automatisch in tot een rustige 1-regelige balk (*"Eigen spreadsheet setup & instructies · Script v2.1.0 up-to-date"*), en klap hem juist automatisch open wanneer iemand nog niet gekoppeld is of een script-update beschikbaar heeft.

### Logische vervolgstappen (V2 / Later)
- [ ] **`initializeBarebonesWorkbook()` repair/init-functie in `Code.gs`:** Een menufunctie in Google Sheets die op een compleet lege spreadsheet automatisch alle 6 tabbladen, koprijen, formule-kolommen (`R:T`, `D:H`, `E:H`, `I:J`, `H`), dropdown-validaties en Pokédex-rijen opbouwt of ontbrekende tabbladen/formules herstelt.
- [ ] **Google Apps Script Library-architectuur (optioneel onderzoeken):** Centrale Library waar gebruikerssheets een dunne wrapper aanroepen. *(Let op: externe read-only gebruikers kunnen in Apps Script geen automatische `HEAD`-updates draaien zonder bewerkrechten op de Library en moeten bij elke update alsnog de Library-versie ophogen + Web-app herdeployen; bovendien geeft het extra vertraging en `PropertiesService`-complexiteit. Vandaar dat 1-klik `Code.gs` kopiëren in V1 robuuster is.)*

### Bewust Buiten Scope (V1)
- Volautomatisch overschrijven van andermans Apps Script via de Google Apps Script API (`script.projects.updateContent`) — vereist aparte Google Cloud OAuth app-verificatie en handmatig API-beheer door elke eindgebruiker.
- Native Capacitor plugins of `android/`-aanpassingen (`apkChanged: false` blijft behouden; dit is een pure WebView OTA + Apps Script uitbreiding).

---

## 5. UX- & Schermimpact (Mobiel & Desktop)
- **Routes / Navigatie:** Geen nieuwe route; geïntegreerd in `/meer/instellingen` ([`settings.component.html`](../../src/app/features/settings/settings.component.html)).
- **Mobiel (`390×844`):**
  - Alle actieknoppen (*Kopieer naar Google Drive*, *Kopieer link*, *Kopieer nieuwste Code.gs*, *Token genereren*) minimaal `44 px` hoog, volle breedte of nette 2-koloms wrap zonder horizontale overflow.
  - Duidelijk mobiel advieskader dat de eenmalige Apps Script-deploy op een laptop/desktop het makkelijkst gaat (met 1-klik *"Kopieer template-link"* om aan jezelf te sturen).
- **Desktop (`1440×900` & `1280×768`):**
  - Heldere visuele scheiding tussen **1. Nieuwe eigen spreadsheet starten** (barebones kopie + setup-gids) en **2. Bestaande spreadsheet koppelen & script updaten**.
  - Directe feedback via toast + inline kopieerbevestiging (*"Code.gs gekopieerd (X regels)"*).
- **Lege-, laad- & foutstaten + Demo-modus:**
  - Juist zichtbaar en bruikbaar in **Demo-modus** en **Niet gekoppeld** (zodat een tester in Demo-modus eerst ziet hoe makkelijk hij naar een eigen Sheet kan overstappen).
  - Als het ophalen van `Code.gs` of `version.json` offline faalt, toont de app een heldere foutmelding met fallback-link naar GitHub.

---

## 6. Data-, Google Sheets- & Sync-impact
- **Domain modellen & Ports ([`models.ts`](../../src/app/core/domain/models.ts), [`collection-repository.port.ts`](../../src/app/core/ports/collection-repository.port.ts)):**
  - Optioneel `scriptVersion?: string` toevoegen aan `ConnectionTestResult` en `AppSnapshot`.
  - Uitbreiden van `RemoteVersionManifest` (`version.utils.ts`) en `AppUpdateService` met optionele `latestScriptVersion`, `scriptCodeUrl` en `scriptChangelog`.
- **Google Sheets & [`apps-script/Code.gs`](../../apps-script/Code.gs):**
  - Voeg `var SCRIPT_VERSION = '2.1.0';` toe; geef deze terug in `ping` en `bootstrap`.
  - Voeg eventueel `checkScriptUpdateFromMenu()` toe aan het menu `⚡ Pokémon API / PokéBinder`.
  - Bestaande formule-kolommen (`Collectie R:T`, `Set Voortgang D:H`, `Pokédex Binder E:H`, `Verlanglijst I:J`, `Ruil & Verkoop H`) blijven **100% onaangeroerd**.
- **Achterwaartse compatibiliteit:**
  - Oudere spreadsheets zonder `scriptVersion` werken gewoon door en krijgen in Instellingen netjes de status *"Update beschikbaar (onbekende oudere versie → v2.1.0)"*.

---

## 7. Acceptatiecriteria & Testplan (`ui-ux-reviewer` + Playwright)
1. **Functioneel:**
   - Barebones template-knop opent de `/copy`-URL met `rel="noopener noreferrer"` (en toont duidelijke fallback/instructie zolang er eventueel nog geen template-ID is geconfigureerd).
   - `AppsScriptSheetsAdapter` en `CollectionStore` lezen `scriptVersion` correct uit zowel `ping` als `bootstrap`, en vergelijken dit met `latestScriptVersion` uit `version.json`.
   - Knop *"Kopieer nieuwste Code.gs"* haalt actuele broncode op (of toont heldere foutmelding offline) en kopieert deze betrouwbaar naar het klembord.
2. **Mobiele & Desktop UX:**
   - Nul horizontale overflow op `390×844` en `1440×900`, alle kopieerknoppen `>= 44 px`, heldere hiërarchie tussen opstarten en updaten, automatische inklap-staat als gebruiker al gekoppeld & up-to-date is.
3. **Tests:**
   - Vitest unit- & integratietests (`version.utils.spec.ts`, `apps-script-sheets.adapter.spec.ts`, `collection.store.spec.ts`, `features.integration.spec.ts`).
   - Apps Script backend tests (`apps-script/code.test.mjs`) die `scriptVersion` in `ping` + `bootstrap` en alle beschermde formules verifiëren.
   - Playwright walkthrough (`e2e/ux-layout.spec.ts`, `e2e/interactive-ui-walkthrough.spec.ts`, `e2e/visual-audit.spec.ts`) + `ui-ux-reviewer` `GO`.

---

## 8. Open Beslispunten voor Samen Beoordelen
1. **Barebones Template Google Sheet ID:** Heb je al een lege (publiek op *"Iedereen met de link kan bekijken"*) barebones Google Spreadsheet aangemaakt waarvan we de Spreadsheet-ID direct in de `/copy`-knop kunnen zetten, of wil je dat we de template-ID via een centraal configbestand + optioneel de `initializeBarebonesWorkbook()`-hulpfunctie voorbereiden zodat jij hem daarna één keer koppelt?
2. **Update-mechanisme voor gebruikers (`Code.gs`):**
   - **Optie A *(Aanbevolen)*:** In-app scriptversie-check (`SCRIPT_VERSION`) + **1-klik "Kopieer nieuwste Code.gs"** + duidelijke 4-staps update-gids (*Implementaties beheren → Nieuwe versie*, zodat `/exec`-URL en `API_TOKEN` behouden blijven) + `--target template` in `deploy-gas.mjs`.
   - **Optie B:** Google Apps Script Library-wrapper (heeft door Google-rechten voor externe gebruikers nog steeds handmatige versie-updates en extra performance-overhead).
3. **Welke Quick Wins uit sectie 4 wil je direct in V1 meenemen?**
   - `[ ]` `--target template` in [`scripts/deploy-gas.mjs`](../../scripts/deploy-gas.mjs)
   - `[ ]` Menu-item *"Controleren op PokéBinder Script-update"* in [`apps-script/Code.gs`](../../apps-script/Code.gs)
   - `[ ]` 1-klik *"Veilig API-token genereren & kopiëren"* direct in PokéBinder Instellingen
   - `[ ]` Dashboard *"Niet gekoppeld"*-banner rechtstreeks laten verwijzen naar de nieuwe setup-sectie
