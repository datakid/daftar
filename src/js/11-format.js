PH.format = function() {
  var cfg = PH.config;
  var blk = PH.blocks;
  function cell(value, columnKey) {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "نعم" : "لا";
    if (typeof value === "bigint") {
      var scaled = blk.formatScaled(value, cfg.decimalsForColumn(columnKey), true);
      return columnKey === "variancePct" ? scaled + "%" : scaled;
    }
    if (cfg.MONEY_COLUMNS[columnKey]) {
      var decimals = cfg.decimalsForColumn(columnKey);
      var negative = value < 0;
      var fixed = Math.abs(value).toFixed(decimals);
      var parts = fixed.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return (negative ? "-" : "") + parts.join(".");
    }
    if (typeof value === "number") {
      var numeric = Number.isInteger(value) ? String(value) : value.toFixed(2);
      return columnKey === "variancePct" ? numeric + "%" : numeric;
    }
    return String(value);
  }
  return {
    cell
  };
}();


