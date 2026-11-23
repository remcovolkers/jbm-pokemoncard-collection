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
  FEEDBACK: 'Feedback'
};

var TCGDEX_BASE_URL = 'https://api.tcgdex.net/v2/en';

var SET_CODE_ALIASES = {
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

// ============================================================================
// GOOGLE SHEETS UI MENU & TRIGGERS
// ============================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('PokéBinder')
    .addItem('TCGdex info aanvullen voor geselecteerde rij', 'enrichSelectedRowFromMenu')
    .addItem('Pokédex Binder volledig synchroniseren', 'syncPokedexBinderFromMenu')
    .addItem('Cardmarket EUR-prijzen verversen', 'refreshAllPricesFromMenu')
    .addSeparator()
    .addItem('API-token instellen / bekijken', 'configureApiTokenFromMenu')
    .addToUi();
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
  syncPokedexBinder_(ss);
}

function syncPokedexBinderFromMenu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = syncPokedexBinder_(ss);
  SpreadsheetApp.getUi().alert('Pokédex Binder gesynchroniseerd (' + result.updatedSlots + ' slots bijgewerkt).');
}

function refreshAllPricesFromMenu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = refreshCollectionPrices_(ss);
  SpreadsheetApp.getUi().alert(
    'Prijzen bijgewerkt: ' + result.updated + ' van ' + result.total + ' kaarten ververst.'
  );
}

/**
 * Installeerbare onEdit-trigger voor direct werken in Google Sheets.
 * (Koppel via Triggers -> handleSheetEdit -> Bij bewerken)
 */
function handleSheetEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAMES.COLLECTION) return;
  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row < 2) return;

  var ss = e.source || SpreadsheetApp.getActiveSpreadsheet();
  if (col === 1) {
    // Kaart-ID ingevoerd in kolom A -> TCGdex verrijking + Set Voortgang + Pokédex sync
    enrichCollectionRow_(ss, sheet, row);
    syncPokedexBinder_(ss);
  } else if (col === 2 || col === 3 || col === 8 || col === 12 || col === 13 || col === 14) {
    syncPokedexBinder_(ss);
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

    lock.waitLock(20000);
    acquired = true;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = body.action || '';
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
      default:
        return jsonResponse_({ ok: false, error: 'Onbekende POST-actie: ' + action });
    }

    return jsonResponse_({
      ok: true,
      result: result,
      data: buildBootstrapPayload_(ss)
    });
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
  return {
    collection: readCollection_(ss),
    setProgress: readSetProgress_(ss),
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
  var values = sheet.getRange(2, 1, lastRow - 1, 22).getValues();
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
      cardNumber: String(row[3] || '').trim(),
      language: String(row[4] || 'EN').trim(),
      type: String(row[5] || '').trim(),
      rarity: String(row[6] || '').trim(),
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
      notes: String(row[21] || '').trim()
    });
  }
  return items;
}

function readSetProgress_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.SET_PROGRESS);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var sets = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var setName = String(row[0] || '').trim();
    if (!setName) continue;
    var totalCards = toNumber_(row[2], 0);
    var ownedUnique = toNumber_(row[3], 0);
    var remaining = toNumber_(row[4], Math.max(0, totalCards - ownedUnique));
    var rawPct = toNumber_(row[5], totalCards > 0 ? ownedUnique / totalCards : 0);
    var progressPercent = rawPct <= 1 && rawPct > 0 ? rawPct * 100 : rawPct;

    sets.push({
      rowIndex: i + 2,
      setName: setName,
      series: String(row[1] || '').trim(),
      totalCards: totalCards,
      ownedUnique: ownedUnique,
      remaining: remaining,
      progressPercent: Math.round(progressPercent * 10) / 10,
      totalSetValue: toNumber_(row[7], 0)
    });
  }
  return sets;
}

function readBinderSlotsPerPage_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.POKEDEX);
  if (!sheet) return 9;
  var val = toNumber_(sheet.getRange('H4').getValue(), 9);
  if (val === 4 || val === 9 || val === 12 || val === 16) return val;
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
  var values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  var items = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var name = String(row[0] || '').trim();
    if (!name) continue;
    var maxBudget = toNumber_(row[6], 0);
    var marketPrice = toNumber_(row[7], 0);
    items.push({
      rowIndex: i + 2,
      cardName: name,
      setName: String(row[1] || '').trim(),
      cardNumber: String(row[2] || '').trim(),
      desiredVariant: String(row[3] || 'Normal').trim(),
      minCondition: String(row[4] || 'Near Mint (NM)').trim(),
      priority: String(row[5] || 'Gemiddeld').trim(),
      maxBudget: maxBudget,
      marketPrice: marketPrice,
      difference: toNumber_(row[8], maxBudget - marketPrice),
      dealStatus: String(row[9] || '').trim(),
      notes: String(row[10] || '').trim(),
      found: Boolean(row[11])
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
    languages: ['EN', 'NL', 'JP', 'DE', 'FR', 'KR'],
    types: [
      'Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting',
      'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless', 'Trainer', 'Energy'
    ],
    rarities: [
      'Common', 'Uncommon', 'Rare', 'Double Rare', 'Illustration Rare',
      'Ultra Rare', 'Special Illustration Rare', 'Hyper Rare', 'Promo', 'Vintage Holo'
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
    tradeTypes: ['Verkoop', 'Ruil', 'Inruil']
  };

  var sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) return defaults;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return defaults;
  var matrix = sheet.getRange(1, 1, lastRow, 9).getValues();
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
    { key: 'tradeTypes', match: ['transactie', 'ruil'] }
  ];

  for (var col = 0; col < 9; col++) {
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

  return defaults;
}

// ============================================================================
// MUTATION HANDLERS (NEVER OVERWRITE FORMULA COLUMNS!)
// ============================================================================

function handleAddCard_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.COLLECTION);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.COLLECTION + '" niet gevonden.');

  var cardId = normalizeCardId_(payload.cardId || '');
  var cardData = Object.assign({}, payload, { cardId: cardId });

  // Vul ontbrekende kaartmetadata aan via TCGdex
  if (cardId && (!cardData.name || !cardData.setName || !cardData.cardNumber)) {
    var fetched = fetchTcgdexCard_(cardId);
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
        cardData.marketPrice = extractCardmarketEur_(fetched);
      }
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
      toNumber_(cardData.setTotalCards, 0)
    );
  }

  syncPokedexBinder_(ss);
  return { rowIndex: targetRow, cardId: cardData.cardId };
}

function handleUpdateCard_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.COLLECTION);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.COLLECTION + '" niet gevonden.');

  var rowIndex = resolveCollectionRowIndex_(sheet, payload.rowIndex, payload.cardId);
  if (rowIndex < 2) throw new Error('Kaartrij niet gevonden om bij te werken.');

  var existingAQ = sheet.getRange(rowIndex, 1, 1, 17).getValues()[0];
  var existingUV = sheet.getRange(rowIndex, 21, 1, 2).getValues()[0];

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
    notes: payload.notes !== undefined ? payload.notes : existingUV[1]
  };

  writeCollectionRow_(sheet, rowIndex, merged);
  syncPokedexBinder_(ss);
  return { rowIndex: rowIndex };
}

function handleDeleteCard_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.COLLECTION);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.COLLECTION + '" niet gevonden.');

  var rowIndex = resolveCollectionRowIndex_(sheet, payload.rowIndex, payload.cardId);
  if (rowIndex < 2) throw new Error('Kaartrij niet gevonden om te verwijderen.');

  // Wis alleen A:Q en U:V; laat formules in R:T intact!
  sheet.getRange(rowIndex, 1, 1, 17).clearContent();
  sheet.getRange(rowIndex, 21, 1, 2).setValues([[false, '']]);
  syncPokedexBinder_(ss);
  return { deletedRowIndex: rowIndex };
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
  // Kolommen A:Q (1..17) en U:V (21..22) — sla R:T (18..20) bewust over!
  sheet.getRange(rowIndex, 1, 1, 17).setValues([rowAQ]);
  sheet.getRange(rowIndex, 21, 1, 2).setValues([[Boolean(data.forTrade), String(data.notes || '').trim()]]);
}

function handleUpdatePokedexSlot_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.POKEDEX);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.POKEDEX + '" niet gevonden.');

  if (payload.slotsPerPage !== undefined) {
    var spp = toNumber_(payload.slotsPerPage, 9);
    if (spp === 4 || spp === 9 || spp === 12 || spp === 16) {
      sheet.getRange('H4').setValue(spp);
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

function handleAddWishlist_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.WISHLIST + '" niet gevonden.');

  var targetRow = findFirstEmptyRow_(sheet, 2, [1]);
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
  return { rowIndex: targetRow };
}

function handleMarkWishlistFound_(ss, payload) {
  var sheet = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  if (!sheet) throw new Error('Tabblad "' + SHEET_NAMES.WISHLIST + '" niet gevonden.');

  var rowIndex = toNumber_(payload.rowIndex, 0);
  if (rowIndex < 2 && payload.cardName) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < names.length; i++) {
        if (String(names[i][0] || '').trim().toLowerCase() === String(payload.cardName).trim().toLowerCase()) {
          rowIndex = i + 2;
          break;
        }
      }
    }
  }
  if (rowIndex < 2) throw new Error('Verlanglijst-item niet gevonden.');

  sheet.getRange(rowIndex, 12).setValue(true);

  if (payload.addToCollection && payload.cardPayload) {
    handleAddCard_(ss, payload.cardPayload);
  }
  return { rowIndex: rowIndex, found: true };
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

  if (payload.status !== undefined) {
    sheet.getRange(rowIdx, 7).setValue(String(payload.status).trim());
  }
  if (payload.votes !== undefined) {
    sheet.getRange(rowIdx, 8).setValue(Math.max(0, toNumber_(payload.votes, 1)));
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

function ensureSetInProgress_(ss, setName, seriesName, totalCards) {
  if (!setName) return;
  var sheet = ss.getSheetByName(SHEET_NAMES.SET_PROGRESS);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var target = String(setName).trim().toLowerCase();
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i][0] || '').trim().toLowerCase() === target) {
        return; // Bestaat al
      }
    }
  }

  var nextRow = findFirstEmptyRow_(sheet, 2, [1]);
  // Voeg uitsluitend kolommen A:C toe — behoud formules in D:H!
  sheet.getRange(nextRow, 1, 1, 3).setValues([[
    String(setName).trim(),
    String(seriesName || '').trim(),
    toNumber_(totalCards, 0)
  ]]);
}

function syncPokedexBinder_(ss) {
  var pokedexSheet = ss.getSheetByName(SHEET_NAMES.POKEDEX);
  if (!pokedexSheet) return { updatedSlots: 0 };

  var collection = readCollection_(ss);
  var lastRow = Math.min(pokedexSheet.getLastRow(), 1032);
  if (lastRow < 8) return { updatedSlots: 0 };

  var numRows = lastRow - 7;
  var dexRows = pokedexSheet.getRange(8, 1, numRows, 10).getValues();
  var updatedSlots = 0;

  for (var i = 0; i < dexRows.length; i++) {
    var pokemonName = String(dexRows[i][2] || '').trim();
    if (!pokemonName) continue;

    var matches = [];
    for (var c = 0; c < collection.length; c++) {
      if (doesCardMatchPokemon_(collection[c].name, pokemonName)) {
        matches.push(formatBinderChoice_(collection[c]));
      }
    }

    var rowNum = i + 8;
    var currentInBinder = Boolean(dexRows[i][3]);
    var currentChoice = String(dexRows[i][8] || '').trim();
    var choiceCell = pokedexSheet.getRange(rowNum, 9);

    if (matches.length === 1) {
      choiceCell.clearDataValidations();
      if (currentChoice !== matches[0]) {
        choiceCell.setValue(matches[0]);
        updatedSlots++;
      }
      if (!currentInBinder) {
        pokedexSheet.getRange(rowNum, 4).setValue(true);
        updatedSlots++;
      }
    } else if (matches.length >= 2) {
      var rule = SpreadsheetApp.newDataValidation().requireValueInList(matches, true).setAllowInvalid(true).build();
      choiceCell.setDataValidation(rule);
      if (matches.indexOf(currentChoice) === -1) {
        choiceCell.setValue(matches[0]);
        updatedSlots++;
      }
      if (!currentInBinder) {
        pokedexSheet.getRange(rowNum, 4).setValue(true);
        updatedSlots++;
      }
    } else {
      choiceCell.clearDataValidations();
    }
  }

  return { updatedSlots: updatedSlots };
}

function formatBinderChoice_(card) {
  var detail = card.variant && card.variant !== 'Normal' ? card.variant : card.cardNumber || card.rarity || 'Kaart';
  return card.cardId + ' | ' + card.setName + ' (' + detail + ')';
}

/**
 * Exacte Pokédex naam-matching (voorkomt valse matches zoals Mew -> Mewtwo of Porygon -> Porygon-Z).
 */
function doesCardMatchPokemon_(cardName, pokemonName) {
  if (!cardName || !pokemonName) return false;
  var cleanCard = String(cardName).trim();
  var cleanPoke = String(pokemonName).trim();
  var escaped = cleanPoke.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var regex = new RegExp('(^|[\\s\'’\\-])' + escaped + '(?=$|[\\s\'’,.!?]|\\s+(?:ex|EX|GX|V|VMAX|VSTAR|δ|★|☆|LV\\.X|BREAK|TAG TEAM))', 'i');
  if (!regex.test(cleanCard)) return false;

  // Extra bescherming tegen hyphen-evoluties zoals Porygon vs Porygon-Z en Ho-Oh
  var afterIdx = cleanCard.toLowerCase().indexOf(cleanPoke.toLowerCase()) + cleanPoke.length;
  var nextChar = cleanCard.charAt(afterIdx);
  if (nextChar === '-' || /[a-z0-9]/i.test(nextChar)) {
    return false;
  }
  return true;
}

// ============================================================================
// TCGDEX ENRICHMENT & PRICE REFRESH
// ============================================================================

function enrichCollectionRow_(ss, sheet, row) {
  var rawId = String(sheet.getRange(row, 1).getValue() || '').trim();
  if (!rawId) return;
  var normalized = normalizeCardId_(rawId);
  var card = fetchTcgdexCard_(normalized);
  if (!card) return;

  var existing = sheet.getRange(row, 1, 1, 17).getValues()[0];
  var setName = (card.set && card.set.name) || existing[2] || '';
  var cardNum = formatCardNumber_(card.localId, card.set && card.set.cardCount && card.set.cardCount.official);
  var price = extractCardmarketEur_(card);

  sheet.getRange(row, 1, 1, 7).setValues([[
    card.id || normalized,
    card.name || existing[1] || '',
    setName,
    cardNum || existing[3] || '',
    existing[4] || 'EN',
    extractCardType_(card) || existing[5] || '',
    mapTcgdexRarity_(card.rarity) || existing[6] || 'Rare'
  ]]);

  if (price > 0) {
    sheet.getRange(row, 17).setValue(price);
  }

  if (setName) {
    ensureSetInProgress_(
      ss,
      setName,
      (card.set && card.set.serie && card.set.serie.name) || '',
      (card.set && card.set.cardCount && (card.set.cardCount.official || card.set.cardCount.total)) || 0
    );
  }
}

function refreshCollectionPrices_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.COLLECTION);
  if (!sheet) return { updated: 0, total: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { updated: 0, total: 0 };

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var prices = sheet.getRange(2, 17, lastRow - 1, 1).getValues();
  var updated = 0;
  var total = 0;

  for (var i = 0; i < ids.length; i++) {
    var rawId = String(ids[i][0] || '').trim();
    if (!rawId) continue;
    total++;
    var card = fetchTcgdexCard_(normalizeCardId_(rawId));
    if (card) {
      var eur = extractCardmarketEur_(card);
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

function normalizeCardId_(rawInput) {
  var cleaned = String(rawInput || '').trim();
  if (!cleaned) return '';

  // Match patronen zoals "MEW 181", "OBF 199/197", "sv03.5-181", "BS 44"
  var match = cleaned.match(/^([a-z0-9.]+)\s*[-\s#]\s*0*([0-9a-z]+)(?:\/\d+)?$/i);
  if (!match) return cleaned.toLowerCase();

  var rawSet = match[1].toUpperCase();
  var mappedSet = SET_CODE_ALIASES[rawSet] || rawSet.toLowerCase();
  var rawNum = match[2];

  // Voor Scarlet & Violet sets gebruikt TCGdex vaak 3-cijferige voorloopnullen (bijv. sv03.5-003)
  return mappedSet + '-' + rawNum;
}

function fetchTcgdexCard_(cardId) {
  if (!cardId) return null;
  var candidates = [cardId];
  var parts = cardId.split('-');
  if (parts.length === 2 && /^\d+$/.test(parts[1])) {
    var numInt = parseInt(parts[1], 10);
    var unpadded = parts[0] + '-' + String(numInt);
    var padded3 = parts[0] + '-' + ('000' + numInt).slice(-3);
    if (candidates.indexOf(padded3) === -1) candidates.push(padded3);
    if (candidates.indexOf(unpadded) === -1) candidates.push(unpadded);
  }

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

function extractCardmarketEur_(card) {
  if (!card || !card.pricing || !card.pricing.cardmarket) return 0;
  var cm = card.pricing.cardmarket;
  var val = cm.trend || cm.avg7 || cm.avg30 || cm.avg || cm.low || 0;
  return Math.round(toNumber_(val, 0) * 100) / 100;
}

function extractCardType_(card) {
  if (!card) return '';
  if (card.types && card.types.length > 0) return card.types[0];
  if (card.category === 'Trainer') return 'Trainer';
  if (card.category === 'Energy') return 'Energy';
  return '';
}

function mapTcgdexRarity_(rarity) {
  var r = String(rarity || '').trim();
  if (!r) return 'Rare';
  return r;
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
