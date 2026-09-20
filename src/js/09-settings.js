PH.settings = function() {
  var cfg = PH.config;
  var CUMULATIVE_MODES = {
    none: true,
    block: true,
    running: true
  };
  var CUMULATIVE_AGGS = {
    sum: true,
    wmean: true
  };
  function toNumberOrNaN(v) {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") return Number(v);
    return NaN;
  }
  function sanitize(reportId, field, value) {
    var repDef = cfg.REPORTS_BY_ID[reportId];
    var defaults = repDef && repDef.defaults || {};
    switch (field) {
     case "rowsPerPage":
      {
        var n = toNumberOrNaN(value);
        if (cfg.ROWS_PER_PAGE_PRESETS.indexOf(n) !== -1) return n;
        return defaults.rowsPerPage;
      }

     case "blockSize":
      {
        if (defaults.blockSize === null || defaults.blockSize === undefined) return null;
        if (value === null) return null;
        var b = toNumberOrNaN(value);
        if (cfg.BLOCK_SIZE_PRESETS.indexOf(b) !== -1) return b;
        return defaults.blockSize;
      }

     case "cumulativeMode":
      return CUMULATIVE_MODES[value] ? value : defaults.cumulativeMode;

     case "cumulativeAgg":
      return CUMULATIVE_AGGS[value] ? value : defaults.cumulativeAgg;

     case "showPartialBlockTotal":
      return typeof value === "boolean" ? value : !!defaults.showPartialBlockTotal;

     case "showPageMarkers":
      return typeof value === "boolean" ? value : !!defaults.showPageMarkers;

     case "printOrientation":
      return cfg.PRINT_ORIENTATIONS.indexOf(value) !== -1 ? value : defaults.printOrientation;

     case "windowSize":
      {
        var w = toNumberOrNaN(value);
        if (!isFinite(w) || w < 0) return defaults.windowSize || 0;
        return Math.floor(w);
      }

     default:
      return value;
    }
  }
  function sanitizeGlobal(field, value) {
    if (field === "rowsPerPage") return cfg.ROWS_PER_PAGE_PRESETS.indexOf(value) !== -1 ? value : cfg.ROWS_PER_PAGE_PRESETS[0];
    if (field === "showPageMarkers") return typeof value === "boolean" ? value : true;
    if (field === "printOrientation") return cfg.PRINT_ORIENTATIONS.indexOf(value) !== -1 ? value : cfg.PRINT_ORIENTATIONS[0];
    if (field === "applyToPrintExport") return typeof value === "boolean" ? value : true;
    return value;
  }
  function resolve(reportId, overrides) {
    var base = cfg.REPORTS_BY_ID[reportId].defaults;
    var out = {};
    Object.keys(base).forEach(function(k) {
      out[k] = base[k];
    });
    out.linked = !(overrides.linked && overrides.linked[reportId] === false);
    var g = overrides.global || {};
    Object.keys(g).forEach(function(k) {
      out[k] = g[k];
    });
    var r = overrides.report && overrides.report[reportId] || {};
    Object.keys(r).forEach(function(k) {
      out[k] = r[k];
    });
    Object.keys(out).forEach(function(k) {
      if (k === "linked") return;
      out[k] = sanitize(reportId, k, out[k]);
    });
    return out;
  }
  function applyLinkedChange(current, field, value) {
    var next = {};
    for (var k in current) next[k] = current[k];
    if (field === "rowsPerPage") {
      next.rowsPerPage = value;
      if (next.linked !== false) next.blockSize = value;
    } else if (field === "blockSize") {
      next.blockSize = value;
      if (next.linked !== false) next.rowsPerPage = value;
    } else {
      next[field] = value;
    }
    return next;
  }
  function isDivergent(settings) {
    return settings.linked === false && settings.blockSize && settings.rowsPerPage && settings.blockSize !== settings.rowsPerPage;
  }
  function estimatedPageCount(rowCount, rowsPerPage) {
    if (!rowsPerPage || rowsPerPage <= 0) return 0;
    return Math.max(1, Math.ceil(rowCount / rowsPerPage));
  }
  return {
    resolve,
    sanitize,
    sanitizeGlobal,
    applyLinkedChange,
    isDivergent,
    estimatedPageCount
  };
}();


