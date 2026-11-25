/**
 * PokéBinder — Google Apps Script Backend (REST API + Google Sheets Integratie)
 *
 * Gebruikt bestaande tabbladen zonder formules te overschrijven:
 *  - Collectie       (koprij 1, data rij 2+, formules in R:T blijven behouden)
 *  - Set Voortgang   (koprij 1, data rij 2+, formules in D:H blijven behouden)
 *  - Pokédex Binder  (koprij 7, data rij 8..1032, cel H4 = vakjes per pagina, formules in E:H)
 *  - Verlanglijst    (koprij 1, data rij 2+, formules in I:J blijven behouden)
 *  - Ruil & Verkoop  (logboek vanaf rij 22, formule in kolom H blijft behouden)
 *  - Instellingen    (kolommen A:I met dropdown-bronlijsten)
 *
 * Configuratie:
 *  Stel een persoonlijke sleutel in via Projectinstellingen -> Scripteigenschappen:
 *    Sleutel: API_TOKEN
 *    Waarde:  <jouw-geheime-token>
 *  Of gebruik het menu "PokéBinder" -> "API-token instellen" in Google Sheets.
 */

var SHEET_NAMES = {
  COLLECTION: 'Collectie',
  SET_PROGRESS: 'Set Voortgang',
  POKEDEX: 'Pokédex Binder',
  WISHLIST: 'Verlanglijst',
  TRADES: 'Ruil & Verkoop',
  SETTINGS: 'Instellingen',
  FEEDBACK: 'Feedback',
  SETCODES: 'Setcodes'
};

var DEX_START_ROW = 8;
var DEX_COUNT = 1025; // #0001 t/m #1025

var TCGDEX_BASE_URL = 'https://api.tcgdex.net/v2/en';
var TCGDEX_GRAPHQL_URL = 'https://api.tcgdex.net/v2/graphql';

var SCRIPT_VERSION = '2.2.4';
var SCRIPT_CHANGELOG = 'Kaartspot Binder Sync (server-side ophalen zonder CORS & razendsnelle bulk-import), script-versiecontrole & batch-sync.';
var POKEBINDER_MANIFEST_URL = 'https://remcovolkers.github.io/jbm-pokemoncard-collection/version.json';
var POKEBINDER_CODE_URL = 'https://github.com/remcovolkers/jbm-pokemoncard-collection/blob/main/apps-script/Code.gs';

// Mapping van geprinte kaartcodes (linksonder op fysieke kaarten) naar TCGdex API-codes
var SET_CODE_ALIASES = {
  // Mega Evolution & 30th Anniversary
  MEG: 'me01',
  ME1: 'me01',
  ME01: 'me01',
  PFL: 'me02',
  ME2: 'me02',
  ME02: 'me02',
  ASC: 'me02.5',
  'ME02.5': 'me02.5',
  POR: 'me03',
  ME3: 'me03',
  ME03: 'me03',
  CRI: 'me04',
  ME4: 'me04',
  ME04: 'me04',
  PBL: 'me05',
  ME5: 'me05',
  ME05: 'me05',
  DLR: 'me06',
  ME6: 'me06',
  ME06: 'me06',
  '30C': '30th',
  '30CC': '30th-c',
  MEP: 'mep',
  MEE: 'mee',
  // Scarlet & Violet
  SVI: 'sv01',
  SV1: 'sv01',
  PAL: 'sv02',
  SV2: 'sv02',
  OBF: 'sv03',
  SV3: 'sv03',
  MEW: 'sv03.5',
  '151': 'sv03.5',
  PAR: 'sv04',
  SV4: 'sv04',
  PAF: 'sv04.5',
  TEF: 'sv05',
  SV5: 'sv05',
  TWM: 'sv06',
  SV6: 'sv06',
  SFA: 'sv06.5',
  SCR: 'sv07',
  SV7: 'sv07',
  SSP: 'sv08',
  SV8: 'sv08',
  PRE: 'sv08.5',
  JTG: 'sv09',
  SV9: 'sv09',
  DRI: 'sv10',
  SV10: 'sv10',
  WHT: 'sv10.5w',
  BLK: 'sv10.5b',
  SVP: 'svp',
  // Sword & Shield
  SSH: 'swsh1',
  RCL: 'swsh2',
  DAA: 'swsh3',
  CPA: 'swsh3.5',
  VIV: 'swsh4',
  SHF: 'swsh4.5',
  BST: 'swsh5',
  CRE: 'swsh6',
  EVS: 'swsh7',
  CEL: 'cel25',
  FST: 'swsh8',
  BRS: 'swsh9',
  ASR: 'swsh10',
  PGO: 'swsh10.5',
  LOR: 'swsh11',
  SIT: 'swsh12',
  CRZ: 'swsh12.5',
  SWSHP: 'swshp',
  // Sun & Moon
  SUM: 'sm1',
  GRI: 'sm2',
  BUS: 'sm3',
  SLG: 'sm3.5',
  CIN: 'sm4',
  UPR: 'sm5',
  FLI: 'sm6',
  CES: 'sm7',
  DRM: 'sm7.5',
  LOT: 'sm8',
  TEU: 'sm9',
  DET: 'det1',
  UNB: 'sm10',
  UNM: 'sm11',
  HIF: 'sm11.5',
  CEC: 'sm12',
  // Classic / WOTC
  BS: 'base1',
  BASE: 'base1',
  JU: 'base2',
  FO: 'base3',
  BS2: 'base4',
  TR: 'base5',
  PR: 'basep',
  G1: 'gym1',
  G2: 'gym2',
  N1: 'neo1',
  N2: 'neo2',
  N3: 'neo3',
  N4: 'neo4',
  EX: 'ecard1',
  EXP: 'ecard1',
  AQ: 'ecard2',
  SK: 'ecard3',
  DX: 'ex8'
};

// Kaartcodes die op meerdere sets voorkomen (bijv. 30C voor 30th Celebration én 30th Classic Collection)
var MULTI_SET_ALIASES = {
  '30C': ['30th', '30th-c']
};

// Reverse lookup van TCGdex API-code -> officiële geprinte kaartcode op de fysieke kaart
var OFFICIAL_CODE_BY_SET_ID = {
  me01: 'MEG',
  me02: 'PFL',
  'me02.5': 'ASC',
  me03: 'POR',
  me04: 'CRI',
  me05: 'PBL',
  me06: 'DLR',
  '30th': '30C',
  '30th-c': '30C',
  mep: 'MEP',
  mee: 'MEE',
  sv01: 'SVI',
  sv02: 'PAL',
  sv03: 'OBF',
  'sv03.5': 'MEW',
  sv04: 'PAR',
  'sv04.5': 'PAF',
  sv05: 'TEF',
  sv06: 'TWM',
  'sv06.5': 'SFA',
  sv07: 'SCR',
  sv08: 'SSP',
  'sv08.5': 'PRE',
  sv09: 'JTG',
  sv10: 'DRI',
  'sv10.5w': 'WHT',
  'sv10.5b': 'BLK',
  svp: 'SVP',
  swsh1: 'SSH',
  swsh2: 'RCL',
  swsh3: 'DAA',
  'swsh3.5': 'CPA',
  swsh4: 'VIV',
  'swsh4.5': 'SHF',
  swsh5: 'BST',
  swsh6: 'CRE',
  swsh7: 'EVS',
  cel25: 'CEL',
  swsh8: 'FST',
  swsh9: 'BRS',
  swsh10: 'ASR',
  'swsh10.5': 'PGO',
  swsh11: 'LOR',
  swsh12: 'SIT',
  'swsh12.5': 'CRZ',
  swshp: 'SWSHP',
  sm1: 'SUM',
  sm2: 'GRI',
  sm3: 'BUS',
  'sm3.5': 'SLG',
  sm4: 'CIN',
  sm5: 'UPR',
  sm6: 'FLI',
  sm7: 'CES',
  'sm7.5': 'DRM',
  sm8: 'LOT',
  sm9: 'TEU',
  det1: 'DET',
  sm10: 'UNB',
  sm11: 'UNM',
  'sm11.5': 'HIF',
  sm12: 'CEC',
  base1: 'BS',
  base2: 'JU',
  base3: 'FO',
  base4: 'BS2',
  base5: 'TR',
  basep: 'PR',
  gym1: 'G1',
  gym2: 'G2',
  neo1: 'N1',
  neo2: 'N2',
  neo3: 'N3',
  neo4: 'N4',
  ecard1: 'EXP',
  ecard2: 'AQ',
  ecard3: 'SK',
  ex8: 'DX'
};

// ============================================================================
// GOOGLE SHEETS UI MENU & TWO-WAY TRIGGERS (DIRECT WERKEN IN SHEETS + APP API)
// ============================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ Pokémon API / PokéBinder')
    .addItem('⚙️ Auto-sync aanzetten (1x activeren)', 'installAutoTrigger')
    .addSeparator()
    .addItem('✨ Lege rijen met Kaart-ID aanvullen', 'fillMissingRows')
    .addItem('📖 Pokédex Binder volledig synchroniseren', 'syncAllPokedexBinder')
    .addItem('🔄 Alle marktprijzen verversen (Cardmarket EUR)', 'refreshAllPrices')
    .addItem('📚 Setcodes-tabblad aanmaken / bijwerken', 'syncSetCodesSheet')
    .addSeparator()
    .addItem('🔑 PokéBinder App API-token instellen / bekijken', 'configureApiTokenFromMenu')
    .addItem('🔄 Controleren op PokéBinder Script-update', 'checkScriptUpdateFromMenu')
    .addToUi();
}

function compareSemverVersions_(a, b) {
  var parseTuple = function (raw) {
    var clean = String(raw || '').trim().replace(/^v/i, '').split(/[+-]/)[0] || '0.0.0';
    var parts = clean.split('.');
    return [
      parseInt(parts[0], 10) || 0,
      parseInt(parts[1], 10) || 0,
      parseInt(parts[2], 10) || 0
    ];
  };
  var pa = parseTuple(a);
  var pb = parseTuple(b);
  for (var i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

function checkScriptUpdateFromMenu() {
  var ui = SpreadsheetApp.getUi();
  try {
    var url = POKEBINDER_MANIFEST_URL + '?t=' + Date.now();
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      ui.alert(
        'Update-controle mislukt (HTTP ' + res.getResponseCode() + ').\n\n' +
          'Bekijk handmatig de nieuwste Code.gs op:\n' + POKEBINDER_CODE_URL
      );
      return;
    }

    var manifest = JSON.parse(res.getContentText() || '{}');
    var latest = String(manifest.latestScriptVersion || '').trim();
    if (!latest) {
      ui.alert(
        'Je huidige PokéBinder scriptversie is v' + SCRIPT_VERSION + '.\n' +
          'Er kon geen nieuwere scriptversie uit version.json worden gelezen.'
      );
      return;
    }

    if (compareSemverVersions_(latest, SCRIPT_VERSION) > 0) {
      var changelog = manifest.scriptChangelog ? '\nWat is nieuw:\n' + manifest.scriptChangelog + '\n' : '';
      ui.alert(
        'Nieuwe PokéBinder Script-update beschikbaar!\n\n' +
          'Huidige versie: v' + SCRIPT_VERSION + '\n' +
          'Nieuwste versie: v' + latest + '\n' +
          changelog +
          '\nZo werk je veilig bij (je /exec-URL & API_TOKEN blijven gelijk):\n' +
          '1. Kopieer Code.gs vanuit PokéBinder → Instellingen (of via GitHub)\n' +
          '2. Extensies → Apps Script → Code.gs vervangen → Ctrl+S\n' +
          '3. Implementeren → Implementaties beheren → Potloodje (Bewerken)\n' +
          '4. Kies "Nieuwe versie" → Implementeren\n\n' +
          'Broncode: ' + POKEBINDER_CODE_URL
      );
      return;
    }

    ui.alert('Je gebruikt al de nieuwste PokéBinder Apps Script versie (v' + SCRIPT_VERSION + ')!');
  } catch (err) {
    ui.alert(
      'Kon niet op updates controleren: ' +
        String(err && err.message ? err.message : err) +
        '\n\nBekijk de broncode op:\n' + POKEBINDER_CODE_URL
    );
  }
}

/**
 * Installeert met 1 klik de onEdit-trigger zodat API-fetch + Set Voortgang + Pokédex-sync
 * automatisch draaien wanneer iemand direct in Google Sheets werkt.
 */
function installAutoTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var fn = trigger.getHandlerFunction();
    if (fn === 'handleSheetEdit' || fn === 'autoFillOnEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('handleSheetEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ss.toast('Automatische API-aanvulling en Pokédex-sync staan nu aan!', '⚡ Auto-sync actief', 5);
}

function configureApiTokenFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var current = props.getProperty('API_TOKEN') || '';
  var prompt = ui.prompt(
    'PokéBinder API-token',
    'Huidig token: ' + (current ? '(ingesteld, ' + current.length + ' tekens)' : '(niet ingesteld)') +
      '\n\nVoer een nieuw persoonlijk API-token in (of laat leeg om een sterk token te genereren):',
    ui.ButtonSet.OK_CANCEL
  );
  if (prompt.getSelectedButton() !== ui.Button.OK) return;
  var value = (prompt.getResponseText() || '').trim();
  if (!value) {
    value = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  }
  props.setProperty('API_TOKEN', value);
  ui.alert('API-token opgeslagen!\n\nKopieer dit token naar PokéBinder → Meer → Instellingen:\n\n' + value);
}

/**
 * Menuknop: Vult alle rijen in Collectie met een Kaart-ID maar lege naam aan + synct Set Voortgang & Pokédex.
 */
function fillMissingRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.COLLECTION);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var updated = 0;
  var failed = [];

  for (var i = 0; i < data.length; i++) {
    var rawId = String(data[i][0] || '').trim();
    var name = String(data[i][1] || '').trim();
    if (rawId && !name) {
      var card = fetchAndPopulateRow_(ss, sheet, i + 2, rawId, false);
      if (card) updated++;
      else failed.push('Rij ' + (i + 2) + ' (' + rawId + ')');
      if (typeof Utilities !== 'undefined' && Utilities.sleep) Utilities.sleep(120);
    }
  }

  syncPokedexBinder_(ss, null);

  var msg = failed.length
    ? updated + ' kaart(en) aangevuld & Pokédex gesynchroniseerd.\nNiet gevonden: ' + failed.join(', ')
    : updated + ' kaart(en) aangevuld & Pokédex gesynchroniseerd!';
  SpreadsheetApp.getUi().alert(msg);
}

function enrichSelectedRowFromMenu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  if (sheet.getName() !== SHEET_NAMES.COLLECTION) {
    SpreadsheetApp.getUi().alert('Selecteer een rij op het tabblad "' + SHEET_NAMES.COLLECTION + '".');
    return;
  }
  var row = sheet.getActiveCell().getRow();
  if (row < 2) return;
  enrichCollectionRow_(ss, sheet, row);
  syncPokedexBinder_(ss, null);
}

/**
 * Menuknop: Synchroniseert de hele Pokédex Binder met de huidige Collectie.
 */
function syncAllPokedexBinder() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var summary = syncPokedexBinder_(ss, null);
  ss.toast(summary.updatedSlots + ' Pokémon-rij(en) bijgewerkt in Pokédex Binder.', '📖 Pokédex Sync', 5);
}

function syncPokedexBinderFromMenu() {
  syncAllPokedexBinder();
}

/**
 * Menuknop: Ververst kolom Q (Huidige waarde p/s) voor alle kaarten met een geldig Kaart-ID.
 */
function refreshAllPrices() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = refreshCollectionPrices_(ss);
  SpreadsheetApp.getUi().alert(
    'Marktprijzen bijgewerkt voor ' + result.updated + ' van ' + result.total + ' kaart(en).'
  );
}

function refreshAllPricesFromMenu() {
  refreshAllPrices();
}

/**
 * Menuknop: Maakt/ververst het overzichtstabblad "Setcodes" met zowel de herkenbare
 * "Kaartcode (Op kaart)" (bijv. DLR, PBL, 30C, MEW) als de technische "API-code (TCGdex)" (me06, sv03.5).
 * Filtert digitale Pokémon TCG Pocket-sets automatisch weg en maakt eigen aanvullingen direct bruikbaar bij invoer!
 */
function syncSetCodesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.SETCODES);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.SETCODES);

  var rawSets = null;
  var gqlQuery = '{ sets { id name tcgOnline serie { id name } cardCount { official total } } }';
  try {
    var gqlRes = UrlFetchApp.fetch(TCGDEX_GRAPHQL_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ query: gqlQuery }),
      muteHttpExceptions: true
    });
    if (gqlRes.getResponseCode() === 200) {
      var gqlJson = JSON.parse(gqlRes.getContentText());
      if (gqlJson && gqlJson.data && gqlJson.data.sets && gqlJson.data.sets.length > 0) {
        rawSets = gqlJson.data.sets;
      }
    }
  } catch (e) {
    // Val terug op REST endpoint
  }

  if (!rawSets) {
    var res = UrlFetchApp.fetch(TCGDEX_BASE_URL + '/sets', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      if (SpreadsheetApp.getUi) {
        SpreadsheetApp.getUi().alert('Kon sets niet ophalen van TCGdex.');
      }
      return;
    }
    rawSets = JSON.parse(res.getContentText());
  }

  var pocketIdRe = /^(?:[AB]\d+[a-z]?|P-A)$/i;
  var physicalSets = [];
  var skippedPocket = 0;

  for (var p = 0; p < rawSets.length; p++) {
    var item = rawSets[p];
    if (!item || !item.id || !item.name) continue;
    var isPocket = (item.serie && item.serie.id === 'tcgp') || pocketIdRe.test(String(item.id));
    if (isPocket) {
      skippedPocket++;
      continue;
    }
    physicalSets.push(item);
  }

  // Nieuwste releases bovenaan
  physicalSets.reverse();

  var rows = [[
    'Kaartcode (Op kaart)',
    'Setnaam',
    'Serie / Era',
    'Officieel',
    'Totaal (incl. secrets)',
    'Voorbeeld invoer',
    'API-code (TCGdex)'
  ]];

  for (var i = 0; i < physicalSets.length; i++) {
    var s = physicalSets[i];
    var setId = String(s.id).trim();
    var setIdLower = setId.toLowerCase();
    var kaartCode = OFFICIAL_CODE_BY_SET_ID[setIdLower] || (s.tcgOnline ? String(s.tcgOnline).trim().toUpperCase() : '');

    // Voor splinternieuwe moderne sets die nog niet in OFFICIAL_CODE_BY_SET_ID staan: haal abbreviation.official op
    if (!kaartCode && (/^(?:me|sv)\d|^30th/i.test(setIdLower) || (s.serie && (s.serie.id === 'me' || s.serie.id === 'sv')))) {
      try {
        var detailRes = UrlFetchApp.fetch(TCGDEX_BASE_URL + '/sets/' + encodeURIComponent(setId), {
          muteHttpExceptions: true
        });
        if (detailRes.getResponseCode() === 200) {
          var detail = JSON.parse(detailRes.getContentText());
          if (detail && detail.abbreviation && detail.abbreviation.official) {
            kaartCode = String(detail.abbreviation.official).trim().toUpperCase();
          } else if (detail && detail.tcgOnline) {
            kaartCode = String(detail.tcgOnline).trim().toUpperCase();
          }
        }
      } catch (e) {
        // Gebruik fallback hieronder
      }
    }

    if (!kaartCode) {
      kaartCode = setId.toUpperCase();
    }

    var serieName = (s.serie && s.serie.name) ? String(s.serie.name).trim() : '';
    var official = s.cardCount && s.cardCount.official !== undefined ? s.cardCount.official : '';
    var total = s.cardCount && s.cardCount.total !== undefined ? s.cardCount.total : '';
    var prefersPadded = /^(?:sv|me)\d|^30th/i.test(setIdLower);
    var exampleInput = kaartCode + ' ' + (prefersPadded ? '001' : '1');

    rows.push([kaartCode, s.name, serieName, official, total, exampleInput, setId]);
  }

  if (sheet.clearContents) sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  if (sheet.setFrozenRows) sheet.setFrozenRows(1);
  if (sheet.autoResizeColumns) sheet.autoResizeColumns(1, rows[0].length);

  if (SpreadsheetApp.getUi) {
    var msg = physicalSets.length + ' fysieke Pokémon TCG-sets geladen op het tabblad "' + SHEET_NAMES.SETCODES + '".';
    if (skippedPocket > 0) {
      msg += '\n(' + skippedPocket + ' digitale TCG Pocket-sets automatisch overgeslagen.)';
    }
    msg += '\n\nJe kunt in Collectie gewoon de "Kaartcode (Op kaart)" intypen (bijv. DLR 011 of MEW 181)!';
    SpreadsheetApp.getUi().alert(msg);
  }
}

/**
 * Hoofd-trigger bij elke bewerking in de spreadsheet (two-way met de PokéBinder app).
 * Ondersteunt:
 *  - Collectie: Kaart-ID typen of plakken (ook meerdere rijen tegelijk) -> TCGdex verrijking,
 *    Set Voortgang aanvullen & Pokédex Binder synchroniseren.
 *  - Pokédex Binder: Kolom I (Gekozen Kaart / Art) wijzigen -> automatisch In Binder? (kolom D) vinken.
 */
function handleSheetEdit(e) {
  if (!e || !e.range) return;

  var lock = LockService.getDocumentLock();
  var locked = lock.tryLock ? lock.tryLock(15000) : (lock.waitLock(15000), true);
  if (!locked) return;

  try {
    var sheet = e.range.getSheet();
    var sheetName = sheet.getName();
    var ss = e.source || SpreadsheetApp.getActiveSpreadsheet();
    var startRow = e.range.getRow();
    var numRows = e.range.getNumRows ? e.range.getNumRows() : 1;
    var startCol = e.range.getColumn();
    var endCol = startCol + (e.range.getNumColumns ? e.range.getNumColumns() : 1) - 1;

    // 1. Bewerking in Collectie
    if (sheetName === SHEET_NAMES.COLLECTION && startRow + numRows - 1 >= 2) {
      var firstDataRow = Math.max(2, startRow);
      var lastDataRow = startRow + numRows - 1;
      var touchedNames = [];
      var fetchedCount = 0;

      // Als kolom A (Kaart-ID) is ingevuld of geplakt -> direct ophalen via TCGdex API
      if (startCol <= 1 && endCol >= 1) {
        var ids = sheet.getRange(firstDataRow, 1, lastDataRow - firstDataRow + 1, 1).getValues();
        for (var i = 0; i < ids.length; i++) {
          var row = firstDataRow + i;
          var rawId = String(ids[i][0] || '').trim();
          if (!rawId) continue;

          var card = fetchAndPopulateRow_(ss, sheet, row, rawId, false);
          if (card && card.name) {
            touchedNames.push(card.name);
            fetchedCount++;
          }
          if (ids.length > 1 && typeof Utilities !== 'undefined' && Utilities.sleep) {
            Utilities.sleep(100);
          }
        }
      }

      // Sync Pokédex Binder bij wijzigingen aan Kaart-ID, Naam, Set, Zeldzaamheid, Variant of Locatie
      var affectsDex =
        (startCol <= 3 && endCol >= 1) ||
        (startCol <= 8 && endCol >= 7) ||
        (startCol <= 14 && endCol >= 12);

      if (affectsDex) {
        var needsFullSync = touchedNames.length === 0;
        var summary = syncPokedexBinder_(ss, needsFullSync ? null : touchedNames);

        if (ss.toast) {
          if (fetchedCount === 1 && touchedNames.length === 1) {
            var msg = summary.multiMatches.length > 0
              ? touchedNames[0] + ' aangevuld (' + summary.multiMatches[0] + '). Vervang eventueel in Pokédex Binder.'
              : touchedNames[0] + ' aangevuld & automatisch opgenomen in Pokédex Binder!';
            ss.toast(msg, '⚡ Pokémon API', 5);
          } else if (fetchedCount > 1) {
            ss.toast(
              fetchedCount + ' kaarten aangevuld en gesynchroniseerd met Pokédex Binder.',
              '⚡ Pokémon API',
              5
            );
          }
        }
      }
      return;
    }

    // 2. Bewerking in Pokédex Binder -> kolom I (Gekozen Kaart / Art)
    if (sheetName === SHEET_NAMES.POKEDEX && startCol <= 9 && endCol >= 9) {
      var firstDexRow = Math.max(DEX_START_ROW, startRow);
      var lastDexRow = Math.min(DEX_START_ROW + DEX_COUNT - 1, startRow + numRows - 1);
      if (firstDexRow > lastDexRow) return;

      var chosenValues = sheet.getRange(firstDexRow, 9, lastDexRow - firstDexRow + 1, 1).getValues();
      var checkboxRange = sheet.getRange(firstDexRow, 4, lastDexRow - firstDexRow + 1, 1);
      var newChecks = [];
      for (var d = 0; d < chosenValues.length; d++) {
        newChecks.push([String(chosenValues[d][0] || '').trim() !== '']);
      }
      checkboxRange.setValues(newChecks);
    }
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// WEB APP REST API (doGet / doPost)
// ============================================================================

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (!isAuthorized_(params.token)) {
      return jsonResponse_({ ok: false, error: 'Ongeldig of ontbrekend API-token.' });
    }

    var action = (params.action || 'bootstrap').toLowerCase();
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'ping') {
      return jsonResponse_({
        ok: true,
        spreadsheetName: ss.getName(),
        scriptVersion: SCRIPT_VERSION,
        syncedAt: new Date().toISOString()
      });
    }

    if (action === 'bootstrap') {
      return jsonResponse_({
        ok: true,
        data: buildBootstrapPayload_(ss)
      });
    }

    return jsonResponse_({ ok: false, error: 'Onbekende GET-actie: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  var lock = LockService.getDocumentLock();
  var acquired = false;
  try {
    var rawBody = (e && e.postData && e.postData.contents) || '{}';
    var body = JSON.parse(rawBody);
    var token = body.token || (e && e.parameter && e.parameter.token);

    if (!isAuthorized_(token)) {
      return jsonResponse_({ ok: false, error: 'Ongeldig of ontbrekend API-token.' });
    }

    var action = body.action || '';
    // Alleen-lezen opzoekactie: geen document-lock nodig (blokkeert schrijfacties van de app niet)
    if (action !== 'resolveCardmarketUrls') {
      lock.waitLock(20000);
      acquired = true;
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var payload = body.payload || {};
    var result;

    switch (action) {
      case 'addCard':
        result = handleAddCard_(ss, payload);
        break;
      case 'updateCard':
        result = handleUpdateCard_(ss, payload);
        break;
      case 'deleteCard':
        result = handleDeleteCard_(ss, payload);
        break;
      case 'updatePokedexSlot':
        result = handleUpdatePokedexSlot_(ss, payload);
        break;
      case 'addWishlist':
        result = handleAddWishlist_(ss, payload);
        break;
      case 'markWishlistFound':
        result = handleMarkWishlistFound_(ss, payload);
        break;
      case 'updateWishlist':
        result = handleUpdateWishlist_(ss, payload);
        break;
      case 'deleteWishlist':
        result = handleDeleteWishlist_(ss, payload);
        break;
      case 'logTrade':
        result = handleLogTrade_(ss, payload);
        break;
      case 'addFeedback':
        result = handleAddFeedback_(ss, payload);
        break;
      case 'updateFeedback':
        result = handleUpdateFeedback_(ss, payload);
        break;
      case 'deleteFeedback':
        result = handleDeleteFeedback_(ss, payload);
        break;
      case 'refreshPrices':
        result = refreshCollectionPrices_(ss);
        break;
      case 'batchMutations':
        result = handleBatchMutations_(ss, payload);
        break;
      case 'fetchKaartspotProfile':
        result = handleFetchKaartspotProfile_(payload);
        break;
      case 'resolveCardmarketUrls':
        result = handleResolveCardmarketUrls_(payload);
        break;
      case 'applyKaartspotSync':
        result = handleApplyKaartspotSync_(ss, payload);
        break;
      default:
        return jsonResponse_({ ok: false, error: 'Onbekende POST-actie: ' + action });
    }

    var responsePayload = {
      ok: true,
      result: result
    };
    if (!body.skipBootstrap) {
      responsePayload.data = buildBootstrapPayload_(ss);
    }
    return jsonResponse_(responsePayload);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (acquired) {
      lock.releaseLock();
    }
  }
}

function isAuthorized_(providedToken) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) {
    throw new Error(
      'API_TOKEN is nog niet ingesteld in Script Properties. Stel dit in via het PokéBinder-menu in Google Sheets.'
    );
  }
  return Boolean(providedToken) && String(providedToken).trim() === String(expected).trim();
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// BOOTSTRAP READER
// ============================================================================

function buildBootstrapPayload_(ss) {
  var collection = readCollection_(ss);
  return {
    scriptVersion: SCRIPT_VERSION,
    collection: collection,
    setProgress: readSetProgress_(ss, collection),
    pokedex: readPokedex_(ss),
    binderSlotsPerPage: readBinderSlotsPerPage_(ss),
    wishlist: readWishlist_(ss),
    trades: readTrades_(ss),
    feedback: readFeedback_(ss),
    settings: readSettings_(ss),
    syncedAt: new Date().toISOString()
  };
}

function readCollection_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.COLLECTION);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var hasCol23 = !sheet.getLastColumn || sheet.getLastColumn() >= 23;
  var numCols = hasCol23 ? 23 : 22;
  var values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  var items = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var cardId = String(row[0] || '').trim();
    var cardName = String(row[1] || '').trim();
    if (!cardId && !cardName) continue;

    var qty = toNumber_(row[11], 1);
    var purchasePrice = toNumber_(row[15], 0);
    var marketPrice = toNumber_(row[16], 0);

    items.push({
      rowIndex: i + 2,
      cardId: cardId,
      name: cardName,
      setName: String(row[2] || '').trim(),
      cardNumber: repairCardNumberCell_(row[3], cardId),
      language: String(row[4] || 'EN').trim(),
      type: String(row[5] || '').trim(),
      rarity: normalizeRarityLabel_(row[6]),
      variant: String(row[7] || 'Normal').trim(),
      condition: String(row[8] || 'Near Mint (NM)').trim(),
      grading: String(row[9] || 'Raw').trim(),
      grade: row[10] === '' || row[10] === null ? '' : String(row[10]).trim(),
      quantity: qty,
      storageLocation: String(row[12] || 'Hoofdbinder').trim(),
      binderDetail: String(row[13] || '').trim(),
      purchaseDate: formatDateCell_(row[14]),
      purchasePrice: purchasePrice,
      marketPrice: marketPrice,
      totalValue: toNumber_(row[17], marketPrice * qty),
      profitLoss: toNumber_(row[18], (marketPrice - purchasePrice) * qty),
      roiPercent: toNumber_(row[19], purchasePrice > 0 ? ((marketPrice - purchasePrice) / purchasePrice) * 100 : 0),
      forTrade: Boolean(row[20]),
      acquisitionMethod: hasCol23 ? String(row[22] || '').trim() : '',
      notes: String(row[21] || '').trim()
    });
  }
  return items;
}

function readSetProgress_(ss, collection) {
  var fallbackBySet = {};
  if (collection && collection.length) {
    for (var c = 0; c < collection.length; c++) {
      var card = collection[c];
      var setKey = String(card.setName || '').trim().toLowerCase();
      if (!setKey) continue;
      if (!fallbackBySet[setKey]) {
        fallbackBySet[setKey] = {
          setName: String(card.setName || '').trim(),
          uniqueIds: {},
          ownedUnique: 0,
          totalSetValue: 0,
          sampleCardNumber: String(card.cardNumber || '').trim()
        };
      }
      var bucket = fallbackBySet[setKey];
      var uid = String(card.cardId || (card.name + '-' + card.cardNumber)).toLowerCase();
      if (!bucket.uniqueIds[uid]) {
        bucket.uniqueIds[uid] = true;
        bucket.ownedUnique++;
      }
      var qty = Math.max(1, toNumber_(card.quantity, 1));
      bucket.totalSetValue += toNumber_(card.marketPrice, 0) * qty;
    }
  }

  var sheet = ss.getSheetByName(SHEET_NAMES.SET_PROGRESS);
  var sets = [];
  var seenSets = {};

  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var setCols = sheet.getMaxColumns ? Math.min(9, sheet.getMaxColumns()) : 9;
      var values = sheet.getRange(2, 1, lastRow - 1, setCols).getValues();
      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var setName = String(row[0] || '').trim();
        if (!setName) continue;
        var key = setName.toLowerCase();
        seenSets[key] = true;
        var fb = fallbackBySet[key];

        var totalCards = toNumber_(row[2], 0);
        var ownedUnique = toNumber_(row[3], 0);
        if (ownedUnique === 0 && fb && fb.ownedUnique > 0) {
          ownedUnique = fb.ownedUnique;
        }
        if (totalCards < ownedUnique) {
          totalCards = ownedUnique;
        }
        var remaining = toNumber_(row[4], Math.max(0, totalCards - ownedUnique));
        if (ownedUnique > 0 && remaining === 0 && totalCards > ownedUnique) {
          remaining = Math.max(0, totalCards - ownedUnique);
        }
        var rawPct = toNumber_(row[5], totalCards > 0 ? ownedUnique / totalCards : 0);
        var progressPercent = rawPct <= 1 && rawPct > 0 ? rawPct * 100 : rawPct;
        if (progressPercent === 0 && ownedUnique > 0 && totalCards > 0) {
          progressPercent = (ownedUnique / totalCards) * 100;
        }
        var totalSetValue = toNumber_(row[7], 0);
        if (totalSetValue === 0 && fb && fb.totalSetValue > 0) {
          totalSetValue = Math.round(fb.totalSetValue * 100) / 100;
        }

        sets.push({
          rowIndex: i + 2,
          setName: setName,
          series: String(row[1] || '').trim(),
          totalCards: totalCards,
          ownedUnique: ownedUnique,
          remaining: remaining,
          progressPercent: Math.round(progressPercent * 10) / 10,
          totalSetValue: totalSetValue,
          setCode: String(row[8] || '').trim() || undefined
        });
      }
    }
  }

  for (var fbKey in fallbackBySet) {
    if (!Object.prototype.hasOwnProperty.call(fallbackBySet, fbKey) || seenSets[fbKey]) continue;
    var missingFb = fallbackBySet[fbKey];
    if (missingFb.ownedUnique <= 0) continue;
    var denomParts = missingFb.sampleCardNumber.split('/');
    var parsedDenom = denomParts.length > 1 ? parseInt(denomParts[1].replace(/\D/g, ''), 10) : 0;
    var fbTotal = Math.max(parsedDenom || 100, missingFb.ownedUnique);
    sets.push({
      setName: missingFb.setName,
      series: 'Pokémon TCG',
      totalCards: fbTotal,
      ownedUnique: missingFb.ownedUnique,
      remaining: Math.max(0, fbTotal - missingFb.ownedUnique),
      progressPercent: fbTotal > 0 ? Math.round((missingFb.ownedUnique / fbTotal) * 1000) / 10 : 0,
      totalSetValue: Math.round(missingFb.totalSetValue * 100) / 100
    });
  }

  return sets;
}

function readBinderSlotsPerPage_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.POKEDEX);
  if (!sheet) return 9;
  var val = toNumber_(sheet.getRange('H4').getValue(), 9);
  if (val === 4 || val === 9 || val === 12 || val === 16 || val === 20) return val;
  return 9;
}

function readPokedex_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.POKEDEX);
  if (!sheet) return [];
  var lastRow = Math.min(sheet.getLastRow(), 1032);
  if (lastRow < 8) return [];
  var values = sheet.getRange(8, 1, lastRow - 7, 10).getValues();
  var slots = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var dexNum = toNumber_(row[1], 0);
    var name = String(row[2] || '').trim();
    if (!dexNum || !name) continue;
    slots.push({
      rowIndex: i + 8,
      generation: String(row[0] || '').trim(),
      dexNumber: dexNum,
      pokemonName: name,
      inBinder: Boolean(row[3]),
      inCollectionCount: toNumber_(row[4], 0),
      status: String(row[5] || '').trim(),
      page: toNumber_(row[6], 1),
      position: String(row[7] || '').trim(),
      selectedCard: String(row[8] || '').trim(),
      upgradeWanted: Boolean(row[9])
    });
  }
  return slots;
}

function readWishlist_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var wishLastCol = sheet.getLastColumn ? sheet.getLastColumn() : 14;
  var hasCol13 = wishLastCol >= 13;
  var hasCol14 = wishLastCol >= 14;
  var numCols = hasCol14 ? 14 : (hasCol13 ? 13 : 12);
  var values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  var items = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var name = String(row[0] || '').trim();
    if (!name) continue;
    var maxBudget = toNumber_(row[6], 0);
    var marketPrice = toNumber_(row[7], 0);
    var cardId = hasCol13 ? String(row[12] || '').trim() : '';
    items.push({
      rowIndex: i + 2,
      cardId: cardId || undefined,
      cardName: name,
      setName: String(row[1] || '').trim(),
      cardNumber: repairCardNumberCell_(row[2], cardId),
      desiredVariant: String(row[3] || 'Normal').trim(),
      minCondition: String(row[4] || 'Near Mint (NM)').trim(),
      priority: String(row[5] || 'Gemiddeld').trim(),
      maxBudget: maxBudget,
      marketPrice: marketPrice,
      difference: toNumber_(row[8], maxBudget - marketPrice),
      dealStatus: String(row[9] || '').trim(),
      notes: String(row[10] || '').trim(),
      found: Boolean(row[11]),
      language: hasCol14 ? (String(row[13] || '').trim() || undefined) : undefined
    });
  }
  return items;
}

function readTrades_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.TRADES);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 22) return [];
  var values = sheet.getRange(22, 1, lastRow - 21, 10).getValues();
  var items = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var cardName = String(row[1] || '').trim();
    if (!cardName && !row[0]) continue;
    var buyPrice = toNumber_(row[4], 0);
    var sellValue = toNumber_(row[5], 0);
    var fees = toNumber_(row[6], 0);
    items.push({
      rowIndex: i + 22,
      date: formatDateCell_(row[0]),
      cardName: cardName,
      setName: String(row[2] || '').trim(),
      type: String(row[3] || 'Verkoop').trim(),
      purchasePrice: buyPrice,
      saleValue: sellValue,
      platformFees: fees,
      netResult: toNumber_(row[7], sellValue - buyPrice - fees),
      counterparty: String(row[8] || '').trim(),
      notes: String(row[9] || '').trim()
    });
  }
  return items;
}

function readSettings_(ss) {
  var defaults = {
    languages: ['EN', 'NL', 'JP', 'DE', 'FR', 'KR', 'CHS', 'ZHT'],
    types: [
      'Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting',
      'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless', 'Trainer', 'Energy'
    ],
    rarities: [
      'Common', 'Uncommon', 'Rare', 'Double Rare', 'Illustration Rare',
      'Ultra Rare', 'Special Illustration Rare', 'Hyper Rare', 'Promo', 'Holo Rare'
    ],
    variants: [
      'Normal', 'Reverse Holo', 'Holo', 'Full Art', 'Alt Art', 'First Edition', 'Stamped / Promo'
    ],
    conditions: [
      'Mint (MT)', 'Near Mint (NM)', 'Excellent (EX)', 'Good (GD)',
      'Light Played (LP)', 'Played (PL)', 'Poor (PO)'
    ],
    gradings: ['Raw', 'PSA', 'BGS', 'CGC', 'TAG'],
    storageLocations: [
      'Hoofdbinder', 'Toploader Binder', 'Trade Binder', 'Speeldeck', 'Display / Kast', 'Bulk Box'
    ],
    priorities: ['Hoog', 'Gemiddeld', 'Laag', 'Grail'],
    tradeTypes: ['Verkoop', 'Ruil', 'Inruil'],
    acquisitionMethods: [
      'Pack Pull', 'Single gekocht', 'Geruild (Trade)', 'Promo / Sealed Box', 'Cadeau', 'Oude collectie'
    ]
  };

  var sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) return defaults;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return defaults;
  var colCount = sheet.getLastColumn ? Math.min(Math.max(sheet.getLastColumn(), 1), 10) : 9;
  var matrix = sheet.getRange(1, 1, lastRow, colCount).getValues();
  var headers = matrix[0].map(function (h) {
    return String(h || '').toLowerCase();
  });

  var keyMap = [
    { key: 'languages', match: ['taal', 'lang'] },
    { key: 'types', match: ['type'] },
    { key: 'rarities', match: ['zeldzaam', 'rarit'] },
    { key: 'variants', match: ['variant'] },
    { key: 'conditions', match: ['conditi'] },
    { key: 'gradings', match: ['grad'] },
    { key: 'storageLocations', match: ['opslag', 'locatie'] },
    { key: 'priorities', match: ['priorit'] },
    { key: 'tradeTypes', match: ['transactie', 'ruil'] },
    { key: 'acquisitionMethods', match: ['herkomst', 'pull', 'acquisit'] }
  ];

  for (var col = 0; col < colCount; col++) {
    var colVals = [];
    for (var r = 1; r < matrix.length; r++) {
      var v = String(matrix[r][col] || '').trim();
      if (v) colVals.push(v);
    }
    if (!colVals.length) continue;

    var header = headers[col];
    var assigned = false;
    for (var k = 0; k < keyMap.length; k++) {
      for (var m = 0; m < keyMap[k].match.length; m++) {
        if (header.indexOf(keyMap[k].match[m]) !== -1) {
          defaults[keyMap[k].key] = colVals;
          assigned = true;
          break;
        }
      }
      if (assigned) break;
    }
    if (!assigned && keyMap[col]) {
      defaults[keyMap[col].key] = colVals;
    }
  }

  defaults.languages = mergeLanguageOptions_(defaults.languages);
  defaults.rarities = normalizeRarityOptions_(defaults.rarities);
  return defaults;
}

/** Eén label voor holo-zeldzaamheid zoals Cardmarket die noemt: "Vintage Holo"/"Rare Holo" -> "Holo Rare". */
function normalizeRarityLabel_(raw) {
  var text = String(raw === null || raw === undefined ? '' : raw).trim();
  var lower = text.toLowerCase();
  return lower === 'vintage holo' || lower === 'rare holo' || lower === 'holo rare' ? 'Holo Rare' : text;
}

function normalizeRarityOptions_(options) {
  var result = [];
  var list = options || [];
  for (var i = 0; i < list.length; i++) {
    var label = normalizeRarityLabel_(list[i]);
    if (label && result.indexOf(label) === -1) result.push(label);
  }
  if (result.indexOf('Holo Rare') === -1) result.push('Holo Rare');
  return result;
}

/** Vult een bestaande Taal-dropdown aan met ontbrekende standaardtalen (CHS, ZHT, ...). */
function mergeLanguageOptions_(existing) {
  var wanted = ['EN', 'NL', 'JP', 'DE', 'FR', 'KR', 'CHS', 'ZHT'];
  var result = [];
  var seen = {};
  var all = (existing || []).concat(wanted);
  for (var i = 0; i < all.length; i++) {
    var code = String(all[i] || '').trim().toUpperCase();
    if (!code || seen[code]) continue;
    seen[code] = true;
    result.push(code);
  }
  return result;
}

// ============================================================================
// MUTATION HANDLERS (NEVER OVERWRITE FORMULA COLUMNS!)
// ============================================================================

function handleAddCard_(ss, payload, options) {
  var sheet = ss.getSheetByName(SHEET_NAMES.COLLECTION);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.COLLECTION + '" niet gevonden.');

  var rawCardInput = String(payload.cardId || '').trim();
  var cardId = normalizeCardId_(rawCardInput, ss);
  var cardData = Object.assign({}, payload, { cardId: cardId });

  // Vul ontbrekende kaartmetadata aan via TCGdex (gebruik ruwe invoer zodat multi-set codes zoals 30C alle sets proberen)
  if (rawCardInput && (!cardData.name || !cardData.setName || !cardData.cardNumber)) {
    var fetched = fetchTcgdexCard_(rawCardInput, ss);
    if (fetched) {
      cardData.cardId = fetched.id || cardData.cardId;
      cardData.name = cardData.name || fetched.name;
      cardData.setName = cardData.setName || (fetched.set && fetched.set.name) || '';
      cardData.cardNumber =
        cardData.cardNumber ||
        formatCardNumber_(fetched.localId, fetched.set && fetched.set.cardCount && fetched.set.cardCount.official);
      cardData.type = cardData.type || extractCardType_(fetched);
      cardData.rarity = cardData.rarity || mapTcgdexRarity_(fetched.rarity);
      if (!cardData.marketPrice) {
        cardData.marketPrice = extractCardmarketEur_(fetched, cardData.variant || '');
      }
      cardData.setId = (fetched.set && fetched.set.id) || cardData.setId || '';
      cardData.seriesName = (fetched.set && fetched.set.serie && fetched.set.serie.name) || cardData.seriesName || '';
      cardData.setTotalCards =
        (fetched.set && fetched.set.cardCount && (fetched.set.cardCount.official || fetched.set.cardCount.total)) ||
        cardData.setTotalCards ||
        0;
    }
  }

  var targetRow = findFirstEmptyRow_(sheet, 2, [1, 2]);
  writeCollectionRow_(sheet, targetRow, cardData);

  if (cardData.setName) {
    ensureSetInProgress_(
      ss,
      cardData.setName,
      cardData.seriesName || '',
      toNumber_(cardData.setTotalCards, 0),
      cardData.setId || '',
      cardData.setCode || extractSetCodeFromNotes_(cardData.notes)
    );
  }

  if (!(options && options.skipPokedexSync)) {
    syncPokedexBinder_(ss, cardData.name ? [cardData.name] : null);
  }
  return { rowIndex: targetRow, cardId: cardData.cardId, name: cardData.name || '' };
}

function ensureCollectionAcquisitionColumn_(sheet) {
  if (sheet.getMaxColumns && sheet.getMaxColumns() < 23 && sheet.insertColumnAfter) {
    sheet.insertColumnAfter(sheet.getMaxColumns());
  }
  if (!String(sheet.getRange(1, 23).getValue() || '').trim()) {
    sheet.getRange(1, 23).setValue('Herkomst');
  }
}

function handleUpdateCard_(ss, payload, options) {
  var sheet = ss.getSheetByName(SHEET_NAMES.COLLECTION);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.COLLECTION + '" niet gevonden.');

  var rowIndex = resolveCollectionRowIndex_(sheet, payload.rowIndex, payload.cardId);
  if (rowIndex < 2) throw new Error('Kaartrij niet gevonden om bij te werken.');

  var existingAQ = sheet.getRange(rowIndex, 1, 1, 17).getValues()[0];
  var existingUV = sheet.getRange(rowIndex, 21, 1, 2).getValues()[0];
  var hasCol23 = !sheet.getLastColumn || sheet.getLastColumn() >= 23;
  var existingW = hasCol23 ? String(sheet.getRange(rowIndex, 23).getValue() || '').trim() : '';

  var oldName = String(existingAQ[1] || '').trim();
  var merged = {
    cardId: payload.cardId !== undefined ? payload.cardId : existingAQ[0],
    name: payload.name !== undefined ? payload.name : existingAQ[1],
    setName: payload.setName !== undefined ? payload.setName : existingAQ[2],
    cardNumber: payload.cardNumber !== undefined ? payload.cardNumber : existingAQ[3],
    language: payload.language !== undefined ? payload.language : existingAQ[4],
    type: payload.type !== undefined ? payload.type : existingAQ[5],
    rarity: payload.rarity !== undefined ? payload.rarity : existingAQ[6],
    variant: payload.variant !== undefined ? payload.variant : existingAQ[7],
    condition: payload.condition !== undefined ? payload.condition : existingAQ[8],
    grading: payload.grading !== undefined ? payload.grading : existingAQ[9],
    grade: payload.grade !== undefined ? payload.grade : existingAQ[10],
    quantity: payload.quantity !== undefined ? toNumber_(payload.quantity, 1) : existingAQ[11],
    storageLocation: payload.storageLocation !== undefined ? payload.storageLocation : existingAQ[12],
    binderDetail: payload.binderDetail !== undefined ? payload.binderDetail : existingAQ[13],
    purchaseDate: payload.purchaseDate !== undefined ? payload.purchaseDate : formatDateCell_(existingAQ[14]),
    purchasePrice: payload.purchasePrice !== undefined ? toNumber_(payload.purchasePrice, 0) : existingAQ[15],
    marketPrice: payload.marketPrice !== undefined ? toNumber_(payload.marketPrice, 0) : existingAQ[16],
    forTrade: payload.forTrade !== undefined ? Boolean(payload.forTrade) : Boolean(existingUV[0]),
    acquisitionMethod:
      payload.acquisitionMethod !== undefined ? String(payload.acquisitionMethod || '').trim() : existingW,
    notes: payload.notes !== undefined ? payload.notes : existingUV[1]
  };

  var newName = String(merged.name || '').trim();
  var touchedNames = [];
  if (oldName) touchedNames.push(oldName);
  if (newName && touchedNames.indexOf(newName) === -1) touchedNames.push(newName);

  writeCollectionRow_(sheet, rowIndex, merged);
  if (!(options && options.skipPokedexSync)) {
    syncPokedexBinder_(ss, touchedNames.length > 0 ? touchedNames : null);
  }
  return { rowIndex: rowIndex, touchedNames: touchedNames };
}

function handleDeleteCard_(ss, payload, options) {
  var sheet = ss.getSheetByName(SHEET_NAMES.COLLECTION);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.COLLECTION + '" niet gevonden.');

  var rowIndex = resolveCollectionRowIndex_(sheet, payload.rowIndex, payload.cardId);
  if (rowIndex < 2) throw new Error('Kaartrij niet gevonden om te verwijderen.');

  var deletedName = String(sheet.getRange(rowIndex, 2).getValue() || '').trim();

  // Wis alleen A:Q, U:V en optioneel W; laat formules in R:T intact!
  sheet.getRange(rowIndex, 1, 1, 17).clearContent();
  sheet.getRange(rowIndex, 21, 1, 2).setValues([[false, '']]);
  if (!sheet.getLastColumn || sheet.getLastColumn() >= 23) {
    sheet.getRange(rowIndex, 23).clearContent();
  }
  if (!(options && options.skipPokedexSync)) {
    syncPokedexBinder_(ss, deletedName ? [deletedName] : null);
  }
  return { deletedRowIndex: rowIndex, deletedName: deletedName };
}

function writeCollectionRow_(sheet, rowIndex, data) {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Amsterdam', 'yyyy-MM-dd');
  var rowAQ = [
    String(data.cardId || '').trim(),
    String(data.name || '').trim(),
    String(data.setName || '').trim(),
    String(data.cardNumber || '').trim(),
    String(data.language || 'EN').trim(),
    String(data.type || '').trim(),
    String(data.rarity || 'Rare').trim(),
    String(data.variant || 'Normal').trim(),
    String(data.condition || 'Near Mint (NM)').trim(),
    String(data.grading || 'Raw').trim(),
    data.grade === '' || data.grade === null || data.grade === undefined ? '' : data.grade,
    Math.max(1, toNumber_(data.quantity, 1)),
    String(data.storageLocation || 'Hoofdbinder').trim(),
    String(data.binderDetail || '').trim(),
    String(data.purchaseDate || today).trim(),
    toNumber_(data.purchasePrice, 0),
    toNumber_(data.marketPrice, 0)
  ];
  // Kolom D (kaartnummer) als platte tekst zodat "5/11" nooit als datum (5 november) wordt opgeslagen
  sheet.getRange(rowIndex, 4).setNumberFormat('@');
  // Kolommen A:Q (1..17) en U:V (21..22) — sla R:T (18..20) bewust over!
  sheet.getRange(rowIndex, 1, 1, 17).setValues([rowAQ]);
  sheet.getRange(rowIndex, 21, 1, 2).setValues([[Boolean(data.forTrade), String(data.notes || '').trim()]]);

  if (data.acquisitionMethod !== undefined) {
    var acq = String(data.acquisitionMethod || '').trim();
    var alreadyHasCol23 = sheet.getLastColumn ? sheet.getLastColumn() >= 23 : true;
    if (acq || alreadyHasCol23) {
      ensureCollectionAcquisitionColumn_(sheet);
      sheet.getRange(rowIndex, 23).setValue(acq);
    }
  }
}

function handleUpdatePokedexSlot_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.POKEDEX);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.POKEDEX + '" niet gevonden.');

  if (payload.slotsPerPage !== undefined) {
    var spp = toNumber_(payload.slotsPerPage, 9);
    if (spp === 4 || spp === 9 || spp === 12 || spp === 16 || spp === 20) {
      var h4Range = sheet.getRange('H4');
      // Upgrade oude dropdown-datavalidatie op H4 automatisch zodat 20 (5x4) altijd geaccepteerd wordt
      if (spp === 20 && h4Range.getDataValidation && SpreadsheetApp.newDataValidation) {
        try {
          var existingRule = h4Range.getDataValidation();
          if (
            existingRule &&
            existingRule.getCriteriaType &&
            SpreadsheetApp.DataValidationCriteria &&
            existingRule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST
          ) {
            var listVals = existingRule.getCriteriaValues()[0] || [];
            var has20 = listVals.some(function (v) {
              return Number(v) === 20;
            });
            if (!has20) {
              var upgradedRule = SpreadsheetApp.newDataValidation()
                .requireValueInList(['4', '9', '12', '16', '20'], true)
                .setAllowInvalid(true)
                .build();
              h4Range.setDataValidation(upgradedRule);
            }
          }
        } catch (e) {
          // Negeer als getDataValidation niet beschikbaar is
        }
      }
      h4Range.setValue(spp);
    }
  }

  if (payload.dexNumber) {
    var targetRow = findPokedexRowByNumber_(sheet, toNumber_(payload.dexNumber, 0));
    if (targetRow >= 8) {
      if (payload.inBinder !== undefined) {
        sheet.getRange(targetRow, 4).setValue(Boolean(payload.inBinder));
      }
      if (payload.selectedCard !== undefined) {
        sheet.getRange(targetRow, 9).setValue(String(payload.selectedCard || '').trim());
      }
      if (payload.upgradeWanted !== undefined) {
        sheet.getRange(targetRow, 10).setValue(Boolean(payload.upgradeWanted));
      }
    }
  }

  return { updated: true };
}

function ensureWishlistCardIdColumn_(sheet) {
  if (sheet.getMaxColumns && sheet.getMaxColumns() < 13 && sheet.insertColumnAfter) {
    sheet.insertColumnAfter(sheet.getMaxColumns());
  }
  if (!String(sheet.getRange(1, 13).getValue() || '').trim()) {
    sheet.getRange(1, 13).setValue('Kaart-ID');
  }
}

/** Kolom N (14) "Taal" op Verlanglijst: gewenste kaarttaal voor scan, lookup en Cardmarket-filter. */
function ensureWishlistLanguageColumn_(sheet) {
  if (sheet.getMaxColumns && sheet.getMaxColumns() < 14 && sheet.insertColumnsAfter) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 14 - sheet.getMaxColumns());
  }
  if (!String(sheet.getRange(1, 14).getValue() || '').trim()) {
    sheet.getRange(1, 14).setValue('Taal');
  }
}

function handleAddWishlist_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.WISHLIST + '" niet gevonden.');

  var targetRow = findFirstEmptyRow_(sheet, 2, [1]);
  // Kolom C (kaartnummer) als platte tekst zodat "5/11" nooit als datum wordt opgeslagen
  sheet.getRange(targetRow, 3).setNumberFormat('@');
  // Kolommen A:H (1..8) en K:L (11..12) — sla I:J (formules) bewust over!
  sheet.getRange(targetRow, 1, 1, 8).setValues([[
    String(payload.cardName || '').trim(),
    String(payload.setName || '').trim(),
    String(payload.cardNumber || '').trim(),
    String(payload.desiredVariant || 'Normal').trim(),
    String(payload.minCondition || 'Near Mint (NM)').trim(),
    String(payload.priority || 'Gemiddeld').trim(),
    toNumber_(payload.maxBudget, 0),
    toNumber_(payload.marketPrice, 0)
  ]]);
  sheet.getRange(targetRow, 11, 1, 2).setValues([[String(payload.notes || '').trim(), false]]);

  var cardId = String(payload.cardId || '').trim();
  var alreadyHasCol13 = sheet.getLastColumn ? sheet.getLastColumn() >= 13 : false;
  if (cardId || alreadyHasCol13) {
    ensureWishlistCardIdColumn_(sheet);
    sheet.getRange(targetRow, 13).setValue(cardId);
  }
  var wishLang = String(payload.language || '').trim().toUpperCase();
  if (wishLang && wishLang !== 'EN') {
    ensureWishlistLanguageColumn_(sheet);
    sheet.getRange(targetRow, 14).setValue(wishLang);
  }
  return { rowIndex: targetRow };
}

function findWishlistRow_(sheet, rowIndexInput, cardName) {
  var rowIndex = toNumber_(rowIndexInput, 0);
  if (rowIndex >= 2) return rowIndex;
  if (cardName) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var needle = String(cardName).trim().toLowerCase();
      for (var i = 0; i < names.length; i++) {
        if (String(names[i][0] || '').trim().toLowerCase() === needle) {
          return i + 2;
        }
      }
    }
  }
  return 0;
}

function handleMarkWishlistFound_(ss, payload, options) {
  var sheet = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.WISHLIST + '" niet gevonden.');

  var rowIndex = findWishlistRow_(sheet, payload.rowIndex, payload.cardName);
  if (rowIndex < 2) throw new Error('Verlanglijst-item niet gevonden.');

  sheet.getRange(rowIndex, 12).setValue(true);

  var addedCard = null;
  if (payload.addToCollection && payload.cardPayload) {
    addedCard = handleAddCard_(ss, payload.cardPayload, options);
  }
  return {
    rowIndex: rowIndex,
    found: true,
    addedCardRowIndex: addedCard ? addedCard.rowIndex : undefined,
    addedCardName: addedCard ? addedCard.name : undefined
  };
}

function handleUpdateWishlist_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.WISHLIST + '" niet gevonden.');

  var rowIndex = findWishlistRow_(sheet, payload.rowIndex, payload.originalCardName || payload.cardName);
  if (rowIndex < 2) throw new Error('Verlanglijst-item niet gevonden om bij te werken.');

  var curAH = sheet.getRange(rowIndex, 1, 1, 8).getValues()[0];
  var curKL = sheet.getRange(rowIndex, 11, 1, 2).getValues()[0];

  sheet.getRange(rowIndex, 3).setNumberFormat('@');
  // Kolommen A:H (1..8) en K:L (11..12) — sla I:J (formules) bewust over!
  sheet.getRange(rowIndex, 1, 1, 8).setValues([[
    payload.cardName !== undefined ? String(payload.cardName || '').trim() : String(curAH[0] || ''),
    payload.setName !== undefined ? String(payload.setName || '').trim() : String(curAH[1] || ''),
    payload.cardNumber !== undefined ? String(payload.cardNumber || '').trim() : repairCardNumberCell_(curAH[2], payload.cardId),
    payload.desiredVariant !== undefined ? String(payload.desiredVariant || 'Normal').trim() : String(curAH[3] || 'Normal'),
    payload.minCondition !== undefined ? String(payload.minCondition || 'Near Mint (NM)').trim() : String(curAH[4] || 'Near Mint (NM)'),
    payload.priority !== undefined ? String(payload.priority || 'Gemiddeld').trim() : String(curAH[5] || 'Gemiddeld'),
    payload.maxBudget !== undefined ? toNumber_(payload.maxBudget, 0) : toNumber_(curAH[6], 0),
    payload.marketPrice !== undefined ? toNumber_(payload.marketPrice, 0) : toNumber_(curAH[7], 0)
  ]]);

  sheet.getRange(rowIndex, 11, 1, 2).setValues([[
    payload.notes !== undefined ? String(payload.notes || '').trim() : String(curKL[0] || ''),
    payload.found !== undefined ? Boolean(payload.found) : (curKL[1] === true || String(curKL[1]).toLowerCase() === 'true')
  ]]);

  if (payload.cardId !== undefined) {
    var cardId = String(payload.cardId || '').trim();
    var alreadyHasCol13 = sheet.getLastColumn ? sheet.getLastColumn() >= 13 : false;
    if (cardId || alreadyHasCol13) {
      ensureWishlistCardIdColumn_(sheet);
      sheet.getRange(rowIndex, 13).setValue(cardId);
    }
  }
  if (payload.language !== undefined) {
    var updLang = String(payload.language || '').trim().toUpperCase();
    var hasLangCol = sheet.getLastColumn ? sheet.getLastColumn() >= 14 : true;
    if ((updLang && updLang !== 'EN') || hasLangCol) {
      ensureWishlistLanguageColumn_(sheet);
      sheet.getRange(rowIndex, 14).setValue(updLang === 'EN' ? '' : updLang);
    }
  }
  return { rowIndex: rowIndex, updated: true };
}

function handleDeleteWishlist_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.WISHLIST + '" niet gevonden.');

  var rowIndex = findWishlistRow_(sheet, payload.rowIndex, payload.cardName);
  if (rowIndex < 2) throw new Error('Verlanglijst-item niet gevonden om te verwijderen.');

  // Wis alleen invoerkolommen A:H, K, L en optioneel M — formules I:J blijven intact!
  sheet.getRange(rowIndex, 1, 1, 8).clearContent();
  sheet.getRange(rowIndex, 11, 1, 1).clearContent();
  sheet.getRange(rowIndex, 12, 1, 1).setValue(false);
  if (sheet.getLastColumn && sheet.getLastColumn() >= 13) {
    sheet.getRange(rowIndex, 13, 1, 1).clearContent();
  }
  return { rowIndex: rowIndex, deleted: true };
}

function handleBatchMutations_(ss, payload) {
  var mutations = (payload && payload.mutations) || [];
  var collectionRowMap = {};
  var wishlistRowMap = {};
  var touchedCardNames = [];
  var needsFullPokedexSync = false;
  var results = [];
  var pushTouchedName = function (name) {
    var clean = String(name || '').trim();
    if (clean && touchedCardNames.indexOf(clean) === -1) {
      touchedCardNames.push(clean);
    }
  };

  for (var i = 0; i < mutations.length; i++) {
    var item = mutations[i] || {};
    var itemAction = item.action || '';
    var itemPayload = Object.assign({}, item.payload || {});
    var tempRow = toNumber_(item.tempRowIndex, 0);

    try {
      // Remap tijdelijke negatieve rijnummers van eerdere add-acties binnen dezelfde batch
      if ((itemAction === 'updateCard' || itemAction === 'deleteCard') && toNumber_(itemPayload.rowIndex, 0) < 0) {
        var mappedColRow = collectionRowMap[String(itemPayload.rowIndex)];
        if (mappedColRow >= 2) {
          itemPayload.rowIndex = mappedColRow;
        }
      }
      if (
        (itemAction === 'updateWishlist' || itemAction === 'deleteWishlist' || itemAction === 'markWishlistFound') &&
        toNumber_(itemPayload.rowIndex, 0) < 0
      ) {
        var mappedWlRow = wishlistRowMap[String(itemPayload.rowIndex)];
        if (mappedWlRow >= 2) {
          itemPayload.rowIndex = mappedWlRow;
        }
      }

      var itemRes;
      switch (itemAction) {
        case 'addCard':
          itemRes = handleAddCard_(ss, itemPayload, { skipPokedexSync: true });
          if (tempRow < 0 && itemRes && itemRes.rowIndex >= 2) {
            collectionRowMap[String(tempRow)] = itemRes.rowIndex;
          }
          if (itemRes && itemRes.name) pushTouchedName(itemRes.name);
          else needsFullPokedexSync = true;
          break;
        case 'updateCard':
          itemRes = handleUpdateCard_(ss, itemPayload, { skipPokedexSync: true });
          if (itemRes && itemRes.touchedNames && itemRes.touchedNames.length > 0) {
            for (var tn = 0; tn < itemRes.touchedNames.length; tn++) {
              pushTouchedName(itemRes.touchedNames[tn]);
            }
          } else {
            needsFullPokedexSync = true;
          }
          break;
        case 'deleteCard':
          itemRes = handleDeleteCard_(ss, itemPayload, { skipPokedexSync: true });
          if (itemRes && itemRes.deletedName) pushTouchedName(itemRes.deletedName);
          else needsFullPokedexSync = true;
          break;
        case 'updatePokedexSlot':
          itemRes = handleUpdatePokedexSlot_(ss, itemPayload);
          break;
        case 'addWishlist':
          itemRes = handleAddWishlist_(ss, itemPayload);
          if (tempRow < 0 && itemRes && itemRes.rowIndex >= 2) {
            wishlistRowMap[String(tempRow)] = itemRes.rowIndex;
          }
          break;
        case 'markWishlistFound':
          itemRes = handleMarkWishlistFound_(ss, itemPayload, { skipPokedexSync: true });
          if (tempRow < 0 && itemRes && itemRes.addedCardRowIndex >= 2) {
            collectionRowMap[String(tempRow)] = itemRes.addedCardRowIndex;
          }
          if (itemRes && itemRes.addedCardName) pushTouchedName(itemRes.addedCardName);
          else if (itemPayload.addToCollection) needsFullPokedexSync = true;
          break;
        case 'updateWishlist':
          itemRes = handleUpdateWishlist_(ss, itemPayload);
          break;
        case 'deleteWishlist':
          itemRes = handleDeleteWishlist_(ss, itemPayload);
          break;
        case 'logTrade':
          itemRes = handleLogTrade_(ss, itemPayload);
          break;
        case 'addFeedback':
          itemRes = handleAddFeedback_(ss, itemPayload);
          break;
        case 'updateFeedback':
          itemRes = handleUpdateFeedback_(ss, itemPayload);
          break;
        case 'deleteFeedback':
          itemRes = handleDeleteFeedback_(ss, itemPayload);
          break;
        default:
          throw new Error('Onbekende batch-actie: ' + itemAction);
      }

      results.push({
        id: item.id || ('item-' + i),
        action: itemAction,
        ok: true,
        result: itemRes
      });
    } catch (itemErr) {
      results.push({
        id: item.id || ('item-' + i),
        action: itemAction,
        ok: false,
        error: String(itemErr && itemErr.message ? itemErr.message : itemErr)
      });
    }
  }

  if (needsFullPokedexSync) {
    syncPokedexBinder_(ss, null);
  } else if (touchedCardNames.length > 0) {
    syncPokedexBinder_(ss, touchedCardNames);
  }

  return { results: results };
}

// ============================================================================
// KAARTSPOT BINDER SYNC (SERVER-SIDE FETCH ZONDER CORS + BULK SHEETS IMPORT)
// ============================================================================

/**
 * Zoekt de exacte Cardmarket-productpagina (kanonieke slug-URL) van kaarten op via de doorverwijzing van
 * prices.pokemontcg.io (302 -> Cardmarket). De app kan die redirect zelf niet lezen (CORS), Apps Script wel.
 * Die dienst geeft soms tijdelijk een 502; daarom wordt er meerdere keren met pauze opnieuw geprobeerd.
 *
 * payload.items = [{ cardId: 'sv05-177', ptcgId: 'sv5-177' }, ...] (max 8 per aanroep)
 * Resultaat: {
 *   urls:     { '<cardId>': 'https://www.cardmarket.com/en/Pokemon/Products/Singles/<Set>/<Kaart>' },
 *   notFound: ['<cardId>', ...]   // definitief onbekend (404): niet opnieuw proberen
 * }   (tijdelijk mislukt = in geen van beide: de app probeert het later opnieuw)
 * De gevonden links worden ook in de notities van Collectie en Verlanglijst bewaard, zodat elke kaart
 * maar één keer opgezocht hoeft te worden en alle apparaten dezelfde link gebruiken.
 */
function handleResolveCardmarketUrls_(payload) {
  var items = (payload && payload.items) || [];
  var urls = {};
  var notFound = [];
  var max = Math.min(items.length, 8);
  for (var i = 0; i < max; i++) {
    var cardId = String((items[i] && items[i].cardId) || '').trim();
    var ptcgId = String((items[i] && items[i].ptcgId) || '').trim();
    if (!cardId || !/^[A-Za-z0-9.]+-[A-Za-z0-9]+$/.test(ptcgId)) continue;
    var outcome = resolveCardmarketProductUrl_(ptcgId);
    if (outcome.url) urls[cardId] = outcome.url;
    else if (outcome.notFound) notFound.push(cardId);
  }

  var hasUrls = false;
  for (var k in urls) {
    if (Object.prototype.hasOwnProperty.call(urls, k)) hasUrls = true;
  }
  if (hasUrls) {
    var lock = LockService.getDocumentLock();
    var locked = false;
    try {
      lock.waitLock(15000);
      locked = true;
      persistCardmarketUrls_(SpreadsheetApp.getActiveSpreadsheet(), urls);
    } catch (e) {
      // Opslaan in de Sheet is een extraatje: de app gebruikt de link sowieso al
    } finally {
      if (locked) lock.releaseLock();
    }
  }
  return { urls: urls, notFound: notFound };
}

/** Eén opzoeking met meerdere pogingen. Geeft { url } bij succes, { notFound: true } bij 404, anders { } (tijdelijk). */
function resolveCardmarketProductUrl_(ptcgId) {
  var endpoint = 'https://prices.pokemontcg.io/cardmarket/' + encodeURIComponent(ptcgId);
  for (var attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0 && Utilities.sleep) Utilities.sleep(400 * attempt);
    var res;
    try {
      res = UrlFetchApp.fetch(endpoint, { followRedirects: false, muteHttpExceptions: true });
    } catch (e) {
      continue;
    }
    var code = res.getResponseCode();
    if (code === 301 || code === 302 || code === 303 || code === 307 || code === 308) {
      var headers = (res.getHeaders && res.getHeaders()) || {};
      var location = String(headers['Location'] || headers['location'] || '');
      var m = location.match(/^https?:\/\/(?:www\.)?cardmarket\.com\/[a-z]{2}\/Pokemon\/Products\/Singles\/[^?#]+/i);
      if (m) {
        return {
          url: m[0].replace(/^https?:\/\/(?:www\.)?cardmarket\.com\/[a-z]{2}\//i, 'https://www.cardmarket.com/en/')
        };
      }
      return { notFound: true };
    }
    if (code === 404) return { notFound: true };
    // 5xx / 429 / netwerkfout: tijdelijk, opnieuw proberen
  }
  return {};
}

/**
 * Bewaart gevonden Cardmarket-links in de notities (Collectie kolom V, Verlanglijst kolom K) van alle rijen met dat Kaart-ID.
 * Een oude Products?idProduct=-link wordt vervangen; een bestaande kanonieke link blijft staan. Schrijft alleen gewijzigde cellen.
 */
function persistCardmarketUrls_(ss, urlsByCardId) {
  var byLower = {};
  for (var id in urlsByCardId) {
    if (Object.prototype.hasOwnProperty.call(urlsByCardId, id)) byLower[id.toLowerCase()] = urlsByCardId[id];
  }
  var slugRe = /cardmarket\.com\/[a-z]{2}\/Pokemon\/Products\/Singles\//i;
  var oldRe = /https?:\/\/(?:www\.)?cardmarket\.com\/[a-z]{2}\/Pokemon\/Products\?idProduct=\d+/i;

  var targets = [
    { name: SHEET_NAMES.COLLECTION, idCol: 1, notesCol: 22 },
    { name: SHEET_NAMES.WISHLIST, idCol: 13, notesCol: 11 }
  ];
  for (var t = 0; t < targets.length; t++) {
    var sheet = ss.getSheetByName(targets[t].name);
    if (!sheet) continue;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;
    if (sheet.getLastColumn && sheet.getLastColumn() < targets[t].idCol) continue;
    var rows = lastRow - 1;
    var ids = sheet.getRange(2, targets[t].idCol, rows, 1).getValues();
    var notes = sheet.getRange(2, targets[t].notesCol, rows, 1).getValues();
    for (var r = 0; r < rows; r++) {
      var url = byLower[String(ids[r][0] || '').trim().toLowerCase()];
      if (!url) continue;
      var current = String(notes[r][0] === null || notes[r][0] === undefined ? '' : notes[r][0]).trim();
      if (slugRe.test(current)) continue;
      var next = oldRe.test(current) ? current.replace(oldRe, url) : (current ? current + ' ' + url : url);
      sheet.getRange(r + 2, targets[t].notesCol).setValue(next);
    }
  }
}

function handleFetchKaartspotProfile_(payload) {
  var rawUser = String((payload && payload.username) || '').trim().replace(/^@+/, '');
  if (!/^[a-zA-Z0-9_.-]{1,60}$/.test(rawUser)) {
    throw new Error('Ongeldige Kaartspot-gebruikersnaam.');
  }

  var url = 'https://kaartspot.nl/api/binder-publiek/' + encodeURIComponent(rawUser);
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { Accept: 'application/json' }
  });
  var code = res.getResponseCode();
  if (code === 404) {
    throw new Error('Kaartspot-profiel "@' + rawUser + '" niet gevonden of heeft geen publieke binders.');
  }
  if (code !== 200) {
    throw new Error('Kaartspot gaf HTTP ' + code + ' terug bij het ophalen van "@' + rawUser + '".');
  }

  var parsed;
  try {
    parsed = JSON.parse(res.getContentText() || '{}');
  } catch (e) {
    throw new Error('Kon Kaartspot-response niet lezen als JSON.');
  }
  return { profile: parsed };
}

function findBulkAppendStartRow_(sheet, startRow, checkCols) {
  var lastRow = sheet.getLastRow();
  if (lastRow < startRow) return startRow;
  var maxCol = Math.max.apply(null, checkCols);
  var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, maxCol).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    for (var c = 0; c < checkCols.length; c++) {
      if (String(values[i][checkCols[c] - 1] || '').trim() !== '') {
        return startRow + i + 1;
      }
    }
  }
  return startRow;
}

function propagateFormulaColumns_(sheet, templateRow, targetStartRow, numRows, formulaStartCol, numFormulaCols) {
  if (numRows <= 0 || !sheet.getRange) return;
  try {
    var tplRange = sheet.getRange(templateRow, formulaStartCol, 1, numFormulaCols);
    if (!tplRange.getFormulas || !tplRange.copyTo) return;
    var tplFormulas = tplRange.getFormulas()[0] || [];
    var hasFormula = tplFormulas.some(function (f) {
      return String(f || '').indexOf('=') === 0;
    });
    if (!hasFormula) return;

    for (var offset = 0; offset < numRows; offset++) {
      var rowNum = targetStartRow + offset;
      if (rowNum <= templateRow) continue;
      var destRange = sheet.getRange(rowNum, formulaStartCol, 1, numFormulaCols);
      var destVals = destRange.getValues ? destRange.getValues()[0] : [];
      var destForms = destRange.getFormulas ? destRange.getFormulas()[0] : [];
      var isBlank = destVals.every(function (v, idx) {
        return String(v || '').trim() === '' && String(destForms[idx] || '').trim() === '';
      });
      if (isBlank) {
        if (SpreadsheetApp.CopyPasteType && SpreadsheetApp.CopyPasteType.PASTE_FORMULA) {
          tplRange.copyTo(destRange, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
        } else {
          tplRange.copyTo(destRange);
        }
      }
    }
  } catch (e) {
    // Negeer als getFormulas/copyTo niet beschikbaar is
  }
}

function handleApplyKaartspotSync_(ss, payload) {
  var cardsToAdd = (payload && payload.cardsToAdd) || [];
  var wishlistToAdd = (payload && payload.wishlistToAdd) || [];
  var wishlistRowsToMarkFound = (payload && payload.wishlistRowsToMarkFound) || [];
  var pokedexUpdates = (payload && payload.pokedexUpdates) || [];
  var slotsPerPage = payload && payload.slotsPerPage;

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Amsterdam', 'yyyy-MM-dd');
  var touchedCardNames = [];
  var pushTouchedName = function (name) {
    var clean = String(name || '').trim();
    if (clean && touchedCardNames.indexOf(clean) === -1) {
      touchedCardNames.push(clean);
    }
  };

  var addedCards = 0;
  var addedWishlist = 0;
  var promotedWishlist = 0;
  var updatedPokedexSlots = 0;

  // 1. Bulk toevoegen aan Collectie (uitsluitend A:Q, U:V en W; formules R:T blijven 100% intact!)
  if (cardsToAdd.length > 0) {
    var colSheet = ss.getSheetByName(SHEET_NAMES.COLLECTION);
    if (!colSheet) throw new Error('Tabblad "' + SHEET_NAMES.COLLECTION + '" niet gevonden.');

    var colStartRow = findBulkAppendStartRow_(colSheet, 2, [1, 2]);
    var rowsAQ = [];
    var rowsUV = [];
    var rowsW = [];
    var uniqueSets = {};

    for (var c = 0; c < cardsToAdd.length; c++) {
      var item = cardsToAdd[c] || {};
      var cardId = String(item.cardId || '').trim();
      var cardName = String(item.name || '').trim();
      var setName = String(item.setName || '').trim();
      pushTouchedName(cardName);

      rowsAQ.push([
        cardId,
        cardName,
        setName,
        String(item.cardNumber || '').trim(),
        String(item.language || 'EN').trim(),
        String(item.type || '').trim(),
        String(item.rarity || 'Rare').trim(),
        String(item.variant || 'Normal').trim(),
        String(item.condition || 'Near Mint (NM)').trim(),
        String(item.grading || 'Raw').trim(),
        item.grade === '' || item.grade === null || item.grade === undefined ? '' : item.grade,
        Math.max(1, toNumber_(item.quantity, 1)),
        String(item.storageLocation || 'Hoofdbinder').trim(),
        String(item.binderDetail || '').trim(),
        String(item.purchaseDate || today).trim(),
        toNumber_(item.purchasePrice, 0),
        toNumber_(item.marketPrice, 0)
      ]);

      rowsUV.push([Boolean(item.forTrade), String(item.notes || '').trim()]);
      rowsW.push([String(item.acquisitionMethod || 'Kaartspot Sync').trim()]);

      if (setName) {
        var setKey = setName.toLowerCase();
        if (!uniqueSets[setKey]) {
          uniqueSets[setKey] = {
            setName: setName,
            seriesName: String(item.seriesName || '').trim(),
            setTotalCards: toNumber_(item.setTotalCards, 0),
            setId: String(item.setId || '').trim(),
            setCode: String(item.setCode || extractSetCodeFromNotes_(item.notes) || '').trim()
          };
        }
      }
    }

    colSheet.getRange(colStartRow, 1, rowsAQ.length, 17).setValues(rowsAQ);
    colSheet.getRange(colStartRow, 21, rowsUV.length, 2).setValues(rowsUV);
    ensureCollectionAcquisitionColumn_(colSheet);
    colSheet.getRange(colStartRow, 23, rowsW.length, 1).setValues(rowsW);
    propagateFormulaColumns_(colSheet, 2, colStartRow, rowsAQ.length, 18, 3);
    addedCards = rowsAQ.length;

    for (var sk in uniqueSets) {
      if (Object.prototype.hasOwnProperty.call(uniqueSets, sk)) {
        var sMeta = uniqueSets[sk];
        ensureSetInProgress_(ss, sMeta.setName, sMeta.seriesName, sMeta.setTotalCards, sMeta.setId, sMeta.setCode);
      }
    }
  }

  // 2. Verlanglijst promoties (nogNodig 1 -> 0) & bulk toevoegen (sla formules I:J over!)
  if (wishlistRowsToMarkFound.length > 0 || wishlistToAdd.length > 0) {
    var wlSheet = ss.getSheetByName(SHEET_NAMES.WISHLIST);
    if (!wlSheet) throw new Error('Tabblad "' + SHEET_NAMES.WISHLIST + '" niet gevonden.');

    for (var f = 0; f < wishlistRowsToMarkFound.length; f++) {
      var foundRow = toNumber_(wishlistRowsToMarkFound[f], 0);
      if (foundRow >= 2) {
        wlSheet.getRange(foundRow, 12).setValue(true);
        promotedWishlist++;
      }
    }

    if (wishlistToAdd.length > 0) {
      var wlStartRow = findBulkAppendStartRow_(wlSheet, 2, [1]);
      var wlRowsAH = [];
      var wlRowsKL = [];
      var wlRowsM = [];

      for (var w = 0; w < wishlistToAdd.length; w++) {
        var wItem = wishlistToAdd[w] || {};
        wlRowsAH.push([
          String(wItem.cardName || '').trim(),
          String(wItem.setName || '').trim(),
          String(wItem.cardNumber || '').trim(),
          String(wItem.desiredVariant || 'Normal').trim(),
          String(wItem.minCondition || 'Near Mint (NM)').trim(),
          String(wItem.priority || 'Hoog').trim(),
          toNumber_(wItem.maxBudget, 0),
          toNumber_(wItem.marketPrice, 0)
        ]);
        wlRowsKL.push([String(wItem.notes || '').trim(), false]);
        wlRowsM.push([String(wItem.cardId || '').trim()]);
      }

      wlSheet.getRange(wlStartRow, 1, wlRowsAH.length, 8).setValues(wlRowsAH);
      wlSheet.getRange(wlStartRow, 11, wlRowsKL.length, 2).setValues(wlRowsKL);
      ensureWishlistCardIdColumn_(wlSheet);
      wlSheet.getRange(wlStartRow, 13, wlRowsM.length, 1).setValues(wlRowsM);
      propagateFormulaColumns_(wlSheet, 2, wlStartRow, wlRowsAH.length, 9, 2);
      addedWishlist = wlRowsAH.length;
    }
  }

  // 3. Pokédex Binder layout + automatische sync + expliciete Kaartspot slot-voorkeurskaarten (sla formules E:H over!)
  if (slotsPerPage === 4 || slotsPerPage === 9 || slotsPerPage === 12 || slotsPerPage === 16 || slotsPerPage === 20) {
    handleUpdatePokedexSlot_(ss, { slotsPerPage: slotsPerPage });
  }

  if (touchedCardNames.length > 0) {
    syncPokedexBinder_(ss, touchedCardNames);
  }

  if (pokedexUpdates.length > 0) {
    var dexSheet = ss.getSheetByName(SHEET_NAMES.POKEDEX);
    if (dexSheet) {
      for (var p = 0; p < pokedexUpdates.length; p++) {
        var upd = pokedexUpdates[p] || {};
        var dexNum = toNumber_(upd.dexNumber, 0);
        if (dexNum < 1) continue;
        var dexRow = findPokedexRowByNumber_(dexSheet, dexNum);
        if (dexRow >= 8) {
          var changedSlot = false;
          if (Boolean(dexSheet.getRange(dexRow, 4).getValue()) !== true) {
            dexSheet.getRange(dexRow, 4).setValue(true);
            changedSlot = true;
          }
          var cleanChoice = String(upd.selectedCard || '').trim();
          if (cleanChoice && String(dexSheet.getRange(dexRow, 9).getValue() || '').trim() !== cleanChoice) {
            dexSheet.getRange(dexRow, 9).setValue(cleanChoice);
            changedSlot = true;
          }
          if (changedSlot) updatedPokedexSlots++;
        }
      }
    }
  }

  return {
    addedCards: addedCards,
    addedWishlist: addedWishlist,
    promotedWishlist: promotedWishlist,
    updatedPokedexSlots: updatedPokedexSlots
  };
}

function handleLogTrade_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.TRADES);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.TRADES + '" niet gevonden.');

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Amsterdam', 'yyyy-MM-dd');
  var targetRow = findFirstEmptyRow_(sheet, 22, [1, 2]);
  // Kolommen A:G (1..7) en I:J (9..10) — sla kolom H (Netto resultaat formule) over!
  sheet.getRange(targetRow, 1, 1, 7).setValues([[
    String(payload.date || today).trim(),
    String(payload.cardName || '').trim(),
    String(payload.setName || '').trim(),
    String(payload.type || 'Verkoop').trim(),
    toNumber_(payload.purchasePrice, 0),
    toNumber_(payload.saleValue, 0),
    toNumber_(payload.platformFees, 0)
  ]]);
  sheet.getRange(targetRow, 9, 1, 2).setValues([[
    String(payload.counterparty || '').trim(),
    String(payload.notes || '').trim()
  ]]);

  return { rowIndex: targetRow };
}

// ============================================================================
// FEEDBACK HUB (TABBLAD "Feedback" — AUTOMATISCH AANGEMAAKT INDIEN NODIG)
// ============================================================================

function ensureFeedbackSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.FEEDBACK);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.FEEDBACK);
    sheet.getRange(1, 1, 1, 10).setValues([[
      'ID', 'Datum', 'Pagina', 'Categorie', 'Titel', 'Beschrijving', 'Status', 'Stemmen', 'Auteur', 'Platform'
    ]]);
  }
  return sheet;
}

function readFeedback_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.FEEDBACK);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var items = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || '').trim();
    var title = String(row[4] || '').trim();
    if (!id && !title) continue;
    var rawStatus = String(row[6] || 'open').trim().toLowerCase();
    var status = rawStatus === 'done' || rawStatus === 'afgerond'
      ? 'done'
      : rawStatus === 'in_progress' || rawStatus === 'bezig'
        ? 'in_progress'
        : 'open';

    items.push({
      rowIndex: i + 2,
      id: id || ('fb-' + (i + 2)),
      createdAt: formatDateCell_(row[1]),
      page: String(row[2] || 'Algemeen / Hele app').trim(),
      category: String(row[3] || 'Idee').trim(),
      title: title,
      description: String(row[5] || '').trim(),
      status: status,
      votes: Math.max(0, toNumber_(row[7], 1)),
      author: String(row[8] || 'Verzamelaar').trim(),
      platform: String(row[9] || 'Web App').trim(),
      source: 'sheets'
    });
  }
  return items;
}

function handleAddFeedback_(ss, payload) {
  var sheet = ensureFeedbackSheet_(ss);
  var targetRow = findFirstEmptyRow_(sheet, 2, [1, 5]);
  var id = String(payload.id || ('fb-' + new Date().getTime())).trim();
  var createdAt = String(payload.createdAt || new Date().toISOString()).trim();

  sheet.getRange(targetRow, 1, 1, 10).setValues([[
    id,
    createdAt,
    String(payload.page || 'Algemeen / Hele app').trim(),
    String(payload.category || 'Idee').trim(),
    String(payload.title || '').trim(),
    String(payload.description || '').trim(),
    String(payload.status || 'open').trim(),
    Math.max(1, toNumber_(payload.votes, 1)),
    String(payload.author || 'Verzamelaar').trim(),
    String(payload.platform || 'Web App').trim()
  ]]);
  return { rowIndex: targetRow, id: id };
}

function handleUpdateFeedback_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.FEEDBACK);
  if (!sheet) return { updated: false };
  var rowIdx = findFeedbackRowById_(sheet, payload.id);
  if (rowIdx < 2) return { updated: false };

  if (payload.page !== undefined) {
    sheet.getRange(rowIdx, 3).setValue(String(payload.page).trim());
  }
  if (payload.category !== undefined) {
    sheet.getRange(rowIdx, 4).setValue(String(payload.category).trim());
  }
  if (payload.title !== undefined) {
    sheet.getRange(rowIdx, 5).setValue(String(payload.title).trim());
  }
  if (payload.description !== undefined) {
    sheet.getRange(rowIdx, 6).setValue(String(payload.description).trim());
  }
  if (payload.status !== undefined) {
    sheet.getRange(rowIdx, 7).setValue(String(payload.status).trim());
  }
  if (payload.votes !== undefined) {
    sheet.getRange(rowIdx, 8).setValue(Math.max(0, toNumber_(payload.votes, 1)));
  }
  if (payload.author !== undefined) {
    sheet.getRange(rowIdx, 9).setValue(String(payload.author).trim() || 'Verzamelaar');
  }
  return { updated: true, rowIndex: rowIdx };
}

function handleDeleteFeedback_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.FEEDBACK);
  if (!sheet) return { deleted: false };
  var rowIdx = findFeedbackRowById_(sheet, payload.id);
  if (rowIdx < 2) return { deleted: false };
  sheet.getRange(rowIdx, 1, 1, 10).clearContent();
  return { deleted: true, rowIndex: rowIdx };
}

function findFeedbackRowById_(sheet, id) {
  if (!id) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var target = String(id).trim();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === target) return i + 2;
  }
  return -1;
}

// ============================================================================
// SET VOORTGANG & POKÉDEX BINDER SYNC
// ============================================================================

function ensureSetInProgress_(ss, setName, seriesName, totalCards, setId, setCode) {
  if (!setName) return;
  var sheet = ss.getSheetByName(SHEET_NAMES.SET_PROGRESS);
  if (!sheet) return;
  var cleanSetCode = String(setCode || '').trim().toUpperCase();

  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var target = String(setName).trim().toLowerCase();
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i][0] || '').trim().toLowerCase() === target) {
        // Bestaat al: vul alleen een nog lege Setcode (kolom I) aan
        if (cleanSetCode) writeSetCodeCell_(sheet, i + 2, cleanSetCode, false);
        return;
      }
    }
  }

  var resolvedSeries = String(seriesName || '').trim();
  var resolvedTotal = toNumber_(totalCards, 0);

  // Vul Serie/Era en totaal aantal kaarten aan via TCGdex /sets/{id} indien nog niet aanwezig
  if (setId && (!resolvedSeries || !resolvedTotal)) {
    var res = UrlFetchApp.fetch(TCGDEX_BASE_URL + '/sets/' + encodeURIComponent(setId), {
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      try {
        var fullSet = JSON.parse(res.getContentText());
        if (!resolvedSeries && fullSet.serie && fullSet.serie.name) {
          resolvedSeries = String(fullSet.serie.name).trim();
        }
        if (!resolvedTotal && fullSet.cardCount) {
          resolvedTotal = toNumber_(fullSet.cardCount.total || fullSet.cardCount.official, 0);
        }
      } catch (e) {
        // Negeer parse-fout en ga door met bekende waarden
      }
    }
  }

  var nextRow = findFirstEmptyRow_(sheet, 2, [1]);
  // Voeg uitsluitend kolommen A:C toe — behoud formules in D:H!
  sheet.getRange(nextRow, 1, 1, 3).setValues([[
    String(setName).trim(),
    resolvedSeries,
    resolvedTotal
  ]]);
  if (cleanSetCode) writeSetCodeCell_(sheet, nextRow, cleanSetCode, true);

  // Kopieer formules in D:H vanaf de bovenliggende rij als de nieuwe rij in D:H nog helemaal leeg is
  if (nextRow > 2) {
    try {
      var prevRange = sheet.getRange(nextRow - 1, 4, 1, 5);
      var targetRange = sheet.getRange(nextRow, 4, 1, 5);
      if (prevRange.getFormulas && targetRange.getValues && prevRange.copyTo) {
        var targetVals = targetRange.getValues()[0];
        var targetFormulas = targetRange.getFormulas ? targetRange.getFormulas()[0] : [];
        var isTargetEmpty = targetVals.every(function (v, idx) {
          return String(v || '').trim() === '' && String(targetFormulas[idx] || '').trim() === '';
        });
        var prevFormulas = prevRange.getFormulas()[0];
        var hasPrevFormula = prevFormulas.some(function (f) {
          return String(f || '').indexOf('=') === 0;
        });
        if (isTargetEmpty && hasPrevFormula) {
          if (SpreadsheetApp.CopyPasteType && SpreadsheetApp.CopyPasteType.PASTE_FORMULA) {
            prevRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
          } else {
            prevRange.copyTo(targetRange);
          }
        }
      }
    } catch (e) {
      // Negeer als copyTo/getFormulas niet ondersteund wordt
    }
  }
}

/**
 * Schrijft de echte setcode (bijv. Chinese CS4.5C) naar kolom I "Setcode" van Set Voortgang.
 * Raakt de formules in D:H niet aan; bestaande codes worden alleen overschreven met overwrite=true.
 */
function writeSetCodeCell_(sheet, row, setCode, overwrite) {
  if (sheet.getMaxColumns && sheet.getMaxColumns() < 9 && sheet.insertColumnsAfter) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 9 - sheet.getMaxColumns());
  }
  if (!String(sheet.getRange(1, 9).getValue() || '').trim()) {
    sheet.getRange(1, 9).setValue('Setcode');
  }
  var cell = sheet.getRange(row, 9);
  if (overwrite || !String(cell.getValue() || '').trim()) {
    cell.setValue(setCode);
  }
}

/** Haalt een opgeslagen echte setcode uit notities: [SET:CS4.5C]. */
function extractSetCodeFromNotes_(notes) {
  var m = String(notes || '').match(/\[SET:([A-Za-z0-9.\-]{2,12})\]/i);
  return m ? m[1].toUpperCase() : '';
}

/**
 * Synchroniseert dropdowns, automatische keuze en In Binder-vinkjes op "Pokédex Binder".
 * - Behoudt eerder gekozen favoriete variant (op basis van cardId-prefix).
 * - Ruimt oude dropdowns & auto-waarden (" | ") netjes op als een kaart verwijderd is,
 *   maar laat handmatige notities met rust.
 */
function syncPokedexBinder_(ss, filterCardNames) {
  var pokedexSheet = ss.getSheetByName(SHEET_NAMES.POKEDEX);
  if (!pokedexSheet) return { updatedSlots: 0, multiMatches: [] };

  var collection = readCollection_(ss);
  var lastRow = Math.min(pokedexSheet.getLastRow(), DEX_START_ROW + DEX_COUNT - 1);
  if (lastRow < DEX_START_ROW) return { updatedSlots: 0, multiMatches: [] };

  var numRows = lastRow - (DEX_START_ROW - 1);
  var dexRows = pokedexSheet.getRange(DEX_START_ROW, 1, numRows, 10).getValues();
  var hasFilter = Boolean(filterCardNames && filterCardNames.length > 0);
  var dexValidations = null;
  if (!hasFilter) {
    var valRange = pokedexSheet.getRange(DEX_START_ROW, 9, numRows, 1);
    dexValidations = valRange.getDataValidations ? valRange.getDataValidations() : null;
  }

  var updatedSlots = 0;
  var multiMatches = [];

  for (var i = 0; i < dexRows.length; i++) {
    var pokemonName = String(dexRows[i][2] || '').trim();
    if (!pokemonName) continue;

    // Bij gerichte edit: sla Pokémon over die niet voorkomen in de zojuist gewijzigde kaartnamen
    if (hasFilter) {
      var touched = false;
      for (var f = 0; f < filterCardNames.length; f++) {
        if (doesCardMatchPokemon_(filterCardNames[f], pokemonName)) {
          touched = true;
          break;
        }
      }
      if (!touched) continue;
    }

    var matches = [];
    var seen = {};
    for (var c = 0; c < collection.length; c++) {
      if (doesCardMatchPokemon_(collection[c].name, pokemonName)) {
        var label = formatBinderChoice_(collection[c]);
        if (!seen[label]) {
          seen[label] = true;
          matches.push(label);
        }
      }
    }

    var rowNum = i + DEX_START_ROW;
    var currentInBinder = dexRows[i][3] === true;
    var currentChoice = String(dexRows[i][8] || '').trim();
    var choiceCell = pokedexSheet.getRange(rowNum, 9);
    var checkCell = pokedexSheet.getRange(rowNum, 4);
    var currentRule = hasFilter
      ? (choiceCell.getDataValidation ? choiceCell.getDataValidation() : null)
      : (dexValidations && dexValidations[i] ? dexValidations[i][0] : null);
    var hasValidationLookup = hasFilter ? Boolean(choiceCell.getDataValidation) : Boolean(dexValidations);

    if (matches.length === 0) {
      var cleared = false;
      if (currentRule || !hasValidationLookup) {
        choiceCell.clearDataValidations();
        if (currentRule) cleared = true;
      }
      // Ruim alleen auto-gegenereerde waarden (" | ") op; laat handmatige notities staan
      if (currentChoice.indexOf(' | ') !== -1) {
        choiceCell.clearContent();
        if (currentInBinder) checkCell.setValue(false);
        cleared = true;
      }
      if (cleared) updatedSlots++;
      continue;
    }

    // Behoud eerder gekozen favoriete variant (op basis van cardId-prefix vóór " | ")
    var targetVal = matches[0];
    if (currentChoice) {
      var currentPrefix = currentChoice.split(' | ')[0].trim().toLowerCase();
      for (var m = 0; m < matches.length; m++) {
        if (matches[m].split(' | ')[0].trim().toLowerCase() === currentPrefix) {
          targetVal = matches[m];
          break;
        }
      }
    }

    if (matches.length >= 2) {
      multiMatches.push(matches.length + 'x ' + pokemonName);
    }

    var rowChanged = false;
    if (matches.length >= 2) {
      var existingList =
        currentRule &&
        currentRule.getCriteriaType &&
        SpreadsheetApp.DataValidationCriteria &&
        currentRule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST
          ? currentRule.getCriteriaValues()[0]
          : null;
      var listChanged = !existingList || existingList.join('\n') !== matches.join('\n');
      if (listChanged) {
        var rule = SpreadsheetApp.newDataValidation()
          .requireValueInList(matches, true)
          .setAllowInvalid(true)
          .build();
        choiceCell.setDataValidation(rule);
        rowChanged = true;
      }
    } else if (currentRule || !hasValidationLookup) {
      choiceCell.clearDataValidations();
      if (currentRule) rowChanged = true;
    }

    if (currentChoice !== targetVal) {
      choiceCell.setValue(targetVal);
      rowChanged = true;
    }
    if (!currentInBinder) {
      checkCell.setValue(true);
      rowChanged = true;
    }

    if (rowChanged) updatedSlots++;
  }

  return { updatedSlots: updatedSlots, multiMatches: multiMatches };
}

function formatBinderChoice_(card) {
  var labelKey = card.cardId || ((card.setName || '') + ' #' + (card.cardNumber || '')).trim();
  var detail =
    card.variant && card.variant !== 'Normal'
      ? card.variant
      : card.rarity || card.cardNumber || 'Kaart';
  var setPart = String(card.setName || '').trim();
  var label = detail ? labelKey + ' | ' + setPart + ' (' + detail + ')' : labelKey + ' | ' + setPart;
  return label.replace(/\s+\|\s*$/, '');
}

/**
 * Exacte Pokédex naam-matching (voorkomt valse matches zoals Mew -> Mewtwo of Porygon -> Porygon-Z,
 * en ondersteunt zowel "Nidoran♀" als "Nidoran ♀").
 */
function buildPokemonNameRegex_(pokemonName) {
  var escaped = String(pokemonName || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  escaped = escaped.replace(/([♀♂])/g, '\\s?$1');
  return new RegExp(
    '(^|[\\s\'’\\-])' + escaped + '(?=$|[\\s\'’,.!?]|-(?:EX|GX|V|VMAX|VSTAR|BREAK)\\b|\\s+(?:ex|EX|GX|V|VMAX|VSTAR|δ|★|☆|LV\\.X|BREAK|TAG TEAM))',
    'i'
  );
}

function doesCardMatchPokemon_(cardName, pokemonName) {
  if (!cardName || !pokemonName) return false;
  var cleanCard = String(cardName)
    .trim()
    .replace(/Nidoran\s*\(?\s*F\s*\)?(?=$|[\s,.!?&\/])/gi, 'Nidoran♀')
    .replace(/Nidoran\s*\(?\s*M\s*\)?(?=$|[\s,.!?&\/])/gi, 'Nidoran♂');
  var cleanPoke = String(pokemonName).trim();
  var regex = buildPokemonNameRegex_(cleanPoke);
  if (!regex.test(cleanCard)) return false;

  // Extra bescherming tegen hyphen-evoluties zoals Porygon vs Porygon-Z (maar wel Porygon-GX toestaan)
  var afterIdx = cleanCard.toLowerCase().indexOf(cleanPoke.toLowerCase()) + cleanPoke.length;
  var remainder = cleanCard.slice(afterIdx);
  var nextChar = remainder.charAt(0);
  if (nextChar === '-' && !/^-(?:EX|GX|V|VMAX|VSTAR|BREAK)\b/i.test(remainder)) {
    return false;
  }
  if (/[a-z0-9]/i.test(nextChar)) {
    return false;
  }
  return true;
}

// ============================================================================
// TCGDEX ENRICHMENT & PRICE REFRESH
// ============================================================================

/**
 * Haalt kaartdata op bij TCGdex en vult de rij in Collectie aan zonder persoonlijke velden
 * of formule-kolommen (R:T) te overschrijven.
 */
function fetchAndPopulateRow_(ss, sheet, row, rawInput, priceOnly) {
  var normalized = normalizeCardId_(rawInput, ss);
  var card = fetchTcgdexCard_(rawInput, ss);
  if (!card) return null;

  var existingVariant = String(sheet.getRange(row, 8).getValue() || '');
  var price = extractCardmarketEur_(card, existingVariant);

  if (priceOnly) {
    if (price > 0) sheet.getRange(row, 17).setValue(price);
    return price > 0 ? card : null;
  }

  var setName = (card.set && card.set.name) || '';
  var cardNum = formatCardNumber_(card.localId, card.set && card.set.cardCount && card.set.cardCount.official);
  var cardType = extractCardType_(card);
  var rarity = mapTcgdexRarity_(card.rarity);

  // Vaste kaartdata invullen (A, B, C, D, F, G)
  sheet.getRange(row, 1).setValue(card.id || normalized);
  sheet.getRange(row, 2).setValue(card.name || '');
  sheet.getRange(row, 3).setValue(setName);
  sheet.getRange(row, 4).setNumberFormat('@').setValue(cardNum);
  sheet.getRange(row, 6).setValue(cardType);
  if (rarity) sheet.getRange(row, 7).setValue(rarity);

  // Defaults alleen als persoonlijke velden nog leeg zijn
  if (!sheet.getRange(row, 5).getValue()) sheet.getRange(row, 5).setValue('EN');
  if (!sheet.getRange(row, 10).getValue()) sheet.getRange(row, 10).setValue('Raw');
  if (!sheet.getRange(row, 12).getValue()) sheet.getRange(row, 12).setValue(1);

  if (price > 0) {
    sheet.getRange(row, 17).setValue(price);
  }

  // Cardmarket productlink in kolom V (Notities) alleen als nog leeg
  if (!sheet.getRange(row, 22).getValue()) {
    sheet.getRange(row, 22).setValue(buildCardmarketUrl_(card));
  }

  if (setName) {
    ensureSetInProgress_(
      ss,
      setName,
      (card.set && card.set.serie && card.set.serie.name) || '',
      (card.set && card.set.cardCount && (card.set.cardCount.total || card.set.cardCount.official)) || 0,
      (card.set && card.set.id) || ''
    );
  }

  return card;
}

function enrichCollectionRow_(ss, sheet, row) {
  var rawId = String(sheet.getRange(row, 1).getValue() || '').trim();
  if (!rawId) return;
  fetchAndPopulateRow_(ss, sheet, row, rawId, false);
}

function refreshCollectionPrices_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.COLLECTION);
  if (!sheet) return { updated: 0, total: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { updated: 0, total: 0 };

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var variants = sheet.getRange(2, 8, lastRow - 1, 1).getValues();
  var prices = sheet.getRange(2, 17, lastRow - 1, 1).getValues();
  var updated = 0;
  var total = 0;

  for (var i = 0; i < ids.length; i++) {
    var rawId = String(ids[i][0] || '').trim();
    if (!rawId) continue;
    total++;
    var card = fetchTcgdexCard_(rawId, ss);
    if (card) {
      var eur = extractCardmarketEur_(card, String(variants[i][0] || ''));
      if (eur > 0) {
        prices[i][0] = eur;
        updated++;
      }
    }
  }

  if (updated > 0) {
    sheet.getRange(2, 17, lastRow - 1, 1).setValues(prices);
  }
  return { updated: updated, total: total };
}

/**
 * Leest dynamische Kaartcode -> API-code koppelingen uit het tabblad "Setcodes" (indien aanwezig),
 * zodat nieuw uitgebrachte of handmatig toegevoegde sets direct werken zonder script-update.
 */
function readDynamicSetCodesFromSheet_(ss) {
  var map = {};
  if (!ss || !ss.getSheetByName) return map;
  var sheet = ss.getSheetByName(SHEET_NAMES.SETCODES);
  if (!sheet) return map;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;

  var headerRow = sheet.getRange(1, 1, 1, 7).getValues()[0];
  var codeCol = -1;
  var apiCol = -1;
  for (var c = 0; c < headerRow.length; c++) {
    var h = String(headerRow[c] || '').trim().toLowerCase();
    if (!h) continue;
    if (codeCol === -1 && (h.indexOf('kaartcode') !== -1 || h.indexOf('op kaart') !== -1)) {
      codeCol = c;
    }
    if (apiCol === -1 && (h.indexOf('api-code') !== -1 || h.indexOf('tcgdex') !== -1)) {
      apiCol = c;
    }
  }

  // Alleen bij een tabblad met zowel Kaartcode als aparte API-code kolom
  if (codeCol === -1 || apiCol === -1 || codeCol === apiCol) return map;

  var numCols = Math.max(codeCol, apiCol) + 1;
  var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  for (var r = 0; r < rows.length; r++) {
    var kaartCode = String(rows[r][codeCol] || '').trim().toUpperCase();
    var apiId = String(rows[r][apiCol] || '').trim().toLowerCase();
    if (!kaartCode || !apiId) continue;
    if (!map[kaartCode]) map[kaartCode] = [];
    if (map[kaartCode].indexOf(apiId) === -1) {
      map[kaartCode].push(apiId);
    }
  }
  return map;
}

function resolveCandidateSetIds_(rawSetUpper, ss) {
  var out = [];
  var pushUnique = function (id) {
    var norm = String(id || '').trim().toLowerCase();
    if (norm && out.indexOf(norm) === -1) out.push(norm);
  };

  if (MULTI_SET_ALIASES[rawSetUpper]) {
    for (var m = 0; m < MULTI_SET_ALIASES[rawSetUpper].length; m++) {
      pushUnique(MULTI_SET_ALIASES[rawSetUpper][m]);
    }
  }
  if (SET_CODE_ALIASES[rawSetUpper]) {
    pushUnique(SET_CODE_ALIASES[rawSetUpper]);
  }

  // Controleer dynamische koppelingen uit het Setcodes-tabblad (overslaan als het al een bekende API-ID zoals me06/sv03.5 is)
  var rawLower = rawSetUpper.toLowerCase();
  if (!OFFICIAL_CODE_BY_SET_ID[rawLower] && ss) {
    var dynamicMap = readDynamicSetCodesFromSheet_(ss);
    if (dynamicMap[rawSetUpper]) {
      for (var d = 0; d < dynamicMap[rawSetUpper].length; d++) {
        pushUnique(dynamicMap[rawSetUpper][d]);
      }
    }
  }

  if (out.length === 0) {
    pushUnique(rawLower);
  }
  return out;
}

function resolveCandidateCardIds_(rawInput, ss) {
  var cleaned = String(rawInput || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];

  // Accepteert: "DLR 11", "MEW 181", "30C 15", "30th-c-015", "OBF 199/197", "BS #044", "CRZ GG70/GG70"
  var match = cleaned.match(/^([a-z0-9.]+(?:-[a-z]+)?)\s*[-\s#:]+\s*#?([a-z]*\d+[a-z]?)(?:\/[a-z]*\d+)?$/i);
  if (!match) return [cleaned.toLowerCase()];

  var rawSet = match[1].toUpperCase();
  var targetSets = resolveCandidateSetIds_(rawSet, ss);
  var rawNum = match[2].trim();
  var isPureDigits = /^\d+$/.test(rawNum);
  var unpadded = isPureDigits ? String(parseInt(rawNum, 10)) : rawNum.toUpperCase();
  var padded3 = isPureDigits ? ('000' + unpadded).slice(-3) : unpadded;

  var candidates = [];
  var pushUnique = function (id) {
    if (candidates.indexOf(id) === -1) candidates.push(id);
  };

  for (var i = 0; i < targetSets.length; i++) {
    var setId = targetSets[i];
    var prefersPadded = /^(?:sv|me)\d|^30th|^(?:svp|sve|mep|mee)$/i.test(setId);
    if (prefersPadded) {
      pushUnique(setId + '-' + padded3);
      pushUnique(setId + '-' + unpadded);
    } else {
      pushUnique(setId + '-' + unpadded);
      pushUnique(setId + '-' + padded3);
    }
    if (rawNum !== (prefersPadded ? padded3 : unpadded)) {
      pushUnique(setId + '-' + rawNum);
    }
  }

  return candidates;
}

function normalizeCardId_(rawInput, ss) {
  var candidates = resolveCandidateCardIds_(rawInput, ss);
  return candidates.length > 0 ? candidates[0] : '';
}

function fetchTcgdexCard_(rawInputOrId, ss) {
  var candidates = resolveCandidateCardIds_(rawInputOrId, ss);
  if (candidates.length === 0) return null;

  for (var i = 0; i < candidates.length; i++) {
    var url = TCGDEX_BASE_URL + '/cards/' + encodeURIComponent(candidates[i]);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      try {
        return JSON.parse(res.getContentText());
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

function buildCardmarketUrl_(card) {
  // Zoeklink i.p.v. Products?idProduct=: die laatste geeft bij Cardmarket regelmatig een 401-fout.
  var rawLocal = String((card && card.localId) || '').trim();
  var cleanLocal = /^\d+$/.test(rawLocal) ? String(parseInt(rawLocal, 10)) : rawLocal;
  var query = encodeURIComponent((((card && card.name) || '') + ' ' + cleanLocal).trim());
  return 'https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=' + query;
}

/**
 * Haalt Cardmarket EUR-prijs op; kiest holo-prijs als de variant een holo/reverse is.
 */
function extractCardmarketEur_(card, variant) {
  if (!card || !card.pricing || !card.pricing.cardmarket) return 0;
  var cm = card.pricing.cardmarket;
  var isHolo = /holo/i.test(String(variant || ''));
  var candidates = isHolo
    ? [cm['trend-holo'], cm['avg7-holo'], cm['avg-holo'], cm.trend, cm.avg7, cm.avg30, cm.avg, cm.low]
    : [cm.trend, cm.avg7, cm.avg30, cm.avg, cm['trend-holo'], cm['avg7-holo'], cm['avg-holo'], cm.low];

  for (var i = 0; i < candidates.length; i++) {
    var val = toNumber_(candidates[i], 0);
    if (val > 0) return Math.round(val * 100) / 100;
  }
  return 0;
}

function extractCardType_(card) {
  if (!card) return '';
  if (card.types && card.types.length > 0) return card.types[0];
  if (card.category === 'Trainer') return 'Trainer';
  if (card.category === 'Energy') return 'Energy';
  return '';
}

/**
 * Mapt TCGdex zeldzaamheden naar de dropdown-opties in tabblad Instellingen.
 */
function mapTcgdexRarity_(rarity) {
  var raw = String(rarity || '').trim();
  if (!raw) return 'Rare';
  var r = raw.toLowerCase();
  if (r.indexOf('special illustration') !== -1 || r === 'three star' || r === 'two shiny') {
    return 'Special Illustration Rare';
  }
  if (r.indexOf('illustration') !== -1 || r === 'one star' || r === 'one shiny') {
    return 'Illustration Rare';
  }
  if (r.indexOf('hyper') !== -1 || r.indexOf('secret') !== -1 || r === 'crown') return 'Hyper Rare';
  if (r.indexOf('ultra') !== -1 || r.indexOf('full art') !== -1 || r === 'two star' || r === 'classic collection') {
    return 'Ultra Rare';
  }
  if (r.indexOf('double') !== -1 || r === 'four diamond') return 'Double Rare';
  if (r.indexOf('promo') !== -1) return 'Promo';
  if (r.indexOf('holo') !== -1) return 'Holo Rare';
  if (r.indexOf('uncommon') !== -1 || r === 'two diamond') return 'Uncommon';
  if (r.indexOf('common') !== -1 || r === 'one diamond') return 'Common';
  if (r.indexOf('rare') !== -1 || r === 'three diamond') return 'Rare';
  return raw;
}

/**
 * Herstelt een kaartnummer dat Google Sheets ooit als datum opsloeg ("5/11" -> 5 november).
 * Ontvangt een Date-object of een datum-string en leidt het echte nummer af uit dag/maand + Kaart-ID.
 */
function repairCardNumberCell_(value, cardId) {
  var isDate = Object.prototype.toString.call(value) === '[object Date]';
  var text = isDate ? '' : String(value === null || value === undefined ? '' : value).trim();
  if (!isDate && !/(GMT|UTC|Standard Time|Daylight Time)/i.test(text)) return text;

  var parts = String(cardId || '').trim().split('-');
  var localFromId = String(parts[parts.length - 1] || '').replace(/^0+(?=\d)/, '');
  var day = NaN;
  var month = NaN;
  if (isDate) {
    day = value.getDate();
    month = value.getMonth() + 1;
  } else {
    // Tijdzone-onafhankelijk: lees dag/maand uit de tekst ("Thu Nov 05 2026 ..." of "2026-11-05T...")
    var months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    var verbose = text.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2})\s+\d{4}/);
    var iso = text.match(/\d{4}-(\d{2})-(\d{2})T/);
    if (verbose && months[verbose[1].toLowerCase()]) {
      day = Number(verbose[2]);
      month = months[verbose[1].toLowerCase()];
    } else if (iso) {
      day = Number(iso[2]);
      month = Number(iso[1]);
    }
  }
  if (isNaN(day) || isNaN(month)) return /^\d+$/.test(localFromId) ? localFromId : '';
  if (localFromId && String(month) === localFromId && String(day) !== localFromId) {
    return month + '/' + day;
  }
  return day + '/' + month;
}

function formatCardNumber_(localId, officialCount) {
  if (!localId) return '';
  return officialCount ? localId + '/' + officialCount : String(localId);
}

// ============================================================================
// UTILITIES
// ============================================================================

function findFirstEmptyRow_(sheet, startRow, checkCols) {
  var lastRow = Math.max(sheet.getLastRow(), startRow);
  var maxCol = Math.max.apply(null, checkCols);
  var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, maxCol).getValues();
  for (var i = 0; i < values.length; i++) {
    var empty = true;
    for (var c = 0; c < checkCols.length; c++) {
      if (String(values[i][checkCols[c] - 1] || '').trim() !== '') {
        empty = false;
        break;
      }
    }
    if (empty) return startRow + i;
  }
  return lastRow + 1;
}

function resolveCollectionRowIndex_(sheet, rowIndex, cardId) {
  var r = toNumber_(rowIndex, 0);
  if (r >= 2) return r;
  if (!cardId) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var target = String(cardId).trim().toLowerCase();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim().toLowerCase() === target) {
      return i + 2;
    }
  }
  return -1;
}

function findPokedexRowByNumber_(sheet, dexNumber) {
  if (dexNumber >= 1 && dexNumber <= 1025) {
    var directRow = 7 + dexNumber;
    if (toNumber_(sheet.getRange(directRow, 2).getValue(), 0) === dexNumber) {
      return directRow;
    }
  }
  var lastRow = Math.min(sheet.getLastRow(), 1032);
  if (lastRow < 8) return -1;
  var nums = sheet.getRange(8, 2, lastRow - 7, 1).getValues();
  for (var i = 0; i < nums.length; i++) {
    if (toNumber_(nums[i][0], 0) === dexNumber) return i + 8;
  }
  return -1;
}

function toNumber_(val, fallback) {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    var normalized = val.replace(/[€%\s]/g, '').replace(/\./g, '').replace(',', '.');
    var parsed = parseFloat(normalized);
    if (!isNaN(parsed)) return parsed;
  }
  return fallback;
}

function formatDateCell_(val) {
  if (!val) return '';
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || 'Europe/Amsterdam', 'yyyy-MM-dd');
  }
  return String(val).trim();
}
