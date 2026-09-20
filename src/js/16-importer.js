PH.importer = function() {
  var cfg = PH.config;
  var norm = PH.normalize;
  var reports = PH.reports;
  var MAX_CELL_TEXT = 32 * 1024;
  var QUANTITY_FIELDS = {
    dispensed: true,
    received: true,
    balance: true,
    serial: true
  };
  function readWorkbookFromArrayBuffer(buf) {
    return XLSX.read(buf, {
      type: "array"
    });
  }
  function readWorkbookFromText(text, delimiter) {
    return XLSX.read(text, {
      type: "string",
      FS: delimiter || undefined
    });
  }
  function sheetToAoa(worksheet, range) {
    return XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      range: range || 0,
      blankrows: true,
      defval: null
    });
  }
  function boundedRange(worksheet, maxRows) {
    var ref = worksheet && worksheet["!ref"];
    if (!ref) return {
      s: {
        r: 0,
        c: 0
      },
      e: {
        r: maxRows - 1,
        c: 0
      }
    };
    var full = XLSX.utils.decode_range(ref);
    return {
      s: {
        r: 0,
        c: full.s.c
      },
      e: {
        r: Math.min(full.e.r, maxRows - 1),
        c: full.e.c
      }
    };
  }
  function sheetThumbnails(workbook) {
    return workbook.SheetNames.map(function(name) {
      var ws = workbook.Sheets[name];
      var rows = sheetToAoa(ws, boundedRange(ws, 5)).slice(0, 5);
      return {
        name,
        preview: rows
      };
    });
  }
  function fuzzyMatchColumnToField(headerText) {
    if (headerText === null || headerText === undefined) return null;
    var target = norm.normalizeForMatch(String(headerText));
    for (var i = 0; i < cfg.FIELDS.length; i++) {
      var f = cfg.FIELDS[i];
      var cand = norm.normalizeForMatch(f.header);
      if (cand.full === target.full || cand.full === target.noArticle || cand.noArticle === target.full || cand.noArticle === target.noArticle) {
        return f.key;
      }
    }
    return null;
  }
  function detectHeaderRow(aoaSample) {
    var limit = Math.min(10, aoaSample.length);
    var bestIdx = 0, bestScore = -1;
    for (var i = 0; i < limit; i++) {
      var row = aoaSample[i] || [];
      var score = 0;
      for (var c = 0; c < row.length; c++) {
        if (fuzzyMatchColumnToField(row[c])) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return {
      rowIndex: bestIdx,
      score: bestScore
    };
  }
  function buildMapping(headerRow) {
    var mapping = {};
    for (var c = 0; c < headerRow.length; c++) {
      mapping[c] = fuzzyMatchColumnToField(headerRow[c]);
    }
    return mapping;
  }
  function isRowEmpty(cells) {
    for (var i = 0; i < cells.length; i++) {
      if (cells[i] !== null && cells[i] !== undefined && String(cells[i]).trim() !== "") return false;
    }
    return true;
  }
  function coerceField(fieldKey, rawVal) {
    var fieldDef = cfg.FIELDS_BY_KEY[fieldKey];
    if (!fieldDef) return null;
    if (rawVal === undefined) rawVal = null;
    if (fieldKey === "month") return norm.parseMonthValue(rawVal);
    if (fieldDef.type === "number") return norm.parseNumber(rawVal);
    if (fieldDef.type === "integer") return norm.parseInteger(rawVal);
    if (fieldDef.type === "enum" || fieldDef.type === "text") {
      if (rawVal === null || rawVal === undefined) return null;
      var s = String(rawVal).trim();
      return s === "" ? null : s;
    }
    return rawVal;
  }
  function extractRows(worksheet, headerRowIndex, mapping) {
    var aoa = sheetToAoa(worksheet, headerRowIndex);
    var dataRows = aoa.slice(1);
    var mappedColumns = Object.keys(mapping).map(Number).map(function(c) {
      return {
        colIndex: c,
        fieldKey: mapping[c]
      };
    }).filter(function(m) {
      return !!m.fieldKey;
    });
    var out = [];
    for (var r = 0; r < dataRows.length; r++) {
      var cells = dataRows[r];
      if (isRowEmpty(cells)) continue;
      var row = {
        __raw: {},
        __sheetRow: headerRowIndex + 1 + r
      };
      for (var m = 0; m < mappedColumns.length; m++) {
        var fieldKey = mappedColumns[m].fieldKey;
        var rawVal = cells[mappedColumns[m].colIndex];
        if (typeof rawVal === "string" && rawVal.length > MAX_CELL_TEXT) rawVal = rawVal.slice(0, MAX_CELL_TEXT);
        row.__raw[fieldKey] = rawVal;
        row[fieldKey] = coerceField(fieldKey, rawVal);
      }
      var importedDispensedValue = row.dispensedValue !== undefined ? row.dispensedValue : null;
      var hasQuantityAndPrice = row.dispensed !== null && row.dispensed !== undefined && row.price !== null && row.price !== undefined;
      row.__computedDispensedValueFloat = hasQuantityAndPrice ? row.dispensed * row.price : null;
      row.dispensedValue = hasQuantityAndPrice ? reports.scaleValueOf(row.dispensed, row.price) : null;
      if (importedDispensedValue !== null) row.__importedDispensedValue = importedDispensedValue;
      out.push(row);
    }
    return out;
  }
  function detectVerticalMerges(worksheet) {
    var merges = worksheet["!merges"] || [];
    return merges.filter(function(m) {
      return m.s.c === m.e.c && m.e.r > m.s.r;
    });
  }
  function detectMergeFillSuggestions(worksheet, mapping, headerRowIndex) {
    var merges = detectVerticalMerges(worksheet);
    var suggestions = {};
    merges.forEach(function(m) {
      if (m.s.r <= headerRowIndex) return;
      var colIdx = m.s.c;
      var fieldKey = mapping[colIdx];
      if (!fieldKey || QUANTITY_FIELDS[fieldKey]) return;
      var blankCells = m.e.r - m.s.r;
      if (!suggestions[colIdx]) suggestions[colIdx] = {
        fieldKey,
        blankCells: 0,
        ranges: 0,
        rowRanges: []
      };
      suggestions[colIdx].blankCells += blankCells;
      suggestions[colIdx].ranges += 1;
      suggestions[colIdx].rowRanges.push({
        startRow: m.s.r,
        endRow: m.e.r
      });
    });
    return suggestions;
  }
  function parseClipboardText(text) {
    var delimiter = text.indexOf("\t") !== -1 ? "\t" : text.indexOf(";") !== -1 ? ";" : ",";
    var wb = readWorkbookFromText(text, delimiter);
    return wb;
  }
  function fileExtensionOf(filename) {
    var idx = filename.lastIndexOf(".");
    return idx === -1 ? "" : filename.slice(idx + 1).toLowerCase();
  }
  return {
    readWorkbookFromArrayBuffer,
    readWorkbookFromText,
    sheetToAoa,
    boundedRange,
    sheetThumbnails,
    fuzzyMatchColumnToField,
    detectHeaderRow,
    buildMapping,
    extractRows,
    detectVerticalMerges,
    detectMergeFillSuggestions,
    parseClipboardText,
    fileExtensionOf,
    coerceField,
    isRowEmpty
  };
}();


