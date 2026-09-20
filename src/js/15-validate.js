PH.validate = function() {
  var cfg = PH.config;
  var norm = PH.normalize;
  var util = PH.util;
  var SEVERITY = {
    MISSING_REQUIRED_COLUMN: "blocker",
    UNKNOWN_ENUM: "blocker",
    NOT_A_NUMBER: "error",
    NEGATIVE_VALUE: "error",
    EMPTY_KEY: "error",
    BLANK_REQUIRED_VALUE: "error",
    DUPLICATE_ROW: "warning",
    VALUE_MISMATCH: "warning",
    TOTAL_ROW_SKIPPED: "info"
  };
  var FILL_PRONE_TEXT_FIELDS = [ "budget", "shift", "dispense", "book", "unit", "group", "month", "pharmacy" ];
  var ENUM_FIELDS = [ "budget", "shift", "dispense" ];
  var NUMERIC_FIELDS = [ "serial", "dispensed", "price", "received", "balance", "pageNo" ];
  var isBlank = util.isBlank;
  function displayRowNumber(row, rowIndex) {
    return row && row.__sheetRow !== undefined && row.__sheetRow !== null ? row.__sheetRow : rowIndex + 1;
  }
  function rowHasData(row) {
    return !isBlank(row.name) || !isBlank(row.dispensed) || !isBlank(row.balance);
  }
  function closestEnumMatch(value, domain) {
    var target = norm.normalizeForMatch(value);
    for (var i = 0; i < domain.length; i++) {
      var candidate = norm.normalizeForMatch(domain[i]);
      if (candidate.full === target.full || candidate.full === target.noArticle || candidate.noArticle === target.full) {
        return domain[i];
      }
    }
    return null;
  }
  function mappedFieldSet(mapping) {
    var set = {};
    for (var k in mapping) if (mapping[k]) set[mapping[k]] = true;
    return set;
  }
  function checkMappedColumns(mapping) {
    var problems = [];
    var requiredFields = cfg.FIELDS.filter(function(f) {
      return f.required;
    });
    var mappedTargets = mappedFieldSet(mapping);
    requiredFields.forEach(function(f) {
      if (!mappedTargets[f.key]) {
        problems.push({
          code: "MISSING_REQUIRED_COLUMN",
          severity: SEVERITY.MISSING_REQUIRED_COLUMN,
          rowIndex: null,
          column: f.key,
          message: 'العمود المطلوب "' + f.header + '" غير موجود. اختر العمود المقابل.',
          fix: {
            type: "scroll-to-mapping",
            field: f.key
          }
        });
      }
    });
    return problems;
  }
  function checkRow(row, rowIndex, seenKeys, mappedFields) {
    var problems = [];
    if (row.book === cfg.TOTAL_ROW_MARKER) {
      problems.push({
        code: "TOTAL_ROW_SKIPPED",
        severity: SEVERITY.TOTAL_ROW_SKIPPED,
        rowIndex,
        column: "book",
        message: "صف الإجمالي — تم استبعاده تلقائيًا.",
        fix: null
      });
      return problems;
    }
    ENUM_FIELDS.forEach(function(key) {
      var val = row[key];
      if (isBlank(val)) return;
      var domain = cfg.DIMENSIONS[key];
      if (domain.indexOf(val) === -1) {
        var suggestion = closestEnumMatch(val, domain);
        var label = cfg.DIMENSION_LABELS[key];
        var msg = suggestion ? '"' + val + '" غير معروف في عمود ' + label + '. هل تقصد "' + suggestion + '"؟' : '"' + val + '" غير معروف في عمود ' + label + ".";
        problems.push({
          code: "UNKNOWN_ENUM",
          severity: SEVERITY.UNKNOWN_ENUM,
          rowIndex,
          column: key,
          foundValue: val,
          message: msg,
          fix: suggestion ? {
            type: "replace",
            value: suggestion,
            allowAll: true
          } : {
            type: "manual"
          }
        });
      }
    });
    NUMERIC_FIELDS.forEach(function(key) {
      var raw = row.__raw ? row.__raw[key] : undefined;
      var val = row[key];
      if (!isBlank(raw) && val === null) {
        problems.push({
          code: "NOT_A_NUMBER",
          severity: SEVERITY.NOT_A_NUMBER,
          rowIndex,
          column: key,
          foundValue: raw,
          message: "الصف " + displayRowNumber(row, rowIndex) + ' — "' + cfg.COLUMN_LABELS[key] + '" يحتوي على "' + raw + '" وليس رقمًا.',
          fix: {
            type: "strip-non-numeric"
          }
        });
      } else if ((key === "dispensed" || key === "price") && val !== null && val < 0) {
        problems.push({
          code: "NEGATIVE_VALUE",
          severity: SEVERITY.NEGATIVE_VALUE,
          rowIndex,
          column: key,
          foundValue: val,
          message: "الصف " + displayRowNumber(row, rowIndex) + ' — قيمة سالبة في "' + cfg.COLUMN_LABELS[key] + '".',
          fix: {
            type: "choice",
            options: [ "set-zero", "exclude-row" ]
          }
        });
      }
    });
    if (isBlank(row.name) && (!isBlank(row.dispensed) || !isBlank(row.price))) {
      problems.push({
        code: "EMPTY_KEY",
        severity: SEVERITY.EMPTY_KEY,
        rowIndex,
        column: "name",
        message: "الصف " + displayRowNumber(row, rowIndex) + " — لا يوجد اسم صنف رغم وجود كميات.",
        fix: {
          type: "choice",
          options: [ "fill-down", "exclude-row" ]
        }
      });
    }
    if (rowHasData(row)) {
      FILL_PRONE_TEXT_FIELDS.forEach(function(key) {
        if (mappedFields && !mappedFields[key]) return;
        if (!cfg.FIELDS_BY_KEY[key].required) return;
        if (isBlank(row[key])) {
          problems.push({
            code: "BLANK_REQUIRED_VALUE",
            severity: SEVERITY.BLANK_REQUIRED_VALUE,
            rowIndex,
            column: key,
            message: "الصف " + displayRowNumber(row, rowIndex) + ' — "' + cfg.COLUMN_LABELS[key] + '" فارغة والصف يحتوي بيانات.',
            fix: {
              type: "choice",
              options: [ "fill-down", "fill-up", "exclude-row" ]
            }
          });
        }
      });
    }
    if (!isBlank(row.__importedDispensedValue) && !isBlank(row.dispensed) && !isBlank(row.price)) {
      var computed = row.__computedDispensedValueFloat;
      if (Math.abs(computed - row.__importedDispensedValue) > .005) {
        problems.push({
          code: "VALUE_MISMATCH",
          severity: SEVERITY.VALUE_MISMATCH,
          rowIndex,
          column: "dispensedValue",
          message: "الصف " + displayRowNumber(row, rowIndex) + " — القيمة المكتوبة " + row.__importedDispensedValue.toFixed(2) + " والمحسوبة " + computed.toFixed(2) + ". سيتم استخدام المحسوبة.",
          fix: null
        });
      }
    }
    var dupKey = [ row.month, row.book, row.serial, row.name, row.unit, row.price, row.budget, row.shift, row.dispense ].join("\0");
    if (seenKeys[dupKey] !== undefined) {
      problems.push({
        code: "DUPLICATE_ROW",
        severity: SEVERITY.DUPLICATE_ROW,
        rowIndex,
        column: null,
        message: "صف مكرر مع الصف " + displayRowNumber(row, seenKeys[dupKey].rowIndex) + ".",
        fix: {
          type: "choice",
          options: [ "keep-one", "keep-both" ]
        }
      });
    } else {
      seenKeys[dupKey] = {
        rowIndex,
        row
      };
    }
    return problems;
  }
  function validateDataset(rows, mapping) {
    var mappedFields = mappedFieldSet(mapping || {});
    var problems = checkMappedColumns(mapping || {});
    var seenKeys = {};
    var rowProblems = [];
    for (var i = 0; i < rows.length; i++) {
      var stableIndex = rows[i].__idx !== undefined ? rows[i].__idx : i;
      var p = checkRow(rows[i], stableIndex, seenKeys, mappedFields);
      rowProblems.push.apply(rowProblems, p);
    }
    problems = problems.concat(rowProblems);
    var blockerCount = problems.filter(function(p) {
      return p.severity === "blocker";
    }).length;
    var errorCount = problems.filter(function(p) {
      return p.severity === "error";
    }).length;
    var errorRowIndexes = {};
    var warningRowIndexes = {};
    var problemRowIndexes = {};
    problems.forEach(function(p) {
      if (p.rowIndex === null) return;
      if (p.severity === "error") errorRowIndexes[p.rowIndex] = true;
      if (p.severity === "warning") warningRowIndexes[p.rowIndex] = true;
      if (p.severity === "error" || p.severity === "blocker") problemRowIndexes[p.rowIndex] = true;
    });
    var totalRowCount = rows.filter(function(r) {
      return r.book !== cfg.TOTAL_ROW_MARKER;
    }).length;
    var problemRowCount = Object.keys(problemRowIndexes).length;
    var duplicateCount = problems.filter(function(p) {
      return p.code === "DUPLICATE_ROW";
    }).length;
    var validCount = totalRowCount - problemRowCount;
    return {
      problems,
      canCommit: blockerCount === 0 && errorCount === 0,
      requiresExplicitOverride: blockerCount === 0 && errorCount > 0,
      summary: {
        validCount,
        problemRowCount,
        duplicateCount,
        totalRowCount
      },
      errorRowIndexes,
      warningRowIndexes
    };
  }
  function groupRepeats(problems) {
    var map = new Map;
    var order = [];
    problems.forEach(function(p) {
      var templateKey = p.code + "\0" + (p.column || "") + "\0" + p.message.replace(/\d+/g, "#").replace(/"[^"]*"/g, '"?"');
      if (!map.has(templateKey)) {
        map.set(templateKey, []);
        order.push(templateKey);
      }
      map.get(templateKey).push(p);
    });
    return order.map(function(k) {
      var group = map.get(k);
      return {
        code: group[0].code,
        severity: group[0].severity,
        column: group[0].column,
        count: group.length,
        sample: group[0],
        items: group
      };
    });
  }
  return {
    SEVERITY,
    FILL_PRONE_TEXT_FIELDS,
    checkMappedColumns,
    checkRow,
    validateDataset,
    groupRepeats,
    closestEnumMatch,
    isBlank,
    rowHasData
  };
}();


