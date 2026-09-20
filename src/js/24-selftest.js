PH.selftest = function() {
  var blk = PH.blocks;
  var reports = PH.reports;
  var avg = PH.average;
  var paginate = PH.paginate;
  var store = PH.store;
  var cfg = PH.config;
  var exportPlan = PH.exportPlan;
  function makeResult() {
    return {
      pass: 0,
      fail: 0,
      failures: []
    };
  }
  function check(result, cond, label) {
    if (cond) result.pass++; else {
      result.fail++;
      result.failures.push(label);
    }
  }
  function runBlocksInvariants() {
    var result = makeResult();
    function makeRows(n) {
      var rows = [];
      for (var i = 0; i < n; i++) rows.push({
        value: (i + 1) * 100
      });
      return rows;
    }
    [ 7, 23, 24, 50, 100, 240 ].forEach(function(n) {
      [ 1, 2, 9, 10, 24, 100 ].forEach(function(blockSize) {
        [ "block", "running" ].forEach(function(mode) {
          [ true, false ].forEach(function(partial) {
            var rows = makeRows(n);
            var out = blk.applyBlocks(rows, {
              blockSize,
              cumulativeMode: mode,
              cumulativeAgg: "sum",
              showPartialBlockTotal: partial,
              valueField: "value"
            });
            var grandTotal = 0n;
            for (var i = 0; i < n; i++) grandTotal += BigInt(rows[i].value);
            for (var i2 = 0; i2 < n; i2++) {
              var closesFullBlock = (i2 + 1) % blockSize === 0;
              var isLast = i2 === n - 1;
              var closesPartial = isLast && partial && !closesFullBlock;
              var shouldClose = closesFullBlock || closesPartial;
              var did = out[i2].cumulative !== null;
              check(result, did === shouldClose, "block-close-index n=" + n + " bs=" + blockSize + " mode=" + mode + " i=" + i2);
            }
            if (mode === "running") {
              var lastRow = out[n - 1];
              var lastCloses = n % blockSize === 0 || partial;
              if (lastCloses) check(result, lastRow.cumulative === grandTotal, "running-final n=" + n + " bs=" + blockSize);
            }
            if (mode === "block" && partial) {
              var sumOfBlocks = 0n;
              for (var i3 = 0; i3 < n; i3++) if (out[i3].cumulative !== null) sumOfBlocks += out[i3].cumulative;
              check(result, sumOfBlocks === grandTotal, "block-sum n=" + n + " bs=" + blockSize);
            }
          });
        });
      });
    });
    return result;
  }
  function runReportParity(source, expected) {
    var result = makeResult();
    var movementSettings = {
      blockSize: 10,
      cumulativeMode: "block",
      showPartialBlockTotal: true,
      showPageMarkers: true
    };
    var yiSettings = {
      blockSize: 24,
      cumulativeMode: "running",
      showPartialBlockTotal: true,
      showPageMarkers: true
    };
    var movement = reports.computeMovement(source, movementSettings);
    check(result, movement.grandTotal.toString() === expected.movement.grandTotal, "movement grand total parity");
    check(result, movement.rows.length === expected.movement.rows.length, "movement row count parity");
    var groups = reports.computeGroups(source, {});
    check(result, groups.grandTotal.toString() === expected.groups.grandTotal, "groups grand total parity");
    var yi = reports.computeYearlyInventory(source, yiSettings);
    check(result, yi.grandTotal.toString() === expected.yearlyInventory.grandTotal, "yearly inventory grand total parity");
    var balance = reports.computeBalance(source, {});
    check(result, balance.rows.length === expected.balance.rows.length, "balance row count parity");
    return result;
  }
  function runPrintInvariants() {
    var result = makeResult();
    var rowsPerPageOptions = [ 9, 10, 24, 7, 33 ];
    var rowCounts = [ 0, 1, 8, 9, 10, 11, 23, 24, 25, 100, 1e3 ];
    rowsPerPageOptions.forEach(function(rpp) {
      rowCounts.forEach(function(rc) {
        [ false, true ].forEach(function(grouped) {
          var slots = [];
          if (!grouped) {
            for (var i = 0; i < rc; i++) slots.push({
              kind: "data"
            });
          } else {
            for (var j = 0; j < rc; j++) {
              if (j % 5 === 0) slots.push({
                kind: "group-header"
              });
              slots.push({
                kind: "data"
              });
            }
          }
          var res = paginate.buildPages(slots, rpp);
          var expectedPageCount = Math.max(1, Math.ceil(slots.length / rpp));
          check(result, res.pageCount === expectedPageCount, "page-count rpp=" + rpp + " rc=" + rc + " grouped=" + grouped);
          var allFull = res.pages.every(function(p) {
            return p.rows.length === rpp;
          });
          check(result, allFull, "slot-count rpp=" + rpp + " rc=" + rc + " grouped=" + grouped);
        });
      });
    });
    [ 9, 10, 24 ].forEach(function(rpp) {
      [ "portrait", "landscape" ].forEach(function(orientation) {
        var geo = {
          marginTopMm: 15,
          marginBottomMm: 15,
          headerMm: 12,
          totalsMm: 8,
          footerMm: 10,
          rowsPerPage: rpp,
          orientation
        };
        var res = paginate.assertGeometry(geo);
        check(result, res.ok, "geometry rpp=" + rpp + " orientation=" + orientation);
      });
    });
    return result;
  }
  function runAverageInvariants(source) {
    var result = makeResult();
    var avgResult = avg.computeAveragePrices(source, {
      weightField: "dispensed"
    });
    var movementResult = reports.computeMovement(source, {
      blockSize: 10,
      cumulativeMode: "block",
      showPartialBlockTotal: true,
      showPageMarkers: true
    });
    var groupsResult = reports.computeGroups(source, {
      blockSize: 10,
      cumulativeMode: "block",
      showPartialBlockTotal: true,
      showPageMarkers: true
    });
    check(result, avgResult.grandTotal.value === movementResult.grandTotal, "average-report reconciles exactly with movement grand total (avg=" + avgResult.grandTotal.value + ", movement=" + movementResult.grandTotal + ")");
    check(result, groupsResult.grandTotal === movementResult.grandTotal, "groups-report reconciles exactly with movement grand total (groups=" + groupsResult.grandTotal + ", movement=" + movementResult.grandTotal + ")");
    avgResult.rows.forEach(function(r) {
      if (r.priceMin === null) return;
      var wavgPS = avg.weightedAverageAtPS(r.__acc);
      check(result, r.priceMin <= wavgPS && wavgPS <= r.priceMax, "bounds for " + r.name + " " + r.unit);
    });
    var phantomRows = [ {
      book: "A",
      serial: 1,
      name: "Item Real",
      unit: "علبة",
      month: "2026-01",
      dispensed: 5,
      price: 10
    }, {
      book: "A",
      serial: 2,
      name: "Item Zero",
      unit: "علبة",
      month: "2026-01",
      dispensed: 0,
      price: 12
    }, {
      book: "A",
      serial: 3,
      name: "Item Zero",
      unit: "علبة",
      month: "2026-01",
      dispensed: 0,
      price: 15
    } ];
    var phantomResult = avg.computeAveragePrices(phantomRows, {
      weightField: "dispensed"
    });
    var nonTotalRows = phantomResult.rows.filter(function(r) {
      return !r.isGrandTotal;
    });
    check(result, nonTotalRows.length === 1, "computeAveragePrices drops the all-zero-weight group instead of emitting a phantom row (got " + nonTotalRows.length + " non-total rows)");
    check(result, !nonTotalRows.some(function(r) {
      return r.priceCount === 0;
    }), "no remaining computeAveragePrices row has priceCount 0");
    return result;
  }
  function runMovingAverageInvariants() {
    var result = makeResult();
    var rows = [ {
      book: "A",
      serial: 1,
      name: "Item A",
      unit: "علبة",
      month: "2026-01",
      received: 10,
      dispensed: 0,
      price: 10
    }, {
      book: "A",
      serial: 2,
      name: "Item B",
      unit: "علبة",
      month: "2026-01",
      received: 10,
      dispensed: 0,
      price: 100
    }, {
      book: "A",
      serial: 3,
      name: "Item A",
      unit: "علبة",
      month: "2026-01",
      received: 0,
      dispensed: 5,
      price: 10
    }, {
      book: "A",
      serial: 4,
      name: "Item B",
      unit: "علبة",
      month: "2026-01",
      received: 0,
      dispensed: 5,
      price: 100
    } ];
    var out = avg.computeMovingAverage(rows).rows;
    check(result, out[2].movingAvg === 100000n, "Item A moving average unaffected by Item B's price (got " + out[2].movingAvg + ")");
    check(result, out[3].movingAvg === 1000000n, "Item B moving average unaffected by Item A's price (got " + out[3].movingAvg + ")");
    check(result, out[2].valueOut === 500000n, "Item A dispense costed at its own average (got " + out[2].valueOut + ")");
    check(result, out[3].valueOut === 5000000n, "Item B dispense costed at its own average (got " + out[3].valueOut + ")");
    return result;
  }
  function runFillInvariants() {
    var result = makeResult();
    for (var seed = 0; seed < 30; seed++) {
      var rows = [];
      var n = 30;
      for (var i = 0; i < n; i++) {
        var blank = Math.random() < .4;
        rows.push({
          book: "A",
          group: blank ? "" : "G" + Math.floor(Math.random() * 5)
        });
      }
      var before = rows.map(function(r) {
        return r.group;
      });
      var out = store.fillBlanks(rows, {
        column: "group",
        direction: "down",
        mode: "blanksOnly",
        boundaryColumn: null
      });
      var ok = true;
      for (var j = 0; j < n; j++) {
        if (!store.isBlankCell(before[j]) && out.rows[j].group !== before[j]) ok = false;
      }
      check(result, ok, "blanksOnly-never-overwrites seed=" + seed);
    }
    var boundaryRows = [ {
      book: "A",
      group: "X"
    }, {
      book: "A",
      group: ""
    }, {
      book: "B",
      group: ""
    } ];
    var boundaryResult = store.fillBlanks(boundaryRows, {
      column: "group",
      direction: "down",
      mode: "blanksOnly",
      boundaryColumn: "book"
    });
    check(result, boundaryResult.rows[1].group === "X", "boundary-inherit-within-book");
    check(result, store.isBlankCell(boundaryResult.rows[2].group), "boundary-stop-across-book");
    return result;
  }
  function mulberry32(seed) {
    return function() {
      seed |= 0;
      seed = seed + 1831565813 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function generateFixtureSource(seed, count) {
    var rnd = mulberry32(seed);
    var drugs = [ {
      name: "Amaryl 10 T",
      unit: "10 T"
    }, {
      name: "Panadol Extra",
      unit: "20 T"
    }, {
      name: "Augmentin 1g",
      unit: "14 T"
    }, {
      name: "Concor 5mg",
      unit: "30 T"
    }, {
      name: "Zantac Syrup",
      unit: "150 ML"
    }, {
      name: "Ventolin Inhaler",
      unit: "1 PC"
    } ];
    var books = [ "A", "B", "C" ];
    var rows = [];
    for (var i = 0; i < count; i++) {
      var d = drugs[Math.floor(rnd() * drugs.length)];
      var price = Math.round((5 + rnd() * 200) * cfg.SCALE_PRICE) / cfg.SCALE_PRICE;
      var dispensed = Math.round(rnd() * 50 * cfg.SCALE_QTY) / cfg.SCALE_QTY;
      var balance = Math.round(rnd() * 500 * cfg.SCALE_QTY) / cfg.SCALE_QTY;
      rows.push({
        budget: "قوى عاملة",
        shift: "صباحي",
        dispense: "مجاني",
        book: books[Math.floor(rnd() * books.length)],
        serial: i + 1,
        name: d.name,
        unit: d.unit,
        dispensed: rnd() < .05 ? null : dispensed,
        price,
        group: null,
        month: "2026-01",
        received: null,
        balance: rnd() < .05 ? null : balance,
        pharmacy: null,
        pageNo: null
      });
    }
    for (var t = 0; t < 3; t++) {
      rows.push({
        budget: "قوى عاملة",
        shift: "صباحي",
        dispense: "مجاني",
        book: cfg.TOTAL_ROW_MARKER,
        serial: null,
        name: "",
        unit: "",
        dispensed: null,
        price: null,
        group: null,
        month: null,
        received: null,
        balance: null,
        pharmacy: null,
        pageNo: null
      });
    }
    return rows;
  }
  function computeExpectedFixture(source) {
    function scaleQtyBigLocal(v) {
      return v === null || v === undefined || v === "" ? 0n : BigInt(Math.round(v * cfg.SCALE_QTY));
    }
    function scalePriceBigLocal(v) {
      return v === null || v === undefined || v === "" ? 0n : BigInt(Math.round(v * cfg.SCALE_PRICE));
    }
    var movementRowCount = 0;
    var movementGrand = 0n;
    source.forEach(function(r) {
      if (r.dispensed === null || r.dispensed === undefined || r.dispensed === 0) return;
      movementRowCount++;
      movementGrand += blk.divRoundBigInt(scalePriceBigLocal(r.price) * scaleQtyBigLocal(r.dispensed), 1000n);
    });
    var groupsGrand = 0n;
    source.forEach(function(r) {
      if (r.book === cfg.TOTAL_ROW_MARKER) return;
      groupsGrand += blk.divRoundBigInt(scalePriceBigLocal(r.price) * scaleQtyBigLocal(r.dispensed), 1000n);
    });
    var yiGrand = 0n;
    source.forEach(function(r) {
      if (r.book === cfg.TOTAL_ROW_MARKER) return;
      if (r.balance === null || r.balance === undefined || r.balance === 0) return;
      yiGrand += blk.divRoundBigInt(scalePriceBigLocal(r.price) * scaleQtyBigLocal(r.balance), 1000n);
    });
    var balGroups = {};
    source.forEach(function(r) {
      if (r.book === cfg.TOTAL_ROW_MARKER) return;
      var key = r.book + "" + r.serial + "" + r.name + "" + r.unit;
      balGroups[key] = (balGroups[key] || 0n) + scaleQtyBigLocal(r.dispensed);
    });
    var balanceRowCount = 0;
    Object.keys(balGroups).forEach(function() {
      balanceRowCount++;
    });
    return {
      movement: {
        grandTotal: movementGrand.toString(),
        rows: {
          length: movementRowCount
        }
      },
      groups: {
        grandTotal: groupsGrand.toString()
      },
      yearlyInventory: {
        grandTotal: yiGrand.toString()
      },
      balance: {
        rows: {
          length: balanceRowCount
        }
      }
    };
  }
  function runAll() {
    var source, expected;
    if (window.PH_FIXTURES && window.PH_FIXTURES.source) {
      var f = window.PH_FIXTURES;
      source = f.source;
      expected = {
        movement: f.expectedMovement,
        groups: f.expectedGroups,
        yearlyInventory: f.expectedYearlyInventory,
        balance: f.expectedBalance
      };
    } else {
      source = generateFixtureSource(20260701, 500);
      expected = computeExpectedFixture(source);
    }
    return new Promise(function(resolve) {
      resolve(runAllWithData(source, expected));
    }).catch(function(err) {
      var failResult = makeResult();
      check(failResult, false, "self-test crashed: " + (err && err.message ? err.message : String(err)));
      return {
        suites: {
          crash: failResult
        },
        totalPass: 0,
        totalFail: 1,
        failures: failResult.failures
      };
    });
  }
  function runRegressionInvariants() {
    var result = makeResult();
    var golden = [ {
      budget: "قوى عاملة",
      shift: "صباحي",
      dispense: "مجاني",
      book: "A",
      serial: "1",
      name: "دواء أ",
      unit: "علبة",
      price: 10,
      dispensed: 5,
      group: "مسكنات",
      month: "2026-01",
      balance: 5
    }, {
      budget: "قوى عاملة",
      shift: "صباحي",
      dispense: "مجاني",
      book: "A",
      serial: "1",
      name: "دواء أ",
      unit: "علبة",
      price: 10,
      dispensed: 3,
      group: "مسكنات",
      month: "2026-01",
      balance: 3
    }, {
      budget: "قوى عاملة",
      shift: "صباحي",
      dispense: "مجاني",
      book: "A",
      serial: "2",
      name: "دواء ب",
      unit: "شريط",
      price: 20,
      dispensed: 2,
      group: "مضادات",
      month: "2026-01",
      balance: 2
    }, {
      budget: "قوى عاملة",
      shift: "صباحي",
      dispense: "مجاني",
      book: "A",
      serial: "3",
      name: "دواء ج",
      unit: "علبة",
      price: 7.5,
      dispensed: 4,
      group: "مضادات",
      month: "2026-01",
      balance: 4
    }, {
      budget: "قوى عاملة",
      shift: "صباحي",
      dispense: "مجاني",
      book: cfg.TOTAL_ROW_MARKER,
      serial: null,
      name: "",
      unit: "",
      price: null,
      dispensed: null,
      group: null,
      month: null,
      balance: null
    } ];
    var EXPECTED_GRAND_TOTAL_SCALED = 1500000n;
    var movementSettings = {
      blockSize: 4,
      cumulativeMode: "block",
      cumulativeAgg: "sum",
      showPartialBlockTotal: true,
      valueField: "value"
    };
    var mv = reports.computeMovement(golden, movementSettings);
    check(result, mv.grandTotal === EXPECTED_GRAND_TOTAL_SCALED, "golden-fixture movement grand total: expected 150.00, got " + blk.formatScaled(mv.grandTotal, 4, false));
    var gr = reports.computeGroups(golden);
    check(result, gr.grandTotal === EXPECTED_GRAND_TOTAL_SCALED, "golden-fixture groups grand total: expected 150.00, got " + blk.formatScaled(gr.grandTotal, 4, false));
    var singlePriceRows = golden.slice(0, 2);
    var avgOut = avg.computeAveragePrices(singlePriceRows, {
      weightField: "dispensed"
    });
    var onlyGroup = avgOut.rows.filter(function(r) {
      return !r.isGrandTotal && !r.isSubtotal;
    })[0];
    check(result, !!onlyGroup && onlyGroup.priceAvg === onlyGroup.priceMin && onlyGroup.priceMin === onlyGroup.priceMax, "priceAvg for a single-price group must equal priceMin/priceMax exactly");
    if (PH.viewTable && typeof document !== "undefined" && typeof document.createElement === "function") {
      try {
        var deletedIds = [];
        var testRows = [ {
          id: "rt-1",
          name: "a"
        }, {
          id: "rt-2",
          name: "b"
        }, {
          id: "rt-3",
          name: "c"
        } ];
        var scratch = document.createElement("div");
        var tc = PH.viewTable.createTable(scratch, {
          columns: [ "name", "actions" ],
          filterRows: testRows,
          onRowDelete: function(row) {
            deletedIds.push(row.id);
          }
        });
        tc.setRows(testRows);
        var rowEls = scratch.querySelectorAll ? scratch.querySelectorAll("tr[data-row-id]") : [];
        check(result, rowEls.length === testRows.length, "row-identity regression fixture rendered all " + testRows.length + " rows");
        rowEls.forEach(function(tr) {
          var expectedId = tr.getAttribute("data-row-id");
          var btn = tr.querySelector && tr.querySelector("button");
          if (btn) btn.click();
          check(result, deletedIds[deletedIds.length - 1] === expectedId, "row-delete targets the clicked row (" + expectedId + ")");
        });
        tc.destroy();
      } catch (e) {
        check(result, false, "row-delete regression test threw: " + (e && e.message ? e.message : String(e)));
      }
    }
    (function() {
      try {
        var qScale = BigInt(cfg.SCALE_QTY);
        var pScale = BigInt(cfg.SCALE_PRICE);
        var negEvents = [ {
          received_s: 3n * qScale,
          dispensed_s: 0n,
          price_s: 10n * pScale
        }, {
          received_s: 0n,
          dispensed_s: 5n * qScale,
          price_s: 10n * pScale
        }, {
          received_s: 10n * qScale,
          dispensed_s: 0n,
          price_s: 10n * pScale
        } ];
        var negCosting = avg.runMovingAverage(negEvents, 0);
        check(result, negCosting[1].negativeStock === true, "negative-stock dip is flagged (P0.4)");
        check(result, negCosting[2].qty === 8n * qScale, "negative-stock deficit carries into the next receipt instead of being erased (P0.4, qty=" + negCosting[2].qty + ")");
      } catch (e) {
        check(result, false, "P0.4 negative-stock regression threw: " + (e && e.message ? e.message : String(e)));
      }
    })();
    (function() {
      try {
        var dupRows = [ {
          id: "dup",
          name: "a"
        }, {
          id: "dup",
          name: "b"
        }, {
          name: "c"
        } ];
        store.setSourceRows(dupRows, "regression-test", true);
        var ids = store.getSourceRows().map(function(r) {
          return r.id;
        });
        var uniqueIds = ids.filter(function(v, i, a) {
          return a.indexOf(v) === i;
        });
        check(result, uniqueIds.length === ids.length, "setSourceRows assigns unique ids to duplicate/missing ids (P0.5)");
        store.setSourceRows([], "regression-test-cleanup", true);
      } catch (e) {
        check(result, false, "P0.5 duplicate-id regression threw: " + (e && e.message ? e.message : String(e)));
      }
    })();
    (function() {
      try {
        var csv = PH.exporter.rowsToCsv([ {
          name: '=HYPERLINK("http://x")',
          qty: -5
        } ], [ "name", "qty" ], ",", {}, {
          qty: 0
        });
        var dataLine = csv.replace(/^\ufeff/, "").split("\r\n")[1];
        check(result, dataLine.indexOf("'=HYPERLINK") !== -1, "CSV export neutralizes formula-leading text fields (P0.9)");
        check(result, dataLine.indexOf(",-5") !== -1, "CSV export leaves validated numeric fields untouched (P0.9)");
      } catch (e) {
        check(result, false, "P0.9 CSV-injection regression threw: " + (e && e.message ? e.message : String(e)));
      }
    })();
    (function() {
      try {
        var mapping = {
          0: "budget",
          1: "shift",
          2: "dispense",
          3: "book",
          4: "serial",
          5: "name",
          6: "unit",
          7: "price",
          8: "dispensed",
          9: "group",
          10: "month",
          11: "pharmacy"
        };
        var badRows = [ {
          budget: "قوى عاملة",
          shift: "صباحي",
          dispense: "مجاني",
          book: "A",
          serial: "1",
          name: "دواء أ",
          unit: "علبة",
          price: 10,
          dispensed: -3
        } ];
        var out = PH.validate.validateDataset(badRows, mapping);
        check(result, out.canCommit === false, "validateDataset blocks commit when a row has an error-severity problem (P0.2)");
      } catch (e) {
        check(result, false, "P0.2 import-validation regression threw: " + (e && e.message ? e.message : String(e)));
      }
    })();
    (function() {
      try {
        var scopeRows = [ {
          group: "A",
          value: 100n
        }, {
          group: "B",
          value: 50n
        }, {
          group: "الإجمالي",
          value: 150n,
          isGrandTotal: true
        } ];
        var visibleRows = scopeRows.filter(function(r) {
          return r.group === "A" || r.isGrandTotal;
        });
        var visible = PH.query.visibleTotalFor(visibleRows, "value");
        check(result, visible === 100n, "visibleTotalFor sums only non-marker visible rows (P0.3, got " + visible + ")");
        var marked = PH.query.markScopeTotals(visibleRows);
        var grandRow = marked.filter(function(r) {
          return r.isGrandTotal;
        })[0];
        check(result, grandRow.group !== "الإجمالي" && grandRow.group.indexOf("الإجمالي") === 0, "markScopeTotals relabels the grand-total row instead of leaving it identical to a filtered total (P0.3)");
      } catch (e) {
        check(result, false, "P0.3 filtered-totals regression threw: " + (e && e.message ? e.message : String(e)));
      }
    })();
    (function() {
      try {
        var mismatchRows = [];
        for (var i = 1; i <= 8; i++) {
          mismatchRows.push({
            book: "A",
            serial: i,
            name: "دواء",
            unit: "علبة",
            dispensed: 1,
            price: 10
          });
        }
        var mismatchSettings = {
          blockSize: 50,
          rowsPerPage: 4,
          cumulativeMode: "block",
          showPartialBlockTotal: true
        };
        var pagesOut = reports.computePagesForCombination(mismatchRows, {}, mismatchSettings);
        check(result, pagesOut.pageCount === 2, "printed-pages report follows rowsPerPage, not blockSize, when they diverge (P0.7, got " + pagesOut.pageCount + ")");
        var pageValueSum = pagesOut.rows.reduce(function(sum, r) {
          return sum + r.value;
        }, 0n);
        check(result, pageValueSum === pagesOut.movementGrandTotal, "printed-pages totals reconcile with the movement grand total (P0.7)");
      } catch (e) {
        check(result, false, "P0.7 printed-pages regression threw: " + (e && e.message ? e.message : String(e)));
      }
    })();
    (function() {
      try {
        var identityRows = [ {
          name: "صيدلية",
          unit: "علبة"
        }, {
          name: "صيدليه",
          unit: "علبة"
        } ];
        var groups = reports.groupRows(identityRows, [ "name", "unit" ]);
        check(result, groups.length === 2, "groupRows keeps financially distinct names separate instead of merging on lossy Arabic normalization (P0.8, got " + groups.length + " groups)");
      } catch (e) {
        check(result, false, "P0.8 grouping-identity regression threw: " + (e && e.message ? e.message : String(e)));
      }
    })();
    (function() {
      try {
        function expectThrow(payload, label) {
          var threw = false;
          try {
            PH.app.validateBackupPayload(payload);
          } catch (e) {
            threw = true;
          }
          check(result, threw, "backup restore rejects " + label + " (P0.10)");
        }
        var okThrew = false;
        try {
          PH.app.validateBackupPayload({
            format: "daftar-workspace",
            version: 1,
            rows: [ {
              id: "a"
            } ]
          });
        } catch (e) {
          okThrew = true;
        }
        check(result, !okThrew, "backup restore accepts a well-formed v1 payload (P0.10)");
        expectThrow({
          format: "something-else",
          version: 1,
          rows: []
        }, "an unknown backup format");
        expectThrow({
          format: "daftar-workspace",
          version: 2,
          rows: []
        }, "an unsupported backup version");
        expectThrow({
          format: "daftar-workspace",
          version: 1,
          rows: "not-an-array"
        }, "a non-array rows payload");
        expectThrow({
          format: "daftar-workspace",
          version: 1,
          rows: [ {
            id: "a"
          }, [ "not", "an", "object" ] ]
        }, "a malformed row entry");
        var tooManyRows = new Array(100001).fill(0).map(function() {
          return {};
        });
        expectThrow({
          format: "daftar-workspace",
          version: 1,
          rows: tooManyRows
        }, "a backup exceeding the row limit");
      } catch (e) {
        check(result, false, "P0.10 backup-restore regression threw: " + (e && e.message ? e.message : String(e)));
      }
    })();
    (function() {
      try {
        var e1 = PH.dom.el("div", {
          html: "<b>injected</b>"
        });
        check(result, e1.innerHTML !== "<b>injected</b>", "el() no longer treats an 'html' attrs key as innerHTML (P1.7)");
        var e2 = PH.dom.trustedSvg("span", {
          class: "x"
        }, "<svg></svg>");
        check(result, e2.innerHTML.indexOf("<svg") !== -1 && e2.className === "x", "trustedSvg renders markup through an explicit, dedicated API (P1.7)");
      } catch (e) {
        check(result, false, "P1.7 dom-helper regression threw: " + (e && e.message ? e.message : String(e)));
      }
    })();
    (function() {
      try {
        check(result, typeof store.getLastDbError === "function" && typeof store.getDbUnavailableReason === "function", "store exposes persistence-diagnostic getters (P1.4/P1.5)");
        check(result, store.getLastDbError() === null, "no persistence error is reported when nothing has failed (P1.4)");
      } catch (e) {
        check(result, false, "P1.4/P1.5 diagnostics regression threw: " + (e && e.message ? e.message : String(e)));
      }
    })();
    (function() {
      try {
        var bigText = new Array(40000).fill("A").join("");
        var aoa = [ [ "name" ], [ bigText ] ];
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        var extracted = PH.importer.extractRows(ws, 0, {
          0: "name"
        });
        check(result, extracted.length === 1, "extractRows produces one row for the oversized-cell fixture (P1.6)");
        check(result, extracted[0].name.length <= 32 * 1024, "extractRows truncates oversized cell text instead of keeping it unbounded (P1.6, got " + extracted[0].name.length + ")");
      } catch (e) {
        check(result, false, "P1.6 cell-size regression threw: " + (e && e.message ? e.message : String(e)));
      }
    })();
    (function() {
      var app = PH.app;
      var originalUser = app.getUserProfile();
      var originalPharmacy = app.getPharmacyProfile();
      var originalPresets = app.getSavedReportPresets();
      try {
        check(result, app.defaultUserProfile().displayName === "", "defaultUserProfile returns an empty display name");
        check(result, Array.isArray(app.defaultPharmacyProfile().signatureRoles), "defaultPharmacyProfile returns an empty signatureRoles array");
        app.saveUserProfile({
          displayName: "test-user"
        });
        check(result, app.getUserProfile().displayName === "test-user", "saveUserProfile persists a display name into app state");
        app.savePharmacyProfile({
          name: "test-pharmacy",
          signatureRoles: [ "a", "b" ]
        });
        var ph = app.getPharmacyProfile();
        check(result, ph.name === "test-pharmacy" && ph.signatureRoles.length === 2, "savePharmacyProfile persists pharmacy fields into app state");
        var preset = app.capturePresetFromCurrentView("test-preset");
        check(result, preset && preset.name === "test-preset" && typeof preset.reportId === "string" && preset.reportSettings && typeof preset.reportSettings.rowsPerPage === "number", "capturePresetFromCurrentView captures report id, name and resolved settings");
        app.saveReportPresets([ preset ]);
        check(result, app.getSavedReportPresets().length === 1 && app.getSavedReportPresets()[0].name === "test-preset", "saveReportPresets stores presets in app state");
      } catch (e) {
        check(result, false, "profile/preset regression threw: " + (e && e.message ? e.message : String(e)));
      } finally {
        try {
          app.saveUserProfile(originalUser || app.defaultUserProfile());
          app.savePharmacyProfile(originalPharmacy || app.defaultPharmacyProfile());
          app.saveReportPresets(originalPresets || []);
        } catch (e2) {}
      }
    })();
    return result;
  }
  function runColumnChooserInvariants() {
    var result = makeResult();
    if (!cfg.withoutHiddenColumns) {
      check(result, false, "PH.config.withoutHiddenColumns is not loaded");
      return result;
    }
    var columns = [ "name", "unit", "price", "value", "cumulative" ];
    check(result, cfg.withoutHiddenColumns(columns, []).length === columns.length, "no hidden columns -> full list returned");
    check(result, cfg.withoutHiddenColumns(columns, null).length === columns.length, "null hidden set -> full list returned");
    var oneHidden = cfg.withoutHiddenColumns(columns, [ "price" ]);
    check(result, oneHidden.indexOf("price") === -1 && oneHidden.length === columns.length - 1, "hiding one column removes exactly that column");
    var allButOne = columns.slice(1);
    var hideAll = cfg.withoutHiddenColumns(columns, allButOne.concat([ "name" ]));
    check(result, hideAll.length === columns.length, "hiding every column falls back to the full list rather than returning empty");
    var virtualColumns = [ "name", "id", "actions", "value" ];
    var hideVirtual = cfg.withoutHiddenColumns(virtualColumns, [ "id", "actions", "name" ]);
    check(result, hideVirtual.indexOf("id") !== -1 && hideVirtual.indexOf("actions") !== -1, "id/actions survive even if named in the hidden set");
    check(result, hideVirtual.indexOf("name") === -1, "a real column in the same hidden set is still removed");
    check(result, columns.length === 5 && columns[2] === "price", "withoutHiddenColumns does not mutate its input columns array");
    if (reports && cfg.REPORTS_BY_ID.groups) {
      var rows = [ {
        name: "أ",
        unit: "علبة",
        group: "مجموعة1",
        price: 10,
        dispensed: 5,
        book: "1",
        month: "2026-01"
      }, {
        name: "ب",
        unit: "علبة",
        group: "مجموعة1",
        price: 20,
        dispensed: 3,
        book: "1",
        month: "2026-01"
      }, {
        name: "ج",
        unit: "علبة",
        group: "مجموعة2",
        price: 15,
        dispensed: 2,
        book: "1",
        month: "2026-01"
      } ];
      var settings = {
        blockSize: null,
        cumulativeMode: "none",
        cumulativeAgg: "sum"
      };
      var before = reports.computeGroups(rows.slice(), settings);
      cfg.withoutHiddenColumns(cfg.REPORTS_BY_ID.groups.columns, [ "group" ]);
      cfg.withoutHiddenColumns(cfg.REPORTS_BY_ID.groups.columns, [ "value" ]);
      var after = reports.computeGroups(rows.slice(), settings);
      check(result, JSON.stringify(before.rows, function(k, v) {
        return typeof v === "bigint" ? v.toString() + "n" : v;
      }) === JSON.stringify(after.rows, function(k, v) {
        return typeof v === "bigint" ? v.toString() + "n" : v;
      }), "computed rows are bit-identical regardless of intervening column-visibility calls");
      check(result, before.grandTotal === after.grandTotal, "grandTotal is bit-identical regardless of intervening column-visibility calls");
    }
    return result;
  }
  function runExportEngine() {
    var result = makeResult();
    if (!exportPlan) {
      check(result, false, "PH.exportPlan is not loaded");
      return result;
    }
    var ROWS_PER_PAGE = 4, BLOCK_SIZE = 3, N = 10;
    var UNIT_SEQ = [ "u1", "u1", "u1", "u2", "u2", "u3", "u3", "u3", "u3", "u4" ];
    var SETTINGS = { rowsPerPage: ROWS_PER_PAGE, blockSize: BLOCK_SIZE };
    var REPORT_ID = "movement";
    var FIELD = "value";
    var GRAND_LABEL = "الإجمالي الكلي";
    function makeFixtureRows() {
      var rows = [];
      for (var i = 0; i < N; i++) {
        rows.push({
          name: "بند" + (i + 1),
          unit: UNIT_SEQ[i],
          value: BigInt((i + 1) * 1e6),
          price: BigInt((i + 1) * 1e5)
        });
      }
      return rows;
    }
    function grandTotalOf(rows, field) {
      return rows.reduce(function(acc, r) {
        return acc + (typeof r[field] === "bigint" ? r[field] : 0n);
      }, 0n);
    }
    function mkLayer(id, field, reset, running, every, place) {
      return {
        id: id,
        field: field,
        reset: reset,
        resetOn: reset === "group" ? "unit" : null,
        running: running,
        every: every,
        place: place,
        label: null
      };
    }
    function makeEntry(rows) {
      return {
        reportId: REPORT_ID,
        sliceKey: "s1",
        combination: { budget: null, shift: null, dispense: null },
        rows: rows,
        columns: [ "name", "unit", "value" ],
        hiddenColumns: [],
        settings: SETTINGS,
        reportLabel: "الحركة",
        printTotalField: "value"
      };
    }
    function isLayerRow(r, field) {
      return !!r.__totalsRow && r.name !== GRAND_LABEL && r[field] !== undefined;
    }
    var PLACES = [ "column", "row", "both" ];
    var RESETS = [ "none", "page", "block", "group" ];
    var BOOLS = [ false, true ];
    var caseCount = 0;
    PLACES.forEach(function(place) {
      RESETS.forEach(function(reset) {
        BOOLS.forEach(function(running) {
          BOOLS.forEach(function(every) {
            BOOLS.forEach(function(grandOn) {
              caseCount++;
              var label = "matrix[place=" + place + ",reset=" + reset + ",running=" + running + ",every=" + every + ",grand=" + grandOn + "]";
              var rows = makeFixtureRows();
              var layer = mkLayer("L1", FIELD, reset, running, every, place);
              var plan = {
                reports: [ REPORT_ID ],
                sheetSplit: "per-slice",
                grandTotal: { enabled: grandOn, field: grandOn ? FIELD : null },
                layers: [ layer ]
              };
              var entry = makeEntry(rows);
              var grand = grandTotalOf(rows, FIELD);
              var sheet;
              try {
                sheet = exportPlan.buildSheets(plan, { sheets: [ entry ] })[0];
              } catch (e) {
                check(result, false, label + ": buildSheets threw unexpectedly — " + (e && e.message));
                return;
              }
              var outRows = sheet.rows;
              var dataRows = outRows.filter(function(r) {
                return !r.__totalsRow;
              });
              check(result, dataRows.length === rows.length, label + ": (1) every data row survives");
              var orderOk = dataRows.length === rows.length && dataRows.every(function(r, i) {
                return r.name === rows[i].name && r.value === rows[i].value;
              });
              check(result, orderOk, label + ": (1) data rows keep original order and values");
              var series = exportPlan.computeLayerSeries(rows, layer, SETTINGS);
              if (!running && !every) {
                var sum = series.reduce(function(a, v) {
                  return v === null ? a : a + v;
                }, 0n);
                check(result, sum === grand, label + ": (2) every:false,running:false entries sum exactly to grand total");
              } else if (running && !every) {
                var nonNull = series.filter(function(v) {
                  return v !== null;
                });
                var nonDec = nonNull.every(function(v, i) {
                  return i === 0 || v >= nonNull[i - 1];
                });
                check(result, nonDec, label + ": (3) every:false,running:true entries are non-decreasing");
                check(result, nonNull.length > 0 && nonNull[nonNull.length - 1] === grand, label + ": (3) every:false,running:true last entry equals grand total");
              } else if (!running && every) {
                var units = exportPlan.unitIndices(rows, layer, SETTINGS);
                var deltaOk = rows.every(function(r, i) {
                  var prev = i > 0 && units[i] === units[i - 1] ? series[i - 1] : 0n;
                  return series[i] - prev === r.value;
                });
                check(result, deltaOk, label + ": (4) every:true,running:false deltas equal row value within a unit and at unit starts");
              } else {
                check(result, series[series.length - 1] === grand, label + ": (5) every:true,running:true last row equals grand total");
                var diffOk = rows.every(function(r, i) {
                  return i === 0 ? series[i] === r.value : series[i] - series[i - 1] === r.value;
                });
                check(result, diffOk, label + ": (5) every:true,running:true series[i]-series[i-1] equals row[i].field for all i");
              }
              var addedCols = sheet.columns.filter(function(c) {
                return entry.columns.indexOf(c) === -1;
              });
              var layerAddedRows = outRows.filter(function(r) {
                return isLayerRow(r, layer.field);
              });
              if (place === "column" || place === "both") {
                check(result, addedCols.length === 1, label + ": (6) place=" + place + " adds exactly one column");
              } else {
                check(result, addedCols.length === 0, label + ": (6) place=row adds zero columns");
              }
              if (place === "row" || place === "both") {
                var nonNullCount = series.filter(function(v) {
                  return v !== null;
                }).length;
                var suppressLast = running && !every;
                var expectedRowCount = nonNullCount - (suppressLast ? 1 : 0);
                check(result, layerAddedRows.length === expectedRowCount, label + ": (6) place=" + place + " emits one row per non-null series entry" + (suppressLast ? " minus the suppressed final carry" : ""));
                if (place === "both" && expectedRowCount > 0) {
                  var colKey = "tot__" + layer.id;
                  var lastEmitIdx = -1;
                  for (var qi = rows.length - 1; qi >= 0; qi--) {
                    if (series[qi] !== null && !(suppressLast && qi === rows.length - 1)) {
                      lastEmitIdx = qi;
                      break;
                    }
                  }
                  var dataRowOut = dataRows[lastEmitIdx];
                  check(result, dataRowOut[colKey] === series[lastEmitIdx], label + ": (6/both) column value at a boundary row equals the series value there");
                  var hasMatchingEmittedRow = layerAddedRows.some(function(r) {
                    return r[layer.field] === series[lastEmitIdx];
                  });
                  check(result, hasMatchingEmittedRow, label + ": (6/both) an emitted row carries the same boundary value as the column");
                }
              } else {
                check(result, layerAddedRows.length === 0, label + ": (6) place=column adds zero rows");
              }
              var grandRows = outRows.filter(function(r) {
                return r.__totalsRow && r.name === GRAND_LABEL;
              });
              if (grandOn) {
                check(result, grandRows.length === 1, label + ": (8) grand total row appears exactly once when enabled");
                check(result, grandRows.length === 1 && grandRows[0][FIELD] === grand, label + ": (8) grand total equals the data-row sum of the field");
              } else {
                check(result, grandRows.length === 0, label + ": (8) no grand total row when disabled");
              }
              var hasColumnOutput = addedCols.length > 0;
              var hasRowOutput = layerAddedRows.length > 0;
              var isVacuousCarryRow = reset === "none" && running && !every && place === "row";
              if (!isVacuousCarryRow) {
                check(result, hasColumnOutput || hasRowOutput, label + ": (9) the configured layer yields observable output");
              }
              var json1 = JSON.stringify(plan);
              var parsedBack = exportPlan.parsePlan(exportPlan.serializePlan(plan));
              check(result, JSON.stringify(parsedBack) === json1, label + ": (10) parsePlan(serializePlan(plan)) deep-equals plan");
            });
          });
        });
      });
    });
    check(result, caseCount === 96, "generated conformance matrix produced exactly 96 cases (3×4×2×2×2)");
    RESETS.forEach(function(reset) {
      BOOLS.forEach(function(running) {
        BOOLS.forEach(function(every) {
          var label = "twoLayer[reset=" + reset + ",running=" + running + ",every=" + every + "]";
          var rows = makeFixtureRows();
          var layerA = mkLayer("A", "value", reset, running, every, "column");
          var layerB = mkLayer("B", "price", reset, running, every, "column");
          var seriesAAlone = exportPlan.computeLayerSeries(rows, layerA, SETTINGS);
          var seriesBAlone = exportPlan.computeLayerSeries(rows, layerB, SETTINGS);
          var plan2 = {
            reports: [ REPORT_ID ],
            sheetSplit: "per-slice",
            grandTotal: { enabled: false, field: null },
            layers: [ layerA, layerB ]
          };
          var entry2 = makeEntry(rows);
          var sheet2 = exportPlan.buildSheets(plan2, { sheets: [ entry2 ] })[0];
          var dataRows2 = sheet2.rows.filter(function(r) {
            return !r.__totalsRow;
          });
          var colA = dataRows2.map(function(r) {
            return r["tot__A"];
          });
          var colB = dataRows2.map(function(r) {
            return r["tot__B"];
          });
          var matchA = colA.length === seriesAAlone.length && colA.every(function(v, i) {
            return v === seriesAAlone[i];
          });
          var matchB = colB.length === seriesBAlone.length && colB.every(function(v, i) {
            return v === seriesBAlone[i];
          });
          check(result, matchA, label + ": (7) two-layer field A series is bit-identical to computing it alone");
          check(result, matchB, label + ": (7) two-layer field B series is bit-identical to computing it alone");
        });
      });
    });
    (function e2ePerPageTotalEmbedded() {
      var rows = makeFixtureRows();
      var layer = mkLayer("L1", FIELD, "page", false, false, "row");
      var plan = {
        reports: [ REPORT_ID ],
        sheetSplit: "per-slice",
        grandTotal: { enabled: false, field: null },
        layers: [ layer ]
      };
      var entry = makeEntry(rows);
      var sheet = exportPlan.buildSheets(plan, { sheets: [ entry ] })[0];
      var ws = PH.exporter.buildWorksheet(sheet.rows, sheet.columns, sheet.columnLabels, sheet.moneyColumns, sheet.columnDecimals);
      var colIdx = sheet.columns.indexOf(FIELD);
      var layerRows = sheet.rows.filter(function(r) {
        return isLayerRow(r, FIELD);
      });
      check(result, layerRows.length === 3, "e2e[per-page total, embedded]: three page-total rows for a 10-row/4-per-page fixture");
      var expectedPageSums = [ 1000, 2600, 1900 ];
      var ok = layerRows.length === 3;
      layerRows.forEach(function(r, i) {
        var idx = sheet.rows.indexOf(r);
        var cellRef = XLSX.utils.encode_cell({ r: idx + 1, c: colIdx });
        var cellValue = ws[cellRef] && ws[cellRef].v;
        if (cellValue !== expectedPageSums[i]) ok = false;
      });
      check(result, ok, "e2e[per-page total, embedded]: each embedded total equals that page's own sum in the real worksheet cells (1000, 2600, 1900)");
    })();
    (function e2eTrueCumulativeOwnColumn() {
      var rows = makeFixtureRows();
      var layer = mkLayer("L1", FIELD, "page", true, false, "column");
      var plan = {
        reports: [ REPORT_ID ],
        sheetSplit: "per-slice",
        grandTotal: { enabled: false, field: null },
        layers: [ layer ]
      };
      var entry = makeEntry(rows);
      var sheet = exportPlan.buildSheets(plan, { sheets: [ entry ] })[0];
      var ws = PH.exporter.buildWorksheet(sheet.rows, sheet.columns, sheet.columnLabels, sheet.moneyColumns, sheet.columnDecimals);
      var colKey = "tot__L1";
      var colIdx = sheet.columns.indexOf(colKey);
      check(result, colIdx !== -1, "e2e[true cumulative, own column]: a dedicated column is added");
      var page3RowIdx = sheet.rows.indexOf(sheet.rows.filter(function(r) {
        return !r.__totalsRow;
      })[9]);
      var cellRef = XLSX.utils.encode_cell({ r: page3RowIdx + 1, c: colIdx });
      var cellValue = ws[cellRef] && ws[cellRef].v;
      check(result, cellValue === 5500, "e2e[true cumulative, own column]: page 3's value in the real worksheet cell equals pages 1+2+3 (5500)");
      var page1RowIdx = sheet.rows.indexOf(sheet.rows.filter(function(r) {
        return !r.__totalsRow;
      })[3]);
      var cellRef1 = XLSX.utils.encode_cell({ r: page1RowIdx + 1, c: colIdx });
      var cellValue1 = ws[cellRef1] && ws[cellRef1].v;
      check(result, cellValue1 === 1000, "e2e[true cumulative, own column]: page 1's boundary value in the real worksheet cell equals pages 1 alone (1000)");
    })();
    (function e2eRollingSumBoth() {
      var rows = makeFixtureRows();
      var layer = mkLayer("L1", FIELD, "none", true, true, "both");
      var plan = {
        reports: [ REPORT_ID ],
        sheetSplit: "per-slice",
        grandTotal: { enabled: false, field: null },
        layers: [ layer ]
      };
      var entry = makeEntry(rows);
      var sheet = exportPlan.buildSheets(plan, { sheets: [ entry ] })[0];
      var ws = PH.exporter.buildWorksheet(sheet.rows, sheet.columns, sheet.columnLabels, sheet.moneyColumns, sheet.columnDecimals);
      var colKey = "tot__L1";
      var colIdx = sheet.columns.indexOf(colKey);
      var dataRowsOut = sheet.rows.filter(function(r) {
        return !r.__totalsRow;
      });
      var expectedRunning = [];
      var acc = 0;
      rows.forEach(function(r, i) {
        acc += (i + 1) * 100;
        expectedRunning.push(acc);
      });
      var colOk = dataRowsOut.every(function(r, i) {
        var idx = sheet.rows.indexOf(r);
        var cellRef = XLSX.utils.encode_cell({ r: idx + 1, c: colIdx });
        var v = ws[cellRef] && ws[cellRef].v;
        return v === expectedRunning[i];
      });
      check(result, colOk, "e2e[rolling sum, both]: the per-row rolling column matches the running grand total on every real worksheet row");
      var layerRows = sheet.rows.filter(function(r) {
        return isLayerRow(r, FIELD);
      });
      check(result, layerRows.length === N, "e2e[rolling sum, both]: an embedded row follows every data row since the value updates on every row");
      var lastLayerRow = layerRows[layerRows.length - 1];
      var lastIdx = sheet.rows.indexOf(lastLayerRow);
      var lastCellRef = XLSX.utils.encode_cell({ r: lastIdx + 1, c: colIdx !== -1 ? sheet.columns.indexOf(FIELD) : 0 });
      var lastFieldColIdx = sheet.columns.indexOf(FIELD);
      var lastCellRefField = XLSX.utils.encode_cell({ r: lastIdx + 1, c: lastFieldColIdx });
      var lastCellValue = ws[lastCellRefField] && ws[lastCellRefField].v;
      check(result, lastCellValue === 5500, "e2e[rolling sum, both]: the final embedded row's value equals the grand total (5500) in the real worksheet cell");
    })();
    return result;
  }
  function runNormalizeInvariants() {
    var result = makeResult();
    var norm = PH.normalize;
    check(result, norm.parseNumber(".5") === .5, "parseNumber accepts a leading decimal point (.5)");
    check(result, norm.parseNumber("12.") === 12, "parseNumber accepts a trailing decimal point (12.)");
    check(result, norm.parseNumber("12.5") === 12.5, "parseNumber still parses a normal decimal (12.5)");
    check(result, norm.parseNumber("") === null, "parseNumber still rejects an empty string");
    check(result, norm.parseNumber("abc") === null, "parseNumber still rejects non-numeric text");
    check(result, norm.parseMonthValue("2026-1") === "2026-01", "parseMonthValue pads a short ISO month (2026-1 -> 2026-01)");
    check(result, norm.parseMonthValue("2026-01") === "2026-01", "parseMonthValue leaves an already-canonical ISO month unchanged");
    check(result, norm.parseMonthValue("1/2026") === "2026-01", "parseMonthValue canonicalizes month/year (1/2026 -> 2026-01)");
    check(result, norm.parseMonthValue("01/2026") === "2026-01", "parseMonthValue canonicalizes zero-padded month/year (01/2026 -> 2026-01)");
    check(result, norm.parseMonthValue("2026/1") === "2026-01", "parseMonthValue canonicalizes year/month with slash (2026/1 -> 2026-01)");
    check(result, norm.parseMonthValue("يناير") === "يناير", "parseMonthValue leaves unrecognized text verbatim");
    check(result, norm.arabicNormalize("café") === "cafe", "arabicNormalize still strips accents from precomposed Latin characters (café -> cafe, E5 NFD skip-check)");
    check(result, norm.arabicNormalize("León") === "leon", "arabicNormalize still strips accents and lowercases (León -> leon)");
    check(result, norm.arabicNormalize("دواء ١٢٣") === "دواء 123", "arabicNormalize still converts Arabic-Indic digits to ASCII");
    check(result, norm.arabicNormalize("دواء ۱۲۳") === "دواء 123", "arabicNormalize still converts Eastern Arabic-Indic digits to ASCII");
    check(result, norm.arabicNormalize("مسكّن") === norm.arabicNormalize("مسكن"), "arabicNormalize still strips tashkeel");
    return result;
  }
  function runMatrixInvariants() {
    var result = makeResult();
    var matrix = PH.matrix;
    var reports = PH.reports;
    var cfg = PH.config;
    var budgets = cfg.DIMENSIONS.budget;
    var shifts = cfg.DIMENSIONS.shift;
    var dispenses = cfg.DIMENSIONS.dispense;
    var rows = [];
    budgets.forEach(function(b) {
      shifts.forEach(function(s) {
        dispenses.forEach(function(d) {
          rows.push({
            budget: b,
            shift: s,
            dispense: d,
            month: "2026-01"
          });
        });
      });
    });
    rows.push({
      budget: null,
      shift: "صباحي",
      dispense: "مجاني",
      month: "2026-01"
    });
    rows.push({
      budget: "قوى عاملة",
      shift: undefined,
      dispense: "مجاني",
      month: "2026-01"
    });
    rows.push({
      budget: "قوى عاملة",
      shift: "صباحي",
      dispense: "",
      month: "2026-01"
    });
    rows.push({
      budget: "قيمة غريبة",
      shift: "صباحي",
      dispense: "مجاني",
      month: "2026-01"
    });
    function bruteMaterialize(dimensionGroups) {
      return matrix.buildCombinations(dimensionGroups).map(function(combo) {
        var subset = reports.filterToCombination(rows, combo);
        return {
          key: matrix.combinationKey(combo),
          count: subset.length
        };
      });
    }
    [ null, {
      budget: [ [ "قوى عاملة", "طلاب" ], [ "مواليد" ], [ "غير محدد" ] ]
    }, {
      shift: [ [ "صباحي", "مسائي", "غير محدد" ] ]
    }, {
      budget: [ [ "غير محدد" ] ],
      shift: [ [ "صباحي" ] ]
    } ].forEach(function(dimensionGroups, idx) {
      var bucketed = matrix.materialize(rows, dimensionGroups);
      var brute = bruteMaterialize(dimensionGroups);
      var allMatch = bucketed.length === brute.length && bucketed.every(function(b, i) {
        return b.key === brute[i].key && b.count === brute[i].count;
      });
      check(result, allMatch, "matrix.materialize's O(n) bucketing matches brute-force filterToCombination for scenario " + idx + " (E3)");
    });
    return result;
  }
  function runValidateInvariants() {
    var result = makeResult();
    var validate = PH.validate;
    var mapping = {
      0: "budget",
      1: "shift",
      2: "dispense",
      3: "book",
      4: "serial",
      5: "name",
      6: "unit",
      7: "price",
      8: "dispensed",
      9: "group",
      10: "month",
      11: "pharmacy"
    };
    var rows = [ {
      __sheetRow: 42,
      budget: "قوى عاملة",
      shift: "صباحي",
      dispense: "مجاني",
      book: "A",
      serial: "1",
      name: "دواء أ",
      unit: "علبة",
      price: 10,
      dispensed: 5,
      group: "",
      month: "",
      pharmacy: ""
    } ];
    var out1 = validate.validateDataset(rows, mapping);
    check(result, out1.problems.every(function(p) {
      return p.rowIndex !== 0 || !/الصف 0\b/.test(p.message || "");
    }), "validation messages never show the raw 0-based row index");
    var blankOptionalRows = [ {
      __sheetRow: 5,
      budget: "قوى عاملة",
      shift: "صباحي",
      dispense: "مجاني",
      book: "A",
      serial: "1",
      name: "دواء أ",
      unit: "علبة",
      price: 10,
      dispensed: 5,
      group: null,
      month: null,
      pharmacy: null
    } ];
    var out2 = validate.validateDataset(blankOptionalRows, mapping);
    check(result, !out2.problems.some(function(p) {
      return p.code === "BLANK_REQUIRED_VALUE" && (p.column === "group" || p.column === "month" || p.column === "pharmacy");
    }), "optional fields (group/month/pharmacy) never trigger BLANK_REQUIRED_VALUE");
    var blankRequiredRows = [ {
      __sheetRow: 5,
      budget: null,
      shift: "صباحي",
      dispense: "مجاني",
      book: "A",
      serial: "1",
      name: "دواء أ",
      unit: "علبة",
      price: 10,
      dispensed: 5
    } ];
    var out3 = validate.validateDataset(blankRequiredRows, mapping);
    check(result, out3.problems.some(function(p) {
      return p.code === "BLANK_REQUIRED_VALUE" && p.column === "budget";
    }), "required fields (budget) still trigger BLANK_REQUIRED_VALUE when blank");
    var blockerRows = [ {
      __sheetRow: 9,
      budget: "غير معروف",
      shift: "صباحي",
      dispense: "مجاني",
      book: "A",
      serial: "1",
      name: "دواء أ",
      unit: "علبة",
      price: 10,
      dispensed: 5
    } ];
    var out4 = validate.validateDataset(blockerRows, mapping);
    check(result, out4.summary.problemRowCount === 1, "blocker-severity rows count toward problemRowCount (got " + out4.summary.problemRowCount + ")");
    check(result, out4.summary.validCount === 0, "validCount excludes blocker rows (got " + out4.summary.validCount + ")");
    return result;
  }
  function runAllWithData(source, expected) {
    var runners = {
      blocks: function() {
        return runBlocksInvariants();
      },
      reportParity: function() {
        return runReportParity(source, expected);
      },
      print: function() {
        return runPrintInvariants();
      },
      average: function() {
        return runAverageInvariants(source);
      },
      movingAverage: function() {
        return runMovingAverageInvariants();
      },
      fill: function() {
        return runFillInvariants();
      },
      regressions: function() {
        return runRegressionInvariants();
      },
      exportEngine: function() {
        return runExportEngine();
      },
      columns: function() {
        return runColumnChooserInvariants();
      },
      normalize: function() {
        return runNormalizeInvariants();
      },
      matrix: function() {
        return runMatrixInvariants();
      },
      validate: function() {
        return runValidateInvariants();
      }
    };
    var suites = {};
    function yieldToMain() {
      return new Promise(function(resolve) {
        setTimeout(resolve, 0);
      });
    }
    return Object.keys(runners).reduce(function(chain, k) {
      return chain.then(yieldToMain).then(function() {
        suites[k] = runners[k]();
      });
    }, Promise.resolve()).then(function() {
      var totalPass = 0, totalFail = 0, allFailures = [];
      Object.keys(suites).forEach(function(k) {
        totalPass += suites[k].pass;
        totalFail += suites[k].fail;
        allFailures = allFailures.concat(suites[k].failures.map(function(f) {
          return k + ": " + f;
        }));
      });
      return {
        suites,
        totalPass,
        totalFail,
        failures: allFailures
      };
    });
  }
  return {
    runAll,
    runBlocksInvariants,
    runPrintInvariants,
    runAverageInvariants,
    runMovingAverageInvariants,
    runRegressionInvariants,
    runExportEngine,
    runColumnChooserInvariants,
    runNormalizeInvariants,
    runMatrixInvariants,
    runValidateInvariants,
    generateFixtureSource
  };
}();


