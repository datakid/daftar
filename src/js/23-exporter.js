PH.exporter = function() {
  var cfg = PH.config;
  function slugSpaces(s) {
    return String(s).replace(/\s+/g, "-");
  }
  function stripUnsafe(s) {
    return String(s).replace(/[\\/:*?"<>|]/g, "");
  }
  function dimensionSegment(combination) {
    return cfg.DIMENSION_ORDER.map(function(d) {
      var group = combination[d];
      if (!group || !group.length || group.length === cfg.DIMENSIONS[d].length) return slugSpaces("الكل");
      return slugSpaces(group.join("+"));
    }).join("-");
  }
  function buildFileName(opts) {
    var month = opts.month || "";
    var reportLabel = slugSpaces(opts.reportLabel);
    var dimSeg = dimensionSegment(opts.combination);
    var parts = [ month, reportLabel, dimSeg ];
    var descriptor = opts.descriptor;
    if (descriptor) {
      if (descriptor.length > 60) descriptor = descriptor.slice(0, 59) + "…";
      parts.push(descriptor);
    }
    var name = parts.join("__") + "." + (opts.ext || "xlsx");
    name = stripUnsafe(name);
    if (name.length > 150) {
      var extPart = "." + (opts.ext || "xlsx");
      name = name.slice(0, 150 - extPart.length) + extPart;
    }
    return name;
  }
  function resolveCollision(name, existingNames) {
    if (existingNames.indexOf(name) === -1) return name;
    var dot = name.lastIndexOf(".");
    var stem = dot === -1 ? name : name.slice(0, dot);
    var ext = dot === -1 ? "" : name.slice(dot);
    var n = 2;
    var candidate;
    do {
      candidate = stem + "-" + n + ext;
      n++;
    } while (existingNames.indexOf(candidate) !== -1);
    return candidate;
  }
  function rowsToAoa(rows, columns, labelOverrides, decimalsOverride) {
    var labels = labelOverrides || {};
    var decimalsFor = decimalsOverride || {};
    var header = columns.map(function(c) {
      return labels[c] || cfg.COLUMN_LABELS[c] || c;
    });
    var body = rows.map(function(row) {
      return columns.map(function(c) {
        var v = row[c];
        if (v === null || v === undefined) return null;
        if (typeof v === "number" && isNaN(v)) return null;
        if (typeof v === "bigint") {
          var decimals = decimalsFor[c] !== undefined ? decimalsFor[c] : cfg.decimalsForColumn(c);
          var magnitude = v < 0n ? -v : v;
          if (magnitude > cfg.MAX_SAFE_SCALED) {
            throw new Error('قيمة العمود "' + (labels[c] || cfg.COLUMN_LABELS[c] || c) + '" أكبر من أن تُمثَّل بدقة في جدول بيانات');
          }
          var n = Number(PH.blocks.formatScaled(v, decimals, false));
          return isNaN(n) ? null : n;
        }
        return v;
      });
    });
    return [ header ].concat(body);
  }
  function buildWorksheet(rows, columns, labelOverrides, moneyColumns, decimalsOverride) {
    var labels = labelOverrides || {};
    var decimalsFor = decimalsOverride || {};
    var moneySet = {};
    (moneyColumns || []).forEach(function(c) {
      moneySet[c] = true;
    });
    var aoa = rowsToAoa(rows, columns, labels, decimalsFor);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var lastDataIdx = -1;
    rows.forEach(function(row, i) {
      if (!row.__totalsRow) lastDataIdx = i;
    });
    var filterEndRow = lastDataIdx === -1 ? 0 : lastDataIdx + 1;
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: {
          r: 0,
          c: 0
        },
        e: {
          r: filterEndRow,
          c: columns.length - 1
        }
      })
    };
    var colWidths = columns.map(function(c, idx) {
      var maxLen = (labels[c] || cfg.COLUMN_LABELS[c] || c).length;
      rows.forEach(function(row) {
        var v = row[c];
        var s;
        if (v === null || v === undefined) s = ""; else if (typeof v === "bigint") s = PH.blocks.formatScaled(v, decimalsFor[c] !== undefined ? decimalsFor[c] : cfg.decimalsForColumn(c), false); else s = String(v);
        if (s.length > maxLen) maxLen = s.length;
      });
      return {
        wch: Math.min(40, maxLen + 2)
      };
    });
    ws["!cols"] = colWidths;
    for (var r = 1; r <= rows.length; r++) {
      columns.forEach(function(c, ci) {
        var cellRef = XLSX.utils.encode_cell({
          r,
          c: ci
        });
        var cell = ws[cellRef];
        if (!cell) return;
        if (cfg.MONEY_COLUMNS[c] || moneySet[c]) {
          var decimals = decimalsFor[c] !== undefined ? decimalsFor[c] : cfg.decimalsForColumn(c);
          cell.z = "#,##0." + "0".repeat(decimals);
        }
        if (rows[r - 1][c] === null || rows[r - 1][c] === undefined) {
          delete ws[cellRef];
        }
      });
    }
    return ws;
  }
  function sheetNameFor(combination, reportLabel, existingNames, skipDimensionSegment) {
    var raw = skipDimensionSegment ? reportLabel : reportLabel + " " + dimensionSegment(combination).replace(/-/g, " ");
    raw = raw.replace(/[\[\]:*?/\\]/g, "");
    raw = raw.slice(0, 31);
    var name = raw;
    var n = 2;
    while (existingNames.indexOf(name) !== -1) {
      var suffix = "_" + n;
      name = raw.slice(0, 31 - suffix.length) + suffix;
      n++;
    }
    existingNames.push(name);
    return name;
  }
  function exportImportTemplate() {
    var dataHeaders = cfg.FIELDS.map(function(f) {
      return f.header;
    });
    var exampleRows = [ [ "قوى عاملة", "صباحي", "مجاني", "A", 1, "Panadol Extra", "20 T", 5, 12.5, 62.5, "مسكنات", "2026-01", null, 100, null, null ], [ "طلاب", "مسائي", "منفذ", "A", 2, "Amaryl 10 T", "10 T", 3, 25.75, 77.25, "مضادات السكري", "2026-01", null, 40, null, null ], [ "مواليد", "صباحي", "تحمل", "B", 1, "Augmentin 1g", "14 T", 2, 45, 90, "مضادات حيوية", "2026-01", null, 12, null, null ] ];
    var dataAoa = [ dataHeaders ].concat(exampleRows);
    var dataWs = XLSX.utils.aoa_to_sheet(dataAoa);
    dataWs["!cols"] = dataHeaders.map(function(h) {
      return {
        wch: Math.max(12, h.length + 4)
      };
    });
    var enumNotes = {
      budget: cfg.DIMENSIONS.budget.join("، "),
      shift: cfg.DIMENSIONS.shift.join("، "),
      dispense: cfg.DIMENSIONS.dispense.join("، ")
    };
    var extraNotes = {
      dispensedValue: "تُستخدم للتحقق فقط — تُحسب تلقائيًا (المنصرف × السعر)",
      group: 'أضف هذا العمود لتفعيل تقرير "المجموعات الدوائية"',
      balance: 'مطلوب لتقريرَي "الجرد السنوي" و"الرصيد"',
      book: "رمز الدفتر، مثال: A، B",
      unit: "وحدة القياس، مثال: 20 T",
      month: "مثال: 2026-01"
    };
    var guideHeaders = [ "العمود", "مطلوب؟", "النوع", "ملاحظات" ];
    var guideRows = cfg.FIELDS.map(function(f) {
      var typeLabel = {
        enum: "قائمة",
        text: "نص",
        number: "رقم",
        integer: "رقم صحيح"
      }[f.type] || f.type;
      var note = enumNotes[f.key] || extraNotes[f.key] || "";
      return [ f.header, f.required ? "نعم" : "اختياري", typeLabel, note ];
    });
    var guideAoa = [ guideHeaders ].concat(guideRows);
    var guideWs = XLSX.utils.aoa_to_sheet(guideAoa);
    guideWs["!cols"] = [ {
      wch: 16
    }, {
      wch: 10
    }, {
      wch: 12
    }, {
      wch: 55
    } ];
    var wb = XLSX.utils.book_new();
    wb.Workbook = {
      Views: [ {
        RTL: true
      } ]
    };
    XLSX.utils.book_append_sheet(wb, dataWs, "البيانات");
    XLSX.utils.book_append_sheet(wb, guideWs, "دليل الحقول");
    var fileName = "قالب-استيراد-دفتر.xlsx";
    XLSX.writeFile(wb, fileName);
    return fileName;
  }
  function appendProvenanceSheet(wb, plan) {
    var payload = JSON.stringify({
      plan: plan,
      engine: PH.exportPlan.ENGINE_VERSION,
      generatedAt: new Date().toISOString()
    }, null, 2);
    var ws = XLSX.utils.aoa_to_sheet([ [ payload ] ]);
    var name = "_provenance";
    XLSX.utils.book_append_sheet(wb, ws, name);
    var idx = wb.SheetNames.indexOf(name);
    wb.Workbook = wb.Workbook || {};
    wb.Workbook.Sheets = wb.Workbook.Sheets || [];
    wb.Workbook.Sheets[idx] = { Hidden: 1 };
  }
  function exportSingleWorkbook(sheets, opts) {
    var wb = XLSX.utils.book_new();
    wb.Workbook = {
      Views: [ {
        RTL: true
      } ]
    };
    var usedNames = [];
    var index = 0;
    if (opts.onProgress) opts.onProgress(0, sheets.length);
    return new Promise(function(resolve, reject) {
      function next() {
        if (opts.abortToken && opts.abortToken.cancelled) {
          reject(new Error("تم الإلغاء"));
          return;
        }
        if (index >= sheets.length) {
          var isMulti = sheets.length > 1;
          var fileNameCombination = isMulti ? {
            budget: null,
            shift: null,
            dispense: null
          } : sheets[0] && sheets[0].combination || {
            budget: null,
            shift: null,
            dispense: null
          };
          var descriptor = opts.descriptor;
          if (isMulti) descriptor = (descriptor ? descriptor + "-" : "") + sheets.length + "-أوراق";
          var fileName = buildFileName({
            month: opts.month,
            reportLabel: opts.reportLabel,
            combination: fileNameCombination,
            descriptor,
            ext: "xlsx"
          });
          try {
            if (opts.plan) appendProvenanceSheet(wb, opts.plan);
            XLSX.writeFile(wb, fileName);
          } catch (err) {
            reject(err);
            return;
          }
          resolve(fileName);
          return;
        }
        try {
          var sheet = sheets[index];
          var ws = buildWorksheet(sheet.rows, sheet.columns, sheet.columnLabels, sheet.moneyColumns, sheet.columnDecimals);
          var name = sheetNameFor(sheet.combination, sheet.name, usedNames, sheet.meta && sheet.meta.combined);
          XLSX.utils.book_append_sheet(wb, ws, name);
          index++;
          if (opts.onProgress) opts.onProgress(index, sheets.length);
          setTimeout(next, 0);
        } catch (err) {
          reject(err);
        }
      }
      next();
    });
  }
  function exportZipPerSheet(sheets, opts) {
    var zip = new JSZip;
    var usedNames = [];
    var zipName = buildFileName({
      month: opts.month,
      reportLabel: opts.reportLabel,
      combination: {
        budget: null,
        shift: null,
        dispense: null
      },
      descriptor: opts.descriptor,
      ext: "zip"
    });
    var index = 0;
    if (opts.onProgress) opts.onProgress(0, sheets.length);
    return new Promise(function(resolve, reject) {
      function next() {
        if (opts.abortToken && opts.abortToken.cancelled) {
          reject(new Error("تم الإلغاء"));
          return;
        }
        if (index >= sheets.length) {
          zip.generateAsync({
            type: "blob"
          }, function(meta) {
            if (opts.onProgress) opts.onProgress(sheets.length, sheets.length, meta.percent);
          }).then(function(blob) {
            downloadBlob(blob, zipName);
            resolve(zipName);
          }).catch(reject);
          return;
        }
        try {
          var sheet = sheets[index];
          var wb = XLSX.utils.book_new();
          wb.Workbook = {
            Views: [ {
              RTL: true
            } ]
          };
          var ws = buildWorksheet(sheet.rows, sheet.columns, sheet.columnLabels, sheet.moneyColumns, sheet.columnDecimals);
          XLSX.utils.book_append_sheet(wb, ws, sheetNameFor(sheet.combination, sheet.name, [], sheet.meta && sheet.meta.combined));
          if (opts.plan) appendProvenanceSheet(wb, opts.plan);
          var buf = XLSX.write(wb, {
            bookType: "xlsx",
            type: "array"
          });
          var name = buildFileName({
            month: opts.month,
            reportLabel: sheet.name,
            combination: sheet.combination,
            descriptor: opts.descriptor,
            ext: "xlsx"
          });
          name = resolveCollision(name, usedNames);
          usedNames.push(name);
          zip.file(name, buf);
          index++;
          if (opts.onProgress) opts.onProgress(index, sheets.length);
          setTimeout(next, 0);
        } catch (err) {
          reject(err);
        }
      }
      next();
    });
  }
  function rowsToCsv(rows, columns, separator, labelOverrides, decimalsOverride) {
    var sep = separator || ",";
    var labels = labelOverrides || {};
    var decimalsFor = decimalsOverride || {};
    var lines = [ columns.map(function(c) {
      return labels[c] || cfg.COLUMN_LABELS[c] || c;
    }).join(sep) ];
    rows.forEach(function(row) {
      var line = columns.map(function(c) {
        var v = row[c];
        if (v === null || v === undefined) return "";
        if (typeof v === "bigint") return PH.blocks.formatScaled(v, decimalsFor[c] !== undefined ? decimalsFor[c] : cfg.decimalsForColumn(c), false);
        var s = String(v);
        if (typeof v === "string" && /^[\s\u0000-\u001F]*[=+\-@]/.test(s)) {
          s = "'" + s;
        }
        if (s.indexOf(sep) !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(sep);
      lines.push(line);
    });
    return "\ufeff" + lines.join("\r\n");
  }
  function exportCsv(rows, columns, opts) {
    var csv = rowsToCsv(rows, columns, opts.separator, opts.columnLabels, opts.columnDecimals);
    var blob = new Blob([ csv ], {
      type: "text/csv;charset=utf-8"
    });
    var fileName = buildFileName({
      month: opts.month,
      reportLabel: opts.reportLabel || cfg.REPORTS_BY_ID[opts.reportId].label,
      combination: opts.combination,
      descriptor: opts.descriptor,
      ext: "csv"
    });
    downloadBlob(blob, fileName);
    return fileName;
  }
  function exportCsvBundle(sheets, opts) {
    if (opts.onProgress) opts.onProgress(0, sheets.length);
    if (sheets.length <= 1) {
      var sheet = sheets[0];
      var csv = sheet ? rowsToCsv(sheet.rows, sheet.columns, opts.separator, sheet.columnLabels, sheet.columnDecimals) : "\ufeff";
      var blob = new Blob([ csv ], {
        type: "text/csv;charset=utf-8"
      });
      var fileName = buildFileName({
        month: opts.month,
        reportLabel: opts.reportLabel,
        combination: sheet && sheet.combination || {
          budget: null,
          shift: null,
          dispense: null
        },
        descriptor: opts.descriptor,
        ext: "csv"
      });
      downloadBlob(blob, fileName);
      if (opts.onProgress) opts.onProgress(1, sheets.length);
      return Promise.resolve(fileName);
    }
    var zip = new JSZip;
    var usedNames = [];
    var zipName = buildFileName({
      month: opts.month,
      reportLabel: opts.reportLabel,
      combination: {
        budget: null,
        shift: null,
        dispense: null
      },
      descriptor: opts.descriptor,
      ext: "zip"
    });
    var index = 0;
    return new Promise(function(resolve, reject) {
      function next() {
        if (opts.abortToken && opts.abortToken.cancelled) {
          reject(new Error("تم الإلغاء"));
          return;
        }
        if (index >= sheets.length) {
          zip.generateAsync({
            type: "blob"
          }, function(meta) {
            if (opts.onProgress) opts.onProgress(sheets.length, sheets.length, meta.percent);
          }).then(function(blob) {
            downloadBlob(blob, zipName);
            resolve(zipName);
          }).catch(reject);
          return;
        }
        try {
          var s = sheets[index];
          var csvText = rowsToCsv(s.rows, s.columns, opts.separator, s.columnLabels, s.columnDecimals);
          var name = buildFileName({
            month: opts.month,
            reportLabel: s.name,
            combination: s.combination,
            descriptor: opts.descriptor,
            ext: "csv"
          });
          name = resolveCollision(name, usedNames);
          usedNames.push(name);
          zip.file(name, csvText);
          index++;
          if (opts.onProgress) opts.onProgress(index, sheets.length);
          setTimeout(next, 0);
        } catch (err) {
          reject(err);
        }
      }
      next();
    });
  }
  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 1e3);
  }
  return {
    buildFileName,
    resolveCollision,
    dimensionSegment,
    buildWorksheet,
    sheetNameFor,
    exportImportTemplate,
    exportSingleWorkbook,
    exportZipPerSheet,
    rowsToCsv,
    exportCsv,
    exportCsvBundle,
    downloadBlob
  };
}();


