# Feature Brief: Horizontaal Swipen bij Vorige / Volgende-navigatie

- **Datum:** 2026-11-24
- **Status:** Gebouwd — geverifieerd via Playwright & `ui-ux-reviewer`
- **Impactniveau:** Workflow-uitbreiding (App-breed interactiepatroon)
- **Release-type verwachting:** WebView OTA (`apkChanged: false`)

---

## 1. Samenvatting & Doel
- **Kernvraag van gebruiker:** Als een scherm in PokéBinder *Vorige / Volgende*-knoppen heeft (zoals de Collectie Kaartdetail-pagina), wil je op aanraakschermen ook natuurlijk naar links/rechts kunnen swipen om door items te bladeren.
- **Gebruikersprobleem:** Op mobiel is bovenaan of onderaan steeds precies op het knopje *Vorige* / *Volgende* tikken onhandiger dan met één duim over de kaart of pagina vegen — terwijl de *Pokédex Binder* ditzelfde veeggebaar al wel heeft via [`PbBinderSwipeDirective`](../../src/app/shared/directives/binder-swipe.directive.ts).
- **Belangrijkste gebruiksmomenten:**
  - *Mobiel (onderweg / op de bank / kaartbeurs):* Met één duim snel kaarten doorbladeren, artwork op groot formaat bekijken en setpagina's omslaan.
  - *Desktop (thuis met toetsenbord):* Consistent `←` / `→` kunnen gebruiken op élke plek waar *Vorige / Volgende*-knoppen staan (ook binnen de High-res Lightbox en bij Alle Sets).

---

## 2. Gebruikersverhalen & Kernflows
1. Als verzamelaar wil ik op de **Kaartdetail-pagina** links/rechts kunnen vegen over het kaartgebied om naar de volgende/vorige kaart binnen mijn actieve Collectie-filter te gaan.
2. Als verzamelaar wil ik in de **High-res Kaart Lightbox** links/rechts kunnen vegen (én `←`/`→` drukken) om kaarten achter elkaar als galerij in volledig formaat te bekijken.
3. Als ik via **Kaart Toevoegen → Alle Sets** door een grote set blader (met *Vorige / Volgende* in `.catalog-pager`), wil ik net als in de Pokédex Binder gewoon door de pagina's heen kunnen vegen.
4. Als ik net een aankoopprijs of notitie heb gewijzigd op Kaartdetail, wil ik beschermd worden tegen per ongeluk wegswipen zodat mijn aanpassingen niet stilzwijgend verloren gaan.

---

## 3. Must-Have Scope (V1)
- [x] **Collectie Kaartdetail swipe (`/collectie/kaart/:rowIndex/:cardId`):** Horizontaal links vegen gaat naar de volgende kaart (`nextCard()`), rechts vegen gaat naar de vorige kaart (`prevCard()`) binnen de huidige gefilterde/gesorteerde collectielijst.
- [x] **Herbruikbare swipe-directive:** De bestaande [`PbBinderSwipeDirective`](../../src/app/shared/directives/binder-swipe.directive.ts) veralgemenen/uitbreiden (bijv. alias `[pbSwipeNav]` naast `[pbBinderSwipe]`) in plaats van swipe-logica te kopiëren, inclusief bestaande bescherming tegen swipes die beginnen in `input`, `select` of `textarea` en tegen normaal verticaal scrollen.

---

## 4. Ideeën van de Business Analyst ("Wat past hier logisch bij?")

### Consistentie-scan: Soortgelijke plekken in de app
*Scan door `src/app/` naar alle onderdelen met `Vorige` / `Volgende`-navigatie of kaartinspectie:*
- [x] **Kaartdetail High-res Lightbox ([`card-detail.component.html`](../../src/app/features/collection/card-detail.component.html)):** Zowel swipe-navigatie als `←` / `→`-toetsen activeren terwijl de Lightbox open is, met een compacte teller (`1 / 25`) en *Vorige / Volgende*-pijltjes in de Lightbox. *(Let op: momenteel blokkeert `onKeydown` in [`card-detail.component.ts`](../../src/app/features/collection/card-detail.component.ts#L245) juist `ArrowLeft`/`ArrowRight` zodra de Lightbox open is!)*
- [x] **Kaart Toevoegen → Alle Sets paginering ([`quick-add.component.html`](../../src/app/features/quick-add/quick-add.component.html#L447-L471)):** `.catalog-pager` heeft dezelfde *Vorige / Volgende*-knoppen voor grote sets. Links/rechts swipen over `.search-results` (en `←`/`→` op desktop buiten invoervelden) slaat direct om naar de vorige/volgende setpagina en scrolt netjes weer naar boven in de resultaten.
- [x] **Pokédex Binder ([`pokedex-binder.component.html`](../../src/app/features/pokedex-binder/pokedex-binder.component.html#L151-L157)):** Heeft `pbBinderSwipe` al, en lift automatisch mee op alle verbeteringen aan de gedeelde directive hieronder (Android randbeveiliging, tablet-ondersteuning en `prefers-reduced-motion`).

### Aanbevolen om direct mee te nemen (V1 Quick Wins)
- [x] **Android Edge-Swipe bescherming (`~24 px` randmarge):** Negeer touchstarts binnen circa `24 px` van de uiterste linker- en rechterrand van het scherm, zodat Android's systeemgebaar (*Terug vegen*) nooit botst met "Vorige kaart".
- [x] **Veiligheid bij onopgeslagen wijzigingen (`hasUnsavedChanges()`):** Als de gebruiker op Kaartdetail velden heeft aangepast en niet heeft opgeslagen, blokkeer horizontaal wegswipen (of vraag bevestiging) met een duidelijke melding *"Sla je wijzigingen eerst op of tik op Herstellen"*.
- [x] **Ook op tablets & hybride touch-schermen:** Laat swipe werken zodra aanraakevents worden gebruikt i.p.v. een vaste breedte-limiet (`window.innerWidth >= 768`), terwijl de UI nooit onbedoeld schuift bij muisgebruik.
- [x] **Subtiele visuele feedback & respect voor `prefers-reduced-motion`:** Zachte eind-weerstand op de eerste of laatste kaart, optionele korte mobiele swipe-hint onder de stepper op Kaartdetail (net zoals op Pokédex Binder), en `translate3d`-feedback uitschakelen wanneer `prefers-reduced-motion` aan staat.

### Logische vervolgstappen (V2 / Later)
- [ ] **Preloading van naastgelegen kaart-artwork:** De high-res afbeeldingen van `prevCard()` en `nextCard()` alvast op de achtergrond inladen voor directe overgangen zonder laadscherm.
- [ ] **Richtingsanimatie bij bladeren:** Volgende kaart schuift subtiel vanuit rechts binnen en vorige vanuit links (zonder layout shifts op Android WebView).

### Bewust Buiten Scope (V1)
- Geen native Capacitor/Android gebarenplugin toevoegen (zodat een snelle WebView OTA volstaat en `apkChanged` op `false` blijft).
- Geen horizontale *swipe-to-delete* of *swipe-actions* op rijen in Collectie of Verlanglijst — dat vraagt een heel ander bevestigingspatroon.

---

## 5. UX- & Schermimpact (Mobiel & Desktop)
- **Kaartdetail & Lightbox:** Vegen mag normaal verticaal scrollen op `.shell__main` nooit verstoren (`PbBinderSwipeDirective` annuleert bij verticale beweging `|dy| > |dx|`), en `Escape` in de Lightbox sluit nog steeds eerst de vergroting.
- **Kaart Toevoegen (`Alle Sets`):** Let op interactieve kaarttegels binnen `.search-results` — tikken op een kaarttegel kiest de kaart; horizontaal slepen over de grid wisselt van pagina zonder per ongeluk een kaart te selecteren.
- **Toetsenbord (Desktop):** `isEditableEventTarget` blijft voorkomen dat `←` / `→` tekstbewerking in invoervelden onderbreekt.
- **Demo- en offline-modus:** Volledig identiek gedrag met of zonder gekoppelde Google Sheet.

---

## 6. Data-, Google Sheets- & Sync-impact
- **Domain modellen (`models.ts`):** Geen wijzigingen nodig.
- **Google Sheets & `apps-script/Code.gs`:** Geen impact; bestaande formules (`R:T`, `I:J`, `H`, `E:H`) en API blijven 100% onaangeraakt.
- **Release-impact (`scripts/detect-apk-changes.mjs`):** Pure web/UI-wijziging -> `apkChanged: false` (rolt automatisch uit via WebView OTA en GitHub Pages PWA).

---

## 7. Acceptatiecriteria & Testplan (`ui-ux-reviewer` + Playwright)
1. **Unit & Integratietests (`ng test`):**
   - Swipe-directive herkent links (`<= -56px`) en rechts (`>= +56px`), negeert verticale scrolls, negeert swipes vanuit `input`/`select`/`textarea`, negeert Android edge-swipes (`<= 24px` van schermrand) en respecteert `hasUnsavedChanges()` indien geconfigureerd.
   - `CardDetailComponent` ondersteunt swipe én `←`/`→` bladeren (ook in de Lightbox).
   - `QuickAddComponent` (*Alle Sets*) ondersteunt swipe én `←`/`→` pagineren tussen setpagina's.
2. **Playwright E2E (`npm run test:e2e`, mobiel `390×844` + desktop `1440×900`):**
   - Nul console errors, nul horizontale overflow tijdens/na horizontale swipe-feedback (`translate3d`).
   - Interactive swipe/navigatie doorlopen op Kaartdetail, Lightbox en Alle Sets zonder gebroken kliks.
3. **`ui-ux-reviewer` gate:** Goedgekeurd met `GO`-verdict op touchscreen-ergonomie (inclusief scroll vs. swipe scheiding) vóór push naar `main`.

---

## 8. Open Beslispunten voor Samen Beoordelen
1. **Welke schermen uit de consistentie-scan wil je in V1 direct meenemen?**
   - *Aanbevolen:* Alle 3 (Collectie **Kaartdetail**, **Kaartdetail Lightbox**, en **Kaart Toevoegen → Alle Sets paginering**), naast de bestaande **Pokédex Binder**.
   - *Alternatief:* Alleen Collectie Kaartdetail (+ eventueel Lightbox).
2. **Hoe omgaan met onopgeslagen wijzigingen (`hasUnsavedChanges()`) bij wegswipen op Kaartdetail?**
   - *Aanbevolen:* Swipe blokkeren + korte toast *"Sla je wijzigingen eerst op of tik op Herstellen"*, zodat je nooit werk kwijtraakt door een onbedoelde duimbeweging.
   - *Alternatief:* Altijd navigeren (zoals `←` / `→`-knoppen nu doen) en niet-opgeslagen wijzigingen negeren.
3. **Mogen de V1 Quick Wins (Android edge-swipe bescherming `24px`, tablets toestaan, `prefers-reduced-motion`) direct mee?**
   - *Aanbevolen:* Ja, klein technisch verschil maar voorkomt botsing met Android *Terug*-vegen en voelt overal consequent aan.

**Besluit (2026-11-24):** Gebruiker akkoord op alle 3 aanbevolen opties (`alle 3 schermen + dirty-state blokkade + alle V1 Quick Wins`). V2-ideeën (artwork preloading + slide-animatie) blijven op de backlog.
