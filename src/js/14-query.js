PH.query = function() {
  var norm = PH.normalize;
  var util = PH.util;
  var normalizedFieldCache = typeof WeakMap !== "undefined" ? new WeakMap : null;
  function normalizedField(row, column) {
    if (!normalizedFieldCache) return norm.arabicNormalize(String(row[column]));
    var cached = normalizedFieldCache.get(row);
    if (!cached) {
      cached = {};
      normalizedFieldCache.set(row, cached);
    }
    var entry = cached[column];
    var raw = row[column];
    if (!entry || entry.raw !== raw) {
      entry = {
        raw,
        normalized: norm.arabicNormalize(String(raw))
      };
      cached[column] = entry;
    }
    return entry.normalized;
  }
  function damerauLevenshtein(a, b) {
    var al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    var maxDist = al + bl;
    var da = {};
    var d = [];
    for (var i = 0; i <= al + 1; i++) d.push([]);
    d[0][0] = maxDist;
    for (var i2 = 0; i2 <= al; i2++) {
      d[i2 + 1][0] = maxDist;
      d[i2 + 1][1] = i2;
    }
    for (var j2 = 0; j2 <= bl; j2++) {
      d[0][j2 + 1] = maxDist;
      d[1][j2 + 1] = j2;
    }
    for (var i3 = 1; i3 <= al; i3++) {
      var db = 0;
      for (var j3 = 1; j3 <= bl; j3++) {
        var i1 = da[b[j3 - 1]] || 0;
        var j1 = db;
        var cost = a[i3 - 1] === b[j3 - 1] ? 0 : 1;
        if (cost === 0) db = j3;
        d[i3 + 1][j3 + 1] = Math.min(d[i3][j3] + cost, d[i3 + 1][j3] + 1, d[i3][j3 + 1] + 1, d[i1][j1] + (i3 - i1 - 1) + 1 + (j3 - j1 - 1));
      }
      da[a[i3 - 1]] = i3;
    }
    return d[al + 1][bl + 1];
  }
  function tokenRank(queryToken, fieldToken) {
    if (fieldToken === queryToken) return 0;
    if (fieldToken.indexOf(queryToken) === 0) return 1;
    if (fieldToken.indexOf(queryToken) !== -1) return 2;
    var qLen = queryToken.length;
    var maxDist = qLen >= 7 ? 2 : 1;
    if (qLen >= 4 && Math.abs(fieldToken.length - qLen) <= maxDist && damerauLevenshtein(queryToken, fieldToken) <= maxDist) return 4;
    return -1;
  }
  function matchRank(normalizedQuery, normalizedField) {
    if (normalizedField === normalizedQuery) return 0;
    if (normalizedField.indexOf(normalizedQuery) === 0) return 1;
    if (normalizedField.indexOf(normalizedQuery) !== -1) return 2;
    var fieldTokens = normalizedField.split(/\s+/);
    for (var i = 0; i < fieldTokens.length; i++) {
      if (fieldTokens[i].indexOf(normalizedQuery) === 0) return 3;
    }
    var queryLen = normalizedQuery.length;
    var maxDist = queryLen >= 7 ? 2 : 1;
    if (queryLen >= 4) {
      for (var j = 0; j < fieldTokens.length; j++) {
        var t = fieldTokens[j];
        if (Math.abs(t.length - queryLen) > maxDist) continue;
        if (damerauLevenshtein(normalizedQuery, t) <= maxDist) return 4;
      }
    }
    var queryTokens = normalizedQuery.split(/\s+/).filter(function(t) {
      return t.length > 0;
    });
    if (queryTokens.length > 1) {
      var worst = 0;
      for (var qi = 0; qi < queryTokens.length; qi++) {
        var best = -1;
        for (var fi = 0; fi < fieldTokens.length; fi++) {
          var r = tokenRank(queryTokens[qi], fieldTokens[fi]);
          if (r !== -1 && (best === -1 || r < best)) best = r;
        }
        if (best === -1) return -1;
        if (best > worst) worst = best;
      }
      return 4 + worst;
    }
    return -1;
  }
  function searchRows(rows, queryText, textColumns) {
    if (!queryText || queryText.trim() === "") return rows.map(function(r, i) {
      return {
        row: r,
        index: i,
        rank: 0
      };
    });
    var q = norm.arabicNormalize(queryText);
    var qNoArticle = norm.stripLeadingAl(q);
    var results = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var best = -1;
      for (var c = 0; c < textColumns.length; c++) {
        var fieldVal = row[textColumns[c]];
        if (fieldVal === null || fieldVal === undefined) continue;
        var nf = normalizedField(row, textColumns[c]);
        var nfNoArticle = norm.stripLeadingAl(nf);
        var r1 = matchRank(q, nf);
        var r2 = matchRank(qNoArticle, nfNoArticle);
        var r3 = matchRank(q, nfNoArticle);
        var r4 = matchRank(qNoArticle, nf);
        [ r1, r2, r3, r4 ].forEach(function(r) {
          if (r !== -1 && (best === -1 || r < best)) best = r;
        });
      }
      if (best !== -1) results.push({
        row,
        index: i,
        rank: best
      });
    }
    results.sort(function(a, b) {
      return a.rank - b.rank;
    });
    return results;
  }
  var OPS = {
    "=": function(a, b) {
      return a === b;
    },
    "!=": function(a, b) {
      return a !== b;
    },
    ">": function(a, b) {
      return a > b;
    },
    "<": function(a, b) {
      return a < b;
    },
    between: function(a, lo, hi) {
      return a >= lo && a <= hi;
    }
  };
  function isMarkerRow(row) {
    return !!(row && (row.isGrandTotal || row.isSubtotal));
  }
  function applyFilters(rows, filters) {
    if (!filters || filters.length === 0) return rows;
    var prepared = filters.map(function(f) {
      if (f.kind === "text-contains") return {
        f,
        nq: norm.arabicNormalize(f.value)
      };
      return {
        f
      };
    });
    return rows.filter(function(row) {
      if (isMarkerRow(row)) return true;
      for (var i = 0; i < prepared.length; i++) {
        var f = prepared[i].f;
        var val = row[f.column];
        if (f.kind === "text-contains") {
          if (val === null || val === undefined) return false;
          var nf = norm.arabicNormalize(String(val));
          if (nf.indexOf(prepared[i].nq) === -1) return false;
        } else if (f.kind === "text-checklist") {
          var isBlankVal = util.isBlank(val);
          if (isBlankVal) {
            if (f.values.indexOf(null) === -1) return false;
          } else if (f.values.indexOf(val) === -1) return false;
        } else if (f.kind === "blank") {
          var valIsBlank = util.isBlank(val);
          if (f.wantBlank !== valIsBlank) return false;
        } else if (f.kind === "numeric") {
          if (val === null || val === undefined) return false;
          if (f.op === "between") {
            if (!OPS.between(val, f.lo, f.hi)) return false;
          } else if (!OPS[f.op](val, f.value)) {
            return false;
          }
        }
      }
      return true;
    });
  }
  function compareValues(a, b, type) {
    var aBlank = util.isBlank(a);
    var bBlank = util.isBlank(b);
    if (aBlank && bBlank) return 0;
    if (aBlank) return 1;
    if (bBlank) return -1;
    if (type === "number") {
      if (typeof a === "bigint" || typeof b === "bigint") {
        var ab = typeof a === "bigint" ? a : BigInt(Math.round(a));
        var bb = typeof b === "bigint" ? b : BigInt(Math.round(b));
        return ab < bb ? -1 : ab > bb ? 1 : 0;
      }
      return a - b;
    }
    return util.collatorAr().compare(String(a), String(b));
  }
  function applySort(rows, sortLevels, columnTypes) {
    if (!sortLevels || sortLevels.length === 0) return rows;
    function compareRows(a, b) {
      for (var l = 0; l < sortLevels.length; l++) {
        var level = sortLevels[l];
        var type = columnTypes && columnTypes[level.column] || "text";
        var av = a.r[level.column], bv = b.r[level.column];
        var aBlank = util.isBlank(av), bBlank = util.isBlank(bv);
        var cmp;
        if (aBlank || bBlank) {
          cmp = compareValues(av, bv, type);
        } else {
          cmp = compareValues(av, bv, type);
          if (level.direction === "desc") cmp = -cmp;
        }
        if (cmp !== 0) return cmp;
      }
      return a.i - b.i;
    }
    function sortRun(run) {
      var indexed = run.map(function(r, i) {
        return {
          r,
          i
        };
      });
      indexed.sort(compareRows);
      return indexed.map(function(x) {
        return x.r;
      });
    }
    var out = [];
    var run = [];
    for (var k = 0; k < rows.length; k++) {
      if (isMarkerRow(rows[k])) {
        out = out.concat(sortRun(run));
        run = [];
        out.push(rows[k]);
      } else {
        run.push(rows[k]);
      }
    }
    return out.concat(sortRun(run));
  }
  function runPipeline(rows, state, textColumns, columnTypes) {
    var filtered = applyFilters(rows, state.filters);
    var searched = state.searchText ? searchRows(filtered, state.searchText, textColumns).sort(function(a, b) {
      return a.index - b.index;
    }).map(function(x) {
      return x.row;
    }) : filtered;
    var sorted = applySort(searched, state.sortLevels, columnTypes);
    return {
      filtered,
      searched,
      sorted,
      resultCount: searched.length,
      totalCount: rows.length
    };
  }
  function markScopeTotals(rows) {
    return rows.map(function(row) {
      if (!row || (!row.isGrandTotal && !row.isSubtotal)) return row;
      var labelKey = Object.keys(row).filter(function(k) {
        return typeof row[k] === "string" && row[k];
      })[0];
      if (!labelKey) return row;
      var copy = Object.assign({}, row);
      copy[labelKey] = row[labelKey] + " — نطاق كامل قبل التصفية";
      return copy;
    });
  }
  function visibleTotalFor(rows, field) {
    if (!field) return null;
    var total = 0n;
    rows.forEach(function(r) {
      if (!r || isMarkerRow(r)) return;
      if (typeof r[field] === "bigint") total += r[field];
    });
    return total;
  }
  return {
    damerauLevenshtein,
    matchRank,
    searchRows,
    applyFilters,
    compareValues,
    applySort,
    runPipeline,
    isMarkerRow,
    markScopeTotals,
    visibleTotalFor
  };
}();


