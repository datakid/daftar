PH.matrix = function() {
  var cfg = PH.config;
  function resolvePartition(dim, dimensionGroups) {
    var custom = dimensionGroups && dimensionGroups[dim];
    if (custom && custom.length) return custom;
    return cfg.DIMENSIONS[dim].map(function(v) {
      return [ v ];
    });
  }
  function buildCombinations(dimensionGroups) {
    var combos = [ {} ];
    cfg.DIMENSION_ORDER.forEach(function(dim) {
      var partition = resolvePartition(dim, dimensionGroups);
      var next = [];
      combos.forEach(function(c) {
        partition.forEach(function(group) {
          var c2 = {};
          for (var k in c) c2[k] = c[k];
          c2[dim] = group;
          next.push(c2);
        });
      });
      combos = next;
    });
    return combos;
  }
  function combinationKey(combination) {
    return cfg.DIMENSION_ORDER.map(function(d) {
      var group = combination[d];
      if (!group || !group.length || group.length === cfg.DIMENSIONS[d].length) return "*";
      if (group.length === 1) return group[0];
      return group.slice().sort().join("+");
    }).join("\0");
  }
  function allValuesCombination() {
    var c = {};
    cfg.DIMENSION_ORDER.forEach(function(d) {
      c[d] = cfg.DIMENSIONS[d].slice();
    });
    return c;
  }
  function bucketDimValue(value, domain) {
    if (value === null || value === undefined || value === "" || domain.indexOf(value) === -1) return "غير محدد";
    return value;
  }
  function selectedDimValues(selected, domain) {
    if (!selected || !selected.length) return domain;
    if (selected.length === domain.length && selected.every(function(v) {
      return domain.indexOf(v) !== -1;
    })) return domain;
    return selected;
  }
  function materialize(rows, dimensionGroups) {
    var combos = buildCombinations(dimensionGroups);
    var buckets = new Map;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var bKey = bucketDimValue(row.budget, cfg.DIMENSIONS.budget) + "\0" + bucketDimValue(row.shift, cfg.DIMENSIONS.shift) + "\0" + bucketDimValue(row.dispense, cfg.DIMENSIONS.dispense);
      buckets.set(bKey, (buckets.get(bKey) || 0) + 1);
    }
    return combos.map(function(combo) {
      var budgets = selectedDimValues(combo.budget, cfg.DIMENSIONS.budget);
      var shifts = selectedDimValues(combo.shift, cfg.DIMENSIONS.shift);
      var dispenses = selectedDimValues(combo.dispense, cfg.DIMENSIONS.dispense);
      var count = 0;
      budgets.forEach(function(b) {
        shifts.forEach(function(s) {
          dispenses.forEach(function(d) {
            count += buckets.get(b + "\0" + s + "\0" + d) || 0;
          });
        });
      });
      return {
        combination: combo,
        key: combinationKey(combo),
        count,
        empty: count === 0
      };
    });
  }
  function nonEmpty(materialized) {
    return materialized.filter(function(m) {
      return !m.empty;
    });
  }
  var memoCache = PH.cache.capped(500, "map");
  function computeMemoized(signature, computeFn) {
    if (memoCache.has(signature)) return memoCache.get(signature);
    var result = computeFn();
    memoCache.set(signature, result);
    return result;
  }
  function buildSignature(parts) {
    return parts.map(function(p) {
      return JSON.stringify(p === undefined ? null : p);
    }).join("|");
  }
  return {
    buildCombinations,
    combinationKey,
    materialize,
    nonEmpty,
    resolvePartition,
    allValuesCombination,
    computeMemoized,
    buildSignature
  };
}();


