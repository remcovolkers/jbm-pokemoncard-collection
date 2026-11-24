import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const CODE_GS_PATH = path.resolve(import.meta.dirname, 'Code.gs');
const CODE_GS_SOURCE = fs.readFileSync(CODE_GS_PATH, 'utf8');

/**
 * Lichtgewicht in-memory Google Sheets mock om apps-script/Code.gs direct te testen
 * (inclusief harde verificatie dat bestaande formule-kolommen nooit overschreven worden).
 */
function createFakeSheet(name, initialRows = [], options = {}) {
  const grid = initialRows.map((r) => [...r]);
  const validations = new Map();
  let maxCols = options.maxCols ?? Math.max(0, ...grid.map((r) => r.length));

  const ensureCell = (r, c) => {
    while (grid.length < r) grid.push([]);
    while (grid[r - 1].length < c) grid[r - 1].push('');
    if (c > maxCols) maxCols = c;
  };

  const rangeObj = (startRow, startCol, numRows, numCols) => ({
    getValues() {
      const out = [];
      for (let r = 0; r < numRows; r++) {
        const row = [];
        for (let c = 0; c < numCols; c++) {
          ensureCell(startRow + r, startCol + c);
          row.push(grid[startRow + r - 1][startCol + c - 1]);
        }
        out.push(row);
      }
      return out;
    },
    getValue() {
      ensureCell(startRow, startCol);
      return grid[startRow - 1][startCol - 1];
    },
    setValues(matrix) {
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          ensureCell(startRow + r, startCol + c);
          grid[startRow + r - 1][startCol + c - 1] = matrix[r][c];
        }
      }
    },
    setValue(val) {
      ensureCell(startRow, startCol);
      grid[startRow - 1][startCol - 1] = val;
    },
    clearContent() {
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          ensureCell(startRow + r, startCol + c);
          grid[startRow + r - 1][startCol + c - 1] = '';
        }
      }
    },
    setDataValidation(rule) {
      validations.set(`${startRow}:${startCol}`, rule);
    },
    getDataValidation() {
      return validations.get(`${startRow}:${startCol}`) ?? null;
    },
    getDataValidations() {
      const out = [];
      for (let r = 0; r < numRows; r++) {
        const row = [];
        for (let c = 0; c < numCols; c++) {
          row.push(validations.get(`${startRow + r}:${startCol + c}`) ?? null);
        }
        out.push(row);
      }
      return out;
    },
    clearDataValidations() {
      validations.delete(`${startRow}:${startCol}`);
    },
    getSheet: () => sheetApi,
    getRow: () => startRow,
    getNumRows: () => numRows,
    getColumn: () => startCol,
    getNumColumns: () => numCols,
  });

  const sheetApi = {
    _grid: grid,
    _validations: validations,
    getName: () => name,
    getLastRow: () => grid.length,
    getLastColumn: () => Math.max(0, ...grid.map((r) => r.length)),
    getMaxColumns: () => Math.max(maxCols, ...grid.map((r) => r.length)),
    insertColumnAfter(colPos) {
      maxCols = Math.max(maxCols, colPos + 1);
    },
    clearContents() {
      grid.length = 0;
    },
    setFrozenRows() {},
    autoResizeColumns() {},
    getRange(a, b, c = 1, d = 1) {
      if (typeof a === 'string') {
        const match = a.match(/^([A-Z]+)(\d+)$/i);
        const col = match[1].toUpperCase().charCodeAt(0) - 64;
        const row = parseInt(match[2], 10);
        return rangeObj(row, col, 1, 1);
      }
      return rangeObj(a, b, c, d);
    },
  };

  return sheetApi;
}

function createGasEnvironment(options = {}) {
  const token = options.token ?? 'test-secret-token';
  const lockState = { waitCalls: 0, releaseCalls: 0 };

  // Collectie: koprij 1, rij 2 met formules in R(18), S(19), T(20)
  const colRow2 = Array(22).fill('');
  colRow2[17] = '=FORMULA_TOTAL_VAL';
  colRow2[18] = '=FORMULA_PROFIT';
  colRow2[19] = '=FORMULA_ROI';

  const collectionSheet = createFakeSheet(
    'Collectie',
    [
      ['Kaart-ID', 'Kaartnaam', 'Set', 'Kaartnr.'],
      colRow2,
    ],
    { maxCols: 22 }
  );

  // Set Voortgang: koprij 1, rij 2 met formules in D..H
  const setRow2 = ['', '', '', '=FORMULA_OWNED', '=FORMULA_REM', '=FORMULA_PCT', '', '=FORMULA_SETVAL'];
  const setProgressSheet = createFakeSheet('Set Voortgang', [
    ['Setnaam', 'Serie', 'Totaal'],
    setRow2,
  ]);

  // Pokédex Binder: H4 = 9, koprij 7, data vanaf rij 8 (#1 Bulbasaur, #3 Venusaur, #150 Mewtwo, #151 Mew)
  const dexRows = Array.from({ length: 7 }, () => Array(10).fill(''));
  dexRows[3][7] = 9; // cel H4
  dexRows.push(
    ['Gen 1', 1, 'Bulbasaur', false, '=E8', '=F8', '=G8', '=H8', '', false],
    ['Gen 1', 3, 'Venusaur', false, '=E9', '=F9', '=G9', '=H9', '', false],
    ['Gen 1', 150, 'Mewtwo', false, '=E10', '=F10', '=G10', '=H10', '', false],
    ['Gen 1', 151, 'Mew', false, '=E11', '=F11', '=G11', '=H11', '', false]
  );
  const pokedexSheet = createFakeSheet('Pokédex Binder', dexRows);

  // Verlanglijst: koprij 1, rij 2 met formules in I(9), J(10)
  const wlRow2 = Array(12).fill('');
  wlRow2[8] = '=FORMULA_DIFF';
  wlRow2[9] = '=FORMULA_DEAL';
  const wishlistSheet = createFakeSheet('Verlanglijst', [['Kaartnaam'], wlRow2]);

  // Ruil & Verkoop: logboek vanaf rij 22 met formule in H(8)
  const tradeRows = Array.from({ length: 21 }, () => Array(10).fill(''));
  const tradeRow22 = Array(10).fill('');
  tradeRow22[7] = '=FORMULA_NET';
  tradeRows.push(tradeRow22);
  const tradesSheet = createFakeSheet('Ruil & Verkoop', tradeRows);

  const settingsSheet = createFakeSheet('Instellingen', [
    ['Taal', 'Type', 'Zeldzaamheid', 'Variant', 'Conditie', 'Grading', 'Opslaglocatie', 'Prioriteit', 'Transactietype'],
    ['EN', 'Fire', 'Rare', 'Normal', 'Near Mint (NM)', 'Raw', 'Hoofdbinder', 'Hoog', 'Verkoop'],
  ]);

  const sheets = {
    Collectie: collectionSheet,
    'Set Voortgang': setProgressSheet,
    'Pokédex Binder': pokedexSheet,
    Verlanglijst: wishlistSheet,
    'Ruil & Verkoop': tradesSheet,
    Instellingen: settingsSheet,
  };

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'API_TOKEN' ? token : null),
      }),
    },
    LockService: {
      getDocumentLock: () => ({
        waitLock: () => {
          lockState.waitCalls++;
        },
        tryLock: () => {
          lockState.waitCalls++;
          return true;
        },
        releaseLock: () => {
          lockState.releaseCalls++;
        },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt) => ({
        _text: txt,
        setMimeType() {
          return this;
        },
        getContent() {
          return txt;
        },
      }),
    },
    Session: {
      getScriptTimeZone: () => 'Europe/Amsterdam',
    },
    Utilities: {
      formatDate: () => '2026-11-23',
      getUuid: () => '12345678-1234-1234-1234-1234567890ab',
    },
    UrlFetchApp: {
      fetch: (url) => {
        if (options.tcgdexMock) return options.tcgdexMock(url);
        return {
          getResponseCode: () => 200,
          getContentText: () =>
            JSON.stringify({
              id: 'sv03.5-151',
              localId: '151',
              name: 'Mew ex',
              types: ['Psychic'],
              rarity: 'Double Rare',
              set: {
                id: 'sv03.5',
                name: '151',
                serie: { name: 'Scarlet & Violet' },
                cardCount: { official: 165, total: 207 },
              },
              pricing: { cardmarket: { trend: 11.4 } },
            }),
        };
      },
    },
    SpreadsheetApp: {
      DataValidationCriteria: { VALUE_IN_LIST: 'VALUE_IN_LIST' },
      getActiveSpreadsheet: () => ({
        getName: () => 'Pokémon Kaartencollectie Tracker',
        getSheetByName: (name) => sheets[name] ?? null,
        insertSheet: (name) => {
          const created = createFakeSheet(name, []);
          sheets[name] = created;
          return created;
        },
        toast: () => {},
      }),
      newDataValidation: () => {
        const rule = {
          values: [],
          getCriteriaType: () => 'VALUE_IN_LIST',
          getCriteriaValues: () => [rule.values],
        };
        return {
          requireValueInList(vals) {
            rule.values = vals;
            return this;
          },
          setAllowInvalid() {
            return this;
          },
          build: () => rule,
        };
      },
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(CODE_GS_SOURCE, sandbox);

  return { sandbox, sheets, lockState };
}

describe('apps-script/Code.gs Backend API & Formule-integriteit', () => {
  it('weigert ongeautoriseerde GET en POST requests zonder geldig API_TOKEN', () => {
    const { sandbox } = createGasEnvironment();

    const badGet = JSON.parse(sandbox.doGet({ parameter: { action: 'bootstrap', token: 'fout' } }).getContent());
    assert.equal(badGet.ok, false);
    assert.match(badGet.error, /Ongeldig/);

    const badPost = JSON.parse(
      sandbox.doPost({ postData: { contents: JSON.stringify({ token: 'fout', action: 'addCard', payload: {} }) } }).getContent()
    );
    assert.equal(badPost.ok, false);
  });

  it('beantwoordt ping en bootstrap correct met geldig token', () => {
    const { sandbox } = createGasEnvironment();

    const ping = JSON.parse(sandbox.doGet({ parameter: { action: 'ping', token: 'test-secret-token' } }).getContent());
    assert.equal(ping.ok, true);
    assert.equal(ping.spreadsheetName, 'Pokémon Kaartencollectie Tracker');

    const boot = JSON.parse(sandbox.doGet({ parameter: { action: 'bootstrap', token: 'test-secret-token' } }).getContent());
    assert.equal(boot.ok, true);
    assert.equal(boot.data.binderSlotsPerPage, 9);
    assert.equal(boot.data.pokedex.length, 4);
  });

  it('addCard schrijft A:Q en U:V, behoudt R:T formules, voegt nieuwe set toe (alleen A:C) en synct Pokédex zonder Mew->Mewtwo bug', () => {
    const { sandbox, sheets, lockState } = createGasEnvironment();

    const res = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'addCard',
            payload: {
              cardId: 'MEW 151',
              quantity: 2,
              purchasePrice: 8.5,
              forTrade: true,
              notes: 'Via PWA',
            },
          }),
        },
      }).getContent()
    );

    assert.equal(res.ok, true);
    assert.equal(lockState.waitCalls, 1);
    assert.equal(lockState.releaseCalls, 1);

    // Collectie rij 2: R:T formules (index 17, 18, 19) mogen NOOIT overschreven zijn!
    const colRow = sheets.Collectie._grid[1];
    assert.equal(colRow[0], 'sv03.5-151');
    assert.equal(colRow[1], 'Mew ex');
    assert.equal(colRow[11], 2);
    assert.equal(colRow[17], '=FORMULA_TOTAL_VAL');
    assert.equal(colRow[18], '=FORMULA_PROFIT');
    assert.equal(colRow[19], '=FORMULA_ROI');
    assert.equal(colRow[20], true);
    assert.equal(colRow[21], 'Via PWA');

    // Set Voortgang rij 2: alleen A:C geschreven, formules D:H behouden!
    const setRow = sheets['Set Voortgang']._grid[1];
    assert.equal(setRow[0], '151');
    assert.equal(setRow[1], 'Scarlet & Violet');
    assert.equal(setRow[2], 165);
    assert.equal(setRow[3], '=FORMULA_OWNED');
    assert.equal(setRow[7], '=FORMULA_SETVAL');

    // Pokédex Binder: Mew (#151, rij 11 = index 10) wel gekoppeld & aangevinkt; Mewtwo (#150, index 9) NIET!
    const mewtwoRow = sheets['Pokédex Binder']._grid[9];
    const mewRow = sheets['Pokédex Binder']._grid[10];
    assert.equal(mewtwoRow[3], false);
    assert.equal(mewtwoRow[8], '');
    assert.equal(mewRow[3], true);
    assert.match(mewRow[8], /^sv03\.5-151 \| 151/);
    assert.equal(mewRow[4], '=E11'); // formule-kolom E behouden
  });

  it('deleteCard wist alleen A:Q en U:V en laat R:T formules intact', () => {
    const { sandbox, sheets } = createGasEnvironment();

    sandbox.doPost({
      postData: {
        contents: JSON.stringify({
          token: 'test-secret-token',
          action: 'addCard',
          payload: { cardId: 'sv03.5-151', name: 'Mew ex', setName: '151', cardNumber: '151/165' },
        }),
      },
    });

    const del = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'deleteCard',
            payload: { rowIndex: 2 },
          }),
        },
      }).getContent()
    );

    assert.equal(del.ok, true);
    const row = sheets.Collectie._grid[1];
    assert.equal(row[0], '');
    assert.equal(row[1], '');
    assert.equal(row[17], '=FORMULA_TOTAL_VAL');
    assert.equal(row[18], '=FORMULA_PROFIT');
    assert.equal(row[19], '=FORMULA_ROI');
    assert.equal(row[20], false);
  });

  it('addWishlist, markWishlistFound en logTrade behouden alle formule-kolommen (I:J en H)', () => {
    const { sandbox, sheets } = createGasEnvironment();

    const addWl = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'addWishlist',
            payload: {
              cardName: 'Gengar Holo',
              setName: 'Expedition',
              cardNumber: '13/165',
              maxBudget: 95,
              marketPrice: 88,
            },
          }),
        },
      }).getContent()
    );
    assert.equal(addWl.ok, true);
    assert.equal(sheets.Verlanglijst._grid[1][0], 'Gengar Holo');
    assert.equal(sheets.Verlanglijst._grid[1][8], '=FORMULA_DIFF');
    assert.equal(sheets.Verlanglijst._grid[1][9], '=FORMULA_DEAL');

    const updWl = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'updateWishlist',
            payload: {
              rowIndex: 2,
              cardName: 'Gengar Holo',
              maxBudget: 110,
              priority: 'Grail',
              notes: 'Centering belangrijk',
              cardId: 'ecard1-13',
            },
          }),
        },
      }).getContent()
    );
    assert.equal(updWl.ok, true);
    assert.equal(sheets.Verlanglijst._grid[1][5], 'Grail');
    assert.equal(sheets.Verlanglijst._grid[1][6], 110);
    assert.equal(sheets.Verlanglijst._grid[1][10], 'Centering belangrijk');
    assert.equal(sheets.Verlanglijst._grid[1][12], 'ecard1-13');
    assert.equal(sheets.Verlanglijst._grid[1][8], '=FORMULA_DIFF');
    assert.equal(sheets.Verlanglijst._grid[1][9], '=FORMULA_DEAL');

    const delWl = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'deleteWishlist',
            payload: { rowIndex: 2, cardName: 'Gengar Holo' },
          }),
        },
      }).getContent()
    );
    assert.equal(delWl.ok, true);
    assert.equal(sheets.Verlanglijst._grid[1][0], '');
    assert.equal(sheets.Verlanglijst._grid[1][10], '');
    assert.equal(sheets.Verlanglijst._grid[1][11], false);
    assert.equal(sheets.Verlanglijst._grid[1][12], '');
    assert.equal(sheets.Verlanglijst._grid[1][8], '=FORMULA_DIFF');
    assert.equal(sheets.Verlanglijst._grid[1][9], '=FORMULA_DEAL');

    const logTr = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'logTrade',
            payload: {
              date: '2026-11-23',
              cardName: 'Charizard ex',
              setName: '151',
              type: 'Verkoop',
              purchasePrice: 100,
              saleValue: 150,
              platformFees: 5,
              counterparty: 'Cardmarket',
            },
          }),
        },
      }).getContent()
    );
    assert.equal(logTr.ok, true);
    const tradeRow = sheets['Ruil & Verkoop']._grid[21]; // rij 22
    assert.equal(tradeRow[1], 'Charizard ex');
    assert.equal(tradeRow[7], '=FORMULA_NET'); // formule in kolom H intact!
    assert.equal(tradeRow[8], 'Cardmarket');
  });

  it('updatePokedexSlot werkt H4 en slotvelden bij zonder formules in E:H te raken, en geeft lock altijd vrij bij fout', () => {
    const { sandbox, sheets, lockState } = createGasEnvironment();

    const res = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'updatePokedexSlot',
            payload: { dexNumber: 3, inBinder: true, upgradeWanted: true, slotsPerPage: 16 },
          }),
        },
      }).getContent()
    );
    assert.equal(res.ok, true);
    assert.equal(sheets['Pokédex Binder']._grid[3][7], 16);
    assert.equal(sheets['Pokédex Binder']._grid[8][3], true);
    assert.equal(sheets['Pokédex Binder']._grid[8][9], true);
    assert.equal(sheets['Pokédex Binder']._grid[8][4], '=E9');

    // 5x4 bulk binder indeling (20 vakjes) opslaan, oude H4 dropdown automatisch uitbreiden en via bootstrap teruggeven
    const oldRule = sandbox.SpreadsheetApp.newDataValidation().requireValueInList(['4', '9', '12', '16'], true).build();
    sheets['Pokédex Binder'].getRange('H4').setDataValidation(oldRule);
    const res20 = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'updatePokedexSlot',
            payload: { slotsPerPage: 20 },
          }),
        },
      }).getContent()
    );
    assert.equal(res20.ok, true);
    assert.equal(sheets['Pokédex Binder']._grid[3][7], 20);
    assert.equal(res20.data.binderSlotsPerPage, 20);
    assert.ok(sheets['Pokédex Binder'].getRange('H4').getDataValidation().getCriteriaValues()[0].includes('20'));

    // Onbekende actie moet netjes lock vrijgeven
    const errRes = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({ token: 'test-secret-token', action: 'bestaatNiet', payload: {} }),
        },
      }).getContent()
    );
    assert.equal(errRes.ok, false);
    assert.equal(lockState.waitCalls, lockState.releaseCalls);
  });

  it('addFeedback maakt automatisch het tabblad Feedback aan en ondersteunt updateFeedback en deleteFeedback', () => {
    const { sandbox, sheets } = createGasEnvironment();
    assert.equal(sheets.Feedback, undefined);

    const addRes = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'addFeedback',
            payload: {
              id: 'fb-test-1',
              page: 'Collectie',
              category: 'Idee',
              title: 'Export naar CSV',
              description: 'Handig als backup',
              author: 'Remco',
              platform: 'Android App',
            },
          }),
        },
      }).getContent()
    );
    assert.equal(addRes.ok, true);
    assert.ok(sheets.Feedback);
    assert.equal(sheets.Feedback._grid[0][0], 'ID');
    assert.equal(addRes.data.feedback.length, 1);
    assert.equal(addRes.data.feedback[0].title, 'Export naar CSV');
    assert.equal(addRes.data.feedback[0].status, 'open');

    const updRes = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'updateFeedback',
            payload: {
              id: 'fb-test-1',
              page: 'Instellingen',
              category: 'Verbetering',
              title: 'Export naar CSV/JSON',
              description: 'Ook voor losse sets',
              author: 'Melli',
              status: 'done',
              votes: 5,
            },
          }),
        },
      }).getContent()
    );
    assert.equal(updRes.ok, true);
    assert.equal(updRes.data.feedback[0].page, 'Instellingen');
    assert.equal(updRes.data.feedback[0].category, 'Verbetering');
    assert.equal(updRes.data.feedback[0].title, 'Export naar CSV/JSON');
    assert.equal(updRes.data.feedback[0].description, 'Ook voor losse sets');
    assert.equal(updRes.data.feedback[0].author, 'Melli');
    assert.equal(updRes.data.feedback[0].status, 'done');
    assert.equal(updRes.data.feedback[0].votes, 5);

    const delRes = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'deleteFeedback',
            payload: { id: 'fb-test-1' },
          }),
        },
      }).getContent()
    );
    assert.equal(delRes.ok, true);
    assert.equal(delRes.data.feedback.length, 0);
  });

  it('handleSheetEdit ondersteunt two-way werken in Google Sheets (auto-fill, Set Voortgang, Cardmarket idProduct + fallback, Pokédex I->D & holo-prijs)', () => {
    const { sandbox, sheets, lockState } = createGasEnvironment({
      tcgdexMock: () => ({
        getResponseCode: () => 200,
        getContentText: () =>
          JSON.stringify({
            id: 'sv03.5-151',
            localId: '151',
            name: 'Mew ex',
            types: ['Psychic'],
            rarity: 'Special Illustration Rare',
            set: {
              id: 'sv03.5',
              name: '151',
              serie: { name: 'Scarlet & Violet' },
              cardCount: { official: 165, total: 207 },
            },
            pricing: { cardmarket: { idProduct: 733794, trend: 11.4, 'trend-holo': 24.75 } },
          }),
      }),
    });

    // Mel vult Variant = "Reverse Holo" en typt Kaart-ID "MEW 151" in rij 2 van Collectie
    sheets.Collectie.getRange(2, 8).setValue('Reverse Holo');
    sheets.Collectie.getRange(2, 1).setValue('MEW 151');
    sandbox.handleSheetEdit({
      range: sheets.Collectie.getRange(2, 1, 1, 1),
    });

    const row = sheets.Collectie._grid[1];
    assert.equal(row[0], 'sv03.5-151');
    assert.equal(row[1], 'Mew ex');
    assert.equal(row[4], 'EN');
    assert.equal(row[6], 'Special Illustration Rare');
    assert.equal(row[9], 'Raw');
    assert.equal(row[11], 1);
    assert.equal(row[16], 24.75); // Holo-prijs gekozen i.p.v. normale prijs!
    assert.equal(row[17], '=FORMULA_TOTAL_VAL'); // R:T formules onaangeroerd
    assert.equal(row[21], 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=733794');
    assert.equal(
      sandbox.buildCardmarketUrl_({ name: 'Dark Charizard', localId: '004' }),
      'https://www.cardmarket.com/en/Pokemon/Products/Singles?searchString=Dark%20Charizard%204'
    );
    assert.equal(sheets['Set Voortgang']._grid[1][0], '151');
    assert.equal(sheets['Pokédex Binder']._grid[10][3], true); // Mew (#151) aangevinkt

    // Mel wist kolom I in Pokédex Binder voor Mew -> kolom D (In Binder?) wordt automatisch false
    sheets['Pokédex Binder'].getRange(11, 9).setValue('');
    sandbox.handleSheetEdit({
      range: sheets['Pokédex Binder'].getRange(11, 9, 1, 1),
    });
    assert.equal(sheets['Pokédex Binder']._grid[10][3], false);
    assert.equal(lockState.waitCalls, lockState.releaseCalls);
  });

  it('syncSetCodesSheet schrijft Kaartcode (Op kaart) én API-code (TCGdex), filtert TCG Pocket weg en ondersteunt dynamische/multi-set lookups (DLR, 30C, nieuwe sets)', () => {
    const fetchedUrls = [];
    const { sandbox, sheets } = createGasEnvironment({
      tcgdexMock: (url) => {
        fetchedUrls.push(url);
        if (url.includes('/graphql')) {
          return {
            getResponseCode: () => 200,
            getContentText: () =>
              JSON.stringify({
                data: {
                  sets: [
                    { id: 'base1', name: 'Base Set', tcgOnline: 'BS', serie: { id: 'base', name: 'Base' }, cardCount: { official: 102, total: 102 } },
                    { id: 'A1', name: 'Genetic Apex', tcgOnline: null, serie: { id: 'tcgp', name: 'Pokémon TCG Pocket' }, cardCount: { official: 226, total: 286 } },
                    { id: 'me06', name: 'Delta Reign', tcgOnline: null, serie: { id: 'me', name: 'Mega Evolution' }, cardCount: { official: 103, total: 141 } },
                    { id: 'me07', name: 'Future Mega Set', tcgOnline: null, serie: { id: 'me', name: 'Mega Evolution' }, cardCount: { official: 99, total: 135 } },
                  ],
                },
              }),
          };
        }
        if (url.endsWith('/sets/me07')) {
          return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({ id: 'me07', abbreviation: { official: 'FMS' } }),
          };
        }
        if (url.endsWith('/cards/me06-011')) {
          return {
            getResponseCode: () => 200,
            getContentText: () =>
              JSON.stringify({
                id: 'me06-011',
                localId: '011',
                name: 'Zorua',
                types: ['Darkness'],
                rarity: 'Common',
                set: { id: 'me06', name: 'Delta Reign', serie: { name: 'Mega Evolution' }, cardCount: { official: 103, total: 141 } },
                pricing: { cardmarket: { trend: 0.45 } },
              }),
          };
        }
        if (url.endsWith('/cards/30th-c-015')) {
          return {
            getResponseCode: () => 200,
            getContentText: () =>
              JSON.stringify({
                id: '30th-c-015',
                localId: '015',
                name: 'Pikachu Classic',
                types: ['Lightning'],
                rarity: 'Holo Rare',
                set: { id: '30th-c', name: '30th Classic Collection', serie: { name: 'Mega Evolution' }, cardCount: { official: 30, total: 30 } },
                pricing: { cardmarket: { trend: 12.0 } },
              }),
          };
        }
        if (url.endsWith('/cards/me07-007')) {
          return {
            getResponseCode: () => 200,
            getContentText: () =>
              JSON.stringify({
                id: 'me07-007',
                localId: '007',
                name: 'Lucario ex',
                types: ['Fighting'],
                rarity: 'Double Rare',
                set: { id: 'me07', name: 'Future Mega Set', serie: { name: 'Mega Evolution' }, cardCount: { official: 99, total: 135 } },
                pricing: { cardmarket: { trend: 3.5 } },
              }),
          };
        }
        return { getResponseCode: () => 404, getContentText: () => 'Not Found' };
      },
    });

    // 1. Draai syncSetCodesSheet -> 7 kolommen, TCG Pocket (A1) uitgefilterd, me07 krijgt live FMS code!
    sandbox.syncSetCodesSheet();
    assert.ok(sheets.Setcodes);
    const grid = sheets.Setcodes._grid;
    assert.deepEqual(grid[0], [
      'Kaartcode (Op kaart)',
      'Setnaam',
      'Serie / Era',
      'Officieel',
      'Totaal (incl. secrets)',
      'Voorbeeld invoer',
      'API-code (TCGdex)',
    ]);
    assert.equal(grid.length, 4); // koprij + 3 fysieke sets (A1 overgeslagen!)
    assert.deepEqual(grid[1], ['FMS', 'Future Mega Set', 'Mega Evolution', 99, 135, 'FMS 001', 'me07']);
    assert.deepEqual(grid[2], ['DLR', 'Delta Reign', 'Mega Evolution', 103, 141, 'DLR 001', 'me06']);
    assert.deepEqual(grid[3], ['BS', 'Base Set', 'Base', 102, 102, 'BS 1', 'base1']);

    // 2. Mel typt "DLR 11" -> vindt direct me06-011 (Zorua)
    sheets.Collectie.getRange(2, 1).setValue('DLR 11');
    sandbox.handleSheetEdit({ range: sheets.Collectie.getRange(2, 1, 1, 1) });
    assert.equal(sheets.Collectie._grid[1][0], 'me06-011');
    assert.equal(sheets.Collectie._grid[1][1], 'Zorua');
    assert.equal(sheets.Collectie._grid[1][2], 'Delta Reign');

    // 3. Mel typt "30C 15" -> probeert 30th (404) en valt automatisch door naar 30th-c-015!
    const res30c = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'addCard',
            payload: { cardId: '30C 15' },
          }),
        },
      }).getContent()
    );
    assert.equal(res30c.ok, true);
    assert.equal(res30c.result.cardId, '30th-c-015');

    // 4. Mel typt nieuwe setcode "FMS 7" (niet hardcoded in Code.gs, maar dynamisch gelezen uit Setcodes-tabblad!)
    const resFms = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'addCard',
            payload: { cardId: 'FMS 7' },
          }),
        },
      }).getContent()
    );
    assert.equal(resFms.ok, true);
    assert.equal(resFms.result.cardId, 'me07-007');
    assert.ok(fetchedUrls.some((u) => u.endsWith('/cards/me07-007')));
  });

  it('ondersteunt optionele Herkomst / acquisitionMethod (kolom W) bij addCard, updateCard en deleteCard zonder R:T formules te raken', () => {
    const { sandbox, sheets } = createGasEnvironment();

    const addRes = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'addCard',
            payload: {
              cardId: 'sv03.5-151',
              name: 'Mew ex',
              setName: '151',
              cardNumber: '151/165',
              purchasePrice: 0,
              marketPrice: 11.4,
              acquisitionMethod: 'Pack Pull',
            },
          }),
        },
      }).getContent()
    );

    assert.equal(addRes.ok, true);
    assert.equal(sheets.Collectie._grid[0][22], 'Herkomst');
    assert.equal(sheets.Collectie._grid[1][22], 'Pack Pull');
    assert.equal(sheets.Collectie._grid[1][17], '=FORMULA_TOTAL_VAL');
    assert.equal(sheets.Collectie._grid[1][18], '=FORMULA_PROFIT');
    assert.equal(sheets.Collectie._grid[1][19], '=FORMULA_ROI');
    assert.equal(addRes.data.collection[0].acquisitionMethod, 'Pack Pull');
    assert.equal(addRes.data.collection[0].purchasePrice, 0);

    const updRes = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'updateCard',
            payload: { rowIndex: 2, acquisitionMethod: 'Single gekocht', purchasePrice: 9.5 },
          }),
        },
      }).getContent()
    );
    assert.equal(updRes.ok, true);
    assert.equal(sheets.Collectie._grid[1][22], 'Single gekocht');
    assert.equal(updRes.data.collection[0].acquisitionMethod, 'Single gekocht');
    assert.equal(updRes.data.collection[0].purchasePrice, 9.5);
    assert.equal(sheets.Collectie._grid[1][17], '=FORMULA_TOTAL_VAL');

    const delRes = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'deleteCard',
            payload: { rowIndex: 2 },
          }),
        },
      }).getContent()
    );
    assert.equal(delRes.ok, true);
    assert.equal(sheets.Collectie._grid[1][22], '');
    assert.equal(sheets.Collectie._grid[1][17], '=FORMULA_TOTAL_VAL');
  });

  it('rekent ontbrekende Set Voortgang waarde (kolom H = 0) live uit Collectie en bewaart Verlanglijst cardId in kolom M zonder I:J formules te raken', () => {
    const { sandbox, sheets } = createGasEnvironment();

    // Voeg SVP Charmander (€ 46,21) toe aan Collectie en een Set Voortgang rij met kolom H = 0
    sheets.Collectie._grid[1][0] = 'svp-044';
    sheets.Collectie._grid[1][1] = 'Charmander';
    sheets.Collectie._grid[1][2] = 'SVP Black Star Promos';
    sheets.Collectie._grid[1][3] = '044';
    sheets.Collectie._grid[1][11] = 1;
    sheets.Collectie._grid[1][16] = 46.21;

    sheets['Set Voortgang']._grid[1] = ['SVP Black Star Promos', 'Scarlet & Violet', 226, 1, 225, 0.004, '', 0];

    const addWl = JSON.parse(
      sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            token: 'test-secret-token',
            action: 'addWishlist',
            payload: {
              cardId: 'sv03.5-181',
              cardName: 'Dragonair',
              setName: '151',
              cardNumber: '181/165',
              maxBudget: 47,
              marketPrice: 44.76,
            },
          }),
        },
      }).getContent()
    );

    assert.equal(addWl.ok, true);
    assert.equal(sheets.Verlanglijst._grid[0][12], 'Kaart-ID');
    assert.equal(sheets.Verlanglijst._grid[1][12], 'sv03.5-181');
    assert.equal(sheets.Verlanglijst._grid[1][8], '=FORMULA_DIFF');
    assert.equal(sheets.Verlanglijst._grid[1][9], '=FORMULA_DEAL');
    assert.equal(addWl.data.wishlist[0].cardId, 'sv03.5-181');

    const svp = addWl.data.setProgress.find((s) => s.setName === 'SVP Black Star Promos');
    assert.equal(svp.totalSetValue, 46.21);
  });
});
