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
function createFakeSheet(name, initialRows = []) {
  const grid = initialRows.map((r) => [...r]);
  const validations = new Map();

  const ensureCell = (r, c) => {
    while (grid.length < r) grid.push([]);
    while (grid[r - 1].length < c) grid[r - 1].push('');
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
    clearDataValidations() {
      validations.delete(`${startRow}:${startCol}`);
    },
  });

  return {
    _grid: grid,
    _validations: validations,
    getName: () => name,
    getLastRow: () => grid.length,
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
}

function createGasEnvironment(options = {}) {
  const token = options.token ?? 'test-secret-token';
  const lockState = { waitCalls: 0, releaseCalls: 0 };

  // Collectie: koprij 1, rij 2 met formules in R(18), S(19), T(20)
  const colRow2 = Array(22).fill('');
  colRow2[17] = '=FORMULA_TOTAL_VAL';
  colRow2[18] = '=FORMULA_PROFIT';
  colRow2[19] = '=FORMULA_ROI';

  const collectionSheet = createFakeSheet('Collectie', [
    ['Kaart-ID', 'Kaartnaam', 'Set', 'Kaartnr.'],
    colRow2,
  ]);

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
      getActiveSpreadsheet: () => ({
        getName: () => 'Pokémon Kaartencollectie Tracker',
        getSheetByName: (name) => sheets[name] ?? null,
        insertSheet: (name) => {
          const created = createFakeSheet(name, []);
          sheets[name] = created;
          return created;
        },
      }),
      newDataValidation: () => {
        const rule = { values: [] };
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
            payload: { id: 'fb-test-1', status: 'done', votes: 5 },
          }),
        },
      }).getContent()
    );
    assert.equal(updRes.ok, true);
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
});
