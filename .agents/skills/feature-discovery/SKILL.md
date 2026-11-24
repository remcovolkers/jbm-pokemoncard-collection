---
name: feature-discovery
description: Facilitate structured Business Analyst feature discovery for major PokéBinder features, proactively proposing companion ideas and producing a reviewable Feature Brief in docs/features/ before coding begins.
---

# Feature Discovery Runbook (Business Analyst)

Activeer deze workflow zodra een gebruiker een grote nieuwe feature, nieuw scherm, datamodel-/Google Sheets-uitbreiding of breder productidee aandraagt.

## Stappen

1. **Verken de huidige app-context & scan app-breed op soortgelijke patronen:** Check [src/app/core/domain/models.ts](../../../src/app/core/domain/models.ts), [src/app/app.routes.ts](../../../src/app/app.routes.ts) en eventueel geraakte componenten of [apps-script/Code.gs](../../../apps-script/Code.gs). Zoek in `src/app/` actief naar alle **soortgelijke plekken en herbruikbare helpers** (bijv. alle plekken met *Vorige/Volgende*, zoekbalken, modals of swipe/sneltoets-directives zoals `pbBinderSwipe`). Start **nog geen** code-implementatie.
2. **Stel alleen gerichte keuzes scherp (max 3–5 vragen):** Gebruik waar nuttig `ask_question` met een aanbevolen optie, of zet open keuzepunten direct helder in het Feature Brief als het verzoek al een duidelijke richting heeft.
3. **Denk proactief mee ("Soortgelijke plekken & wat past erbij?"):** Benoem altijd eerst alle vergelijkbare schermen/onderdelen uit de codebase waar ditzelfde patroon thuishoort (met `[ ]` checkboxes), gevolgd door logische vervolgstappen, cross-screen koppelingen (bijv. Dashboard ↔ Collectie ↔ Pokédex ↔ Verlanglijst ↔ Ruil & Verkoop), mobiele vs. desktop ergonomie en dataveiligheid.
4. **Leg de Feature Brief vast:** Schrijf een Nederlands document in `docs/features/YYYY-MM-DD-<korte-slug>.md` op basis van [references/feature-brief-template.md](./references/feature-brief-template.md).
5. **Pauzeer voor gezamenlijke review:** Presenteer een klikbare link naar het document, vat de kernscope + jouw beste aanvullende ideeën beknopt samen, en vraag om akkoord/keuzes voordat er een technisch plan of code wordt geschreven.
