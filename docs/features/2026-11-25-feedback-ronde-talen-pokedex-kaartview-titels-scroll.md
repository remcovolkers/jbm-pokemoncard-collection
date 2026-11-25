# Feature Brief: Feedback-ronde Melli (6 punten) — Talen & Cardmarket, Pokédex Kaart-View, Nidoran, Set-titels & Scrollbehoud

- **Datum:** 2026-11-25
- **Status:** Gebouwd (zie 'Implementatie-notities' onderaan) — Goedgekeurd — keuzes 4.1 Optie B (Engelse kaartnaam + anderstalige scan/badge), 4.2 Cardmarket taal-URL gecontroleerd meenemen, 4.3 Optie A (Hero Card modal met Vorige/Volgende zonder Bevestig selectie) en 4.4 alle 3 consistentie-punten vastgesteld
- **Impactniveau:** Groot / Gecombineerde UX-, Data- & Workflow-verbetering over `Snel Toevoegen`, `Pokédex Binder`, `Collectie`, `Kaartdetail` & `Code.gs`
- **Release-type verwachting:** WebView OTA (`apkChanged: false`) + update van `apps-script/Code.gs` naar `v2.2.1` (voor tekst-opmaak van `5/11`-kaartnummers en taal-ondersteuning)

---

## 1. Samenvatting & Diagnose van alle 6 Feedback-items

We hebben alle 6 punten én Melli's 3 meegestuurde screenshots tegen de live data (`@jellybeanmels`) en de codebase geanalyseerd:

1. **[Idee] Snel Toevoegen — Simplified Chinese (`CHS`) toevoegen + taalgebonden ophalen & Cardmarket:**
   - *Huidige situatie:* `Simplified Chinese` ontbreekt in de standaard talenlijst (`EN, NL, JP, DE, FR, KR` — en `ZHT` uit Kaartspot), de taalkiezer zit weggestopt onderaan in *Meer opties*, `TcgdexAdapter` haalt altijd Engels (`/v2/en`) op en Cardmarket-links filteren niet op taal.
   - *API-bevinding:* **TCGdex ondersteunt wél gelokaliseerde endpoints** (`/v2/fr` met 203 sets, `/v2/de` met 157 sets, `/v2/nl` met de 3 officiële WOTC-sets, `/v2/ja` met 204 sets, `/v2/ko` met 95 sets, `/v2/zh-tw` met 98 Traditional Chinese sets én **`/v2/zh-cn` met 57 officiële Simplified Chinese sets**!) inclusief anderstalige kaartscans en `dexId` voor Pokédex-koppeling.
   - *Cardmarket-nuance:* De gratis publieke prijsfeed van TCGdex levert per kaart één algemene Cardmarket EUR-trend (Cardmarket geeft taal-gesplitste prijzen niet vrij zonder betaalde Seller OAuth API en blokkeert scraping via Cloudflare). **Wél** kunnen we elke **Cardmarket-knop/link direct op de exacte taal laten openen** (`&language=2` voor Frans, `&language=6` voor Simplified Chinese, `&language=12` voor Nederlands, enz.) én bij het zoeken direct de juiste TCGdex-taal gebruiken!

2. **[Bug] Pokédex Binder — *"Ik heb geen Nidoran maar binder zegt wel dat ik hem heb?"* (Screenshot 1):**
   - *Exacte oorzaak gevonden:* Op Melli's screenshot staat op de achtergrond in het binder-vakje `#0029` wél haar *Nidoran♀* (`JU 57` uit Jungle), maar zodra ze erop klikt zegt de popup: *"Nog geen kaart van Nidoran♀ gevonden in je Collectie"* terwijl `In Binder geplaatst` aan staat!
   - *Waarom:* Haar kaarten uit Kaartspot heten `"Nidoran ♀"` (`base2-57`) en `"Nidoran ♂"` (`base1-55`) **mét een spatie vóór het symbool**, terwijl `doesCardMatchPokemon` in `pokedex-matching.utils.ts` zocht op `"Nidoran♀"` zónder spatie (`Code.gs` stond die spatie al wel toe, Angular niet!).

3. **[Idee] Pokédex Binder — *"Wat betekent 'Bevestig selectie' überhaupt?"*:**
   - *Oorzaak:* In de huidige Pokédex-popup staat onderaan altijd een grote rode knop **`✓ Bevestig selectie`**, óók als je alleen kijkt en niets hebt aangepast. Dat voelt verwarrend en overbodig.

4. **[Idee] Pokédex Binder — Ander scherm bij aanklikken kaart in Pokédex Binder (Screenshot 2):**
   - *Wens uit Melli's screenshot:* Wanneer je op een gevulde kaart in de Pokédex Binder klikt (zoals haar *Dark Charizard*), verwacht ze een strakke **Collectie Hero-kaartweergave** (setbadge, titel, groot klikbaar kaart-artwork mét **`360°` 3D Showcase-knop**, Cardmarket-marktwaarde, waarde-statistieken en `Bekijk op Cardmarket`) — **zónder** de hele kolom met bewerk-invulvelden aan de rechterkant en zónder *"Bevestig selectie"*.

5. **[Idee] Collectie — *"Trainer kit kaarten hebben rare titels, en Chinese titels zijn ook heel vreemd (geen abbreviation)"* (Screenshot 3):**
   - *Dubbele oorzaak gevonden op Melli's screenshot van Machop:*
     1. **Google Sheets Datum-bug (`#Thu Nov 05 2026 00:00:00 GMT+0100...`):** Machop uit *DP Trainer Kit (Lucario)* heeft kaartnummer **`5/11`**. Google Sheets zag `"5/11"` bij het opslaan aan voor **5 november** en maakte er een JavaScript `Date` van! Dit raakt élke kleine set met `<= 31` kaarten (*Trainer Kits*, *McDonald's*, *Celebrations*, *POP*, *Dragon Vault*).
     2. **Rare set-badges bij Chinese & Trainer Kit kaarten + kleine letter `trainer`:** Voor Melli's Chinese kaarten (`Dragonite V` in *Final Flame Dance*) maakte PokéBinder de interne ID `zht-final-flame-dance-38`, waarna `getDisplaySetCode` de hele lange slug **`ZHT-FINAL-FLAME-DANCE`** als setcode-pil toonde i.p.v. de echte Chinese setcode (`CS4.5C` / `CS3AC`) of een korte afkorting (`FFD`), en TCGdex schreef `DP trainer Kit (Lucario)` met een kleine `t`.

6. **[Idee] Collectie — *"Pagina verspringt naar boven als ik een kaart verwijder"*:**
   - *Oorzaak gevonden in `src/app/app.ts`:* Een `effect()` op `currentUrl()` zet bij **elke** routewissel `.shell__main.scrollTop = 0`. Als je in een lange collectie naar beneden scrollt, een kaart opent om hem te verwijderen (of te bekijken/bewerken) en terugkomt op `/collectie`, springt het overzicht helemaal terug naar kaart #1 bovenaan.

---

## 2. Must-Have Scope (V1)

- [ ] **1. Volledige Taal-ondersteuning incl. Simplified Chinese (`CHS`) + Gelokaliseerde TCGdex & Cardmarket:**
  - Voeg **`CHS`** (*Simplified Chinese*) en **`ZHT`** (*Traditional Chinese*) standaard toe aan `DEFAULT_DROPDOWN_SETTINGS.languages` (`EN, NL, JP, DE, FR, KR, CHS, ZHT` + leesbare labels zoals `CHS — Simplified Chinese`, `ZHT — Traditional Chinese`, `FR — Frans`, enz. én automatisch aanvullen naast bestaande Google Sheet dropdown-lijsten zodat ze óók op al bestaande Sheets direct kiesbaar zijn!).
  - Verplaats op **Snel Toevoegen** de **Taal-kiezer naar boven bij het zoekveld** (compacte taal-pill/dropdown naast de zoekmodus) zodat je vóór het zoeken al bijv. `FR`, `DE`, `JP` of `CHS` kiest.
  - Laat `TcgdexAdapter` zoeken & ophalen in de gekozen TCGdex-taal (`/v2/fr`, `/v2/de`, `/v2/nl`, `/v2/ja`, `/v2/ko`, `/v2/zh-cn`, `/v2/zh-tw`, met automatische fallback naar `/v2/en` als een westerse set niet in bijv. `/v2/nl` bestaat) — inclusief de echte anderstalige kaartscan én automatische Pokédex-koppeling via `dexId` (`[DEX:0006]`) zodat ook `"Dracaufeu"` of `"喷火龙"` op `#0006 Charizard` matcht!
  - Geef aan alle **Cardmarket-links** (`resolveCardmarketUrl` + `Code.gs`) automatisch de juiste Cardmarket `language=`-filter mee (`1=EN`, `2=FR`, `3=DE`, `6=CHS`, `7=JP`, `10=KR`, `11=ZHT`, `12=NL`) zodat Cardmarket direct opent op kaarten in die taal.
- [ ] **2. Fix `Nidoran ♀` / `Nidoran ♂` (& speciale tekens) Pokédex-matching:**
  - Sta in `doesCardMatchPokemon` (`pokedex-matching.utils.ts` én `Code.gs`) optionele spaties vóór `♀`/`♂` toe (`"Nidoran ♀"` ↔ `"Nidoran♀"`, `"Nidoran ♂"` ↔ `"Nidoran♂"`) én herken tekstvarianten zoals `"Nidoran F"` / `"Nidoran (F)"` en `"Nidoran M"` / `"Nidoran (M)"`, plus ondersteuning voor `[DEX:xxxx]`-tags bij anderstalige kaartnamen.
- [ ] **3 & 4. Nieuwe Pokédex Binder Kaart-View (Hero Slab zonder inputvelden & zonder "Bevestig selectie"):**
  - Klikken op een gevuld Pokédex-vakje opent een schone **Showcase Kaart-modal / Sheet** geïnspireerd op Melli's screenshot (`Hero Card` uit Collectie):
    - Pokédex-badge (`#0006 · Pagina 1, Vakje 6`) + Setcode-pil (`TR #4/82`) + Zeldzaamheid + Taalbadge (indien niet EN).
    - Grote kaarttitel, setnaam, conditie & variant.
    - **Groot kaart-artwork** met directe **`360°` 3D Showcase-knop** (voor alle bijzondere kaarten) + `Vorige / Volgende` om tussen gevulde Pokédex-kaarten te bladeren!
    - Cardmarket Marktwaarde-blok + **`Bekijk op Cardmarket`** knop + subtiele secundaire knop **`Bewerken in Collectie`** (voor wie wél velden of verwijderen nodig heeft).
    - **Geen "Bevestig selectie" knop meer:** `★ Upgrade gewenst` wisselt **direct bij aantikken**, en als je meerdere kaarten van die Pokémon bezit (bijv. 3× Venusaur), kies je onderaan met 1 directe tik een andere versie.
  - Klikken op een **leeg / ontbrekend vakje** toont een compacte kaart met directe knop **`+ Zoek <Pokémon> om toe te voegen`** en een directe switch **`Handmatig als aanwezig markeren`** (slaat direct op zonder bevestig-knop).
- [ ] **5. Fix Google Sheets Datum-corruptie (`5/11`) + Schone Trainer Kit & Chinese Set-titels:**
  - Zet in `Code.gs` (`v2.2.1`) kolom `D` van *Collectie* en kolom `C` van *Verlanglijst* vóór het schrijven expliciet op platte tekst (`setNumberFormat('@')`).
  - **Automatisch zelf-herstel voor Melli's bestaande Sheet:** Herken in zowel `Code.gs` (`readCollection_` / `readWishlist_`) als in Angular (`card-id.utils.ts`) verminkte datum-kaartnummers (`Date`-objecten of strings met `GMT` / `Standard Time`) en herstel het echte kaartnummer direct uit `cardId` (zodat Machop `tk-dp-l-5` meteen weer netjes **`TK-L #5/11`** toont zonder opnieuw te hoeven importeren!).
  - Haal voor Chinese Pikaqian-kaarten uit Kaartspot de echte setcode uit het pad (`cs4.5c` → **`CS4.5C`**, `cs3ac` → **`CS3AC`**), verbeter `getDisplaySetCode` zodat lange custom ID's nooit meer als `ZHT-FINAL-FLAME-DANCE` op een badge verschijnen maar een korte 3–4 letter code krijgen, en corrigeer TCGdex-titels zoals `"DP trainer Kit"` → **`"DP Trainer Kit"`**.
- [ ] **6. Scrollpositie behouden bij kaart verwijderen & terugkeren naar Collectie:**
  - Bewaar in `CollectionViewStateService` (en op shell-niveau in `App`) de scrollpositie van `/collectie` wanneer je doorklikt naar `/collectie/kaart/...`, en herstel die exacte scrollpositie wanneer je een kaart verwijdert, opslaat of op *Terug* klikt (in plaats van hard naar `scrollTop = 0` te springen!).

---

## 3. Ideeën van de Business Analyst ("Consistentie-scan & Wat past hier logisch bij?")

### Consistentie-scan: Soortgelijke plekken in de app
- [ ] **1. Taalkiezer & Cardmarket taal-link óók op Kaartdetail (`CardDetailComponent`) & Verlanglijst (`WishlistComponent`):** Op Kaartdetail tonen we een taalbadge en maken we de taal aanpasbaar (mocht een kaart per ongeluk als `EN` zijn ingevoerd terwijl het `FR` of `CHS` is), waarna *"Bekijk op Cardmarket"* meteen met de juiste `&language=`-filter opent.
- [ ] **2. Scrollbehoud óók bij terugkeren vanuit Kaartdetail naar `Ruil & Verkoop` of `Dashboard`:** Als je vanaf *Ruil & Verkoop* op een kaart klikt en teruggaat, behouden we daar óók netjes je scrollpositie (terwijl wisselen tussen hoofd-tabbladen via het menu nog steeds fris bovenaan opent).
- [ ] **3. `Vorige / Volgende` (en swipe!) in de nieuwe Pokédex Binder Kaart-View:** Net zoals bij Kaartdetail kun je in de geopende Pokédex-kaartview met `← / →` of links/rechts swipen direct doorbladeren naar de vorige/volgende Pokémon in je binder!

### Logische vervolgstappen (V2 / Later)
- [ ] **Optionele Cardmarket OAuth / Prijs-scraper per taal:** Mocht Cardmarket of Scrydex in de toekomst openbare per-taal prijstrends aanbieden zonder login, dan kunnen we die direct koppelen.

---

## 4. Open Beslispunten voor Samen Beoordelen

1. **Kaartnaam bij anderstalige kaarten (Frans / Duits / Japans / Simplified Chinese) in Snel Toevoegen:**
   - **Optie A *(Aanbevolen)*:** Gebruik de **echte kaartnaam en kaartscan in de gekozen taal** vanuit TCGdex (dus bijv. Frans `"Bulbizarre"` met Franse scan, of Simplified Chinese `"妙蛙种子"` met Chinese scan) én koppel op de achtergrond automatisch het Pokédex-nummer (`[DEX:0001]`) zodat hij in de **Pokédex Binder én bij zoeken op "Bulbasaur" gewoon gevonden en gekoppeld wordt**!
   - **Optie B:** Houd de kaartnaam altijd in het Engels (`"Bulbasaur"`) en gebruik alleen de taalbadge (`FR` / `CHS`) + taal-gefilterde Cardmarket-link.
2. **Cardmarket taal-prijzen realiteitscheck:**
   - Omdat Cardmarket geen openbare gratis API heeft voor losse Franse/Chinese dagprijzen (alleen een algemene EUR-trend per kaart, plus taalfilter op de website zelf), vullen we de algemene Cardmarket-trend in (met duidelijke label-hint bij niet-EN kaarten) én openen we de knop **"Bekijk op Cardmarket"** direct gefilterd op de exacte kaarttaal (`&language=2` voor Frans, `&language=6` voor Simplified Chinese, enz.). Is die aanpak helemaal goed?
3. **Nieuwe Pokédex Binder Kaart-View (#3 & #4):**
   - **Optie A *(Aanbevolen)*:** Open bij klikken op een gevulde Pokédex-kaart de schone **Hero Card modal** (zoals op Melli's screenshot: groot klikbaar artwork + `360°` 3D Showcase, prijs, `Bekijk op Cardmarket`, directe `★ Upgrade gewenst`-knop, directe variant-wisselaar als je meerdere versies hebt, `Vorige / Volgende` bladeren, en een klein knopje *"Bewerken in Collectie"* — helemaal zónder *"Bevestig selectie"*!).
   - **Optie B:** Zelfde Hero Card modal, maar zonder `Vorige / Volgende` bladeren tussen Pokédex-vakjes.
4. **Consistentie Quick Wins (sectie 3):**
   - Nemen we **alle 3** de consistentie-punten (taal ook wijzigbaar op Kaartdetail, scrollbehoud op álle terug-navigaties vanaf Kaartdetail, en swipe/`← →` in de Pokédex Kaart-View) meteen mee?

---

## 5. Implementatie-notities (afwijkingen & restpunten)

- **Taal (Optie B):** kaartnaam blijft Engels; westerse talen (FR/DE/NL/ES/IT/PT) gebruiken dezelfde kaart-ID met de anderstalige scan en set-naam, Aziatische talen (JP/KR/CHS/ZHT) worden via `dexId` gekoppeld (`/cards?dexId=eq:N`). Anderstalige scans worden als `[IMG:…]` in de notities bewaard zodat ze na een sync zichtbaar blijven. Bestaat de kaart niet in de gekozen taal, dan valt de app terug op de Engelse gegevens.
- **Cardmarket:** `language=`-filter wordt bij het openen aan de link toegevoegd (Kaartdetail & Pokédex-kaartview); opgeslagen links in Sheets blijven taalloos.
- **Chinese set-badge:** lange custom slugs (`ZHT-FINAL-FLAME-DANCE`) worden nu automatisch verkort tot een 2–4 letter afkorting (`FFD`). De echte Pikaqian-setcode (`CS4.5C`) wordt (nog) niet persistent opgeslagen — kandidaat voor een vervolgstap.
- **`[DEX:xxxx]`-tags** zijn niet nodig gebleken door Optie B (Engelse naam blijft behouden).
- **Verlanglijst:** heeft nu een taalveld (Sheets-kolom N "Taal"), een taalbadge en een Cardmarket-knop met taalfilter; de TCGdex-lookup gebruikt de gekozen taal.
- **Code.gs v2.2.2 (was v2.2.1):** (aanvullend: Setcode-kolom in Set Voortgang, Taal-kolom op Verlanglijst) kaartnummer-kolommen als platte tekst + zelfherstel van datum-verminkte nummers, Nidoran F/M-varianten, CHS/ZHT automatisch in de Taal-dropdown. Gebruikers moeten Code.gs eenmalig bijwerken.

