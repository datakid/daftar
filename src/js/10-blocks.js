PH.blocks = function() {
  var util = PH.util;
  function divRoundBigInt(num, den) {
    if (den === 0n) return 0n;
    var negative = num < 0n !== den < 0n;
    var an = num < 0n ? -num : num;
    var ad = den < 0n ? -den : den;
    var result = (an * 2n + ad) / (ad * 2n);
    return negative ? -result : result;
  }
  function emptyMeanAcc() {
    return {
      wq: 0n,
      wqp: 0n,
      sp: 0n,
      n: 0
    };
  }
  function mergeMeanAcc(a, b) {
    return {
      wq: a.wq + b.wq,
      wqp: a.wqp + b.wqp,
      sp: a.sp + b.sp,
      n: a.n + b.n
    };
  }
  function addRowToMeanAcc(acc, priceScaled, weightScaled) {
    var w = weightScaled === undefined || weightScaled === null ? 1n : weightScaled;
    return mergeMeanAcc(acc, {
      wq: w,
      wqp: w * priceScaled,
      sp: priceScaled,
      n: 1
    });
  }
  function renderMeanAcc(acc, agg) {
    if (acc.n === 0) return null;
    if (agg === "wmean") {
      if (acc.wq === 0n) return null;
      return divRoundBigInt(acc.wqp, acc.wq);
    }
    return divRoundBigInt(acc.sp, BigInt(acc.n));
  }
  function toBigInt(n) {
    if (typeof n === "bigint") return n;
    if (n === null || n === undefined) return 0n;
    if (!Number.isFinite(n)) return 0n;
    if (Math.abs(n) > Number.MAX_SAFE_INTEGER) throw new Error("toBigInt: value exceeds safe integer range");
    return BigInt(Math.round(n));
  }
  function applyBlocks(rows, opts) {
    var blockSize = opts.blockSize;
    var cumulativeMode = opts.cumulativeMode || "none";
    var cumulativeAgg = opts.cumulativeAgg || "sum";
    var showPartialBlockTotal = opts.showPartialBlockTotal !== false;
    var valueField = opts.valueField;
    var weightField = opts.weightField;
    var n = rows.length;
    var out = new Array(n);
    if (cumulativeMode === "none") {
      for (var j = 0; j < n; j++) out[j] = util.shallowCopy(rows[j]);
      return out;
    }
    var isMean = cumulativeAgg === "wmean" || cumulativeAgg === "mean";
    var runningAcc = isMean ? emptyMeanAcc() : 0n;
    var blockAcc = isMean ? emptyMeanAcc() : 0n;
    var runningIds = [];
    var blockIds = [];
    for (var i = 0; i < n; i++) {
      var row = rows[i];
      var isLastRow = i === n - 1;
      var closesFullBlock = !!blockSize && (i + 1) % blockSize === 0;
      var closesPartial = isLastRow && showPartialBlockTotal && !closesFullBlock;
      var closes = closesFullBlock || closesPartial;
      if (isMean) {
        var priceScaled = toBigInt(row[valueField]);
        var weightScaled = weightField ? toBigInt(row[weightField]) : 1n;
        runningAcc = addRowToMeanAcc(runningAcc, priceScaled, weightScaled);
        blockAcc = addRowToMeanAcc(blockAcc, priceScaled, weightScaled);
      } else {
        var v = toBigInt(row[valueField]);
        runningAcc = runningAcc + v;
        blockAcc = blockAcc + v;
      }
      var copy = util.shallowCopy(row);
      if (row.sourceIds && row.sourceIds.length) {
        runningIds.push.apply(runningIds, row.sourceIds);
        blockIds.push.apply(blockIds, row.sourceIds);
      }
      if (closes) {
        var source = cumulativeMode === "running" ? runningAcc : blockAcc;
        copy.cumulative = isMean ? renderMeanAcc(source, cumulativeAgg) : source;
        copy.sourceIds = util.uniq(cumulativeMode === "running" ? runningIds : blockIds);
        blockAcc = isMean ? emptyMeanAcc() : 0n;
        blockIds = [];
      } else {
        copy.cumulative = null;
      }
      out[i] = copy;
    }
    return out;
  }
  function formatScaled(value, decimals, useGrouping) {
    if (value === null || value === undefined) return "";
    var big = typeof value === "bigint" ? value : BigInt(Math.round(value));
    var negative = big < 0n;
    if (negative) big = -big;
    var scale = 10n ** BigInt(decimals);
    var whole = big / scale;
    var frac = big % scale;
    var wholeStr = whole.toString();
    if (useGrouping !== false) {
      wholeStr = wholeStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    var fracStr = frac.toString();
    while (fracStr.length < decimals) fracStr = "0" + fracStr;
    var out = decimals > 0 ? wholeStr + "." + fracStr : wholeStr;
    return (negative ? "-" : "") + out;
  }
  return {
    applyBlocks,
    divRoundBigInt,
    emptyMeanAcc,
    mergeMeanAcc,
    addRowToMeanAcc,
    renderMeanAcc,
    formatScaled,
    toBigInt
  };
}();


