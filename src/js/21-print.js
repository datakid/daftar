PH.print = function() {
  var paginate = PH.paginate;
  var cfg = PH.config;
  var el = PH.dom.el;
  var text = PH.dom.text;
  var DEFAULT_GEO = {
    marginTopMm: 15,
    marginBottomMm: 15,
    marginInnerMm: 12,
    marginOuterMm: 12,
    headerMm: 14,
    totalsMm: 9,
    footerMm: 10
  };
  function resolveGeo(baseGeo, calibration) {
    var adjusted = paginate.computeCalibrationOffset({
      top: baseGeo.marginTopMm,
      bottom: baseGeo.marginBottomMm,
      inner: baseGeo.marginInnerMm,
      outer: baseGeo.marginOuterMm
    }, calibration || {});
    return Object.assign({}, baseGeo, {
      marginTopMm: adjusted.marginTopMm,
      marginBottomMm: adjusted.marginBottomMm,
      marginInnerMm: adjusted.marginInnerMm,
      marginOuterMm: adjusted.marginOuterMm,
      contentScale: adjusted.contentScale || 1
    });
  }
  function measureTextWidth(ctx, str, fontPx, fontFamily) {
    ctx.font = fontPx + "px " + (fontFamily || "IBM Plex Sans Arabic");
    return ctx.measureText(str).width;
  }
  var measureCache = PH.cache.capped(5e3, "object");
  function cachedMeasure(ctx, str, columnWidth, fontPx) {
    var key = str + "|" + columnWidth + "|" + fontPx;
    var hit = measureCache.get(key);
    if (hit !== undefined) return hit;
    var w = measureTextWidth(ctx, str, fontPx);
    measureCache.set(key, w);
    return w;
  }
  function clearMeasureCache() {
    measureCache.clear();
  }
  var printCanvas = null;
  function getPrintCtx() {
    if (!printCanvas) printCanvas = document.createElement("canvas");
    return printCanvas.getContext ? printCanvas.getContext("2d") : null;
  }
  var columnMetricsCache = null;
  function getColumnMetrics(columns) {
    var key = columns.join(",");
    if (columnMetricsCache && columnMetricsCache.key === key) return columnMetricsCache.metrics;
    var printColumns = [ "__sequence" ].concat(columns);
    var printWeights = {
      __sequence: .5
    };
    for (var wk in cfg.COLUMN_WEIGHTS) printWeights[wk] = cfg.COLUMN_WEIGHTS[wk];
    var printWeightTotal = printColumns.reduce(function(sum, col) {
      return sum + (printWeights[col] || 1);
    }, 0);
    var printTemplate = printColumns.map(function(col) {
      return ((printWeights[col] || 1) / printWeightTotal * 100).toFixed(3) + "%";
    }).join(" ");
    var metrics = {
      printColumns,
      printWeights,
      printWeightTotal,
      printTemplate
    };
    columnMetricsCache = {
      key,
      metrics
    };
    return metrics;
  }
  function buildPageElement(pageData, geo, columns, reportLabel, orientation, marginsMm, totalField, pharmacyProfile, userProfile) {
    var isLandscape = orientation === "landscape";
    var pageEl = el("div", {
      class: "page" + (isLandscape ? " print-landscape" : "")
    });
    if (marginsMm) {
      pageEl.style.paddingInlineStart = marginsMm.marginOuterMm + "mm";
      pageEl.style.paddingInlineEnd = marginsMm.marginInnerMm + "mm";
      pageEl.style.paddingTop = marginsMm.marginTopMm + "mm";
      pageEl.style.paddingBottom = marginsMm.marginBottomMm + "mm";
    }
    var grid = el("div", {
      class: "page-grid"
    });
    var rowMm = geo.rowMm;
    var templateRows = geo.headerMm + "mm " + "repeat(" + pageData.rows.length + ", " + rowMm + "mm) " + geo.totalsMm + "mm " + geo.footerMm + "mm 1fr";
    grid.style.gridTemplateRows = templateRows;
    var contentScale = geo.contentScale || 1;
    grid.style.transform = "scale(" + contentScale + ")";
    grid.style.transformOrigin = "top center";
    grid.style.width = 100 / contentScale + "%";
    grid.style.height = 100 / contentScale + "%";
    var pharmacyName = pharmacyProfile && pharmacyProfile.name ? pharmacyProfile.name : "";
    var headerLabel = pharmacyName ? pharmacyName + " · " + reportLabel : reportLabel;
    var headerTop = el("div", {
      class: "page-header__top"
    }, [ el("span", {}, [ text(headerLabel) ]), el("span", {}, [ text("صفحة " + pageData.pageNumber) ]) ]);
    var headerColumns = el("div", {
      class: "page-header__columns"
    });
    var columnMetrics = getColumnMetrics(columns);
    var printColumns = columnMetrics.printColumns;
    var printWeights = columnMetrics.printWeights;
    var printWeightTotal = columnMetrics.printWeightTotal;
    var printTemplate = columnMetrics.printTemplate;
    headerColumns.style.gridTemplateColumns = printTemplate;
    printColumns.forEach(function(col) {
      var label = col === "__sequence" ? "ت" : cfg.COLUMN_LABELS[col] || cfg.DIMENSION_LABELS[col] || (col === "pageNo" ? "رقم الصفحة" : col);
      var isNumHeader = col === "__sequence" || cfg.isNumericColumn(col);
      headerColumns.appendChild(el("div", {
        class: "page-header__column" + (isNumHeader ? " page-header__column--num" : "")
      }, [ text(label) ]));
    });
    var header = el("div", {
      class: "page-header"
    }, [ headerTop, headerColumns ]);
    grid.appendChild(header);
    var ctx = getPrintCtx();
    var pageSequence = 0;
    pageData.rows.forEach(function(slot) {
      var rowEl = el("div", {
        class: "page-row"
      });
      rowEl.style.gridTemplateColumns = printTemplate;
      rowEl.style.display = "grid";
      if (slot.kind === "filler") {
        rowEl.classList.add("filler");
        printColumns.forEach(function() {
          rowEl.appendChild(el("div", {
            class: "page-cell"
          }, [ text("") ]));
        });
        grid.appendChild(rowEl);
        return;
      }
      if (slot.row && slot.row.cumulative !== null && slot.row.cumulative !== undefined) {
        rowEl.classList.add("block-close");
      }
      pageSequence++;
      printColumns.forEach(function(col) {
        var raw = col === "__sequence" ? pageSequence : slot.row ? slot.row[col] : "";
        var isNum = cfg.alignEnd(col, raw);
        var display = PH.format.cell(raw, col);
        var cell = el("div", {
          class: "page-cell" + (isNum ? " page-cell--num" : "")
        }, [ text(display) ]);
        if (ctx && display.length > 0) {
          var fontPx = 13;
          var pageWidthMm = isLandscape ? 297 : 210;
          var horizontalMm = marginsMm ? marginsMm.marginInnerMm + marginsMm.marginOuterMm : 24;
          var colFraction = (printWeights[col] || 1) / printWeightTotal;
          var available = Math.max(24, (pageWidthMm - horizontalMm) * colFraction * 3.78 * .82);
          var step = paginate.autoShrinkStep(function(t, size) {
            return cachedMeasure(ctx, t, available, size);
          }, display, fontPx, available);
          if (step.scale !== 1) cell.style.fontSize = fontPx * step.scale + "px";
          if (!step.fits) cell.classList.add("page-cell--shrink-flag");
        }
        rowEl.appendChild(cell);
      });
      grid.appendChild(rowEl);
    });
    var totalsParts = [];
    var totalsDecimals = cfg.decimalsForColumn(totalField || "value");
    if (pageData.pageTotal !== null && pageData.pageTotal !== undefined) {
      totalsParts.push("إجمالي الصفحة: " + PH.blocks.formatScaled(pageData.pageTotal, totalsDecimals, true));
    }
    if (pageData.carryForward !== null && pageData.carryForward !== undefined && pageData.pageNumber > 1) {
      totalsParts.push("منقول من الصفحة السابقة: " + PH.blocks.formatScaled(pageData.carryForward, totalsDecimals, true));
    }
    if (pageData.grandTotal !== null && pageData.grandTotal !== undefined && pageData.isLastPage) {
      totalsParts.push("الإجمالي الكلي: " + PH.blocks.formatScaled(pageData.grandTotal, totalsDecimals, true));
    }
    var totals = el("div", {
      class: "page-totals"
    }, [ text(totalsParts.join("   ·   ")) ]);
    grid.appendChild(totals);
    var footerLeftText = (pageData.filteredMarker || "") + (pageData.filledMarker ? " " + pageData.filledMarker : "");
    if (userProfile && userProfile.displayName) footerLeftText = (footerLeftText ? footerLeftText + " · " : "") + "أعدّه: " + userProfile.displayName;
    var signatureRoles = pharmacyProfile && pharmacyProfile.signatureRoles && pharmacyProfile.signatureRoles.filter(function(r) {
      return r;
    }).length ? pharmacyProfile.signatureRoles.filter(function(r) {
      return r;
    }) : [ "الصيدلي", "المسؤول" ];
    var signatureSpans = signatureRoles.map(function(role) {
      return text(role + ": __________");
    });
    signatureSpans.push(text("التاريخ: __________"));
    var footer = el("div", {
      class: "page-footer"
    }, [ el("span", {}, [ text(footerLeftText) ]), el("span", {
      class: "page-footer__signatures"
    }, signatureSpans) ]);
    grid.appendChild(footer);
    grid.appendChild(el("div", {}));
    pageEl.appendChild(grid);
    return pageEl;
  }
  function renderPreview(container, blockedRows, opts) {
    var baseGeo = Object.assign({}, DEFAULT_GEO, opts.geo || {});
    var calibratedGeo = resolveGeo(baseGeo, opts.calibration);
    var rowsPerPage = opts.rowsPerPage;
    var orientation = opts.orientation || "portrait";
    var geometry = paginate.computeRowMm(Object.assign({
      rowsPerPage,
      orientation
    }, calibratedGeo));
    var pagesResult = paginate.buildPagesFromBlocked(blockedRows, rowsPerPage);
    if (pagesResult.pages.length > 200 && !opts.largeConfirmed) {
      return {
        pageCount: pagesResult.pages.length,
        needsConfirm: true
      };
    }
    var totalField = opts.printTotalField || null;
    if (container.__pageObserver) {
      container.__pageObserver.disconnect();
      container.__pageObserver = null;
    }
    container.innerHTML = "";
    var shell = el("div", {
      class: "print-preview-shell"
    });
    paginate.annotatePageTotals(pagesResult, totalField, {
      isFiltered: opts.isFiltered,
      hasFilledMoney: opts.hasFilledMoney
    });
    function realizePage(idx) {
      var pageData = pagesResult.pages[idx];
      var pageEl = buildPageElement(pageData, geometry, opts.columns, opts.reportLabel, orientation, calibratedGeo, totalField, opts.pharmacyProfile, opts.userProfile);
      var wrapper = el("div", {
        class: "print-preview-page",
        "data-page-index": String(idx)
      });
      wrapper.appendChild(pageEl);
      return wrapper;
    }
    function placeholderFor(idx) {
      return el("div", {
        class: "print-preview-page print-preview-page--placeholder",
        "data-page-index": String(idx),
        style: "height:calc(" + geometry.pageHeightMm + "mm + 2px);"
      });
    }
    var EAGER_PAGE_COUNT = 3;
    var useLazy = pagesResult.pages.length > EAGER_PAGE_COUNT && typeof IntersectionObserver === "function";
    var observer = null;
    if (useLazy) {
      observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          var node = entry.target;
          var idx = Number(node.getAttribute("data-page-index"));
          if (idx < EAGER_PAGE_COUNT) return;
          if (entry.isIntersecting) {
            if (node.classList.contains("print-preview-page--placeholder")) {
              var real = realizePage(idx);
              node.replaceWith(real);
              observer.unobserve(node);
              observer.observe(real);
            }
          } else if (!node.classList.contains("print-preview-page--placeholder")) {
            var placeholder = placeholderFor(idx);
            node.replaceWith(placeholder);
            observer.unobserve(node);
            observer.observe(placeholder);
          }
        });
      }, {
        root: container,
        rootMargin: "800px 0px"
      });
      container.__pageObserver = observer;
    }
    pagesResult.pages.forEach(function(pageData, idx) {
      if (!useLazy || idx < EAGER_PAGE_COUNT) {
        shell.appendChild(realizePage(idx));
      } else {
        var placeholder = placeholderFor(idx);
        shell.appendChild(placeholder);
        observer.observe(placeholder);
      }
    });
    container.appendChild(shell);
    return pagesResult;
  }
  var printJobToken = 0;
  function runPrintJob(blockedRows, opts) {
    var baseGeo = Object.assign({}, DEFAULT_GEO, opts.geo || {});
    var calibratedGeo = resolveGeo(baseGeo, opts.calibration);
    var geometry = paginate.computeRowMm(Object.assign({
      rowsPerPage: opts.rowsPerPage,
      orientation: opts.orientation || "portrait"
    }, calibratedGeo));
    var geometryAssertion = paginate.assertGeometry(Object.assign({
      rowsPerPage: opts.rowsPerPage,
      orientation: opts.orientation || "portrait"
    }, calibratedGeo));
    if (!geometryAssertion.ok && !opts.geometryConfirmed) {
      return {
        geometryInvalid: true,
        geometryErrors: geometryAssertion.errors
      };
    }
    var pagesResult = paginate.buildPagesFromBlocked(blockedRows, opts.rowsPerPage);
    if (pagesResult.pages.length > 200 && !opts.largeConfirmed) {
      return {
        pageCount: pagesResult.pages.length,
        needsConfirm: true
      };
    }
    var jobToken = ++printJobToken;
    var printRoot = document.getElementById("print-root");
    if (!printRoot) {
      printRoot = el("div", {
        id: "print-root"
      });
      document.body.appendChild(printRoot);
    }
    printRoot.innerHTML = "";
    document.body.classList.toggle("print-landscape", opts.orientation === "landscape");
    var totalField = opts.printTotalField || null;
    paginate.annotatePageTotals(pagesResult, totalField, {
      isFiltered: opts.isFiltered,
      hasFilledMoney: opts.hasFilledMoney
    });
    pagesResult.pages.forEach(function(pageData) {
      var pageEl = buildPageElement(pageData, geometry, opts.columns, opts.reportLabel, opts.orientation, calibratedGeo, totalField, opts.pharmacyProfile, opts.userProfile);
      printRoot.appendChild(pageEl);
    });
    var previousTitle = document.title;
    document.title = (opts.reportLabel || "دفتر") + " — صفحة مطبوعة";
    var cleanup = function() {
      if (jobToken !== printJobToken) return;
      printRoot.innerHTML = "";
      document.body.classList.remove("print-landscape");
      document.title = previousTitle;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 2e4);
    return pagesResult;
  }
  function buildCalibrationRulerPage(calibration, orientation) {
    var baseGeo = DEFAULT_GEO;
    var geo = resolveGeo(baseGeo, calibration);
    var pageW = orientation === "landscape" ? paginate.PAGE_WIDTH_LANDSCAPE_MM : paginate.PAGE_WIDTH_PORTRAIT_MM;
    var pageH = orientation === "landscape" ? paginate.PAGE_HEIGHT_LANDSCAPE_MM : paginate.PAGE_HEIGHT_PORTRAIT_MM;
    var pageEl = el("div", {
      class: "page" + (orientation === "landscape" ? " print-landscape" : "")
    });
    var svgLines = [];
    for (var x = 0; x <= pageW; x += 10) {
      var xTick = x % 50 === 0 ? 6 : 3;
      svgLines.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + xTick + '"/>');
      svgLines.push('<line x1="' + x + '" y1="' + pageH + '" x2="' + x + '" y2="' + (pageH - xTick) + '"/>');
    }
    for (var y = 0; y <= pageH; y += 10) {
      var yTick = y % 50 === 0 ? 6 : 3;
      svgLines.push('<line x1="0" y1="' + y + '" x2="' + yTick + '" y2="' + y + '"/>');
      svgLines.push('<line x1="' + pageW + '" y1="' + y + '" x2="' + (pageW - yTick) + '" y2="' + y + '"/>');
    }
    var left = geo.marginOuterMm, right = pageW - geo.marginInnerMm, top = geo.marginTopMm, bottom = pageH - geo.marginBottomMm;
    var rect = '<rect x="' + left + '" y="' + top + '" width="' + (right - left) + '" height="' + (bottom - top) + '" fill="none" stroke-width="0.4" stroke-dasharray="3,2"/>';
    var svg = '<svg class="calibration-ruler" width="' + pageW + 'mm" height="' + pageH + 'mm" viewBox="0 0 ' + pageW + " " + pageH + '" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none">' + svgLines.join("") + rect + "</svg>";
    var svgHost = el("div", {
      style: "position:absolute; inset:0;"
    });
    svgHost.innerHTML = svg;
    pageEl.appendChild(svgHost);
    var label = el("div", {
      style: "position:absolute; top:2mm; inset-inline-start:2mm; font-size:8pt; font-family:var(--font-num); color:#4A4740;"
    }, [ text("معايرة — أعلى " + geo.marginTopMm.toFixed(1) + "مم · أسفل " + geo.marginBottomMm.toFixed(1) + "مم · داخلي " + geo.marginInnerMm.toFixed(1) + "مم · خارجي " + geo.marginOuterMm.toFixed(1) + "مم") ]);
    pageEl.appendChild(label);
    return pageEl;
  }
  return {
    DEFAULT_GEO,
    resolveGeo,
    renderPreview,
    runPrintJob,
    clearMeasureCache,
    buildPageElement,
    buildCalibrationRulerPage
  };
}();


