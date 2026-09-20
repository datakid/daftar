PH.exportPlan = function() {
  var blk = PH.blocks;
  var cfg = PH.config;
  var util = PH.util;
  var ENGINE_VERSION = "export-engine-2";
  var TOP_LEVEL_KEYS = { reports: true, sheetSplit: true, grandTotal: true, layers: true };
  var LAYER_KEYS = { id: true, field: true, reset: true, resetOn: true, running: true, every: true, place: true, label: true };
  var VALID_RESETS = { none: true, page: true, block: true, group: true };
  var VALID_PLACES = { column: true, row: true, both: true };
  var VALID_SHEET_SPLITS = { "per-slice": true, combined: true };
  function sumField(rows, field) {
    if (!field) return 0n;
    return rows.reduce(function(acc, r) {
      if (r.isGrandTotal || r.isSubtotal || typeof r[field] !== "bigint") return acc;
      return acc + r[field];
    }, 0n);
  }
  function fieldIsKnownNumeric(repDef, field) {
    return !!(repDef && field && repDef.columns.indexOf(field) !== -1 && cfg.isNumericColumn(field));
  }
  function validateLayer(layer, index, errors) {
    if (!layer || typeof layer !== "object") {
      errors.push("layers[" + index + "]: عنصر غير صالح");
      return;
    }
    Object.keys(layer).forEach(function(k) {
      if (!LAYER_KEYS[k]) errors.push("layers[" + index + "]: حقل غير معروف \"" + k + "\"");
    });
    if (!layer.id || typeof layer.id !== "string") errors.push("layers[" + index + "]: id مطلوب");
    if (!layer.field || typeof layer.field !== "string") errors.push("layers[" + index + "]: field مطلوب");
    if (!VALID_RESETS[layer.reset]) errors.push("layers[" + index + "]: reset غير صالح \"" + layer.reset + "\"");
    if (layer.reset === "group") {
      if (!layer.resetOn || typeof layer.resetOn !== "string") errors.push("layers[" + index + "]: resetOn مطلوب مع reset=group");
    } else if (layer.resetOn !== null && layer.resetOn !== undefined) {
      errors.push("layers[" + index + "]: resetOn يجب أن يكون null إلا مع reset=group");
    }
    if (typeof layer.running !== "boolean") errors.push("layers[" + index + "]: running يجب أن يكون قيمة منطقية");
    if (typeof layer.every !== "boolean") errors.push("layers[" + index + "]: every يجب أن يكون قيمة منطقية");
    if (!VALID_PLACES[layer.place]) errors.push("layers[" + index + "]: place غير صالح \"" + layer.place + "\"");
    if (layer.label !== null && layer.label !== undefined && typeof layer.label !== "string") errors.push("layers[" + index + "]: label يجب أن يكون نصًا أو null");
  }
  function validatePlan(plan) {
    var errors = [];
    if (!plan || typeof plan !== "object") return { ok: false, errors: [ "الخطة ليست كائنًا صالحًا" ] };
    Object.keys(plan).forEach(function(k) {
      if (!TOP_LEVEL_KEYS[k]) errors.push("حقل غير معروف على مستوى الخطة: \"" + k + "\"");
    });
    if (!Array.isArray(plan.reports) || !plan.reports.length) errors.push("reports مطلوب كمصفوفة غير فارغة");
    if (!VALID_SHEET_SPLITS[plan.sheetSplit]) errors.push("sheetSplit غير صالح \"" + plan.sheetSplit + "\"");
    if (!plan.grandTotal || typeof plan.grandTotal !== "object") {
      errors.push("grandTotal مطلوب");
    } else {
      if (typeof plan.grandTotal.enabled !== "boolean") errors.push("grandTotal.enabled يجب أن يكون قيمة منطقية");
      if (plan.grandTotal.field !== null && plan.grandTotal.field !== undefined && typeof plan.grandTotal.field !== "string") errors.push("grandTotal.field يجب أن يكون نصًا أو null");
      if (plan.grandTotal.enabled && !plan.grandTotal.field) errors.push("grandTotal.field مطلوب عندما grandTotal.enabled=true");
    }
    if (!Array.isArray(plan.layers)) {
      errors.push("layers مطلوب كمصفوفة");
    } else {
      plan.layers.forEach(function(layer, i) {
        validateLayer(layer, i, errors);
      });
    }
    if (Array.isArray(plan.layers) && !plan.layers.length && plan.grandTotal && plan.grandTotal.enabled === false) {
      errors.push("الخطة فارغة: لا طبقات إجمالي ولا إجمالي كلي");
    }
    if (Array.isArray(plan.reports)) {
      plan.reports.forEach(function(reportId) {
        var repDef = cfg.REPORTS_BY_ID[reportId];
        if (!repDef) {
          errors.push("تقرير غير معروف: \"" + reportId + "\"");
          return;
        }
        if (Array.isArray(plan.layers)) {
          plan.layers.forEach(function(layer, i) {
            if (layer && layer.field && !fieldIsKnownNumeric(repDef, layer.field)) {
              errors.push("layers[" + i + "]: الحقل \"" + layer.field + "\" غير رقمي أو غير موجود في تقرير \"" + reportId + "\"");
            }
            if (layer && layer.reset === "group" && layer.resetOn && repDef.columns.indexOf(layer.resetOn) === -1) {
              errors.push("layers[" + i + "]: عمود إعادة الضبط \"" + layer.resetOn + "\" غير موجود في تقرير \"" + reportId + "\"");
            }
          });
        }
        if (plan.grandTotal && plan.grandTotal.enabled && plan.grandTotal.field && !fieldIsKnownNumeric(repDef, plan.grandTotal.field)) {
          errors.push("grandTotal.field \"" + plan.grandTotal.field + "\" غير رقمي أو غير موجود في تقرير \"" + reportId + "\"");
        }
      });
    }
    return { ok: errors.length === 0, errors: errors };
  }
  function clonePlan(plan) {
    return JSON.parse(JSON.stringify(plan));
  }
  function freezePlan(plan) {
    if (plan && Array.isArray(plan.layers)) {
      plan.layers.forEach(function(l) {
        Object.freeze(l);
      });
      Object.freeze(plan.layers);
    }
    if (plan && plan.grandTotal) Object.freeze(plan.grandTotal);
    if (plan && plan.reports) Object.freeze(plan.reports);
    return Object.freeze(plan);
  }
  function preparePlan(planInput) {
    var plan = freezePlan(clonePlan(planInput));
    var v = validatePlan(plan);
    if (!v.ok) throw new Error("خطة تصدير غير صالحة: " + v.errors.join("؛ "));
    return plan;
  }
  function serializePlan(plan) {
    return JSON.stringify(plan);
  }
  function parsePlan(json) {
    return JSON.parse(json);
  }
  function layerKey(layer) {
    return "tot__" + layer.id;
  }
  function layerSignature(layer) {
    if (!layer) return "invalid";
    return [ layer.field || "", layer.reset || "", layer.resetOn || "", layer.running ? "1" : "0", layer.every ? "1" : "0", layer.place || "" ].join("|");
  }
  var RESET_LABEL_AR = { none: "للورقة كاملة", page: "لكل صفحة", block: "لكل كتلة", group: "لكل مجموعة" };
  function runningEveryShortLabel(running, every) {
    if (!running && !every) return "إجمالي";
    if (!running && every) return "تراكمي";
    if (running && !every) return "منقول تراكمي";
    return "تراكمي كلي";
  }
  function columnLabel(layer) {
    if (layer.label) return layer.label;
    var fieldLabel = cfg.COLUMN_LABELS[layer.field] || layer.field || "";
    return [ runningEveryShortLabel(layer.running, layer.every), fieldLabel, RESET_LABEL_AR[layer.reset] || layer.reset ].filter(Boolean).join(" · ");
  }
  var RESET_NOUN_AR = { none: "الورقة", page: "الصفحة", block: "الكتلة", group: "المجموعة" };
  function runningEveryPhrase(running, every) {
    if (!running && !every) return "قيمة واحدة عند نهاية كل وحدة";
    if (!running && every) return "قيمة تتجدد في كل صف وتبدأ من صفر مع كل وحدة جديدة";
    if (running && !every) return "قيمة تراكمية منذ بداية الورقة، تظهر فقط عند نهاية كل وحدة";
    return "قيمة تراكمية منذ بداية الورقة، تتجدد في كل صف";
  }
  function resetPhrase(reset, resetOn) {
    if (reset === "none") return "على مستوى الورقة كاملة بلا إعادة ضبط";
    if (reset === "group") return "تُعاد لكل مجموعة" + (resetOn ? " حسب عمود \"" + (cfg.COLUMN_LABELS[resetOn] || resetOn) + "\"" : "");
    return "تُعاد لكل " + (RESET_NOUN_AR[reset] || reset);
  }
  var PLACE_PHRASE_AR = { column: "في عمود مستقل", row: "كصف إجمالي بين البيانات", both: "في عمود مستقل وكصف إجمالي معًا" };
  function explain(layer) {
    var fieldLabel = cfg.COLUMN_LABELS[layer.field] || layer.field || "";
    return fieldLabel + ": " + runningEveryPhrase(layer.running, layer.every) + "، " + resetPhrase(layer.reset, layer.resetOn) + "، تظهر " + (PLACE_PHRASE_AR[layer.place] || layer.place) + ".";
  }
  function resolveColumnKeys(layers, reportColumns) {
    var usedKeys = {};
    reportColumns.forEach(function(c) {
      usedKeys[c] = "report";
    });
    return layers.map(function(layer) {
      var desired = layerKey(layer);
      var key = desired;
      var suffix = 2;
      while (usedKeys[key]) {
        key = desired + suffix;
        suffix++;
      }
      usedKeys[key] = "claimed";
      return { cfg: layer, key: key };
    });
  }
  function unitIndices(rows, layer, settings) {
    var n = rows.length;
    var out = new Array(n);
    if (layer.reset === "page") {
      var rpp = settings && settings.rowsPerPage || 24;
      for (var i = 0; i < n; i++) out[i] = Math.floor(i / rpp);
    } else if (layer.reset === "block") {
      var bs = settings && settings.blockSize || settings && settings.rowsPerPage || 24;
      for (var i2 = 0; i2 < n; i2++) out[i2] = Math.floor(i2 / bs);
    } else if (layer.reset === "group") {
      var resetOn = layer.resetOn;
      var unitIdx = 0, prevNorm = null, hasPrev = false;
      for (var i3 = 0; i3 < n; i3++) {
        if (!resetOn) {
          out[i3] = 0;
          continue;
        }
        var raw = rows[i3][resetOn];
        var normVal = PH.normalize.identityKey(raw === null || raw === undefined ? "" : String(raw));
        if (hasPrev && normVal !== prevNorm) unitIdx++;
        out[i3] = unitIdx;
        prevNorm = normVal;
        hasPrev = true;
      }
    } else {
      for (var i4 = 0; i4 < n; i4++) out[i4] = 0;
    }
    return out;
  }
  function computeLayerSeries(rows, layer, settings) {
    var units = unitIndices(rows, layer, settings);
    var out = new Array(rows.length);
    var unitAcc = 0n, grandAcc = 0n;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var raw = row[layer.field];
      var v = row.isGrandTotal || row.isSubtotal || typeof raw !== "bigint" ? 0n : raw;
      unitAcc += v;
      grandAcc += v;
      var isEnd = i === rows.length - 1 || units[i + 1] !== units[i];
      var acc = layer.running ? grandAcc : unitAcc;
      out[i] = layer.every ? acc : isEnd ? acc : null;
      if (isEnd) unitAcc = 0n;
    }
    return out;
  }
  function applyTotalsColumns(rows, resolved, settings) {
    var out = rows.map(util.shallowCopy);
    var keys = [];
    var labelPairs = [];
    var decimalPairs = [];
    resolved.forEach(function(r) {
      var layer = r.cfg;
      var series = computeLayerSeries(rows, layer, settings);
      r.series = series;
      if (layer.place === "column" || layer.place === "both") {
        for (var i = 0; i < out.length; i++) out[i][r.key] = series[i];
        keys.push(r.key);
        labelPairs.push([ r.key, columnLabel(layer) ]);
        decimalPairs.push([ r.key, cfg.decimalsForColumn(layer.field) ]);
      }
    });
    var labels = {};
    labelPairs.forEach(function(pair) {
      labels[pair[0]] = pair[1];
    });
    var decimals = {};
    decimalPairs.forEach(function(pair) {
      decimals[pair[0]] = pair[1];
    });
    return { rows: out, decimals: decimals, keys: keys, labels: labels };
  }
  function rowLabelFor(layer, unitOrdinal) {
    var noun = RESET_NOUN_AR[layer.reset] || "الوحدة";
    var isCarryLike = layer.running && !layer.every;
    if (isCarryLike) {
      return layer.reset === "page" ? "المنقول من الصفحة السابقة" : "منقول من " + noun + " السابقة";
    }
    return "إجمالي " + noun + (layer.reset !== "none" ? " " + unitOrdinal : "");
  }
  function emitRowLayers(rows, rowLayers, settings, labelColumn) {
    var n = rows.length;
    rowLayers.forEach(function(rl) {
      rl.units = unitIndices(rows, rl.cfg, settings);
    });
    var boundaryLayers = rowLayers.filter(function(rl) {
      return !(rl.cfg.running && !rl.cfg.every);
    });
    var carryLayers = rowLayers.filter(function(rl) {
      return rl.cfg.running && !rl.cfg.every;
    });
    var out = [];
    function makeRow(rl, i) {
      var rowObj = { __totalsRow: true };
      rowObj[labelColumn] = rowLabelFor(rl.cfg, rl.units[i] + 1);
      rowObj[rl.cfg.field] = rl.series[i];
      if (rl.cfg.place === "both" && rl.key !== rl.cfg.field) rowObj[rl.key] = rl.series[i];
      return rowObj;
    }
    for (var i = 0; i < n; i++) {
      out.push(rows[i]);
      var boundaryHits = boundaryLayers.filter(function(rl) {
        return rl.series[i] !== null && rl.series[i] !== undefined;
      });
      var carryHits = i === n - 1 ? [] : carryLayers.filter(function(rl) {
        return rl.series[i] !== null && rl.series[i] !== undefined;
      });
      boundaryHits.forEach(function(rl) {
        out.push(makeRow(rl, i));
      });
      if (boundaryHits.length || carryHits.length) out.push({ __totalsRow: true });
      carryHits.forEach(function(rl) {
        out.push(makeRow(rl, i));
      });
    }
    return out;
  }
  function firstNonNumericColumn(columns) {
    for (var i = 0; i < columns.length; i++) {
      if (!cfg.isNumericColumn(columns[i])) return columns[i];
    }
    return columns[0];
  }
  function totalsRowsFor(rows, settings, layers, grandTotal, labelColumn, reportColumns) {
    var hasBaked = rows.some(function(r) {
      return r.isGrandTotal;
    });
    var resolved = resolveColumnKeys(layers, reportColumns);
    var withColumns = applyTotalsColumns(rows, resolved, settings);
    var out = withColumns.rows;
    var rowLayers = resolved.filter(function(r) {
      return r.cfg.place === "row" || r.cfg.place === "both";
    });
    if (rowLayers.length) out = emitRowLayers(out, rowLayers, settings, labelColumn);
    if (grandTotal.enabled && grandTotal.field && !hasBaked) {
      var totalRow = { __totalsRow: true };
      totalRow[labelColumn] = "الإجمالي الكلي";
      totalRow[grandTotal.field] = sumField(rows, grandTotal.field);
      out = out.concat([ totalRow ]);
    }
    return { rows: out, extraColumns: withColumns.keys, columnLabels: withColumns.labels, columnDecimals: withColumns.decimals };
  }
  function buildSingleSheet(entry, plan) {
    var labelColumn = firstNonNumericColumn(entry.columns);
    var result = totalsRowsFor(entry.rows, entry.settings, plan.layers, plan.grandTotal, labelColumn, entry.columns);
    var hidden = entry.hiddenColumns || [];
    var columns = entry.columns.concat(result.extraColumns.filter(function(k) {
      return entry.columns.indexOf(k) === -1 && hidden.indexOf(k) === -1;
    }));
    var moneyColumns = result.extraColumns.filter(function(k) {
      return columns.indexOf(k) !== -1;
    });
    return {
      name: entry.reportLabel,
      columns: columns,
      rows: result.rows,
      columnLabels: result.columnLabels,
      columnDecimals: result.columnDecimals,
      moneyColumns: moneyColumns,
      meta: { reportId: entry.reportId, sliceKey: entry.sliceKey, combination: entry.combination }
    };
  }
  function buildCombinedSheet(reportId, group, plan) {
    var first = group[0];
    var labelColumn = firstNonNumericColumn(first.columns);
    var sliceGrandTotal = { enabled: false, field: null };
    var grandField = plan.grandTotal.field;
    var extraColsSeen = [];
    var columnLabels = {};
    var columnDecimals = {};
    var allRows = [];
    var overall = 0n;
    group.forEach(function(entry) {
      overall += sumField(entry.rows, grandField);
      var sliceResult = totalsRowsFor(entry.rows, entry.settings, plan.layers, sliceGrandTotal, labelColumn, entry.columns);
      sliceResult.extraColumns.forEach(function(k) {
        if (extraColsSeen.indexOf(k) === -1) extraColsSeen.push(k);
      });
      for (var lk in sliceResult.columnLabels) columnLabels[lk] = sliceResult.columnLabels[lk];
      for (var dk in sliceResult.columnDecimals) columnDecimals[dk] = sliceResult.columnDecimals[dk];
      var dims = entry.combination || {};
      sliceResult.rows.forEach(function(r) {
        var withDims = r.__totalsRow ? {} : { budget: dims.budget, shift: dims.shift, dispense: dims.dispense };
        for (var rk in r) withDims[rk] = r[rk];
        allRows.push(withDims);
      });
    });
    var hidden = first.hiddenColumns || [];
    var baseColumns = first.columns.concat(extraColsSeen.filter(function(k) {
      return first.columns.indexOf(k) === -1 && hidden.indexOf(k) === -1;
    }));
    var columns = [ "budget", "shift", "dispense" ].concat(baseColumns);
    if (plan.grandTotal.enabled && grandField) {
      var grandRow = { __totalsRow: true, budget: "الإجمالي الكلي", shift: "", dispense: "" };
      grandRow[grandField] = overall;
      allRows.push(grandRow);
    }
    var moneyColumns = extraColsSeen.filter(function(k) {
      return columns.indexOf(k) !== -1;
    });
    return {
      name: first.reportLabel,
      columns: columns,
      rows: allRows,
      columnLabels: columnLabels,
      moneyColumns: moneyColumns,
      meta: { reportId: reportId, combined: true }
    };
  }
  function buildSheets(planInput, input) {
    var plan = preparePlan(planInput);
    var byReport = {};
    (input.sheets || []).forEach(function(e) {
      (byReport[e.reportId] = byReport[e.reportId] || []).push(e);
    });
    var out = [];
    plan.reports.forEach(function(reportId) {
      var group = byReport[reportId];
      if (!group || !group.length) return;
      if (plan.sheetSplit === "combined" && group.length > 1) {
        out.push(buildCombinedSheet(reportId, group, plan));
      } else {
        group.forEach(function(entry) {
          out.push(buildSingleSheet(entry, plan));
        });
      }
    });
    return out;
  }
  function preview(planInput, entry, limit) {
    var n = limit || 20;
    var plan = preparePlan(planInput);
    var sheet = buildSingleSheet(entry, plan);
    return { columns: sheet.columns, columnLabels: sheet.columnLabels, columnDecimals: sheet.columnDecimals, rows: sheet.rows.slice(0, n) };
  }
  var RESET_SLUG = { none: "ورقة", page: "صفحة", block: "كتلة", group: "مجموعة" };
  function runningEverySlug(running, every) {
    if (!running && !every) return "ختامي";
    if (!running && every) return "تراكمي-وحدة";
    if (running && !every) return "منقول";
    return "تراكمي-كلي";
  }
  function descriptorForLayers(layers) {
    if (!layers || !layers.length) return "";
    return layers.map(function(l) {
      return runningEverySlug(l.running, l.every) + "-" + (RESET_SLUG[l.reset] || l.reset);
    }).join("+");
  }
  return {
    ENGINE_VERSION: ENGINE_VERSION,
    buildSheets: buildSheets,
    preview: preview,
    validatePlan: validatePlan,
    explain: explain,
    serializePlan: serializePlan,
    parsePlan: parsePlan,
    layerKey: layerKey,
    layerSignature: layerSignature,
    columnLabel: columnLabel,
    unitIndices: unitIndices,
    computeLayerSeries: computeLayerSeries,
    descriptorForLayers: descriptorForLayers,
    resolveColumnKeys: resolveColumnKeys
  };
}();


