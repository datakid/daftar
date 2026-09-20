PH.average = function() {
  var cfg = PH.config;
  var reports = PH.reports;
  var blk = PH.blocks;
  var util = PH.util;
  var isBlank = util.isBlank;
  var PS = BigInt(cfg.SCALE_PRICE);
  function emptyPriceAcc() {
    return {
      wq: 0n,
      wqp: 0n,
      sp: 0n,
      n: 0,
      min: null,
      max: null,
      keys: new Set,
      filledN: 0,
      rowValueSum: 0n
    };
  }
  function mergePriceAcc(a, b) {
    var keys = new Set(a.keys);
    b.keys.forEach(function(k) {
      keys.add(k);
    });
    return {
      wq: a.wq + b.wq,
      wqp: a.wqp + b.wqp,
      sp: a.sp + b.sp,
      n: a.n + b.n,
      min: a.min === null ? b.min : b.min === null ? a.min : a.min < b.min ? a.min : b.min,
      max: a.max === null ? b.max : b.max === null ? a.max : a.max > b.max ? a.max : b.max,
      keys,
      filledN: a.filledN + b.filledN,
      rowValueSum: a.rowValueSum + b.rowValueSum
    };
  }
  function addRowToPriceAcc(acc, priceScaled, weightScaled, wasFilled) {
    var w = weightScaled === undefined || weightScaled === null ? 0n : weightScaled;
    var single = {
      wq: w,
      wqp: w * priceScaled,
      sp: priceScaled,
      n: 1,
      min: priceScaled,
      max: priceScaled,
      keys: new Set([ priceScaled.toString() ]),
      filledN: wasFilled ? 1 : 0,
      rowValueSum: reports.valueSFromScaled(priceScaled, w)
    };
    return mergePriceAcc(acc, single);
  }
  function weightedAverageAtPS(acc) {
    if (acc.wq === 0n) return null;
    return blk.divRoundBigInt(acc.wqp, acc.wq);
  }
  var PCT_SCALE = 1000000n;
  function variancePctScaled(acc) {
    var wavg = weightedAverageAtPS(acc);
    if (wavg === null || wavg === 0n || acc.min === null || acc.max === null) return null;
    var diff = acc.max - acc.min;
    return blk.divRoundBigInt(diff * PCT_SCALE, wavg);
  }
  function valueAtValueScale(acc) {
    return acc.rowValueSum;
  }
  function quantityAtDisplayScale(acc) {
    return acc.wq;
  }
  function accumulateGroup(rows, weightField, zeroWeightPolicy) {
    var acc = emptyPriceAcc();
    rows.forEach(function(row) {
      var weightRaw = row[weightField];
      var isZero = isBlank(weightRaw) || weightRaw === 0;
      if (isZero && zeroWeightPolicy !== "weight-one") {
        return;
      }
      var priceScaled = blk.toBigInt(reports.scalePrice(row.price));
      var weightScaled = isZero ? 1n : blk.toBigInt(reports.scaleQty(weightRaw));
      var wasFilled = !!(row.__filled && row.__filled[weightField]);
      acc = addRowToPriceAcc(acc, priceScaled, weightScaled, wasFilled);
    });
    return acc;
  }
  function computeAveragePrices(rows, settings) {
    var weightField = settings && settings.weightField || "dispensed";
    var zeroWeightPolicy = settings && settings.zeroWeightPolicy || "exclude";
    var filtered = rows.filter(function(row) {
      return row.book !== cfg.TOTAL_ROW_MARKER && !isBlank(row.price) && row.price > 0;
    });
    var groups = reports.groupRows(filtered, [ "name", "unit" ]);
    var out = groups.map(function(g) {
      var acc = accumulateGroup(g.rows, weightField, zeroWeightPolicy);
      return {
        name: g.display.name,
        unit: g.display.unit,
        priceCount: acc.keys.size,
        priceMin: acc.min,
        priceMax: acc.max,
        priceAvg: weightedAverageAtPS(acc),
        qty: quantityAtDisplayScale(acc),
        value: valueAtValueScale(acc),
        variancePct: variancePctScaled(acc),
        sourceIds: g.rows.map(function(sourceRow) {
          return sourceRow.id;
        }).filter(Boolean),
        __acc: acc
      };
    }).filter(function(r) {
      return r.__acc.n > 0;
    });
    var sorted = reports.stableSortBy(out, [ function(a, b) {
      return b.value < a.value ? -1 : b.value > a.value ? 1 : 0;
    }, reports.textAsc("name") ]);
    var grandAcc = emptyPriceAcc();
    sorted.forEach(function(r) {
      grandAcc = mergePriceAcc(grandAcc, r.__acc);
    });
    var grandTotal = {
      name: "الإجمالي",
      unit: "",
      priceCount: grandAcc.keys.size,
      priceMin: grandAcc.min,
      priceMax: grandAcc.max,
      qty: quantityAtDisplayScale(grandAcc),
      value: valueAtValueScale(grandAcc),
      priceAvg: weightedAverageAtPS(grandAcc),
      variancePct: variancePctScaled(grandAcc),
      __acc: grandAcc,
      sourceIds: sorted.reduce(function(ids, row) {
        ids.push.apply(ids, row.sourceIds || []);
        return ids;
      }, []),
      isGrandTotal: true
    };
    sorted.push(grandTotal);
    return {
      rows: sorted,
      grandTotal,
      grandAcc,
      sourceCount: rows.length
    };
  }
  function eventSequence(rows) {
    return reports.stableSortBy(rows.slice(), [ function(a, b) {
      var am = a.month || "", bm = b.month || "";
      return am < bm ? -1 : am > bm ? 1 : 0;
    }, reports.textAsc("book"), reports.numAsc("serial") ]);
  }
  var VALUE_FROM_AVG_DIVISOR = BigInt(cfg.SCALE_QTY) * BigInt(cfg.SCALE_AVG) / BigInt(cfg.SCALE_VALUE);
  function runMovingAverage(events, windowSize) {
    var qty = 0n;
    var avg = 0n;
    var window = [];
    var out = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var flagged = false;
      if (e.received_s > 0n) {
        if (windowSize > 0) {
          window.push({ qty: e.received_s, price: e.price_s });
          while (window.length > windowSize) window.shift();
          var wCost = 0n, wQty = 0n;
          for (var w = 0; w < window.length; w++) { wCost += window[w].qty * window[w].price * PS; wQty += window[w].qty; }
          qty = qty + e.received_s;
          avg = wQty > 0n ? blk.divRoundBigInt(wCost, wQty) : avg;
        } else {
          var cost = qty * avg + e.received_s * e.price_s * PS;
          qty = qty + e.received_s;
          avg = qty > 0n ? blk.divRoundBigInt(cost, qty) : avg;
        }
      }
      if (e.dispensed_s > 0n) {
        qty = qty - e.dispensed_s;
        if (qty < 0n) flagged = true;
      }
      out.push({
        index: i,
        qty,
        avg,
        valueOut: blk.divRoundBigInt(e.dispensed_s * avg, VALUE_FROM_AVG_DIVISOR),
        negativeStock: flagged
      });
    }
    return out;
  }
  function computeMovingAverage(rows, settings) {
    var windowSize = (settings && settings.windowSize) || 0;
    var source = rows.filter(function(row) {
      return row.book !== cfg.TOTAL_ROW_MARKER;
    });
    var events = eventSequence(source).map(function(row, index) {
      return {
        index,
        source: row,
        book: row.book,
        serial: row.serial,
        name: row.name,
        unit: row.unit,
        received_s: BigInt(Math.round((row.received || 0) * cfg.SCALE_QTY)),
        dispensed_s: BigInt(Math.round((row.dispensed || 0) * cfg.SCALE_QTY)),
        price_s: BigInt(Math.round((row.price || 0) * cfg.SCALE_PRICE))
      };
    });
    var itemGroups = reports.groupRows(events, [ "name", "unit" ]);
    var costingByIndex = new Array(events.length);
    itemGroups.forEach(function(g) {
      var itemCosting = runMovingAverage(g.rows, windowSize);
      g.rows.forEach(function(event, i) {
        costingByIndex[event.index] = itemCosting[i];
      });
    });
    var output = events.map(function(event) {
      var result = costingByIndex[event.index];
      return {
        book: event.book,
        serial: event.serial,
        name: event.name,
        unit: event.unit,
        received: Number(event.received_s) / cfg.SCALE_QTY,
        dispensed: Number(event.dispensed_s) / cfg.SCALE_QTY,
        price: event.price_s,
        movingAvg: blk.divRoundBigInt(result.avg, PS),
        valueOut: result.valueOut,
        negativeStock: result.negativeStock,
        sourceIds: event.source.id ? [ event.source.id ] : []
      };
    });
    return {
      rows: output,
      sourceCount: rows.length
    };
  }
  return {
    PS,
    emptyPriceAcc,
    mergePriceAcc,
    addRowToPriceAcc,
    weightedAverageAtPS,
    variancePctScaled,
    valueAtValueScale,
    accumulateGroup,
    computeAveragePrices,
    computeMovingAverage,
    eventSequence,
    runMovingAverage
  };
}();


