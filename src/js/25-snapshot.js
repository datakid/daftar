PH.snapshot = function() {
  var cfg = PH.config;
  var reports = PH.reports;
  var matrix = PH.matrix;
  var average = PH.average;
  var exportPlan = PH.exportPlan;
  function ser(v) {
    if (typeof v === "bigint") return v.toString() + "n";
    if (v === null || v === undefined) return v;
    if (typeof v === "object") return null;
    return v;
  }
  function rowDigest(row) {
    var keys = Object.keys(row).filter(function(k) {
      return k.charAt(0) !== "_" && k !== "sourceIds" && k !== "__acc";
    }).sort();
    var o = {};
    keys.forEach(function(k) {
      o[k] = ser(row[k]);
    });
    return o;
  }
  function checksumRows(rows) {
    var hash = 2166136261;
    for (var i = 0; i < rows.length; i++) {
      var s = JSON.stringify(rowDigest(rows[i]));
      for (var j = 0; j < s.length; j++) {
        hash ^= s.charCodeAt(j);
        hash = Math.imul(hash, 16777619);
      }
      hash ^= 1;
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
  function sheetDigest(sheet) {
    var rows = sheet.rows || [];
    var gt = sheet.grandTotal;
    return {
      rowCount: rows.length,
      grandTotal: ser(typeof gt === "bigint" ? gt : null),
      excludedNullOrZero: sheet.excludedNullOrZero || 0,
      head: rows.slice(0, 3).map(rowDigest),
      tail: rows.slice(-3).map(rowDigest),
      checksum: checksumRows(rows)
    };
  }
  function run() {
    var source = PH.selftest.generateFixtureSource(20260701, 500);
    var movementSettingsList = [ {
      tag: "block10",
      blockSize: 10,
      cumulativeMode: "block",
      showPartialBlockTotal: true
    }, {
      tag: "running24",
      blockSize: 24,
      cumulativeMode: "running",
      showPartialBlockTotal: true
    }, {
      tag: "none",
      blockSize: 10,
      cumulativeMode: "none",
      showPartialBlockTotal: true
    }, {
      tag: "partialOff",
      blockSize: 10,
      cumulativeMode: "block",
      showPartialBlockTotal: false
    } ];
    var out = {};
    movementSettingsList.forEach(function(ms) {
      out["movement_" + ms.tag] = sheetDigest(reports.computeMovement(source, ms));
      out["yearlyInventory_" + ms.tag] = sheetDigest(reports.computeYearlyInventory(source, ms));
    });
    out.groups = sheetDigest(reports.computeGroups(source, {}));
    out.balance = sheetDigest(reports.computeBalance(source, {}));
    out.averagePrices = sheetDigest(average.computeAveragePrices(source, {}));
    out.averagePrices_wmean = sheetDigest(average.computeAveragePrices(source, {
      weightField: "dispensed",
      zeroWeightPolicy: "exclude"
    }));
    out.movingAverage_w0 = sheetDigest(average.computeMovingAverage(source, {
      windowSize: 0
    }));
    out.movingAverage_w3 = sheetDigest(average.computeMovingAverage(source, {
      windowSize: 3
    }));
    var movementBlock10 = reports.computeMovement(source, movementSettingsList[0]);
    if (exportPlan && exportPlan.computeLayerSeries) {
      out.layerSeries_pageReset = ser(null);
      try {
        var s1 = exportPlan.computeLayerSeries(movementBlock10.rows, {
          field: "value",
          reset: "page",
          running: false,
          every: false
        });
        out.layerSeries_pageReset = Array.isArray(s1) ? s1.map(ser) : null;
        var s2 = exportPlan.computeLayerSeries(movementBlock10.rows, {
          field: "value",
          reset: "none",
          running: true,
          every: true
        });
        out.layerSeries_runningEvery = Array.isArray(s2) ? s2.map(ser) : null;
      } catch (e) {
        out.layerSeriesError = String(e && e.message || e);
      }
    }
    return {
      seed: 20260701,
      n: 500,
      reports: out
    };
  }
  return {
    run
  };
}();

PH.__snapshot = function() {
  return JSON.stringify(PH.snapshot.run());
};


