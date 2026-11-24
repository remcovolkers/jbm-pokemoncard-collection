# Feature Brief: UX Slag B — Slankere Mobiele Quick Add, Collectie Filter-Sheet & Pokédex 3×3 Fit

- **Datum:** 2026-11-24
- **Status:** Concept — wacht op gezamenlijke review
- **Impactniveau:** Groot / Mobiele Ergonomie & Invoer-versnelling
- **Release-type verwachting:** WebView OTA (`apkChanged: false`)

---

## 1. Samenvatting & Doel
- **Kernvraag van gebruiker:** De 3 meest gebruikte mobiele kernflows (*Kaart Toevoegen*, *Collectie* en *Pokédex Binder*) slanker, minder overweldigend en veel ruimer boven de vouw maken.
- **Gebruikersprobleem:**
  - `/toevoegen` toont meteen een hele invulmuur (*Variant, Conditie, Grading, Locatie, Herkomst, Aantal/Prijs/Taal, Te ruil*) met uitgeschakelde knoppen nog vóórdat een kaart is gezocht, plus demo-chips in live-modus en twee volgepropte Opslaan-knoppen naast elkaar op 390 px.
  - `/collectie` heeft op mobiel een 3-lagige sticky header en zet `×1` op het HP-getal van élke losse kaart.
  - `/pokedex` duwt bij het standaard `3×3`-formaat net de 3e rij vakjes onderaan achter de mobiele navigatiebalk weg door 3 filterrijen boven de binder.
- **Belangrijkste gebruiksmomenten:**
  - *Mobiel (onderweg / pack opening / snelle binder-check):* Direct overzicht over alle 9 vakjes op 3×3, razendsnel kaarten invoeren zonder onnodig scrollen, rustige 2-koloms collectie met één tap naar krachtige filters.
  - *Desktop (thuis met muis/toetsenbord):* Inline filterbalk blijft op `/collectie` bewaard (waar breedte zat is), én `/toevoegen` krijgt dezelfde nette *Terug naar collectie*-knop als Kaartdetail.

---

## 2. Gebruikersverhalen & Kernflows
1. Als verzamelaar wil ik op mobiel in **Pokédex Binder (3×3)** alle 9 vakjes van de actieve pagina direct in één blik zien zonder steeds omhoog en omlaag te moeten schuiven.
2. Als ik een kaart toevoeg op `/toevoegen`, wil ik eerst rustig focussen op **Kaart vinden** en daarna alleen de velden invullen die ertoe doen (*Variant, Conditie, Map*), terwijl zelden veranderde velden (*Grading, Herkomst, Taal*) netjes ingeklapt blijven tenzij ik ze nodig heb.
3. Als ik op mobiel door **Collectie** scroll, wil ik maximaal veel van de kaarten zien met één strakke zoekbalk + **Filter-knop** (die een nette bottom-sheet opent) en alleen een tellerbadge (`×2`, `×3`) bij echte dubbele kaarten.

---

## 3. Must-Have Scope (UX Slag B — per onderdeel aan/uit te vinken)
- [ ] **1. Kaart Toevoegen (`/toevoegen`) — Progressive Disclosure & Slimme Opslaan-knop ([`quick-add.component.html`](../../src/app/features/quick-add/quick-add.component.html), [`.ts`](../../src/app/features/quick-add/quick-add.component.ts)):**
  - **Snel-chips op basis van modus:** Toon *Snel testen* (`DLR 11`, `MEW 181`...) uitsluitend in **Demo-modus**; toon in **Live-modus** je **3 laatst gebruikte setcodes** (idealiter uit recente kaarten / laatste `Pack Opening` invoer) om in 1 tik door te zoeken.
  - **Compacter handmatig & formulieropbouw (Progressive Disclosure):** Zet *Handmatig invoeren* als subtiele link/knop onder de zoekbalk, en bundel zelden veranderde opties (*Grading Slab Status, Herkomst, Taal, Aankoopprijs & Te ruil*) in één inklapbare accordeon **"Meer opties"** met live samenvatting (*bijv. `Raw · EN · Niet te ruil`*).
  - **Slimmere `.qa-dock` opslaan-acties:**
    - Pack Opening Mode **UIT:** één heldere primaire CTA **"Opslaan"** (gaat terug / slaat op) + compacte knop ernaast voor *"+ Nog een"*.
    - Pack Opening Mode **AAN:** één heldere primaire CTA **"Opslaan & Volgende kaart"** (zonder tweeregelige tekstpropping op 390 px).
  - **Consistente desktop header:** Vervang zwevende `×` op desktop (`/toevoegen`) door *Terug naar collectie* zoals op Kaartdetail.
- [ ] **2. Collectie (`/collectie`) — 1-rij Mobiele Controls + Filter Sheet & `>1` Hoeveelheidsbadge ([`collection.component.html`](../../src/app/features/collection/collection.component.html), [`.scss`](../../src/app/features/collection/collection.component.scss)):**
  - Verberg `×1` op losse kaarten in kaartengallery; toon `×2`, `×3`, … alleen bij dubbele exemplaren (`card.quantity > 1`).
  - **Mobiel (`< 768 px`):** Slank de sticky header af naar één zoek-/weergave-balk (`[Zoekbalk] [Filters (N)] [Grid/Lijst]`) + één compacte waardestrip (`25 kaarten (32×) · € 2.875,82`). Tikken op **Filters** opent een mobiele **Filter Bottom Sheet** (`pb-sheet--structured` + `pbSheetDismiss`) voor *Sortering, Set, Zeldzaamheid, Opslaglocatie* en *Alleen Te Ruil*, met directe *Filters resetten*-knop.
  - **Desktop (`>= 768 px`):** Behoud directe inline filters & sortering (want desktop heeft de breedte wél).
- [ ] **3. Pokédex Binder (`/pokedex`) — 3×3 Pagina Past in Eén Blik op Mobiel ([`pokedex-binder.component.html`](../../src/app/features/pokedex-binder/pokedex-binder.component.html), [`.scss`](../../src/app/features/pokedex-binder/pokedex-binder.component.scss)):**
  - Zet op mobiel (`< 768 px`) de *Generatie*-pills om naar een compacte `<select>`-dropdown direct naast de formaatkiezer `3×3 (9)` (en comprimeer/balanceer de Controls-hoogte), zodat alle 9 pockets van een 3×3 pagina in één blik zonder verticaal scrollen boven de bottom nav zichtbaar blijven. (Op desktop blijven de 10 generatie-pills op 1 strakke rij behouden.)

---

## 4. Ideeën van de Business Analyst ("Wat past hier logisch bij?")

### Consistentie-scan: Soortgelijke plekken in de app
*Andere schermen/onderdelen die naadloos op deze slankere mobiele flows aansluiten:*
- [ ] **Set Voortgang → "+ Kaart uit set toevoegen" ([`set-progress.component.html`](../../src/app/features/set-progress/set-progress.component.html)):** Momenteel opent klikken op een set in `/meer/sets` alleen jouw *bestaande* kaarten in Collectie. Voeg op elke setkaart (en optioneel in Collectie bij actief setfilter) een secundaire knop toe die `/toevoegen` direct opent in *Alle Sets*-modus met die specifieke set al ingeladen!
- [ ] **Kaartdetail mobiele quick-actions ([`card-detail.component.html`](../../src/app/features/collection/card-detail.component.html)):** Maak de Hero-kaart op mobiel compacter (of plaats een compacte `− 1× +` & *Te ruil*-schakelaar hoog in beeld) zodat de meest voorkomende mutatie direct bereikbaar is zonder eerst voorbij het grote artwork en de Cardmarket-knop te scrollen.

### Aanbevolen om direct mee te nemen (V1 Quick Wins)
- [ ] **Herbruikbare Filter Bottom Sheet-patronen:** Gebruik dezelfde `ModalScrollLockService` + `pbSheetDismiss` + veilige onderactie *Toepassen (X resultaten)* als alle andere bottom sheets in de app, zodat filteren op mobiel exact vertrouwd aanvoelt.
- [ ] **Slimme accordeon-state onthouden op Quick Add:** Klap *"Meer opties"* alleen automatisch open als er via een duplicaat/prefill specifieke afwijkende waarden actief zijn (of gebruiker dat aanlaat in Pack Opening Mode).

### Logische vervolgstappen (V2 / Later)
- [ ] **Virtual scrolling / paginering in Collectie boven 400+ kaarten** (soepel renderen op Android bij grote Master Sets).
- [ ] **Bulk-selectie & multi-edit in Collectie** (meerdere kaarten tegelijk verplaatsen of op *Te ruil* zetten).

### Bewust Buiten Scope (V1)
- Camera / OCR-scanner op `/toevoegen` (vereist native Capacitor Camera plugin en APK-release).
- Wijzigingen aan shell/dashboard/instellingen (worden apart aangepakt in [UX Slag A Feature Brief](./2026-11-24-ux-slag-a-shell-dashboard-beheer.md)).

---

## 5. UX- & Schermimpact (Mobiel & Desktop)
- **Mobiel (`390×844`):**
  - Collectie krijgt ~65 px extra kaartruimte + schoner kaartartwork zonder ruisende `×1`-badges.
  - Pokédex Binder `3×3` wordt in één schermhoogte zichtbaar zonder de onderste vakjes achter `.bottom-nav` te verliezen.
  - Quick Add slankt af zodat een nieuw toegevoegde kaart binnen één snelle blik op *Variant / Conditie / Map / Opslaan* ingevuld kan worden.
- **Desktop (`1440×900`):** Inline filters in Collectie en 1-rij Generatie-pills in Pokédex blijven volledig intact; Quick Add krijgt een consistente *Terug naar collectie*-header.
- **Playwright aandachtspunt:** Controleer dat bestaande en nieuwe E2E-tests (`e2e/ux-layout.spec.ts` en `e2e/interactive-ui-walkthrough.spec.ts`) netjes zowel via mobiele Filter Bottom Sheet (`[Filters]`) als via desktop inline filters werken.

---

## 6. Data-, Google Sheets- & Sync-impact
- **Domain modellen & Apps Script:** Geen wijzigingen nodig (`apps-script/Code.gs` blijft 100% ongemoeid).
- **LocalStorage:** Optioneel 3 recent gebruikte setcodes op `/toevoegen` lokaal opslaan.
- **Release-impact:** Pure web/UI-wijziging -> `apkChanged: false` (WebView OTA + PWA).

---

## 7. Acceptatiecriteria & Testplan (`ui-ux-reviewer` + Playwright)
1. **Collectie mobiel (`390×844`):** Sticky header is max 2 compacte regels (`[Zoek] [Filters] [Grid/Lijst]` + waardestrip); openen/toepassen/wissen in Filter Bottom Sheet werkt zonder overflow; losse kaarten met `quantity === 1` tonen geen `×1` pill op het artwork.
2. **Pokédex mobiel (`390×844`):** Alle 9 pockets van een `3×3` pagina vallen op pagina 1 volledig boven `.bottom-nav` (zichtbaar in `mobile/06-pokedex.png`).
3. **Quick Add (`/toevoegen`):** Live-modus toont geen `Snel testen`-chips; *"Meer opties"* accordeon klapt soepel open/dicht; één heldere primaire actieknop passend bij Pack Opening Mode; zero regressies op budget of `mobile-ui.spec.ts`.
4. **`ui-ux-reviewer` gate:** Visuele inspectie op `mobile/` + `desktop/` screenshots bevestigt ruimer ritme en `GO`-verdict.

---

## 8. Open Beslispunten voor Samen Beoordelen
1. **Collectie mobiel: verplaatsen we de 4 filters + sortering inderdaad naar een `Filters`-bottom-sheet?**
   - *Aanbevolen:* Ja — geeft je op 390 px direct meer dan de helft extra kaartruimte bij scrollen (en op desktop blijft alles direct zichtbaar).
2. **`×1`-badge op unieke kaarten verbergen in Collectie?**
   - *Aanbevolen:* Ja — dubbele exemplaren (`×2`, `×3`, …) springen er dan meteen veel duidelijker uit zonder de artwork-hoekjes onnodig te vullen.
3. **Welke slag bouwen we eerst: [UX Slag A](./2026-11-24-ux-slag-a-shell-dashboard-beheer.md) of UX Slag B (of beide achtereenvolgens)?**
   - *Aanbevolen:* Starten met **UX Slag A** (Shell, Dashboard, slimme Kaartdetail-dock, Verlanglijst, Ruil & Instellingen — laag risico, meteen overal rust en logica) en direct daarna **UX Slag B** (mobiele Quick Add, Collectie Filter-Sheet & Pokédex 3×3 fit).
