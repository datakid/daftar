PH.paginate = function() {
  var PAGE_HEIGHT_PORTRAIT_MM = 297;
  var PAGE_WIDTH_PORTRAIT_MM = 210;
  var PAGE_HEIGHT_LANDSCAPE_MM = 210;
  var PAGE_WIDTH_LANDSCAPE_MM = 297;
  function pageHeightMm(orientation) {
    return orientation === "landscape" ? PAGE_HEIGHT_LANDSCAPE_MM : PAGE_HEIGHT_PORTRAIT_MM;
  }
  function computeRowMm(geo) {
    var height = pageHeightMm(geo.orientation);
    var fixed = geo.marginTopMm + geo.marginBottomMm + geo.headerMm + geo.totalsMm + geo.footerMm;
    var available = height - fixed;
    var rowMm = available / geo.rowsPerPage;
    return {
      rowMm,
      fixedMm: fixed,
      pageHeightMm: height,
      tracksMm: fixed + rowMm * geo.rowsPerPage
    };
  }
  function buildPages(rowSlots, rowsPerPage) {
    var safeRowsPerPage = rowsPerPage && rowsPerPage > 0 ? rowsPerPage : 1;
    var count = rowSlots.length;
    var pageCount = count === 0 ? 1 : Math.ceil(count / safeRowsPerPage);
    var pages = [];
    for (var p = 0; p < pageCount; p++) {
      var slice = rowSlots.slice(p * safeRowsPerPage, (p + 1) * safeRowsPerPage);
      var realCount = slice.length;
      while (slice.length < safeRowsPerPage) slice.push({
        kind: "filler"
      });
      pages.push({
        pageNumber: p + 1,
        rows: slice,
        realRowCount: realCount
      });
    }
    return {
      pageCount,
      pages,
      rowsPerPage: safeRowsPerPage
    };
  }
  function buildPagesFromBlocked(blockedRows, rowsPerPage) {
    var slots = blockedRows.map(function(r) {
      return {
        kind: "data",
        row: r
      };
    });
    return buildPages(slots, rowsPerPage);
  }
  var SHRINK_LADDER = [ 1, .92, .85, .78 ];
  function autoShrinkStep(measureFn, text, fontSizePx, availableWidthPx) {
    for (var i = 0; i < SHRINK_LADDER.length; i++) {
      var scale = SHRINK_LADDER[i];
      var width = measureFn(text, fontSizePx * scale);
      if (width <= availableWidthPx) return {
        scale,
        fits: true,
        floor: i === SHRINK_LADDER.length - 1
      };
    }
    return {
      scale: SHRINK_LADDER[SHRINK_LADDER.length - 1],
      fits: false,
      floor: true
    };
  }
  function computeCalibrationOffset(baseMarginMm, calibration) {
    var scale = 1 + (calibration.scalePercent || 0) / 100;
    return {
      marginTopMm: baseMarginMm.top + (calibration.offsetTopMm || 0),
      marginBottomMm: baseMarginMm.bottom + (calibration.offsetBottomMm || 0),
      marginInnerMm: baseMarginMm.inner + (calibration.offsetInnerMm || 0),
      marginOuterMm: baseMarginMm.outer + (calibration.offsetOuterMm || 0),
      contentScale: scale
    };
  }
  var MIN_ROW_MM = 4;
  function assertGeometry(geo) {
    var errors = [];
    if (!Number.isFinite(geo.rowsPerPage) || geo.rowsPerPage <= 0 || Math.floor(geo.rowsPerPage) !== geo.rowsPerPage) {
      errors.push("rowsPerPage must be a positive whole number: " + geo.rowsPerPage);
    }
    var g = computeRowMm(geo);
    if (g.tracksMm > g.pageHeightMm + .5) errors.push("tracks exceed page height: " + g.tracksMm + " > " + g.pageHeightMm);
    if (g.rowMm <= 0) errors.push("rowMm is non-positive: " + g.rowMm); else if (g.rowMm < MIN_ROW_MM) errors.push("row height too small to print legibly: " + g.rowMm.toFixed(2) + "mm < " + MIN_ROW_MM + "mm");
    return {
      ok: errors.length === 0,
      errors,
      geometry: g
    };
  }
  function annotatePageTotals(pagesResult, totalField, opts) {
    opts = opts || {};
    var carryForward = totalField ? 0n : null;
    var grandTotal = totalField ? 0n : null;
    pagesResult.pages.forEach(function(pageData) {
      if (totalField) {
        pageData.pageTotal = pageData.rows.reduce(function(sum, slot) {
          if (!slot.row || slot.row.isGrandTotal || slot.row.isSubtotal || typeof slot.row[totalField] !== "bigint") return sum;
          return sum + slot.row[totalField];
        }, 0n);
        pageData.carryForward = carryForward;
        carryForward += pageData.pageTotal;
        grandTotal = carryForward;
      } else {
        pageData.pageTotal = null;
        pageData.carryForward = null;
      }
      pageData.isLastPage = pageData.pageNumber === pagesResult.pageCount;
      pageData.grandTotal = grandTotal;
      pageData.filteredMarker = opts.isFiltered ? "(مصفّى)" : "";
      pageData.filledMarker = opts.hasFilledMoney ? "(مملوء)" : "";
    });
    return pagesResult;
  }
  return {
    PAGE_HEIGHT_PORTRAIT_MM,
    PAGE_WIDTH_PORTRAIT_MM,
    PAGE_HEIGHT_LANDSCAPE_MM,
    PAGE_WIDTH_LANDSCAPE_MM,
    computeRowMm,
    buildPages,
    buildPagesFromBlocked,
    autoShrinkStep,
    computeCalibrationOffset,
    assertGeometry,
    annotatePageTotals
  };
}();


