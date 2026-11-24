# Feature Brief: Instant Lokaal Opslaan + Persistente Achtergrond-Sync & Snelle Sheets-Backend

- **Datum:** 2026-11-24
- **Status:** Gebouwd (2026-11-24) — alle V1-onderdelen + aanbevolen BA Quick Wins geïmplementeerd & geverifieerd
- **Impactniveau:** Groot / Architectuur, Snelheid & Dataveiligheid (App-breed + Google Apps Script)
- **Release-type verwachting:** WebView OTA (`apkChanged: false`) *(plus aanbevolen update van [`apps-script/Code.gs`](../../apps-script/Code.gs) in je Google Sheet voor maximale backend-snelheid, 100% backwards-compatible met oudere Apps Script-versies)*

---

## 1. Samenvatting & Doel
- **Kernvraag van gebruiker:** Bij het toevoegen van kaarten duurt het syncen veel te lang. Kaarten moeten **meteen lokaal zichtbaar en opgeslagen** zijn (zonder wachten) terwijl het wegschrijven naar Google Sheets betrouwbaar op de achtergrond gebeurt — uiteraard zonder dat er ook maar één kaart verloren gaat of formules/rijnummers scheeflopen.
- **Waarom het nu zo traag aanvoelt (oorzaakanalyse in de codebase):**
  1. **UI blokkeert op elke netwerk-roundtrip ([`quick-add.component.ts`](../../src/app/features/quick-add/quick-add.component.ts#L741-L808), [`collection.store.ts`](../../src/app/core/state/collection.store.ts#L704-L755)):** `saveCard()` zet `isSaving.set(true)` en doet `await this.store.addCard(...)`, wat weer `await this.dispatchRemoteMutation(...)` blokkeert (`collection.store.ts#L1341-L1387`). Pas als Google Apps Script helemaal klaar is, roept `QuickAddComponent` `prepareNextCard()` of `router.navigateByUrl('/collectie')` aan! De hele `.qa-dock` blijft dus meerdere seconden bevroren per kaart.
  2. **Apps Script stuurt na Élke kaart de complete 7-tabblad bootstrap terug ([`Code.gs`](../../apps-script/Code.gs#L685-L689)):** Elke `doPost` (`addCard`, `updateCard`, `deleteCard`, etc.) roept als laatste `buildBootstrapPayload_(ss)` aan en leest alle rijen uit *Collectie*, *Set Voortgang*, alle *1.025* rijen van *Pokédex Binder*, *Verlanglijst*, *Ruil & Verkoop*, *Feedback* en *Instellingen*.
  3. **`syncPokedexBinder_` leest validaties over 1.025 rijen ook bij 1 kaart ([`Code.gs`](../../apps-script/Code.gs#L1649-L1650)):** Zelfs als `addCard` `filterCardNames` meegeeft (`[cardData.name]`), haalt `syncPokedexBinder_` eerst `valRange.getDataValidations()` op over álle ~1.025 rijen van de Pokédex voordat de for-loop doorheeft dat er maar 1 Pokémon is aangeraakt. Bovendien roept `handleAddCard_` zonder `card.seriesName`/`setTotalCards` soms ook extra `UrlFetchApp.fetch` calls naar TCGdex aan.
  4. **Geen crash-bestendige "write-ahead" outbox vóór verzenden:** Nu komt een mutatie pas in `pendingQueue` (`pokebinder_offline_queue_v1`) als de netwerkcall *faalt* of je al offline bent. Als achtergrond-sync non-blocking wordt en je ondertussen doornavigeert, de app sluit of een pas toegevoegde kaart meteen bewerkt (terwijl deze nog een tijdelijke negatieve `rowIndex < 0` heeft), heb je een echte persistente outbox met coalescing en rijnummer-remapping nodig.
- **Belangrijkste gebruiksmomenten:**
  - *Pack Opening / stapels kaarten toevoegen (`/toevoegen`):* Elke tik op **Opslaan & Volgende kaart** (of `+ Nog één` / duplicaat `+1`) is in `< 10 ms` klaar: kaart verschijnt direct in de collectie/duplicaatdetectie/Pokédex, invoerveld wordt direct leeggemaakt en focust meteen op de volgende kaart — terwijl op de achtergrond netjes wordt weggeschreven.
  - *Browsen & bewerken (`/collectie`, Kaartdetail, Pokédex, Verlanglijst, Ruil & Verkoop):* Ook na navigatie naar Collectie of het aanpassen/verwijderen van een zojuist toegevoegde kaart blijft alles lokaal consistent en veilig gesynchroniseerd.

---

## 2. Gebruikersverhalen & Kernflows
1. Als verzamelaar wil ik na een tik op **Opslaan** of **Opslaan & Volgende kaart** binnen een oogwenk door kunnen naar mijn Collectie of de volgende kaart, zonder op de Google Sheets API te hoeven wachten.
2. Als ik achter elkaar 10–20 kaarten uit een booster box invoer, wil ik dat die mutaties slim gebundeld en zonder haperen op de achtergrond naar Google Sheets worden gestuurd terwijl mijn lokale overzicht al 100% up-to-date is (collectiewaarde, Set Voortgang, Pokédex Binder en duplicaatdetectie).
3. Als ik meteen na het toevoegen op een kaart tik om het aantal aan te passen of als ik de app tussentijds sluit/herlaad voordat de achtergrond-sync klaar is, mag er nooit data verdwijnen en moet de app de wijziging na herstarten automatisch alsnog naar Google Sheets sturen.

---

## 3. Must-Have Scope (V1 — Thorough Local-First & Snelle Sync)
- [x] **1. Instant Local-First Opslaan (0 ms UI-blokkade):**
  - Splits elke mutatie in `CollectionStore` in twee duidelijke stappen:
    1. **Synchrone lokale commit (meteen klaar):** werk `snapshot()` bij (`collection`, `setProgress`, `pokedex`, `wishlist`, `trades`), bewaar direct in `LocalCacheAdapter` (`pokebinder_snapshot_v1_<profileId>`) én voeg de mutatie met een uniek `clientMutationId` direct **vóór** verzending toe aan een persistente **Outbox** (`PendingMutation` in `localStorage`).
    2. **Non-blocking achtergrond-sync:** start direct de achtergrond-sync-worker (`void this.scheduleRemoteSync()`), zonder dat UI-acties (`QuickAddComponent`, `CardDetailComponent`, `WishlistComponent`, `TradesComponent`, `PokedexBinderComponent`) op netwerkverkeer wachten.
  - Toast-meldingen en UI-feedback kloppen eerlijk: lokaal direct opgeslagen (bijv. *"Mew ex lokaal opgeslagen — wordt naar Google Sheets gesynct"* of compact in de bestaande *Sync-pil* i.p.v. foutieve *"Pokédex gesynct!"* vóór bevestiging).
- [x] **2. Bulletproof Outbox: Coalescing, Temp-Row Remapping & Conflictbescherming:**
  - **Temp-row remapping:** Nieuwe kaarten krijgen lokaal een negatief tijdelijk `rowIndex` (`-1`, `-2`, …). Zodra `addCard` van Google Sheets zijn echte `rowIndex` (bijv. rij `42`) terugkrijgt, vervangt de store dat tijdelijke `rowIndex` zowel in `snapshot().collection` **als in eventuele volgende wachtende outbox-items** (en corrigeert desgewenst een actieve `/collectie/kaart/-1/...` route terwijl onopgeslagen `editDraft`-wijzigingen behouden blijven).
  - **Slimme outbox-coalescing (minder netwerkverkeer & nul dubbele rijen):**
    - `addCard(-1)` + `updateCard(-1)` terwijl `-1` nog in de wachtrij staat → samengevoegd tot één bijgewerkte `addCard` payload.
    - `addCard(-1)` + `deleteCard(-1)` terwijl `-1` nog in de wachtrij staat → beide annuleren elkaar lokaal zonder onnodige Sheet-call!
    - Meerdere `updateCard` calls op dezelfde kaart (bijv. `3×` snel op `+` tikken) → samengevoegd tot één `updateCard` met de laatste staat.
    - Meerdere `updatePokedexSlot` calls voor dezelfde Pokémon → samengevoegd tot één update.
  - **Strenge `syncFromRemote`-beveiliging:** Achtergrond-`bootstrap()` / pull mag nooit de lokale `snapshot()` overschrijven zolang de Outbox nog niet-bevestigde mutaties bevat of net aan het flushen is; bij app-start in live modus wordt altijd eerst een niet-lege outbox leeggewerkt vóórdat de verse bootstrap wordt binnengehaald.
- [x] **3. Apps Script Backend Versnelling ([`apps-script/Code.gs`](../../apps-script/Code.gs)) — 100% Backwards-Compatible:**
  - **`syncPokedexBinder_` gericht optimaliseren:** Zoek bij `filterCardNames` eerst welke 1–2 Pokédex-rijen uit `dexRows` matchen en lees alleen voor dié rijen `getDataValidation()`, i.p.v. 1.025 rijen `getDataValidations()` op te vragen bij elke toegevoegde kaart.
  - **Nieuwe `batchMutations` POST-actie + lichte `skipBootstrap: true` modus:**
    - Bundelt 2..N wachtende mutaties uit de client-outbox in één HTTPS-request → 1× `LockService`, 1× batch `syncPokedexBinder_(ss, touchedCardNames)` aan het einde, en retourneert per mutatie de echte `rowIndex` + pas aan het einde één schone snapshot.
    - Bij een enkele losse write kan `skipBootstrap: true` worden gebruikt (ack alleen `{ rowIndex, cardId }` → bespaart ~70% Sheets read-tijd op elke losse add!), terwijl de laatste achtergrond-reconcile zo nodig stilletjes synchroniseert.
  - **Veilige fallback voor niet-bijgewerkte Sheets:** Als een gebruiker zijn Google Apps Script nog niet geüpdatet heeft (actie `'Onbekende POST-actie: batchMutations'`), schakelt de adapter automatisch over op losse sequentiële calls zonder dat iets faalt — mét optioneel vriendelijk berichtje in Instellingen (*"Snellere batch-sync beschikbaar"*).
- [x] **4. Transparante Sync-status & Browser/Tab-sluitbeveiliging:**
  - De bestaande `.sync-pill` (desktop zijbalk + mobiele topbar) toont duidelijk het live wachtrij-aantal: bijv. `Syncen (3)…`, `Wachtrij (3)` (bij offline/fout met tik om handmatig opnieuw te proberen) → `Gesynct` zodra alles veilig in Google Sheets staat.
  - Registreer in de browser `window.addEventListener('beforeunload', ...)` (waarschuwing als je het tabblad sluit terwijl er nog niet-gesyncte items in-flight zijn; voor mobiel/Capacitor blijft alles al direct veilig in `localStorage` bewaard voor automatische sync bij heropening).

---

## 4. Ideeën van de Business Analyst ("Wat past hier logisch bij?")

### Consistentie-scan: Soortgelijke plekken in de app
*Niet alleen Quick Add heeft last van wachtende Google Sheets calls — álle mutaties lopen via dezelfde store:*
- [x] **[`QuickAddComponent`](../../src/app/features/quick-add/quick-add.component.ts#L732-L808):** Zowel `saveCard(false)`, `saveCard(true)` als `incrementDuplicate()` moeten instant zijn zonder UI-freeze; bij `Pack Opening Mode` direct leegmaken + focus naar volgend kaartnummer.
- [x] **[`CardDetailComponent`](../../src/app/features/collection/card-detail.component.ts#L311-L344):** `saveDraft()` en `deleteActiveCard()` roepen nu al `goBack()` vóór `await`, maar blokkeren wél de gedeelde `mutationChain` voor acties erna (als je daarna snel een andere kaart opent of wijzigt) en overschrijven zonder temp-row coalescing mogelijk met een verouderde snapshot. Dankzij dezelfde Outbox werkt snel doorbladeren en direct achter elkaar meerdere kaarten bewerken veel vloeiender en veiliger.
- [x] **[`PokedexBinderComponent`](../../src/app/features/pokedex-binder/pokedex-binder.component.ts#L371-L404):** `confirmSlotSelection()` en vooral `quickPlaceReadySlot()` (die nog `await` doet vóór de toast!) worden meteen instant bij snel achter elkaar afvinken van Pokémon.
- [x] **[`WishlistComponent`](../../src/app/features/wishlist/wishlist.component.ts#L163-L195):** `saveNewWish()` (nieuw/bewerken), `markFoundAndAdd()`, `markFoundOnly()` en `confirmDeleteItem()` blokkeren het bottom-sheet nog tot Apps Script klaar is → voortaan instant sluiten + achtergrond-sync (inclusief veilig `addWishlist(-1)` → `markWishlistFound(-1)` / `updateWishlist(-1)` remapping).
- [x] **[`TradesComponent`](../../src/app/features/trades/trades.component.ts#L89-L109):** `submitTrade()` sluit de transactie-sheet nu pas ná Google Sheets response → wordt direct instant met achtergrond-sync.

### Aanbevolen om direct mee te nemen (V1 Quick Wins)
- [x] **Directe herkenbare micro-status op `.card-slab` & `.sync-pill`:** Toon op pas toegevoegde kaarten die nog in de outbox zitten (`rowIndex < 0` en `!demoMode`) optioneel een subtiel wolkje/spinner (`cloud_upload`) of groene bevestiging zodra Google Sheets klaar is — zo *voel* en *vertrouw* je als verzamelaar dat achtergrond-sync echt draait.
- [x] **Offline/Live snelcheck in `.pack-card` / `.qa-dock`:** Toon tijdens snel pack-openen rechtsboven (via de sync-pil) zonder extra popups dat bijv. `4 in wachtrij` rustig weggeschreven worden.
- [x] **Live-modus voorkeur: Sortering nieuwste/toegevoegde kaarten bovenaan + directe lokale kaart-zichtbaarheid:** Nieuwe kaarten worden al bovenin `[newCard, ...collection]` geplaatst, dus meteen zichtbaar in Collectie & Duplicaatdetectie (inclusief direct werken met `+1 bij bestaande kaart` nog vóór Sheets bevestigd heeft!).

### Logische vervolgstappen (V2 / Later)
- [ ] **Uitklapbaar Sync-wachtrij detailpaneel vanuit de Sync-pil:** Tikken op `Syncen (4)…` of `Sync-fout` opent een compact overzicht met per wachtrij-item de status (*Bezig / Wachtend / Fout*) en een *Opnieuw proberen* / *Item annuleren*-knop.
- [ ] **Periodieke retry met exponential backoff:** Automatisch op de achtergrond opnieuw proberen na tijdelijke Google Apps Script timeout / rate-limit (`5s` → `15s` → `45s`) wanneer verbinding weer stabiel is.

### Bewust Buiten Scope (V1)
- Aanpassen van [`FeedbackStore`](../../src/app/core/state/feedback.store.ts) / `Code.gs` Feedback Hub (die heeft al een losse niet-blokkerende werking op de Feedback-tab en raakt kaartinvoer niet).
- Native Android background WorkManager / foreground service (vereist native Capacitor plugins & APK-release; WebView outbox in `localStorage` werkt al direct via WebView OTA).

---

## 5. UX- & Schermimpact (Mobiel & Desktop)
- **Routes / Navigatie:** Geen route-verwijderingen. Alleen in [`CardDetailComponent`](../../src/app/features/collection/card-detail.component.ts#L48-L62): `activeCard()` heeft al fallback `cards.find((c) => c.cardId === cardId)`, wat zorgt dat direct openen van een pas toegevoegde kaart vóór én na remapping van `rowIndex < 0` → `rowIndex >= 2` blijft werken! (Eventueel `replaceUrl` sync zodra het echte `rowIndex` binnenkomt.)
- **Mobiel (`390×844`):**
  - `.qa-dock` knoppen op `/toevoegen` hebben geen merkbaar laaddelay meer tussen opeenvolgende kaarten.
  - Bottom sheets op Verlanglijst, Ruil & Verkoop en Pokédex sluiten direct bij tik op opslaan zonder 2–5 seconden spinner-vergrijzing.
- **Desktop (`1440×900` & `1280×768`):**
  - Ctrl/Cmd+Enter sneltoets achter elkaar doorpakken tijdens invoer voelt onmiddellijk responsief.
- **Lege-, laad- & foutstaten + Demo-modus:**
  - Demo-modus blijft synchroon en 100% zonder remote calls.
  - Foutstaat bij live sync bewaart de kaart lokaal + in outbox met duidelijke herstelknop (nooit stille verdwijning).

---

## 6. Data-, Google Sheets- & Sync-impact
- **Domain modellen ([`models.ts`](../../src/app/core/domain/models.ts)):**
  - Optioneel `clientMutationId?: string` en `tempRowIndex?: number` / metadata op `PendingMutation` voor deterministische coalescing, deduplicatie en `rowIndex`-remapping.
- **Google Sheets & [`apps-script/Code.gs`](../../apps-script/Code.gs):**
  - Alle bestaande formule-kolommen blijven strikt onaangeroerd (`Collectie R:T`, `Set Voortgang D:H`, `Pokédex Binder E:H`, `Verlanglijst I:J`, `Ruil & Verkoop H`).
  - `batchMutations` voert elke actie binnen één `LockService.getDocumentLock()` uit, verzamelt alle aangeraakte kaartnamen en draait `syncPokedexBinder_(ss, touchedNames)` éénmaal per batch i.p.v. 1× per kaart!
  - `syncPokedexBinder_` haalt bij gerichte edit eerst de rijen op en roept alleen voor gematchte Pokémon-rijen `choiceCell.getDataValidation()` aan (van 1.025 reads → 1 read).
- **Achterwaartse compatibiliteit:**
  - Oudere gedeployde Google Apps Script URLs zonder `batchMutations` of `skipBootstrap` krijgen automatische detectie en vallen transparant terug op de bestaande losse POST-acties (`addCard`, `updateCard`, etc.).

---

## 7. Acceptatiecriteria & Testplan (`ui-ux-reviewer` + Playwright + Apps Script)
1. **Reactiesnelheid (`< 50 ms` UI):** Toevoegen van een kaart in live-modus (met gesimuleerde 2.500 ms Google Apps Script vertraging in Vitest/Playwright) maakt het `/toevoegen`-formulier direct vrij (`prepareNextCard()` / navigatie naar `/collectie`) zonder op de serverresponse te wachten.
2. **Duplicaat, edit & delete vóór Sync voltooid is:** Direct achter elkaar `addCard` + `incrementExistingCard` of `updateCard` + `deleteCard` sturen terwijl de 1e request nog in-flight is resulteert in exact consistente lokale + uiteindelijke Google Sheets staat (geen terugspringende verwijderde kaarten of dubbele rijen).
3. **Crash/Reload-veiligheid:** Als de pagina herladen wordt terwijl de outbox items bevat in `localStorage`, worden alle niet-gesyncte kaarten na herstart zowel lokaal getoond als direct naar Google Sheets gesynct.
4. **Apps Script testen ([`apps-script/code.test.mjs`](../../apps-script/code.test.mjs)):** Nieuwe unit tests voor `batchMutations`, `skipBootstrap`, `syncPokedexBinder_` performance-filter en keiharde verificatie dat alle formulekolommen (`R:T`, `D:H`, `E:H`, `I:J`, `H`) intact blijven.
5. **Pre-Push UI/UX QA:** `npm run test:all`, `npm run test:e2e`, `npm run build`, `apkChanged: false` en screenshot-controle op `GO`.

---

## 8. Open Beslispunten voor Samen Beoordelen
1. **Wil je deze instant Local-First + persistente Outbox meteen voor álle mutaties (Kaart Toevoegen, Kaartdetail, Pokédex, Verlanglijst & Ruil) activeren?**
   - *Aanbevolen:* Ja — ze delen al dezelfde wachtrij in `CollectionStore`, waardoor snel schakelen tussen schermen overal direct vliegensvlug aanvoelt en er één uniform conflictmodel ontstaat.
2. **Zullen we ook meteen de `apps-script/Code.gs` versnelling (`batchMutations` + gerichte `syncPokedexBinder_` zonder 1.025-rijen validatie-scan + backwards-compatible fallback) meenemen?**
   - *Aanbevolen:* Ja — dan is zowel de app direct instantaan als ook het wegschrijven naar je Google Sheet zelf vele malen sneller zodra je de bijgewerkte `Code.gs` één keer in Apps Script plakt (en tot die tijd blijft je huidige sheet gewoon werken dankzij de fallback).
3. **Subtiele synchronisatie-indicator op pas toegevoegde kaarten (naast de globale Sync-pil)?**
   - *Aanbevolen:* Ja — een klein `cloud_upload`-icoontje naast een kaart zolang zijn tijdelijke rij nog op achtergrond-sync wacht geeft fijn vertrouwen dat hij straks 100% veilig in je Google Sheet staat.
