# PokéBinder — Volledige UX Review (Mobiel & Desktop)

**Datum:** 2026-11-24  
**Scope:** Alle 11 routes, gedeelde overlays/bottom sheets, toetsenbord- & aanraakinteractie, PWA & Android APK WebView-schil.  
**Ontwerpkaders:** Apple HIG, Material Design 3, WCAG 2.1 AA, en TCG Collector UX best practices.

---

## 1. Samenvatting & Beoordeling

| Dimensie | Voor deze slag | Na deze slag | Belangrijkste winst |
| :--- | :--- | :--- | :--- |
| **Mobiele navigatie & ritme** | 7.5 / 10 | **9.0 / 10** | Dedicated Kaartdetail-pagina, strakke `... Meer`-hub zonder loze scroll, slankere Pokédex Binder op mobiel, schone terug-navigatie |
| **Desktop productiviteit** | 7.0 / 10 | **9.0 / 10** | `/` snelzoeken op 5 pagina's, `←`/`→` bladeren op Kaartdetail & Binder, `Ctrl+Enter` snel opslaan, toetsenbordbediening op elke kaarttegel |
| **Formulieren & data-invoer** | 7.5 / 10 | **9.0 / 10** | Dirty-state + `Herstellen`-knop op Kaartdetail, virtueel toetsenbord duwt invoer vrij, directe doorzetting vanuit lege Pokédex-slots naar Quick Add |
| **Visuele rust & touch-gevoel** | 7.5 / 10 | **9.0 / 10** | Alle dubbele ondermarges geëlimineerd, `:hover` achter `@media (hover: hover)` (geen plakkerige hover na tap), `prefers-reduced-motion` volledig ondersteund |

---

## 2. Scherm-voor-scherm beoordeling (Mobiel & Desktop)

1. **Shell (`App`)**
   - *Mobiel:* Vaste topbar met back-pijl uitsluitend op stack-routes (`/toevoegen`, `/meer/*`, `/collectie/kaart/*`) en in-flow 5-tab bottom bar (zonder teruggesprongen stack-tabhistory dankzij `replaceUrl`). Verbetering: instellingen-icoon rechtsboven verborgen tijdens gerichte bewerk-flows om afleiding te beperken; toasts tonen nu expliciet sluit-icoon (`close`).
   - *Desktop:* Vaste linker zijbalk compacter verticaal uitgelijnd zodat op 720p/768p-laptops geen zijbalk-scrollbar ontstaat; toegankelijke `.skip-link` ("Ga naar hoofdinhoud") en `prefers-reduced-motion` voor alle animaties.
2. **Dashboard (`/dashboard`)**
   - *Mobiel & Desktop:* Hero-portfoliokaart met directe ontgrendeling naar Pokédex Binder (`Klaar voor binder`), horizontale Top-5 rail op mobiel en 5-koloms grid op desktop. Verbetering: Top-5 header heeft nu net als *Actieve Master Sets* een symmetrische *Bekijk collectie*-link, en zowel Top-5 als Set-tegels zijn volledig via toetsenbord (`Enter`/`Space` + focus-ring) te bedienen.
3. **Collectie (`/collectie`)**
   - *Mobiel & Desktop:* Sticky zoek/sorteer/filterbalk met live waarde- en exemplarenteller (`24 kaarten (29×) · € 1.240,50`) direct in de resultaatpil. Verbetering: filterlogica gedeeld via `CollectionViewStateService` zodat actieve filters behouden blijven na het openen van een kaart; `/` focust direct het zoekveld; desktop filterstrip wrapt netjes zonder horizontale scrollbar.
4. **Kaartdetail (`/collectie/kaart/:rowIndex/:cardId`)**
   - *Mobiel & Desktop:* Vervangt de voormalige zware bottom sheet (geen WebView-renderglitch en ongelimiteerd comfortabel scrollen). Verbetering:
     - **Vorige / Volgende-stepper** (en `←` / `→` op toetsenbord) bladert direct door kaarten binnen het actieve Collectie-filter.
     - **High-res artwork lightbox**: tik op de kaartafbeelding opent schermvullende inspectie (sluit met `Esc` of achtergrond-tik).
     - **Dirty-state & Herstellen**: vaste onderbalk toont `Niet opgeslagen` + `Herstellen`-knop en deactiveert opslaan zolang er niets gewijzigd is.
5. **Pokédex Binder (`/pokedex`)**
   - *Mobiel & Desktop:* Ondersteunt 4/9/12/16/20 pockets per pagina met horizontale swipe op mobiel én `←` / `→` toetsen op desktop, plus `/` snelzoeken. Verbetering: ontbrekende Pokémon-slots bieden in hun bottom sheet nu een directe knop **"Zoek [Pokémon] om toe te voegen"** die `/toevoegen` opent met vooraf ingevulde naamzoekopdracht. Tap-glitch op pockets en checklist-rijen verwijderd.
6. **Kaart Toevoegen (`/toevoegen`)**
   - *Mobiel & Desktop:* Drie modi (*Code / ID*, *Op Naam*, *Alle Sets*), duplicaatdetectie en Pack Opening Mode. Verbetering: automatische prefill vanuit ontbrekende Pokédex-slots en `Ctrl/Cmd+Enter` om op desktop razendsnel op te slaan & door te gaan.
7. **`... Meer` Hub (`/meer`)**
   - *Mobiel & Desktop:* Eén scherm zonder micro-scroll dat live sync-status toont en doorboort naar de 5 beheertools.
8. **Set Voortgang (`/meer/sets`)**
   - Verbetering: zoekbalk voorzien van zoek-icoon, wis-knop (`×`), `/` sneltoets en focus-ring op setkaarten.
9. **Verlanglijst (`/meer/verlanglijst`)**
   - Verbetering: **Nieuwe wens**-knop verplaatst van helemaal onderaan naar een vaste actiebalk bovenaan naast de filters, zodat gebruikers met lange verlanglijsten niet eerst naar beneden hoeven te scrollen.
10. **Ruil & Verkoop (`/meer/ruil-verkoop`)**
    - Verbetering: ruilbare kaarten in de *Live Trade Binder* zijn nu klikbaar (naar hun Kaartdetailpagina) terwijl *Log deal* los blijft klikbaar (`stopPropagation`).
11. **Feedback Hub (`/meer/feedback`) & Instellingen (`/meer/instellingen`)**
    - Verbetering: `/` snelzoeken in Feedback Hub, duidelijke live OTA-foutdiagnose en keuzeknoppen zichtbaar in Instellingen, overal gestandaardiseerde ondermarges zonder dubbele scrollruimte.

---

## 3. Toegepaste best practices in deze verbeterslag

- **Zero redundant scroll**: één enkele bron voor ondermarge per pagina i.p.v. gestapelde padding in zowel `.shell__main` als het component.
- **Closed-loop workflows**: ontbrekende Pokédex-slot → Quick Add zoekopdracht → opslaan terug in collectie; Collectie → Kaartdetail → Vorige/Volgende binnen hetzelfde filter.
- **Dirty-state feedback & reversible edits**: gebruiker ziet expliciet of wijzigingen onopgeslagen zijn en kan in 1 klik terug naar de oorspronkelijke staat (`Herstellen`).
- **Scheiding tussen aanraak- en muisinteractie**: `@media (hover: hover) and (pointer: fine)` voorkomt "plakkende" hover-staten op telefoons, terwijl desktop wel rijke hover + focus-ringen + sneltoetsen krijgt.
- **Compositor-veilige Android WebView UI**: vermijden van `transform` + `backdrop-filter` op zware scrollbare grids/footers voorkomt flitsende WebView-artefacten bij tappen.

---

## 4. Prioritaire verbeterbacklog (Wat er nog beter kan)

### Prioriteit 1 — Hoog (grootste gebruikersimpact)
1. **Virtual scrolling of paginering in Collectie (1.000+ kaarten)**  
   *Waarom:* Momenteel rendert `.cards-grid` alle gefilterde DOM-nodes tegelijk. Boven ~400 kaarten vertraagt initieel renderen en geheugengebruik op midrange Android-telefoons.  
   *Aanpak:* `@angular/cdk/scrolling` virtual grid of incrementeel "Laad meer / Pagina" per 60 kaarten net als in de Pokédex Checklist.
2. **Undo-actie ("Ongedaan maken") in toast na verwijderen**  
   *Waarom:* Bij het verwijderen van een kaart of wens helpt een 5-seconden *Ongedaan maken*-knop in de toast tegen per ongeluk definitief wissen zonder het Google Sheet-herstel te moeten openen.
3. **Pull-to-refresh gebaar op Collectie & Dashboard (native/PWA)**  
   *Waarom:* Gebruikers op mobiel zijn gewend omlaag te trekken bovenaan een lijst om een live Google Sheets-sync af te trappen (buiten `.shell__main` overscroll-bounce van de shell zelf).

### Prioriteit 2 — Middel (productiviteit & verzamelaar-features)
4. **Bulk-selectie & Multi-edit in Collectie**  
   *Waarom:* Na het sorteren van een map willen verzamelaars vaak 10–30 kaarten tegelijk verplaatsen naar een andere opslaglocatie (`Binder B`), markeren voor ruil, of verwijderen.
5. **Camera / OCR Kaartscanner op mobiel (`/toevoegen`)**  
   *Waarom:* Via Capacitor Camera + on-device tekstherkenning (setcode + kaartnummer onderaan de kaart) kunnen kaarten tijdens het openen van packs zonder typen worden ingescand.
6. **Prijshistorie & portfoliotrend over tijd**  
   *Waarom:* Periodieke lokale/Sheet-snapshots laten de portfoliowaarde-ontwikkeling als mini-grafiek zien op Dashboard en Kaartdetail.
7. **Globaal Command Palette (`Ctrl+K` / `Cmd+K`) op desktop**  
   *Waarom:* Snel springen tussen schermen, sets of specifieke kaarten zonder muis.

### Prioriteit 3 — Laag (fijnslijpen & power-user gemak)
8. **Native Android Edge-Swipe Back ondersteuning**  
   *Waarom:* Synchroniseren met Android Predictive Back gestures (Android 14+) op stack-pagina's (`/collectie/kaart/...`, `/meer/*`, `/toevoegen`).
9. **Export / Afdrukbare Binder Checklist (PDF / CSV)**  
   *Waarom:* Verzamelaars gebruiken geprinte checklists op ruilbeurzen waar mobiel bereik slecht kan zijn.
10. **Tablet landscape split-view**  
    *Waarom:* Op tablets in liggende stand (`>= 768px` tot `1024px`) kan `/collectie` optioneel als master-detail (lijst links, kaartdetail rechts) renderen.
