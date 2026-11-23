# PokéBinder — Pokémon TCG Manager PWA

**PokéBinder** is een offline-first Progressive Web App (PWA) gebouwd met **Angular 21** (standalone components, Angular Signals, gecentraliseerde SCSS design tokens volgens het **Obsidian Vault TCG** design system), gehost op **GitHub Pages**, met een bestaande **Google Sheets** *Pokémon Kaartencollectie Tracker* als backend via Google Apps Script én live kaartdata, artwork en Cardmarket EUR-prijzen via de gratis [TCGdex API](https://tcgdex.dev/).

---

## Functionaliteiten

- **Dashboard:** Live KPI-berekeningen (Unieke kaarten, Totaal exemplaren, Aankoopwaarde, Marktwaarde, Ongerealiseerde winst & ROI %, Gerealiseerde verkoopwinst, Openstaand verlanglijst-budget), National Pokédex voortgangskaart met generatie-overzicht, Top 5 waardevolste kaarten en Actieve Master Sets.
- **Collectie:** Visuele 2–6 koloms kaartengallery met TCGdex artwork én lijstweergave, multi-filters (Set, Opslaglocatie, Zeldzaamheid, Te ruil/verkoop, live zoekbalk), natuurlijke numerieke kaartnummer-sortering (`44/102` vóór `166/165`) en een interactieve Detail Bottom Sheet met `- / +` stepper en directe bewerking.
- **Snel Toevoegen (`+`):** Zoeken via Kaart-ID met setcode-aliassen (`MEW 181`, `OBF 199/197`, `BS 44`, `sv03.5-181`) óf op Pokémon-naam via TCGdex, live kaart-preview met Cardmarket EUR-prijs, duplicaatdetectie (**"+1 bij bestaande kaart"** of **"Als aparte variant toevoegen"**) en **Pack Opening Mode** die set, conditie en opslaglocatie onthoudt voor razendsnel invoeren.
- **Pokédex Binder (`#0001–#1025`):** Visuele binder-weergave in `4` (2×2), `9` (3×3), `12` (4×3) of `16` (4×4) vakjes per pagina + compacte checklist, generatiefilter (`Gen 1` t/m `Gen 9` met live teller), statusfilter (`Alle`, `Ontbrekend`, `Al in Collectie`, `In Binder`, `Upgrade gewenst`), variant-kiezer met echt kaartartwork en directe `Upgrade gewenst`-schakelaar.
- **Meer (Tools):**
  - **Set Voortgang:** Overzichtskaarten per set met voortgangsbalk en 1-klik filter naar `Collectie`.
  - **Verlanglijst:** Maandbudget-overzicht, filters op prioriteit en budgetstatus, nieuwe wens toevoegen met TCGdex-lookup en 1-klik `"Gevonden → Toevoegen aan Collectie"`.
  - **Ruil & Verkoop:** Live Trade Binder (kaarten met `Te ruil/verkoop = true` of `Aantal > 1`), totale ruilwaarde en transactielogboek voor verkopen/ruilen/inruilen.
  - **Instellingen:** Google Apps Script Web App URL & persoonlijk API-token beheren, verbinding testen, handmatig volledig synchroniseren, Cardmarket-prijzen verversen, Demo-modus aan/uit en offline-cache legen.
- **Offline-first PWA:** Service Worker caching voor de app én TCGdex artwork/API, lokale snapshot-cache en een offline wijzigingswachtrij die automatisch synchroniseert zodra je weer online bent.

---

## Lokaal ontwikkelen & testen

```bash
# 1. Afhankelijkheden installeren
npm install

# 2. Ontwikkelserver starten (op http://localhost:4200)
npm start

# 3. Alle tests draaien (Angular Vitest + Apps Script backend tests)
npm run test:all

# Of afzonderlijk:
npm test -- --watch=false
npm run test:apps-script

# 4. Productie-build maken
npm run build
```

---

## Installatiehandleiding (Productie)

### Stap A — `apps-script/Code.gs` deployen als Web App + `API_TOKEN` instellen

De backend-code staat kant-en-klaar in [`apps-script/Code.gs`](apps-script/Code.gs). Het script schrijft nooit over bestaande Google Sheets-formules heen (zoals `R:T` in `Collectie`, `D:H` in `Set Voortgang`, `E:H` in `Pokédex Binder`, `I:J` in `Verlanglijst` en `H` in `Ruil & Verkoop`) en gebruikt `LockService` tegen schrijfbotsingen.

1. Open je bestaande Google Spreadsheet (**Pokémon Kaartencollectie Tracker**).
2. Klik in het bovenste menu op **Extensies → Apps Script**.
3. Vervang de inhoud van `Code.gs` door de volledige inhoud van [`apps-script/Code.gs`](apps-script/Code.gs) en sla op (`Ctrl+S`).
4. **Persoonlijk `API_TOKEN` instellen** (geen secrets in GitHub!):
   - Klik links in de Apps Script-editor op het tandwiel (**Projectinstellingen**).
   - Scroll helemaal naar beneden naar **Scripteigenschappen → Scripteigenschap toevoegen**.
   - **Eigenschap:** `API_TOKEN`
   - **Waarde:** een zelfgekozen sterke sleutel (bijv. 32+ willekeurige tekens).
   - Klik op **Scripteigenschappen opslaan**. *(Tip: na herladen van je Sheet kun je dit ook via het nieuwe menu **PokéBinder → API-token instellen** doen.)*
5. **Deployen als Web App:**
   - Klik rechtsboven op **Implementeren → Nieuwe implementatie**.
   - Klik op het tandwiel bij *Type selecteren* en kies **Web-app**.
   - **Beschrijving:** `PokéBinder API v1`
   - **Uitvoeren als:** `Ik` *(jouw eigen Google-account)*
   - **Wie heeft toegang:** `Iedereen` *(vereist zodat de PWA zonder Google OAuth-popup mag aanroepen; je persoonlijke `API_TOKEN` schermt alle requests af)*.
   - Klik op **Implementeren**, doorloop de eenmalige Google-toestemming en kopieer de **Web-app-URL** (eindigend op `/exec`).
6. *(Optioneel maar aanbevolen voor direct bewerken in Sheets)* Voeg bij **Triggers** (klok-icoon links) een trigger toe voor functie `handleSheetEdit` → *Uit spreadsheet* → *Bij bewerken*.
7. Open de PokéBinder PWA → ga naar **Meer → Instellingen**, schakel **Demo-modus** uit, vul de **Web-app-URL** en je **API-token** in, klik op **Verbinding testen** en daarna op **Opslaan & Synchroniseren**.

> **Let op bij aanpassingen in `Code.gs`:** Maak na codewijzigingen altijd een nieuwe versie via **Implementeren → Implementaties beheren → Bewerken → Nieuwe versie** zodat de bestaande `/exec`-URL de nieuwe code serveert.

---

### Stap B — GitHub Pages aanzetten

Deze repository bevat al een kant-en-klare GitHub Actions workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) die automatisch unit tests draait, de Angular PWA bouwt met de juiste `--base-href "/<repo-naam>/"`, een `404.html` SPA-fallback toevoegt en publiceert naar GitHub Pages.

1. Push deze repository naar GitHub op de branch `main` (`https://github.com/remcovolkers/jbm-pokemoncard-collection`).
2. Ga op GitHub naar **Settings → Pages**.
3. Kies onder **Build and deployment → Source** de optie **GitHub Actions**.
4. Ga naar het tabblad **Actions** en bekijk de workflow **Deploy PokéBinder PWA to GitHub Pages** (of start deze handmatig via *Run workflow*).
5. Zodra de job groen is, staat jouw PWA live op:
   **`https://remcovolkers.github.io/jbm-pokemoncard-collection/`**

---

### Stap C — PokéBinder installeren als PWA op je telefoon

- **Android (Chrome / Edge):**
  1. Open je GitHub Pages URL in Chrome.
  2. Tik op het menu (`⋮`) rechtsboven → **App installeren** (of **Toevoegen aan startscherm**).
  3. Bevestig met **Installeren**. PokéBinder verschijnt met eigen icoon op je startscherm en opent fullscreen zonder adresbalk.
- **iOS (Safari):**
  1. Open je GitHub Pages URL in Safari.
  2. Tik onderaan op het deel-icoon (**Deel** `↑`).
  3. Scroll naar beneden en tik op **Zet op beginscherm** → **Voeg toe**.
- **Offline gebruik op ruilavonden:** Open de app één keer met internet om je collectie, Pokédex Binder en kaart-artwork te cachen. Zonder bereik blijft alles direct bladerbaar en worden wijzigingen opgeslagen in de sync-wachtrij.

---

### Stap D — Android App (Capacitor APK), Automatische In-App Updates & Native Uitbreidingen

PokéBinder is ingepakt met **Capacitor 8** ([`capacitor.config.ts`](capacitor.config.ts) + `android/`), zonder dat de bestaande web/PWA-logica verandert. De PWA op GitHub Pages blijft 100% zelfstandig werken én installeerbaar.

#### 1. Automatische updates zonder nieuwe APK (*"Nieuwe versie beschikbaar"*)
Elke push naar `main` bouwt via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) zowel de GitHub Pages PWA als een Capacitor OTA web-bundle (`ota/web-bundle.zip`) + `version.json`:
- **Op de PWA (Web):** Angular `SwUpdate` detecteert direct de nieuwe versie en toont bovenin de banner **"Nieuwe versie beschikbaar → Nu bijwerken"**.
- **In de Android APK:** `@capgo/capacitor-updater` (100% self-hosted op GitHub Pages, geen betaald account nodig) downloadt `ota/web-bundle.zip` op de achtergrond en past de update met 1 tik toe zonder nieuwe APK te installeren — terwijl de app volledig **offline-first** blijft werken.

#### 2. Nieuwe Android APK bouwen & direct downloaden
Wanneer je een nieuwe APK wilt uitbrengen (bijvoorbeeld zodra je later Android-only plugins toevoegt zoals `@capacitor/local-notifications` of een Android home-screen widget):
1. Verhoog `"version"` (en bij verplicht nieuwe native plugins ook `"pokebinder.minNativeVersion"`) in `package.json`.
2. Push een tag (bijv. `git tag v1.1.0 && git push origin v1.1.0`) **óf** klik op GitHub bij **Actions → Build & Release Android APK → Run workflow**.
3. GitHub Actions bouwt de APK volledig in de cloud (zonder dat je lokaal Android Studio nodig hebt) en publiceert deze automatisch onder **GitHub Releases** met de vaste directe downloadlink:
   **`https://github.com/remcovolkers/jbm-pokemoncard-collection/releases/latest/download/pokebinder-release.apk`**
4. Gebruikers met een oudere APK zien automatisch een melding **"Nieuwe Android-app (APK) beschikbaar"** met een 1-klik **APK downloaden**-knop (ook altijd bereikbaar onder **Meer → Instellingen → App-versie & Android APK**).

*(Optioneel voor permanente Play Store / upgrade-signing: voeg in GitHub Settings → Secrets de variabelen `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` en `ANDROID_KEY_PASSWORD` toe. Zonder secrets tekent de workflow de APK automatisch met de debug keystore zodat je hem direct kunt delen en installeren.)*

#### 3. Lokaal werken met Android Studio & uitbreiden met Android-only functies
```bash
# Angular bouwen voor Capacitor en synchroniseren naar android/
npm run cap:sync

# Native Android-project openen in Android Studio
npm run cap:open
```
Alle platformdetectie en native hooks staan geïsoleerd in `src/app/core/platform/` ([`platform.service.ts`](src/app/core/platform/platform.service.ts) & [`app-update.service.ts`](src/app/core/platform/app-update.service.ts)), zodat je daar later schoon native notificaties of widgets aan kunt toevoegen zonder de PWA aan te tasten.

---

## Architectuur (Hexagonaal)

```text
src/
├── styles/                     # Gecentraliseerde Obsidian Vault TCG SCSS (geen Tailwind)
│   ├── _tokens.scss            # Kleuren, typografie, spacing, radii & CSS custom properties
│   ├── _mixins.scss            # Breakpoints, typography & slab mixins
│   ├── _base.scss              # Dark canvas reset & animaties
│   └── _components.scss        # Buttons, pills, switches, inputs & bottom sheets
└── app/
    ├── core/
    │   ├── domain/             # Pure TypeScript modellen, ROI, binder-posities, Pokédex regex
    │   ├── ports/              # Abstracte interfaces (CollectionRepository, CardCatalogPort)
    │   ├── adapters/           # TcgdexAdapter, AppsScriptSheetsAdapter, LocalCacheAdapter
    │   └── state/              # CollectionStore (Angular Signals)
    ├── shared/                 # Herbruikbare UI-componenten (o.a. CardArtwork)
    └── features/               # Standalone feature modules (dashboard, collection, quick-add,
                                # pokedex-binder, set-progress, wishlist, trades, settings)
```
