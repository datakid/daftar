PH.reports = function() {
  var cfg = PH.config;
  var norm = PH.normalize;
  var blk = PH.blocks;
  var util = PH.util;
  var isBlank = util.isBlank;
  function toNum(v) {
    return isBlank(v) ? 0 : v;
  }
  function scalePrice(price) {
    if (isBlank(price)) return null;
    return Math.round(price * cfg.SCALE_PRICE);
  }
  function scaleQty(qty) {
    if (isBlank(qty)) return null;
    return Math.round(qty * cfg.SCALE_QTY);
  }
  function toScaledPriceBig(price) {
    return isBlank(price) ? 0n : BigInt(Math.round(price * cfg.SCALE_PRICE));
  }
  function toScaledQtyBig(qty) {
    return isBlank(qty) ? 0n : BigInt(Math.round(qty * cfg.SCALE_QTY));
  }
  var VALUE_DIVISOR = BigInt(cfg.SCALE_PRICE) * BigInt(cfg.SCALE_QTY) / BigInt(cfg.SCALE_VALUE);
  function valueSFromScaled(priceS, qtyS) {
    return blk.divRoundBigInt(priceS * qtyS, VALUE_DIVISOR);
  }
  function scaleValueOf(quantity, price) {
    if (isBlank(quantity) || isBlank(price)) return 0n;
    return valueSFromScaled(toScaledPriceBig(price), toScaledQtyBig(quantity));
  }
  var collatorAr = util.collatorAr;
  function stableSortBy(rows, comparators) {
    var indexed = rows.map(function(r, i) {
      return {
        r,
        i
      };
    });
    indexed.sort(function(a, b) {
      for (var c = 0; c < comparators.length; c++) {
        var res = comparators[c](a.r, b.r);
        if (res !== 0) return res;
      }
      return a.i - b.i;
    });
    return indexed.map(function(x) {
      return x.r;
    });
  }
  function textAsc(field) {
    var coll = collatorAr();
    return function(a, b) {
      var av = a[field], bv = b[field];
      if (isBlank(av) && isBlank(bv)) return 0;
      if (isBlank(av)) return 1;
      if (isBlank(bv)) return -1;
      return coll.compare(String(av), String(bv));
    };
  }
  function numAsc(field) {
    return function(a, b) {
      var av = a[field], bv = b[field];
      if (isBlank(av) && isBlank(bv)) return 0;
      if (isBlank(av)) return 1;
      if (isBlank(bv)) return -1;
      return av - bv;
    };
  }
  function groupRows(rows, keyFields) {
    var map = new Map;
    var order = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var parts = [];
      for (var k = 0; k < keyFields.length; k++) {
        parts.push(norm.identityKey(row[keyFields[k]]));
      }
      var key = parts.join("\0");
      if (!map.has(key)) {
        var display = {};
        for (var k2 = 0; k2 < keyFields.length; k2++) display[keyFields[k2]] = row[keyFields[k2]];
        var group = {
          key,
          display,
          rows: [],
          firstRow: row
        };
        map.set(key, group);
        order.push(key);
      }
      map.get(key).rows.push(row);
    }
    return order.map(function(k) {
      return map.get(k);
    });
  }
  function filterToCombination(rows, combination) {
    function prepareMatcher(selected, domain) {
      if (!selected || !selected.length) return {
        matchAll: true
      };
      var coversFullDomain = selected.length === domain.length && selected.every(function(v) {
        return domain.indexOf(v) !== -1;
      });
      if (coversFullDomain) return {
        matchAll: true
      };
      var selectedSet = new Set(selected);
      return {
        matchAll: false,
        selectedSet,
        hasUndefinedMarker: selectedSet.has("غير محدد")
      };
    }
    function matches(value, matcher, domain) {
      if (matcher.matchAll) return true;
      if (matcher.hasUndefinedMarker && (value === null || value === undefined || value === "" || domain.indexOf(value) === -1)) return true;
      return matcher.selectedSet.has(value);
    }
    var budgetMatcher = prepareMatcher(combination.budget, cfg.DIMENSIONS.budget);
    var shiftMatcher = prepareMatcher(combination.shift, cfg.DIMENSIONS.shift);
    var dispenseMatcher = prepareMatcher(combination.dispense, cfg.DIMENSIONS.dispense);
    return rows.filter(function(row) {
      if (combination.month && combination.month !== "*" && row.month !== combination.month) return false;
      if (!matches(row.budget, budgetMatcher, cfg.DIMENSIONS.budget)) return false;
      if (!matches(row.shift, shiftMatcher, cfg.DIMENSIONS.shift)) return false;
      if (!matches(row.dispense, dispenseMatcher, cfg.DIMENSIONS.dispense)) return false;
      return true;
    });
  }
  function dimLabel(combination, key) {
    var group = combination[key];
    if (!group || !group.length) return "الكل";
    if (group.length === cfg.DIMENSIONS[key].length) return "الكل";
    return group.join(" + ");
  }
  function computeMovement(rows, settings) {
    var excludedNullOrZero = 0;
    var filtered = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.book === cfg.TOTAL_ROW_MARKER) continue;
      if (isBlank(row.dispensed) || row.dispensed === 0) {
        excludedNullOrZero++;
        continue;
      }
      filtered.push(row);
    }
    var withValue = filtered.map(function(row) {
      var out = {};
      out.name = row.name;
      out.unit = row.unit;
      out.dispensed = row.dispensed;
      out.price = toScaledPriceBig(row.price);
      out.value = scaleValueOf(row.dispensed, row.price);
      out.sourceIds = row.id ? [ row.id ] : [];
      out.__fromFilled = !!row.__filled;
      return out;
    });
    var blocked = blk.applyBlocks(withValue, {
      blockSize: settings.blockSize,
      cumulativeMode: settings.cumulativeMode,
      cumulativeAgg: "sum",
      showPartialBlockTotal: settings.showPartialBlockTotal,
      valueField: "value"
    });
    var grandTotal = 0n;
    for (var g = 0; g < withValue.length; g++) grandTotal += withValue[g].value;
    return {
      rows: blocked,
      grandTotal,
      excludedNullOrZero,
      sourceCount: rows.length
    };
  }
  function computeGroups(rows, settings) {
    var kept = rows.filter(function(row) {
      return row.book !== cfg.TOTAL_ROW_MARKER;
    });
    var withValue = kept.map(function(row) {
      var out = {};
      out.group = isBlank(row.group) ? "بدون مجموعة" : row.group;
      out.value = scaleValueOf(toNum(row.dispensed), toNum(row.price));
      out.sourceIds = row.id ? [ row.id ] : [];
      out.__fromFilled = !!row.__filled;
      return out;
    });
    var groups = groupRows(withValue, [ "group" ]);
    var summed = groups.map(function(g) {
      var sum = 0n;
      var fromFilled = false;
      for (var i = 0; i < g.rows.length; i++) {
        sum += g.rows[i].value;
        fromFilled = fromFilled || !!g.rows[i].__fromFilled;
      }
      return {
        group: g.display.group,
        value: sum,
        cumulative: null,
        sourceIds: g.rows.reduce(function(ids, row) {
          return ids.concat(row.sourceIds || []);
        }, []),
        __fromFilled: fromFilled
      };
    });
    var sorted = stableSortBy(summed, [ function(a, b) {
      return a.value < b.value ? 1 : a.value > b.value ? -1 : 0;
    } ]);
    var grandTotal = 0n;
    for (var s = 0; s < sorted.length; s++) grandTotal += sorted[s].value;
    sorted.push({
      group: "الإجمالي",
      value: grandTotal,
      cumulative: null,
      isGrandTotal: true
    });
    return {
      rows: sorted,
      grandTotal,
      sourceCount: rows.length
    };
  }
  function computeYearlyInventory(rows, settings) {
    var filtered = rows.filter(function(row) {
      return row.book !== cfg.TOTAL_ROW_MARKER && !isBlank(row.balance) && row.balance !== 0;
    });
    var groups = groupRows(filtered, [ "name", "unit", "price" ]);
    var grouped = groups.map(function(g) {
      var price = g.display.price;
      var priceS = toScaledPriceBig(price);
      var balanceSumS = 0n;
      var valueSum = 0n;
      for (var i = 0; i < g.rows.length; i++) {
        var rowBalanceS = toScaledQtyBig(g.rows[i].balance);
        balanceSumS += rowBalanceS;
        valueSum += valueSFromScaled(priceS, rowBalanceS);
      }
      return {
        name: g.display.name,
        unit: g.display.unit,
        price: priceS,
        balance: Number(balanceSumS) / cfg.SCALE_QTY,
        value: valueSum,
        __book: g.firstRow.book,
        __pageNo: isBlank(g.firstRow.pageNo) ? null : g.firstRow.pageNo,
        sourceIds: g.rows.map(function(sourceRow) {
          return sourceRow.id;
        }).filter(Boolean),
        __fromFilled: g.rows.some(function(sourceRow) {
          return !!sourceRow.__filled;
        })
      };
    });
    var hasPageNo = grouped.some(function(r) {
      return r.__pageNo !== null;
    });
    var comparators = [ textAsc("__book") ];
    if (hasPageNo) comparators.push(numAsc("__pageNo"));
    comparators.push(textAsc("name"));
    comparators.push(function(a, b) {
      return a.price < b.price ? 1 : a.price > b.price ? -1 : 0;
    });
    var sorted = stableSortBy(grouped, comparators);
    var output = sorted.map(function(r) {
      return {
        name: r.name,
        unit: r.unit,
        balance: r.balance,
        price: r.price,
        value: r.value,
        sourceIds: r.sourceIds,
        __fromFilled: r.__fromFilled
      };
    });
    var blocked = blk.applyBlocks(output, {
      blockSize: settings.blockSize,
      cumulativeMode: settings.cumulativeMode,
      cumulativeAgg: "sum",
      showPartialBlockTotal: settings.showPartialBlockTotal,
      valueField: "value"
    });
    var grandTotal = 0n;
    for (var v = 0; v < output.length; v++) grandTotal += output[v].value;
    return {
      rows: blocked,
      grandTotal,
      sourceCount: rows.length
    };
  }
  function computeBalance(rows, settings) {
    var filtered = rows.filter(function(row) {
      return row.book !== cfg.TOTAL_ROW_MARKER;
    });
    var groups = groupRows(filtered, [ "book", "serial", "name", "unit" ]);
    var grouped = groups.map(function(g) {
      var dispensedSumS = 0n;
      var balanceSumS = 0n;
      for (var i = 0; i < g.rows.length; i++) {
        dispensedSumS += toScaledQtyBig(g.rows[i].dispensed);
        balanceSumS += toScaledQtyBig(g.rows[i].balance);
      }
      return {
        book: g.display.book,
        serial: g.display.serial,
        name: g.display.name,
        unit: g.display.unit,
        dispensed: Number(dispensedSumS) / cfg.SCALE_QTY,
        balance: Number(balanceSumS) / cfg.SCALE_QTY,
        sourceIds: g.rows.map(function(sourceRow) {
          return sourceRow.id;
        }).filter(Boolean),
        __fromFilled: g.rows.some(function(sourceRow) {
          return !!sourceRow.__filled;
        })
      };
    });
    return {
      rows: grouped,
      sourceCount: rows.length
    };
  }
  function computePagesForCombination(sourceRowsForCombination, combination, movementSettings) {
    var movement = computeMovement(sourceRowsForCombination, movementSettings);
    if (movement.rows.length === 0) {
      return {
        rows: [],
        pageCount: 0,
        movementGrandTotal: movement.grandTotal
      };
    }
    var pagesResult = PH.paginate.buildPagesFromBlocked(movement.rows, movementSettings.rowsPerPage);
    PH.paginate.annotatePageTotals(pagesResult, "value", {});
    var pages = pagesResult.pages.map(function(page) {
      var ids = [];
      var fromFilled = false;
      page.rows.forEach(function(slot) {
        if (slot.row) {
          if (slot.row.sourceIds) ids.push.apply(ids, slot.row.sourceIds);
          if (slot.row.__fromFilled) fromFilled = true;
        }
      });
      return {
        printPageNo: page.pageNumber,
        value: page.pageTotal,
        budget: dimLabel(combination, "budget"),
        shift: dimLabel(combination, "shift"),
        dispense: dimLabel(combination, "dispense"),
        sourceIds: ids,
        __fromFilled: fromFilled
      };
    });
    return {
      rows: pages,
      pageCount: pages.length,
      movementGrandTotal: movement.grandTotal
    };
  }
  function computePagesConsolidated(perCombinationResults) {
    var out = [];
    var grand = 0n;
    for (var c = 0; c < perCombinationResults.length; c++) {
      var entry = perCombinationResults[c];
      var subtotal = 0n;
      var subtotalIds = [];
      for (var p = 0; p < entry.pages.rows.length; p++) {
        out.push({
          budget: entry.pages.rows[p].budget,
          shift: entry.pages.rows[p].shift,
          dispense: entry.pages.rows[p].dispense,
          printPageNo: entry.pages.rows[p].printPageNo,
          value: entry.pages.rows[p].value,
          sourceIds: entry.pages.rows[p].sourceIds || []
        });
        subtotal += entry.pages.rows[p].value;
        subtotalIds.push.apply(subtotalIds, entry.pages.rows[p].sourceIds || []);
      }
      out.push({
        budget: dimLabel(entry.combination, "budget"),
        shift: dimLabel(entry.combination, "shift"),
        dispense: dimLabel(entry.combination, "dispense"),
        printPageNo: null,
        value: subtotal,
        sourceIds: util.uniq(subtotalIds),
        isSubtotal: true
      });
      grand += subtotal;
    }
    var allIds = [];
    out.forEach(function(row) {
      allIds.push.apply(allIds, row.sourceIds || []);
    });
    out.push({
      budget: "الإجمالي",
      shift: "",
      dispense: "",
      printPageNo: null,
      value: grand,
      sourceIds: util.uniq(allIds),
      isGrandTotal: true
    });
    return {
      rows: out,
      grandTotal: grand
    };
  }
  return {
    filterToCombination,
    computeMovement,
    computeGroups,
    computeYearlyInventory,
    computeBalance,
    computePagesForCombination,
    computePagesConsolidated,
    groupRows,
    stableSortBy,
    textAsc,
    numAsc,
    scaleValueOf,
    valueSFromScaled,
    scalePrice,
    scaleQty,
    isBlank,
    dimLabel
  };
}();


