PH.store = function() {
  var util = PH.util;
  var DB_NAME = "daftar";
  var DB_VERSION = 1;
  var STORES = {
    meta: "meta",
    sourceRows: "sourceRows",
    settings: "settings",
    calibration: "calibration",
    rawImport: "rawImport"
  };
  var dbPromise = null;
  var dbUnavailable = false;
  var dbUnavailableReason = null;
  function attemptOpenDb() {
    return new Promise(function(resolve) {
      if (typeof indexedDB === "undefined") {
        resolve({
          db: null,
          reason: "unsupported"
        });
        return;
      }
      var settled = false;
      var blockedTimer = null;
      function settle(result) {
        if (settled) return;
        settled = true;
        if (blockedTimer) clearTimeout(blockedTimer);
        resolve(result);
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        Object.keys(STORES).forEach(function(k) {
          if (!db.objectStoreNames.contains(STORES[k])) db.createObjectStore(STORES[k]);
        });
      };
      req.onblocked = function() {
        notify({
          type: "db-blocked"
        });
        blockedTimer = setTimeout(function() {
          settle({
            db: null,
            reason: "blocked"
          });
        }, 8000);
      };
      req.onsuccess = function(e) {
        var db = e.target.result;
        db.onversionchange = function() {
          db.close();
          dbPromise = null;
        };
        settle({
          db: db,
          reason: null
        });
      };
      req.onerror = function() {
        captureDbError(req.error, "database", "open");
        settle({
          db: null,
          reason: "error"
        });
      };
    });
  }
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = attemptOpenDb().then(function(result) {
      if (result.db || result.reason === "blocked") return result;
      return attemptOpenDb();
    }).then(function(result) {
      dbUnavailable = !result.db;
      dbUnavailableReason = result.db ? null : result.reason;
      if (!result.db) dbPromise = null;
      return result.db;
    });
    return dbPromise;
  }
  function isDbUnavailable() {
    return dbUnavailable;
  }
  function getDbUnavailableReason() {
    return dbUnavailableReason;
  }
  var lastDbError = null;
  function captureDbError(err, storeName, op) {
    lastDbError = {
      code: err && err.name ? err.name : "UnknownError",
      message: err && err.message ? err.message : "",
      store: storeName,
      op: op,
      timestamp: Date.now()
    };
  }
  function getLastDbError() {
    return lastDbError;
  }
  function put(storeName, key, value) {
    return openDb().then(function(db) {
      if (!db) return false;
      return new Promise(function(resolve) {
        var tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = function() {
          resolve(true);
        };
        tx.onerror = function() {
          captureDbError(tx.error, storeName, "put");
          resolve(false);
        };
      });
    });
  }
  function get(storeName, key) {
    return openDb().then(function(db) {
      if (!db) return null;
      return new Promise(function(resolve) {
        var tx = db.transaction(storeName, "readonly");
        var req = tx.objectStore(storeName).get(key);
        req.onsuccess = function() {
          resolve(req.result === undefined ? null : req.result);
        };
        req.onerror = function() {
          captureDbError(req.error, storeName, "get");
          resolve(null);
        };
      });
    });
  }
  function getAll(storeName) {
    return openDb().then(function(db) {
      if (!db) return [];
      return new Promise(function(resolve) {
        var tx = db.transaction(storeName, "readonly");
        var store = tx.objectStore(storeName);
        var keysReq = store.getAllKeys();
        var valsReq = store.getAll();
        var keys, vals;
        keysReq.onsuccess = function() {
          keys = keysReq.result;
          done();
        };
        valsReq.onsuccess = function() {
          vals = valsReq.result;
          done();
        };
        function done() {
          if (keys && vals) {
            resolve(keys.map(function(k, i) {
              return {
                key: k,
                value: vals[i]
              };
            }));
          }
        }
        tx.onerror = function() {
          captureDbError(tx.error, storeName, "getAll");
          resolve([]);
        };
      });
    });
  }
  function remove(storeName, key) {
    return openDb().then(function(db) {
      if (!db) return false;
      return new Promise(function(resolve) {
        var tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = function() {
          resolve(true);
        };
        tx.onerror = function() {
          captureDbError(tx.error, storeName, "remove");
          resolve(false);
        };
      });
    });
  }
  var MAX_UNDO = 50;
  var undoStack = [];
  var redoStack = [];
  var currentSourceRows = [];
  var rowsVersion = 0;
  var listeners = [];
  var saveState = "idle";
  var saveTimer = null;
  var saveRevision = 0;
  var persistedRevision = 0;
  var saveChain = Promise.resolve(true);
  function notify(event) {
    listeners.forEach(function(fn) {
      fn(event);
    });
  }
  function onChange(fn) {
    listeners.push(fn);
    return function() {
      listeners = listeners.filter(function(f) {
        return f !== fn;
      });
    };
  }
  function getSourceRows() {
    return currentSourceRows;
  }
  function ensureUniqueRowIds(rows, prefix) {
    var seen = {};
    return (rows || []).map(function(row, index) {
      var id = row && typeof row.id === "string" ? row.id : "";
      if (id && !seen[id]) {
        seen[id] = true;
        return row;
      }
      var copy = Object.assign({}, row);
      do {
        copy.id = (prefix || "row-") + Date.now().toString(36) + "-" + index.toString(36) + "-" + Math.random().toString(36).slice(2, 7);
      } while (seen[copy.id]);
      seen[copy.id] = true;
      return copy;
    });
  }
  function setSourceRows(rows, actionLabel, skipUndo) {
    if (!skipUndo) {
      undoStack.push({
        rows: currentSourceRows,
        label: actionLabel || "تعديل"
      });
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack = [];
    } else {
      undoStack = [];
      redoStack = [];
    }
    currentSourceRows = ensureUniqueRowIds(rows);
    rowsVersion++;
    notify({
      type: "rows-changed",
      label: actionLabel
    });
    scheduleAutosave();
    return true;
  }
  function canUndo() {
    return undoStack.length > 0;
  }
  function canRedo() {
    return redoStack.length > 0;
  }
  function undo() {
    if (undoStack.length === 0) return null;
    var entry = undoStack.pop();
    redoStack.push({
      rows: currentSourceRows,
      label: entry.label
    });
    currentSourceRows = entry.rows;
    rowsVersion++;
    notify({
      type: "rows-changed",
      label: "تراجع: " + entry.label
    });
    scheduleAutosave();
    return entry.label;
  }
  function redo() {
    if (redoStack.length === 0) return null;
    var entry = redoStack.pop();
    undoStack.push({
      rows: currentSourceRows,
      label: entry.label
    });
    currentSourceRows = entry.rows;
    rowsVersion++;
    notify({
      type: "rows-changed",
      label: "إعادة: " + entry.label
    });
    scheduleAutosave();
    return entry.label;
  }
  function persistCurrentRevision() {
    var revision = saveRevision;
    var rowsToPersist = currentSourceRows;
    saveChain = saveChain.then(function() {
      return put(STORES.sourceRows, "current", rowsToPersist).then(function(ok) {
        if (ok && revision > persistedRevision) persistedRevision = revision;
        saveState = !ok ? "error" : persistedRevision === saveRevision ? "saved" : "pending";
        notify({
          type: "save-state",
          state: saveState,
          timestamp: Date.now()
        });
        return ok;
      });
    });
    return saveChain;
  }
  function scheduleAutosave() {
    saveRevision++;
    saveState = "pending";
    notify({
      type: "save-state",
      state: saveState
    });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function() {
      saveTimer = null;
      persistCurrentRevision();
    }, 400);
  }
  function flushAutosave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      return persistCurrentRevision();
    }
    return saveChain;
  }
  function getSaveState() {
    return saveState;
  }
  function getRowsVersion() {
    return rowsVersion;
  }
  function loadPersisted() {
    return openDb().then(function() {
      if (dbUnavailable) {
        saveState = "error";
        notify({
          type: "save-state",
          state: "error"
        });
      }
      return get(STORES.sourceRows, "current");
    }).then(function(rows) {
      if (rows) {
        currentSourceRows = ensureUniqueRowIds(rows, "row-restored-");
        rowsVersion++;
      }
      return currentSourceRows;
    });
  }
  function mutateSettings(scope, mutator) {
    return openDb().then(function(db) {
      if (!db) return false;
      return new Promise(function(resolve) {
        var tx = db.transaction(STORES.settings, "readwrite");
        var objStore = tx.objectStore(STORES.settings);
        var req = objStore.get(scope);
        req.onsuccess = function() {
          var existing = req.result === undefined ? null : req.result;
          var obj = mutator(existing);
          if (obj !== null) objStore.put(obj, scope);
        };
        tx.oncomplete = function() {
          resolve(true);
        };
        tx.onerror = function() {
          resolve(false);
        };
      });
    });
  }
  function saveSettings(scope, key, value) {
    return mutateSettings(scope, function(existing) {
      var obj = existing || {};
      obj[key] = value;
      return obj;
    });
  }
  function saveSettingsMulti(scope, fields) {
    return mutateSettings(scope, function(existing) {
      var obj = existing || {};
      for (var k in fields) obj[k] = fields[k];
      return obj;
    });
  }
  function loadSettings(scope) {
    return get(STORES.settings, scope).then(function(obj) {
      return obj || {};
    });
  }
  function getAllSettingsScopes() {
    return getAll(STORES.settings).then(function(entries) {
      var out = {
        global: {},
        report: {},
        sheet: {},
        linked: {},
        hiddenColumns: {}
      };
      entries.forEach(function(e) {
        if (!e || typeof e.key !== "string") return;
        if (e.key === "global") out.global = e.value || {}; else if (e.key === "meta") {
          out.linked = e.value && e.value.linked || {};
          out.hiddenColumns = e.value && e.value.hiddenColumns || {};
        } else if (e.key.indexOf("report:") === 0) out.report[e.key.slice(7)] = e.value || {}; else if (e.key.indexOf("sheet:") === 0) out.sheet[e.key.slice(6)] = e.value || {};
      });
      return out;
    });
  }
  function clearSettingsScope(scope) {
    return remove(STORES.settings, scope);
  }
  function deleteSettingsFields(scope, fieldNames) {
    return mutateSettings(scope, function(existing) {
      if (!existing) return null;
      var obj = existing;
      var changed = false;
      fieldNames.forEach(function(f) {
        if (f in obj) {
          delete obj[f];
          changed = true;
        }
      });
      return changed ? obj : null;
    });
  }
  function isBlankCell(v) {
    return util.isBlank(v);
  }
  function fillBlanks(rows, opts) {
    var column = opts.column;
    var direction = opts.direction;
    var mode = opts.mode || "blanksOnly";
    var boundaryColumn = opts.boundaryColumn === undefined ? "book" : opts.boundaryColumn;
    var scopeRowIds = opts.scopeRowIds || null;
    var indices;
    if (scopeRowIds) {
      var idToIndex = new Map;
      for (var bi = 0; bi < rows.length; bi++) {
        if (rows[bi] && rows[bi].id !== undefined) idToIndex.set(rows[bi].id, bi);
      }
      indices = scopeRowIds.map(function(value) {
        if (typeof value === "number") return value;
        var found = idToIndex.get(value);
        return found === undefined ? -1 : found;
      }).filter(function(index) {
        return index >= 0;
      });
    } else {
      indices = [];
      for (var idx = 0; idx < rows.length; idx++) indices.push(idx);
    }
    var sequence = indices.filter(function(i) {
      return rows[i].book !== PH.config.TOTAL_ROW_MARKER;
    });
    if (direction === "up") sequence = sequence.slice().reverse();
    var out = rows.map(function(r) {
      return util.shallowCopy(r);
    });
    var provenance = [];
    var lastValue;
    var lastSourceIndex = null;
    var lastBoundaryValue;
    var boundaryStarted = false;
    var leadingBlankCount = 0;
    var filledCount = 0;
    function markFilled(rowIndex, sourceRowIndex) {
      out[rowIndex].__filled = Object.assign({}, out[rowIndex].__filled);
      out[rowIndex].__filled[column] = {
        sourceRowIndex,
        direction,
        mode,
        at: Date.now()
      };
    }
    sequence.forEach(function(i) {
      var row = rows[i];
      if (boundaryColumn && boundaryColumn !== column) {
        var boundaryVal = row[boundaryColumn];
        if (!boundaryStarted || boundaryVal !== lastBoundaryValue) {
          lastValue = undefined;
          lastSourceIndex = null;
          lastBoundaryValue = boundaryVal;
          boundaryStarted = true;
        }
      }
      var cellBlank = isBlankCell(row[column]);
      if (mode === "overwrite") {
        if (!cellBlank) {
          lastValue = row[column];
          lastSourceIndex = i;
        } else if (lastValue !== undefined) {
          out[i][column] = lastValue;
          markFilled(i, lastSourceIndex);
          provenance.push({
            column,
            sourceRowIndex: lastSourceIndex,
            direction,
            mode,
            at: Date.now(),
            rowIndex: i
          });
          filledCount++;
        } else {
          leadingBlankCount++;
        }
      } else {
        if (cellBlank) {
          if (lastValue !== undefined) {
            out[i][column] = lastValue;
            markFilled(i, lastSourceIndex);
            provenance.push({
              column,
              sourceRowIndex: lastSourceIndex,
              direction,
              mode,
              at: Date.now(),
              rowIndex: i
            });
            filledCount++;
          } else {
            leadingBlankCount++;
          }
        } else {
          lastValue = row[column];
          lastSourceIndex = i;
        }
      }
    });
    return {
      rows: filledCount === 0 ? rows : out,
      filledCount,
      leadingBlankCount,
      provenance
    };
  }
  function saveCalibrationProfile(name, profile) {
    return get(STORES.calibration, "profiles").then(function(existing) {
      var obj = existing || {};
      obj[name] = profile;
      return put(STORES.calibration, "profiles", obj);
    });
  }
  function loadCalibrationProfiles() {
    return get(STORES.calibration, "profiles").then(function(obj) {
      return obj || {};
    });
  }
  return {
    STORES,
    put,
    get,
    getAll,
    remove,
    getSourceRows,
    setSourceRows,
    canUndo,
    canRedo,
    undo,
    redo,
    onChange,
    getSaveState,
    flushAutosave,
    isDbUnavailable,
    getDbUnavailableReason,
    getLastDbError,
    getRowsVersion,
    loadPersisted,
    saveSettings,
    saveSettingsMulti,
    loadSettings,
    getAllSettingsScopes,
    clearSettingsScope,
    deleteSettingsFields,
    saveCalibrationProfile,
    loadCalibrationProfiles,
    fillBlanks,
    isBlankCell
  };
}();


