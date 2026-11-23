import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const CODE_GS_PATH = path.resolve(import.meta.dirname, 'Code.gs');
const CODE_GS_SOURCE = fs.readFileSync(CODE_GS_PATH, 'utf8');

function createFakeSheet(name, initialRows = []) {
  const grid = initialRows.map((r) => [...r]);
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
  });

  let currentName = name;
  return {
    _grid: grid,
    getName: () => currentName,
    setName: (n) => {
      currentName = n;
    },
    getLastRow: () => grid.length,
    getLastColumn: () => Math.max(0, ...grid.map((r) => r.length)),
    setFrozenRows() {},
    getRange: (r, c, nr = 1, nc = 1) => rangeObj(r, c, nr, nc),
  };
}

function createFeedbackEnv() {
  const props = new Map();
  const driveFiles = new Map();
  const driveFolders = new Map();
  let fileSeq = 0;
  let folderSeq = 0;

  const sheets = [createFakeSheet('Sheet1', [])];
  const ssApi = {
    getName: () => 'PokéBinder Feedback Hub',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/fb-sheet/edit',
    getSheets: () => sheets,
    getSheetByName: (name) => sheets.find((s) => s.getName() === name) ?? null,
    insertSheet: (name) => {
      const s = createFakeSheet(name, []);
      sheets.push(s);
      return s;
    },
  };

  const lockState = { waits: 0, releases: 0 };

  const createFolderObj = (id, name) => ({
    getId: () => id,
    getName: () => name,
    getUrl: () => `https://drive.google.com/drive/folders/${id}`,
    isTrashed: () => false,
    createFile(blob) {
      const fileId = `drive-file-${++fileSeq}`;
      const record = {
        id: fileId,
        name: blob.name,
        mimeType: blob.mimeType,
        size: blob.bytes.length,
        access: null,
        permission: null,
        trashed: false,
      };
      driveFiles.set(fileId, record);
      return {
        getId: () => fileId,
        setSharing(access, permission) {
          record.access = access;
          record.permission = permission;
        },
        setTrashed(flag) {
          record.trashed = flag;
        },
      };
    },
  });

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
    Error,
    parseInt,
    isNaN,
    encodeURIComponent,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(k) ?? null,
        setProperty: (k, v) => props.set(k, String(v)),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          lockState.waits++;
        },
        releaseLock: () => {
          lockState.releases++;
        },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt) => ({
        setMimeType() {
          return this;
        },
        getContent: () => txt,
      }),
    },
    Utilities: {
      base64Decode: (b64) => Array.from(Buffer.from(b64, 'base64')),
      newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name }),
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFoldersByName(name) {
        const match = Array.from(driveFolders.values()).filter((f) => f.getName() === name);
        let idx = 0;
        return { hasNext: () => idx < match.length, next: () => match[idx++] };
      },
      createFolder(name) {
        const id = `drive-folder-${++folderSeq}`;
        const f = createFolderObj(id, name);
        driveFolders.set(id, f);
        return f;
      },
      getFolderById: (id) => driveFolders.get(id) ?? null,
      getFileById(id) {
        const rec = driveFiles.get(id);
        if (!rec) throw new Error('File not found');
        return {
          setTrashed(flag) {
            rec.trashed = flag;
          },
        };
      },
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ssApi,
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(CODE_GS_SOURCE, sandbox);

  return { sandbox, ssApi, driveFiles, driveFolders, lockState };
}

describe('apps-script-feedback/Code.gs Centrale Feedback Hub + Drive Screenshots', () => {
  it('richt tijdens setupFeedbackHub automatisch tabblad en Drive-map in en weigert ongeldige appKey', () => {
    const { sandbox, ssApi, driveFolders } = createFeedbackEnv();
    const info = sandbox.setupFeedbackHub();
    assert.equal(info.sheetName, 'Feedback');
    assert.equal(driveFolders.size, 1);
    assert.equal(ssApi.getSheetByName('Feedback')._grid[0][10], 'Screenshot URL');

    const badGet = JSON.parse(
      sandbox.doGet({ parameter: { action: 'list', appKey: 'verkeerd' } }).getContent()
    );
    assert.equal(badGet.ok, false);

    const ping = JSON.parse(
      sandbox.doGet({ parameter: { action: 'ping', appKey: 'pokebinder-feedback-v1' } }).getContent()
    );
    assert.equal(ping.ok, true);
  });

  it('slaat feedback met base64-screenshot op in Google Drive, deelt link publiek en vervangt/verwijdert screenshot netjes', () => {
    const { sandbox, driveFiles, lockState } = createFeedbackEnv();
    const tinyPngBase64 = Buffer.from('fake-png-bytes-pokebinder').toString('base64');

    const addRes = JSON.parse(
      sandbox
        .doPost({
          postData: {
            contents: JSON.stringify({
              appKey: 'pokebinder-feedback-v1',
              action: 'addFeedback',
              payload: {
                id: 'fb-hub-1',
                page: 'Collectie',
                category: 'Bug',
                title: 'Knop valt deels buiten scherm',
                description: 'Zie screenshot rechtsboven',
                author: 'Melli',
                platform: 'Android App',
                screenshot: {
                  base64: tinyPngBase64,
                  mimeType: 'image/webp',
                  fileName: 'bug-collectie.webp',
                },
              },
            }),
          },
        })
        .getContent()
    );

    assert.equal(addRes.ok, true);
    assert.equal(addRes.items.length, 1);
    assert.equal(addRes.items[0].source, 'hub');
    assert.equal(addRes.items[0].screenshotFileId, 'drive-file-1');
    assert.equal(addRes.items[0].screenshotUrl, 'https://drive.google.com/thumbnail?id=drive-file-1&sz=w1600');
    assert.equal(driveFiles.get('drive-file-1').access, 'ANYONE_WITH_LINK');
    assert.equal(driveFiles.get('drive-file-1').permission, 'VIEW');

    // Weigert ongeldig MIME type of te groot bestand
    const badMime = JSON.parse(
      sandbox
        .doPost({
          postData: {
            contents: JSON.stringify({
              appKey: 'pokebinder-feedback-v1',
              action: 'addFeedback',
              payload: {
                title: 'Fout type',
                screenshot: { base64: tinyPngBase64, mimeType: 'application/pdf', fileName: 'x.pdf' },
              },
            }),
          },
        })
        .getContent()
    );
    assert.equal(badMime.ok, false);

    // updateFeedback met nieuwe screenshot -> verplaatst oude file (drive-file-1) naar prullenbak
    const updRes = JSON.parse(
      sandbox
        .doPost({
          postData: {
            contents: JSON.stringify({
              appKey: 'pokebinder-feedback-v1',
              action: 'updateFeedback',
              payload: {
                id: 'fb-hub-1',
                title: 'Knop op smal scherm verbeterd',
                status: 'in_progress',
                votes: 4,
                screenshot: {
                  base64: tinyPngBase64,
                  mimeType: 'image/png',
                  fileName: 'nieuw.png',
                },
              },
            }),
          },
        })
        .getContent()
    );
    assert.equal(updRes.ok, true);
    assert.equal(updRes.items[0].title, 'Knop op smal scherm verbeterd');
    assert.equal(updRes.items[0].status, 'in_progress');
    assert.equal(updRes.items[0].votes, 4);
    assert.equal(updRes.items[0].screenshotFileId, 'drive-file-2');
    assert.equal(driveFiles.get('drive-file-1').trashed, true);
    assert.equal(driveFiles.get('drive-file-2').trashed, false);

    // deleteFeedback ruimt ook de actieve Drive-screenshot op
    const delRes = JSON.parse(
      sandbox
        .doPost({
          postData: {
            contents: JSON.stringify({
              appKey: 'pokebinder-feedback-v1',
              action: 'deleteFeedback',
              payload: { id: 'fb-hub-1' },
            }),
          },
        })
        .getContent()
    );
    assert.equal(delRes.ok, true);
    assert.equal(delRes.items.length, 0);
    assert.equal(driveFiles.get('drive-file-2').trashed, true);
    assert.equal(lockState.waits, lockState.releases);
  });
});
