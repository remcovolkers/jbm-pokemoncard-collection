# Feature Brief: 3D Kaart Showcase & Verlanglijst Grail-View

- **Datum:** 2026-11-24
- **Status:** Gebouwd — alle keuzes goedgekeurd (inclusief app-brede regel *"Bijzondere kaart = bijzondere view"*: uitsluitend Rare+ / Illustration Rare+, geen Commons/Uncommons, en officiële Pokémon TCG achterkant)
- **Impactniveau:** Groot / Nieuw interactief showcase-component & uitbreiding zusterschermen
- **Release-type verwachting:** WebView OTA (`apkChanged: false`) — puur CSS 3D + Pointer Events zonder extra native of zware 3D-libraries

---

## 1. Samenvatting & Doel
- **Kernvraag van gebruiker:** Wanneer je op de **Verlanglijst** een kaart aanklikt, opent een indrukwekkende **Showcase-view ("even de show stelen")** waarin je je favoriete of gezochte droomkaart groot kunt bewonderen én interactief in 3D kunt ronddraaien.
- **Gebruikersprobleem:** Op dit moment zijn kaarten op de Verlanglijst kleine, niet-aanklikbare miniaturen (`wl-card__art`), en zelfs in Collectie → Kaartdetail toont de vergroting (`.art-lightbox`) alleen een plat, statisch plaatje. Juist bij Pokémon TCG draait de beleving om holo-lichtinval, textuur, voor- en achterkant en het trots laten zien van je *Grails* of *Top-kaarten*.
- **Belangrijkste gebruiksmomenten:**
  - *Mobiel (kaartbeurs / vrienden / winkel):* Je tikt op een droomkaart op je Verlanglijst om hem schermvullend met je duim in 3D rond te draaien, aan een verkoper te tonen (*"Ik zoek deze in min. NM voor max € 160"*), of op *Auto-Showcase* te zetten als draaiend pronkstuk.
  - *Desktop (thuis / collectie & grail-jacht):* Met muisbeweging en klik-en-slepen laat je het holo-licht over je favoriete kaarten glijden, blader je met `← / →` langs al je Verlanglijst-targets en spring je met 1 klik door naar Cardmarket.

---

## 2. Gebruikersverhalen & Kernflows
1. **Verlanglijst Showcase openen:** Als verzamelaar wil ik op het artwork of de kop van een Verlanglijst-kaart kunnen tikken/klikken, zodat de kaart direct opent in een donkere, museum-waardige **3D Showcase** zonder dat de bewerk-/verwijderknoppen op de kaarttegel in de weg zitten.
2. **360° Ronddraaien & Holo-licht:** Als ik met mijn vinger sleep (mobiel) of met de muis beweeg/sleep (desktop), wil ik de kaart soepel in **3D kunnen kantelen én 360° om zijn as draaien** (voorzijde met dynamische holo-glans + gestileerde Pokémon TCG-achterzijde), of via **Auto-Showcase** rustig automatisch laten rondzweven.
3. **Directe Grail-context & actie:** Terwijl ik een Verlanglijst-kaart bewonder, wil ik in één oogopslag mijn **Max Target vs. Markttrend** (binnen/boven budget), gewenste variant/conditie en notitie zien, met `Vorige / Volgende` door mijn lijst bladeren en direct naar **Cardmarket**, **Bewerken** of **Gevonden → Toevoegen** kunnen doorklikken.

---

## 3. Must-Have Scope (V1)
- [ ] **Herbruikbaar `<pb-card-showcase>` 3D-component (`src/app/shared/card-showcase/`):**
  - Echte **CSS 3D `preserve-3d` kaart** op hoge resolutie artwork (`high` kwaliteit uit TCGdex/Limitless/PokémonTCG fallback-keten) met afgeronde TCG-hoeken, subtiele kaartdikte/randglans en een strakke, offline-veilige **vector TCG-achterkant** (nul externe netwerkafhankelijkheid).
  - **Interactief 3D-draaien (60fps GPU-accelerated):**
    - *Vinger-drag (mobiel) & klik-en-sleep (desktop):* Vrij 360° draaien om de Y-as + subtiele X-as kanteling om zowel voorkant, lichtinval als achterkant te bekijken.
    - *Muis-hover (desktop zonder klikken):* Subtiele 3D holo-tilt richting de cursor.
    - *Showcase-controls onder de kaart:* **`Omdraaien (180°)`**, **`Auto-Showcase`** (rustige vitrine-rotatie aan/uit) en **`Reset hoek`** (of dubbeltik op de kaart).
- [ ] **Variant-bewuste Holo / Foil Glans-engine:**
  - De lichtreflectie past zich aan op de kaartvariant (`desiredVariant` / `variant`):
    - *Normal:* Subtiele glossy toploader/sleeve-reflectie.
    - *Reverse Holo:* Zachte iriserende foil-gloed met schuine lichtbaan.
    - *Holo / Full Art / Alt Art / First Edition / Stamped:* Rijke meerlaagse regenboog-holofoil + diagonale specular glare + subtiele sterrenglans die meebeweegt met de draaihoek.
    - *Grail-aura:* Kaarten met prioriteit `Grail` (of hoge marktwaarde) krijgen een subtiele warme gouden achtergrondgloed in de showcase-stage.
- [ ] **Verlanglijst Showcase-integratie (`WishlistComponent`):**
  - Tikken/klikken op het kaart-artwork of de titel/header van een Verlanglijst-kaart opent de Showcase (met subtiel `360°`-icoontje op het artwork als visuele cue).
  - Compact info-paneel onder de 3D-kaart met: Prioriteit-pill, `Gewenste variant · min. Conditie`, `Markttrend` vs. `Max Target` + budget-statusbadge, eventuele notitie, **`Vorige / Volgende`** om door je huidige Verlanglijst-filter te bladeren, en snelle knoppen (**Cardmarket**, **Bewerken**, **Gevonden → Toevoegen**).
  - Sluiten via `×`, `Escape` of klik naast het paneel (`ModalScrollLockService` actief, zonder conflict tussen 3D-drag op de kaart en achterliggende pagina-scroll).

---

## 4. Ideeën van de Business Analyst ("Wat past hier logisch bij?")

### Consistentie-scan: Soortgelijke plekken in de app
*Omdat we `<pb-card-showcase>` modulair bouwen, zijn er 4 zusterschermen waar verzamelaars óók een kaart aanklikken om hem groot te bewonderen:*
- [ ] **1. Kaartdetail Vergroting / Lightbox vervangen (`CardDetailComponent`) *(Sterk aanbevolen)*:** Vervang de huidige platte `.art-lightbox` op `/collectie/kaart/:rowIndex/:cardId` door dezelfde **3D Kaart Showcase** (inclusief `Vorige / Volgende` door je gefilterde collectie). Zo stelen óók je eigen bezeten topkaarten de show!
- [ ] **2. Dashboard — "Top Waardevolste Kaarten" (`DashboardComponent`) *(Aanbevolen)*:** Voeg op de Top-5 kaarten op het Dashboard een directe `360° Showcase`-knop toe (naast het openen van Kaartdetail), zodat je vanaf het startscherm met 1 tik je pronkstukken in 3D kunt laten zien.
- [ ] **3. Pokédex Binder — Gekozen kaart in Slot-sheet (`PokedexBinderComponent`):** Maak de kaart-thumbnail in de geopende Pokédex-slot bottom sheet aanklikbaar om die specifieke binder-kaart groot in 3D te bekijken.
- [ ] **4. Ruil & Verkoop — Trade Binder preview (`TradesComponent`):** Maak het kaart-artwork op je *Te Ruil / Verkoop*-kaarten aanklikbaar voor de 3D Showcase (ideaal op een beurs om een ruilkaart + marktwaarde schermvullend te tonen).

### Aanbevolen om direct mee te nemen (V1 Quick Wins)
- [ ] **1. Slimme Cardmarket-knop op Verlanglijst & in de Showcase:** Als je in `Notities` al een `cardmarket.com`-URL hebt geplakt opent hij exact die link; anders bouwt hij automatisch de juiste Cardmarket zoek-URL (`cardName + cardNumber`), net zoals op Kaartdetail.
- [ ] **2. Graded Slab-badge / Case-accent (voor Collectie-kaarten):** Als een kaart uit je Collectie een grading heeft (`PSA 10`, `BGS 9.5`, `CGC 10`, d.w.z. `grading !== 'Raw'`), toont de 3D Showcase bovenaan de kaart een strak **Graded Slab-label** met maatschappij + cijfer en een extra kristalheldere acryl-randreflectie.
- [ ] **3. Toetsenbordsneltoetsen op Desktop + `prefers-reduced-motion`:** `← / →` voor Vorige/Volgende kaart, `Spatie` of `F` voor 180° flip, `R` voor Auto-Showcase aan/uit, `Escape` voor sluiten, én nette terugval zonder draai-duizeligheid als het OS `prefers-reduced-motion: reduce` aan heeft staan.

### Logische vervolgstappen (V2 / Later)
- [ ] **Telefoon-gyroscoop kanteling (`DeviceOrientationEvent`):** De kaart laten meebewegen door je telefoon fysiek te kantelen (vereist op iOS een expliciete permissie-popup en kalibratie; daarom bewust V2 na vinger-drag + Auto-Showcase).
- [ ] **Eigen voor-/achterkant foto's uploaden (Google Drive):** Voor het inspecteren van echte whitenings/centering van een fysiek exemplaar (raakt opslag & Apps Script).
- [ ] **Deelbare "Grail Poster" / Screenshot-modus:** Eén knop die UI-knoppen tijdelijk verbergt zodat je een strakke social/WhatsApp-screenshot van je 3D Grail of Top-kaart maakt.

### Bewust Buiten Scope (V1)
- **Zware WebGL / Three.js libraries:** Niet nodig — moderne CSS 3D-transforms (`perspective`, `rotateX/Y`, `mix-blend-mode` / gelaagde foil-gradients) zijn 0 kB extra dependencies, starten instant in 1 frame en houden de bundel superslank.
- **Google Sheets of `Code.gs` wijzigingen:** Alle benodigde velden (`cardId`, `imageUrl`, `desiredVariant`/`variant`, `priority`, `minCondition`/`condition`, `grading`, `grade`, `marketPrice`, `maxBudget`, `notes`) bestaan al in het huidige datamodel!

---

## 5. UX- & Schermimpact (Mobiel & Desktop)
- **Routes / Navigatie:** Fullscreen overlay-modal (`role="dialog"`, `aria-modal="true"`) bovenop het huidige scherm, zodat je filterpositie en scrollpositie op Verlanglijst (en Collectie/Dashboard) 100% behouden blijven bij sluiten.
- **Mobiel (`390×844`):**
  - `touch-action: none` uitsluitend op het 3D-kaartvlak zodat vinger-slepen boterzacht de kaart draait zonder dat de pagina meescrollt of per ongeluk horizontale pagina-swipe triggert.
  - Alle actie- en navigatieknoppen (`Omdraaien`, `Auto-Showcase`, `Vorige`, `Volgende`, `Sluiten`) zijn minimaal `44×44 px`.
  - Bovenste 60–65% van het scherm is puur het zwevende 3D-podium; onderste compacte glas-kaart toont de kerncijfers en acties zonder dat iets buiten `390×844` valt.
- **Desktop (`1440×900` & `1280×768`):**
  - Royaal gecentreerd showcase-podium (of side-by-side kaart links + Grail-details rechts op brede schermen) met muis-tilt, klik-en-sleep 360°-rotatie en volledige toetsenbordbediening.
- **Lege-, laad- & foutstaten + Demo-modus:**
  - Werkt 100% direct in **Demo-modus** op alle voorbeelditems op Verlanglijst (zoals *Umbreon VMAX Alt Art*, *Lugia V*, enz.).
  - Heeft een handmatig toegevoegde wens nog geen `cardId` of bekend artwork? Dan rendert de voorkant een stijlvolle, luxe **PokéBinder Mystery Grail-kaart** met kaartnaam, set en gewenste variant in goudfolie-typografie die je evengoed in 3D kunt ronddraaien!

---

## 6. Data-, Google Sheets- & Sync-impact
- **Domain modellen (`models.ts`):** Geen wijzigingen aan `WishlistItem` of `CollectionCard` nodig; alleen een licht intern UI-viewtype `ShowcaseCardItem` dat zowel een `WishlistItem` als een `CollectionCard` kan afbeelden.
- **Google Sheets & `apps-script/Code.gs`:** **Geen wijzigingen nodig** — alle tabbladen en formule-kolommen (`I:J` in *Verlanglijst*, `R:T` in *Collectie*) blijven 100% onaangeroerd.
- **Release-impact:** **100% WebView OTA (`apkChanged: false`)** — rolt na push direct als lichte in-app update uit zonder nieuwe Android APK.

---

## 7. Acceptatiecriteria & Testplan (`ui-ux-reviewer` + Playwright)
1. **Functioneel:**
   - Klikken op Verlanglijst-kaart opent de 3D Showcase met juiste naam, set, variant-holo, budgetvergelijking en werkende `Vorige / Volgende`.
   - Slepen (`pointerdown` → `pointermove`) verandert daadwerkelijk `rotateY`/`rotateX` (inclusief doordraaien naar de achterkant > 90° en 360° rond), `Omdraaien` flipt tussen 0° en 180°, en `Auto-Showcase` zet continue vitrine-rotatie aan/uit.
   - Knoppen `Bewerk`, `Verwijder` en `Gevonden → Toevoegen` op de Verlanglijst-tegel zelf openen **niet** per ongeluk de Showcase (`stopPropagation` / eigen klikzone op artwork + kop).
2. **Mobiele & Desktop UX (Headless Playwright Chromium):**
   - Nul horizontale overflow op `390×844` en `1440×900`, alle showcase-knoppen `>= 44×44 px`, `Escape` en sluitknop sluiten netjes zonder scroll-sprong.
3. **Tests:**
   - Unit-/integratietests in `features.integration.spec.ts` voor openen, 3D pointer-rotatie, flippen, Auto-Showcase, Vorige/Volgende en Cardmarket-URL opbouw.
   - Uitbreiding van `e2e/interactive-ui-walkthrough.spec.ts` (headless Chromium) met openen, draaien/flippen en sluiten van de Showcase zonder console-errors of overflow.

---

## 8. Open Beslispunten voor Samen Beoordelen
1. **Interactiegevoel van het draaien:**
   - **Optie A *(Aanbevolen)*:** Vrije **360° ronddraai-modus** bij slepen (zowel voor- als achterkant zichtbaar + kanteling voor holo-licht) + muis-hover tilt op desktop + knoppen **`🔄 Omdraaien`** en **`✨ Auto-Showcase`** (rustig vanzelf ronddraaiende vitrine-modus).
   - **Optie B:** Alleen beperkte kanteling (±25° tilt) met een losse knop voor 180° omdraaien.
2. **Klikgedrag op de Verlanglijst-kaart:**
   - **Optie A *(Aanbevolen)*:** Zowel het **kaart-artwork** (met subtiel `360°`-icoontje) als de **kaarttitel/kop** zijn aanklikbaar om de Showcase te openen; de losse knoppen (`Bewerk`, `Verwijder`, `Gevonden → Toevoegen`) behouden gewoon hun eigen directe functie.
   - **Optie B:** Alleen het kaart-artwork opent de Showcase.
3. **Consistentie op zusterschermen (welke pakken we meteen mee in V1?):**
   - **Verlanglijst** *(altijd in V1)*
   - **Kaartdetail Lightbox** *(aanbevolen: vervangt de platte vergroting bij je eigen collectiekaarten)*
   - **Dashboard Top 5 Waardevolste Kaarten** *(aanbevolen: snel pronken vanaf je startscherm)*
   - **Pokédex Binder** *(kaart-thumbnail in geopende slot-sheet)* en/of **Ruil & Verkoop**
4. **V1 Quick Wins:** Nemen we de **3 aanbevolen Quick Wins** (slimme Cardmarket-knop in Showcase, Graded Slab-label bij PSA/BGS/CGC collectiekaarten, en desktop sneltoetsen `←/→/Spatie/R`) allemaal direct mee?
