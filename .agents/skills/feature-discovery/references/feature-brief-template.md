# Feature Brief: <Feature Naam>

- **Datum:** YYYY-MM-DD
- **Status:** Concept — wacht op gezamenlijke review
- **Impactniveau:** Groot / Nieuw scherm / Workflow-uitbreiding
- **Release-type verwachting:** WebView OTA (`apkChanged: false`) / Nieuwe Android APK vereist (`android/` wijziging)

---

## 1. Samenvatting & Doel
- **Kernvraag van gebruiker:** Korte samenvatting in gewone taal.
- **Gebruikersprobleem:** Welke frictie of gemiste workflow lost dit op?
- **Belangrijkste gebruiksmomenten:**
  - *Mobiel (onderweg / kaartbeurs / pack opening):* ...
  - *Desktop (thuis / collectiebeheer / analyse):* ...

---

## 2. Gebruikersverhalen & Kernflows
1. Als verzamelaar wil ik ..., zodat ...
2. Als ik op mobiel ..., dan moet de app direct ...

---

## 3. Must-Have Scope (V1)
- [ ] Kerneis 1
- [ ] Kerneis 2
- [ ] Kerneis 3

---

## 4. Ideeën van de Business Analyst ("Wat past hier logisch bij?")

### Consistentie-scan: Soortgelijke plekken in de app
*Andere schermen/onderdelen waar ditzelfde patroon voorkomt en waar deze verbetering waarschijnlijk ook logisch is:*
- [ ] **[Scherm / Component A]:** ...
- [ ] **[Scherm / Component B]:** ...

### Aanbevolen om direct mee te nemen (V1 Quick Wins)
- [ ] **[Idee 1]:** Waarom het naadloos aansluit op deze feature + welke bestaande schermen er beter van worden.
- [ ] **[Idee 2]:** Concrete tijdsbesparing of UX-koppeling (bijv. lege-staat CTA, prefill tussen schermen of snelfilter).

### Logische vervolgstappen (V2 / Later)
- [ ] **[Idee 3]:** Waardevolle uitbreiding die we bewust later doen om V1 scherp en overzichtelijk te houden.
- [ ] **[Idee 4]:** ...

### Bewust Buiten Scope (V1)
- Wat we expliciet **niet** bouwen in V1 (en waarom).

---

## 5. UX- & Schermimpact (Mobiel & Desktop)
- **Routes / Navigatie:** Nieuw tabblad, subroute onder `/meer`, modal/bottom sheet of uitbreiding bestaand scherm?
- **Mobiel (`390×844`):** Touch-targets `>= 44 px`, bottom-nav zichtbaarheid, virtueel toetsenbordgedrag.
- **Desktop (`1440×900` & `1280×768`):** Toetsenbord-sneltoetsen, multi-kolom layout, focusbeheer.
- **Lege-, laad- & foutstaten + Demo-modus:** Hoe ziet dit eruit zonder gekoppeld Google Sheet?

---

## 6. Data-, Google Sheets- & Sync-impact
- **Domain modellen (`models.ts`):** Welke velden of nieuwe types zijn nodig?
- **Google Sheets & `apps-script/Code.gs`:** Nieuwe kolommen/tabblad? Welke bestaande formule-kolommen blijven strikt onaangeroerd?
- **Achterwaartse compatibiliteit:** Hoe gaat de app om met bestaande rijen waarin nieuwe kolommen nog leeg zijn?

---

## 7. Acceptatiecriteria & Testplan (`ui-ux-reviewer` + Playwright)
1. **Functioneel:** ...
2. **Mobiele & Desktop UX:** Nul horizontale overflow, vloeiend scrollgedrag, werkende modals/formulieren.
3. **Tests:** Unit/integratietests + Apps Script-tests + uitbreiding op `e2e/` Playwright walkthrough.

---

## 8. Open Beslispunten voor Samen Beoordelen
1. **Keuze A:** Optie 1 *(Aanbevolen omdat ...)* vs. Optie 2
2. **Keuze B:** Welke opties uit sectie 4 wil je meteen in V1 aanvinken?
