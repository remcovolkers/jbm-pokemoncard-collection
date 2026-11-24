# PokéBinder Feature Briefs (Business Analyst)

In deze map worden grote nieuwe features eerst uitgewerkt als **Feature Brief** (`YYYY-MM-DD-<slug>.md`) door de `business-analyst` agent voordat de bouw begint.

## Werkwijze
1. Jij deelt een groot feature-idee (ook als het nog breed of ruw is).
2. De Business Analyst checkt de huidige app/datastructuur, stelt maximaal 3–5 gerichte vragen als er keuzes openstaan, en schrijft een compact voorstel in deze map.
3. In elk document staan **proactieve aanvullende ideeën ("Wat past hier logisch bij?")** met `[ ]` checkboxes voor V1 vs. V2, plus UX-, Google Sheets- en OTA/APK-impact.
4. Samen beoordelen we het document; zodra jij de keuzes goedkeurt gaat de implementatie van start (gevolgd door de `ui-ux-reviewer` pre-push audit).

## Statussen
- **Concept:** Open ter review — nog geen code geschreven.
- **Goedgekeurd:** Scope en optionele BA-ideeën zijn gekozen; klaar om te bouwen.
- **Gebouwd:** Geïmplementeerd en geverifieerd via Playwright & `ui-ux-reviewer`.

## Overzicht Feature Briefs

| Datum | Feature Brief | Status | Release-type |
| :--- | :--- | :--- | :--- |
| 2026-11-24 | [Horizontaal Swipen bij Vorige / Volgende-navigatie](./2026-11-24-swipe-navigatie-vorige-volgende.md) | **Gebouwd** | WebView OTA |
| 2026-11-24 | [UX Slag A — Rustige Shell, Slimme Detail-dock, Klikbaar Dashboard & Beheerschermen](./2026-11-24-ux-slag-a-shell-dashboard-beheer.md) | **Gebouwd** | WebView OTA |
| 2026-11-24 | [UX Slag B — Slankere Mobiele Quick Add, Collectie Filter-Sheet & Pokédex 3×3 Fit](./2026-11-24-ux-slag-b-mobiele-focus-quick-add-collectie-binder.md) | **Gebouwd** | WebView OTA |
