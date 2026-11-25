# Feature Brief: Kaartspot Binder Import & Slimme Sync

- **Datum:** 2026-11-25
- **Status:** Goedgekeurd — keuzes 8.1 A, 8.2 A, 8.3 B (centraal in Instellingen & Sync) en 8.4 A vastgesteld
- **Impactniveau:** Groot / Nieuwe externe platform-sync (`Collectie` + `Pokédex Binder` + optioneel `Verlanglijst` & `Code.gs`)
- **Release-type verwachting:** WebView OTA (`apkChanged: false`) + update van `apps-script/Code.gs` naar `v2.2.0` (1-klik kopieerbaar via Instellingen, Web App `/exec`-URL blijft 100% gelijk)

---

## 1. Samenvatting & Doel
- **Kernvraag van gebruiker:** De gedeelde Kaartspot-link `https://kaartspot.nl/wrapped/jellybeanmels?cat=c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8` bevat alle kaarten uit Melany's Pokédex-binder op Kaartspot (inclusief "greyed out" doelkaarten die ze nog niet heeft, zoals *Treecko*). Hoe halen we dat onderscheid zuiver uit de data en bouwen we een makkelijke, herhaalbare sync naar PokéBinder?
- **Technische bevinding op de live Kaartspot-data (`jellybeanmels`):**
  1. **Publiek JSON-endpoint gevonden:** Elke Kaartspot wrapped-link (`/wrapped/<username>?cat=<binderId>`), profiellink (`/profiel/<username>?tab=binder&binder=<binderId>`) of losse gebruikersnaam mapt onder water direct naar één compact, publiek JSON-endpoint:
     `GET https://kaartspot.nl/api/binder-publiek/<username>` (`~84 KB`, `formaat: 2`).
  2. **Greyed-out (*Treecko*) is 100% expliciet te herkennen via veld `nogNodig`:**
     - In kolom `19` (`nogNodig`) van de API-response staat per kaart exact `0` (in bezit) of `1` (greyed out / *"nog nodig"*):
       - **In bezit (`nogNodig: 0`):** **266 kaarten** (bijv. *Bulbasaur* `sv7-143` Stellar Crown IR, *Dark Charizard* `base5-4`, enz.).
       - **Greyed out (`nogNodig: 1`):** **14 kaarten**, waaronder inderdaad **Treecko** (`mep-55`, *Mega Evolution Black Star Promos #55*, `vakje: 251` = `#0252`, `nogNodig: 1`), *Igglybuff*, *Wobbuffet V*, *Hitmontop*, *Smoochum*, *Grovyle*, *Sceptile*, *Blaziken*, *Mudkip*, *Marshtomp*, *Swampert*, *Wurmple*, *Silcoon* en *Cascoon*.
  3. **Exact Pokédex-vakje én rijke kaartmetadata aanwezig:**
     - `vakje` (`0`-gebaseerd) in de Pokédex-binder komt exact overeen met `dexNumber - 1` (bijv. *Bulbasaur* `vakje: 0` → `#0001`, *Dark Charizard* `vakje: 5` → `#0006`, *Treecko* `vakje: 251` → `#0252`), plus `grid_size: 20` (`5×4` binder-layout).
     - Elke rij bevat al: `naam`, `set`, `nummer`, Scrydex/CDN-afbeeldingspad (`fotoBegin` + `fotoRest`, bijv. `sv7-143/small`, én directe afbeelding-URL's voor haar 3 Chinese `ZHT`-kaarten zoals *Dragonite V*), `zeldzaamheid`, `conditie` (`NM`, `LP`, `PO`), `druk` (`normal`, `holofoil`, `reverse_holofoil`, `first_edition`, `poke_ball_reverse_holofoil`, stamped variants), `grader` + `cijfer`, `taal` (`EN`, `NL`, `DE`, `FR`, `ZHT`), `aantal` en `waardeCents` (marktwaarde in eurocenten).
  4. **Geen CORS-probleem dankzij Google Apps Script (`Code.gs`):**
     - `kaartspot.nl` stuurt geen browser-CORS header (`Access-Control-Allow-Origin`) mee, waardoor een directe `fetch()` vanuit de browser geblokkeerd wordt.
     - Omdat PokéBinder al op **Google Apps Script (`UrlFetchApp.fetch`)** draait, haalt `Code.gs` de JSON **server-side zonder enige CORS-beperking** in `< 300 ms` op én schrijft hij 266+ kaarten in **één bulk-operatie (1–2 seconden)** weg in Google Sheets!
- **Belangrijkste gebruiksmomenten:**
  - *Eerste overstap (porten):* Plak één keer de Kaartspot-link of gebruikersnaam (`jellybeanmels`), controleer de visuele preview (`266 in bezit` vs. `14 nog nodig`), en zet in één klik de hele Pokédex-binder over.
  - *Periodieke bijwerk-sync (mobiel of desktop):* Voegt Mel later op Kaartspot kaarten toe of vinkt ze *Treecko* af als gevonden? Eén tik op **"Sync met Kaartspot"** haalt alleen het verschil (*delta*) binnen zonder duplicaten.

---

## 2. Gebruikersverhalen & Kernflows
1. **Link of gebruikersnaam plakken → Directe Preview:** Als gebruiker plak ik `https://kaartspot.nl/wrapped/jellybeanmels?cat=c4c1bf4b-...` (of typ ik alleen `jellybeanmels`). PokéBinder herkent automatisch de gebruikersnaam én selecteert direct de juiste binder (`Pokedex`, omdat `cat=c4c1bf4b-...` in de URL staat), en toont een heldere samenvatting vóór er iets wordt opgeslagen.
2. **Zuiver onderscheid tussen Bezit en Greyed-out (*Treecko*):** Kaarten met `nogNodig === 0` (`266 stuks`) gaan naar `Collectie` én worden op het exacte Pokédex-nummer (`#0001–#1025`) gekoppeld en aangevinkt in `Pokédex Binder`. Greyed-out kaarten met `nogNodig === 1` (`14 stuks`, zoals *Treecko*) worden **nooit** als bezit gemarkeerd, maar kunnen optioneel met 1 vinkje op de **Verlanglijst** worden gezet.
3. **Herhaalbare Delta-Sync zonder dubbele kaarten:** Als ik een week later opnieuw synchroniseer met hetzelfde Kaartspot-account, herkent PokéBinder welke Kaartspot-items al eerder geïmporteerd zijn (`[KS:<id>]`-anker / `cardId`-match), voegt alleen nieuwe kaarten toe, en promoveert kaarten die op Kaartspot van `nogNodig: 1` naar `nogNodig: 0` zijn gegaan automatisch van Verlanglijst → Collectie + Pokédex Binder.

---

## 3. Must-Have Scope (V1)
- [ ] **Slimme Kaartspot URL- & Profiel-parser (`src/app/core/domain/kaartspot-sync.utils.ts`):**
  - Accepteert elke vorm: `/wrapped/<user>?cat=<uuid>`, `/profiel/<user>?tab=binder&binder=<uuid>`, `/api/binder-publiek/<user>` of los `<user>`.
  - Decodeert Kaartspot `formaat: 2` (`kolommen` + `teksten`-woordenboek + `items`), filtert `soort === 1` (sealed producten zoals boosterboxen) netjes uit kaart-imports, en splitst zuiver op `nogNodig === 0` (in bezit) vs. `nogNodig === 1` (greyed out / gezocht).
- [ ] **Automatische Kaart-ID & Metadata-vertaling (Kaartspot/Scrydex → PokéBinder/TCGdex):**
  - Vertaalt Scrydex-codes uit `fotoRest` (`sv7-143` → `sv07-143`, `sv3pt5-5` → `sv03.5-005`, `me2pt5-240` → `me02.5-240`, `mep-55` → `mep-055`, `me55-120` + `'30th Celebration'` → `30th-120`) + fallback op `inferCardIdFromSetAndNumber(set, nummer)`.
  - Mapt `druk` (`holofoil` → `Holo`, `reverse_holofoil` / `poke_ball_reverse_holofoil` / `love_ball_reverse_holofoil` → `Reverse Holo`, `first_edition*` → `First Edition`, `*_stamp` / `prerelease` / `staff` → `Stamped / Promo`), `conditie` (`NM` → `Near Mint (NM)`, `LP` → `Light Played (LP)`, `PO` → `Poor (PO)`), `grader`/`cijfer`, `taal` (incl. `ZHT`) en `waardeCents / 100` (`marketPrice`).
  - Bewaart voor niet-Engelse/Chinese exclusives (`ZHT`, zoals Melany's *Dragonite V* uit *Final Flame Dance*) de directe CDN-afbeelding zodat er géén lege kaartvakjes ontstaan in de Pokédex Binder!
- [ ] **Server-side Fetch & Supersnelle Bulk-Sync in `apps-script/Code.gs` (`v2.2.0`):**
  - Nieuwe acties `previewKaartspot` (haalt via `UrlFetchApp.fetch` zonder CORS de publieke JSON op en geeft de geparseerde binders terug aan de app) en `syncKaartspot` (schrijft alle nieuwe collectierijen, `Set Voortgang`, `Pokédex Binder` kolom `D` + `I` + `H4` layout en optioneel `Verlanglijst` in één gebatchte Google Sheets-operatie weg binnen ~2 seconden, zonder formule-kolommen `R:T`, `D:H` of `I:J` aan te raken!).
- [ ] **Interactieve Sync-Preview & Binder-kiezer in PokéBinder:**
  - Toont alle gevonden publieke binders van het Kaartspot-account (met de binder uit `?cat=` standaard aangevinkt), aantallen (`266 in bezit`, `14 nog nodig`, totale waarde `€ 3.225,22`), keuzeschakelaar voor de `nogNodig: 1`-kaarten, en een **"Nu synchroniseren"**-knop + bewaarde koppeling voor latere **1-klik Her-sync**.

---

## 4. Ideeën van de Business Analyst ("Wat past hier logisch bij?")

### Consistentie-scan: Soortgelijke plekken in de app
*Waar verwacht een gebruiker deze Kaartspot-sync tegen te komen of terug te zien?*
- [ ] **1. Instellingen & Sync (`/meer/instellingen` — `SettingsComponent`) *(Sterk aanbevolen)*:** Een vaste kaart **"Externe Collectie Sync (Kaartspot)"** direct bij *Synchronisatie*, gekoppeld aan het actieve Sheet-profiel (zodat bijv. het profiel *Mel (Live)* haar eigen `@jellybeanmels`-koppeling onthoudt en jouw profiel de jouwe!).
- [ ] **2. Pokédex Binder (`/pokedex` — `PokedexBinderComponent`) *(Sterk aanbevolen)*:** Een compacte **"Kaartspot Sync"**-knop in de binder-balk (én een directe CTA wanneer een Pokédex Binder nog leeg is), zodat je vanuit de Pokédex Binder zelf met 1 tik bijwerkt zonder eerst naar Instellingen te navigeren.
- [ ] **3. Verlanglijst (`/meer/verlanglijst` — `WishlistComponent`) *(Aanbevolen)*:** De 14 greyed-out kaarten (`nogNodig: 1`, zoals *Treecko MEP #055*) zijn op Kaartspot al tot op de exacte set & kaart uitgekozen als binder-target. Door ze optioneel als Verlanglijst-items mee te nemen (met notitie `Pokédex #0252 · Kaartspot target`), staan ze meteen klaar met 3D Showcase en budgettracking!
- [ ] **4. Overige binders op hetzelfde Kaartspot-profiel (`Collectie` & `Set Voortgang`):** Op dezelfde API-call van `@jellybeanmels` staan óók haar **Shrouded Fable Masterset** (`126 kaarten` in bezit) en **Dragonair-binder** (`2 in bezit · 59 nog nodig`). Door in het Sync-scherm vinkjes per Kaartspot-binder te tonen, kan ze desgewenst in één moeite óók die andere mappen meenemen (met `binderDetail` = naam van de Kaartspot-map, bijv. `Kaartspot · Shrouded Fable Masterset`).
- [ ] **5. Google Sheets Menu (`⚡ Pokémon API / PokéBinder` in `Code.gs`):** Ook een menu-item **"🔗 Synchroniseer vanaf Kaartspot..."** rechtstreeks in Google Sheets zelf, handig als iemand op desktop in de spreadsheet werkt.

### Aanbevolen om direct mee te nemen (V1 Quick Wins)
- [ ] **1. Automatische Promotie bij Her-sync (`nogNodig: 1 → 0`):** Als *Treecko* vandaag als `nogNodig: 1` op de Verlanglijst belandt en Mel vinkt hem volgende maand op Kaartspot aan als verkregen (`nogNodig: 0`), markeert de volgende Kaartspot-sync het Verlanglijst-item automatisch als **Gevonden** én plaatst hij *Treecko* in `Collectie` + vakje `#0252` van de `Pokédex Binder`!
- [ ] **2. Binder-formaat (`grid_size`) optioneel overnemen:** Melany's Pokédex op Kaartspot gebruikt `grid_size: 20` (`5×4`, exact ondersteund door PokéBinder!). Bij de eerste import bieden we een vinkje om het binder-formaat direct op `5×4 (20)` te zetten zodat haar pagina-indeling 1-op-1 klopt.
- [ ] **3. Demo-modus / Offline JSON-plak fallback:** Heeft iemand nog géén Google Sheet gekoppeld (Demo-modus), dan kan diegene met 1 knop de publieke JSON-link openen en plakken om de hele Kaartspot-binder direct in PokéBinder uit te proberen.

### Logische vervolgstappen (V2 / Later)
- [ ] **Kaartspot Actieve Verkoop-listings syncen naar `Te Ruil / Verkoop`:** `@jellybeanmels` heeft op Kaartspot ook 78 actieve verkoop-listings staan (via Kaartspot's publieke Supabase `listings`-tabel). In V2 kunnen we die optioneel koppelen aan `forTrade = true` / `Trade Binder`.
- [ ] **Automatische achtergrond-sync op tijdschema (Apps Script dagelijkse trigger):** Dat Google Sheets elke nacht zelf checkt of er iets op Kaartspot is veranderd, zonder zelfs op de knop te hoeven drukken.
- [ ] **Export vanuit PokéBinder → CSV/Kaartspot:** Andersom exporteren vanuit PokéBinder.

### Bewust Buiten Scope (V1)
- **Inloggen met Kaartspot-wachtwoord of cookies:** Niet nodig en onveilig — de publieke binder-endpoint `/api/binder-publiek/<username>` levert alle publieke mappen al volledig zonder login.
- **Sealed producten (`soort: 1`, zoals haar 5 items in de map *Sealed*) importeren in `Collectie`:** PokéBinder's `Collectie` is gebouwd op losse TCG-kaarten; die 5 sealed items tonen we netjes als *"5 sealed items overgeslagen"* in het sync-verslag zodat er geen vervuilde kaartrijen ontstaan.

---

## 5. UX- & Schermimpact (Mobiel & Desktop)
- **Routes / Navigatie:** Geen extra hoofdtab nodig; een strakke **Kaartspot Sync-kaart** in `/meer/instellingen` + een herbruikbare **Kaartspot Sync Modal / Bottom Sheet** die je zowel vanuit `/pokedex` als `/meer/instellingen` opent.
- **Mobiel (`390×844`):**
  - Stap 1: URL of `@gebruikersnaam` plakken → knop **Binders ophalen** (`>= 44 px`).
  - Stap 2: Overzichtelijke vinklijst van gevonden binders (met `Pokedex` automatisch geselecteerd als `?cat=` in de geplakte link zat) + duidelijke badges `266 in bezit` (emerald) en `14 greyed-out / nog nodig` (amber) + keuze wat er met `nogNodig: 1` gebeurt.
  - Stap 3: Duidelijke voortgangsstatus tijdens de bulk-sync en toast met samenvatting (`"266 kaarten gesynchroniseerd naar Collectie & Pokédex Binder, 14 op Verlanglijst gezet"`).
- **Desktop (`1440×900`):** Ruime preview met voorbeeld van de gevonden mappen en snelle **1-klik Opnieuw synchroniseren**-knop zodra een profiel gekoppeld is.

---

## 6. Data-, Google Sheets- & Sync-impact
- **Per-profiel opslag (`models.ts`):** Optionele velden `kaartspotUsername?: string` en `kaartspotDefaultBinderId?: string` op `SheetProfile` / `AppConnectionConfig`, zodat elk Google Sheet-profiel (bijv. *Remco* vs. *Mel*) zijn eigen Kaartspot-koppeling onthoudt!
- **Deduplicatie & Idempotentie zonder nieuwe verplichte kolommen:**
  - In `Collectie` kolom `V` (`Notities`) en `Verlanglijst` kolom `K` (`Notities`) bewaren we een compacte, mensvriendelijke sync-tag (bijv. `Kaartspot sync [KS:2c69167c]`) naast de Cardmarket-link.
  - Daarnaast kunnen we optioneel `imageUrl` meeleveren/cachen voor niet-Engelse kaarten (`ZHT`) waarvan TCGdex EN geen scan heeft.
- **Formule-veiligheid (`Code.gs`):**
  - Schrijft in `Collectie` uitsluitend `A:Q`, `U:V` en `W` (`Herkomst = "Kaartspot Sync"`); formules in **`R:T` blijven 100% onaangeroerd**.
  - Schrijft in `Pokédex Binder` uitsluitend `H4` (optioneel), kolom `D` (`In Binder?`) en kolom `I` (`Gekozen Kaart / Art`) op exact `vakje + 1` (gevalideerd met Pokémon-naam); formules in **`E:H` blijven 100% onaangeroerd**.
  - Schrijft in `Verlanglijst` uitsluitend `A:H`, `K:L` en `M` (`Kaart-ID`); formules in **`I:J` blijven 100% onaangeroerd**.

---

## 7. Acceptatiecriteria & Testplan (`ui-ux-reviewer` + Playwright)
1. **Functioneel:**
   - Plakken van `https://kaartspot.nl/wrapped/jellybeanmels?cat=c4c1bf4b-b193-4b0d-a9b3-8e0b3390b0f8` herkent `jellybeanmels`, selecteert automatisch binder `Pokedex` (`c4c1bf4b-...`), telt exact **266 in bezit** en **14 nog nodig** (waaronder *Treecko* `mep-055` op `#0252` als **niet in bezit**).
   - Tweemaal achter elkaar op *Synchroniseren* klikken maakt **0 dubbele rijen** aan in `Collectie`, `Pokédex Binder` of `Verlanglijst`.
   - *Dark Charizard* (`vakje: 5`) landt netjes op `#0006 Charizard`, *Bulbasaur* (`sv07-143`) op `#0001`, en *Treecko* (`nogNodig: 1`) staat **niet** aangevinkt als `In Binder`.
2. **Mobiele & Desktop UX (Headless Playwright Chromium):**
   - Nul horizontale overflow op `390×844` en `1440×900`, alle knoppen/inputs `>= 44 px`, geen micro-scrollbars op `/meer` of `.sidebar`.
3. **Tests:**
   - Uitgebreide unit-tests voor `kaartspot-sync.utils.spec.ts` (inclusief echte snapshot-fixture van `jellybeanmels` met *Bulbasaur*, *Dark Charizard*, *Treecko* `nogNodig: 1`, `ZHT` *Dragonite V* en `Sealed` uitsluiting).
   - Apps Script tests (`test:apps-script`) voor `previewKaartspot` + idempotente bulk `syncKaartspot` zonder formule-overschrijving.
   - Headless Playwright E2E verificatie.

---

## 8. Open Beslispunten voor Samen Beoordelen
1. **Wat doen we standaard met greyed-out kaarten (`nogNodig: 1`, zoals de 14 kaarten waaronder *Treecko*)?**
   - **Optie A *(Aanbevolen)*:** Keuze-schakelaar in het Sync-scherm (standaard **AAN**): zet `nogNodig: 1`-kaarten automatisch op de **Verlanglijst** (met exacte set, nummer, variant, prijs en `Pokédex #0252` notitie), en zet ze **niet** in Collectie / `In Binder`. (Je kunt het vinkje per sync ook uitzetten om ze helemaal te negeren.)
   - **Optie B:** Negeer `nogNodig: 1`-kaarten altijd volledig (alleen `nogNodig: 0` importeren).
2. **Welke binders uit het Kaartspot-profiel ondersteunen we in het Sync-scherm?**
   - **Optie A *(Aanbevolen)*:** Toon **alle publieke kaarten-binders** van het profiel met vinkjes (waarbij de binder uit `?cat=...` — dus `Pokedex` — automatisch als enige voorgeselecteerd staat, maar je óók bijv. haar *Shrouded Fable Masterset (126)* of *Dragonair (2 + 59)* kunt aanvinken).
   - **Optie B:** Alleen de Pokédex-binder ondersteunen.
3. **Waar in de app plaatsen we de Kaartspot Sync-knop (en onthouden per Sheet-profiel)?**
   - **Optie A *(Aanbevolen)*:** Zowel bij **Instellingen & Sync** (gekoppeld aan het actieve Sheet-profiel, zodat *Mel* en *Remco* elk hun eigen Kaartspot-account kunnen koppelen) **áls** een directe **"Kaartspot Sync"**-knop bovenin **Pokédex Binder** (+ menu-optie in Google Sheets zelf).
   - **Optie B:** Alleen onder **Instellingen & Sync**.
4. **Bestaande kaarten bij een eerste import / her-sync:**
   - **Optie A *(Aanbevolen)*:** Veilige **Merge / Aanvul-sync**: voeg ontbrekende kaarten toe, koppel de gekozen Kaartspot-kaart als actieve voorkeurskaart op het Pokédex-vakje, en sla kaarten met dezelfde `[KS:<id>]` (of exact dezelfde `cardId + variant` in diezelfde binder) bij een volgende sync over zodat je nooit duplicaten krijgt en handmatig ingevulde aankoopprijzen behouden blijven.
   - **Optie B:** Overschrijf Pokédex Binder volledig met alleen wat op Kaartspot staat.
