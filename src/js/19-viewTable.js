PH.viewTable = function() {
  var cfg = PH.config;
  var store = PH.store;
  var util = PH.util;
  var el = PH.dom.el;
  var text = PH.dom.text;
  var ROW_H_FALLBACK = 40;
  var rowHeightCache = null;
  function rowHeight() {
    if (rowHeightCache) return rowHeightCache;
    var fromCss = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-h"));
    rowHeightCache = Number.isFinite(fromCss) && fromCss > 0 ? fromCss : ROW_H_FALLBACK;
    return rowHeightCache;
  }
  var BUFFER_ROWS = 12;
  var FILTER_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16l-6 7v5l-4 2v-7Z" stroke-linejoin="round"></path></svg>';
  var FILL_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5.5" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="12" cy="18.5" r="1.8"></circle></svg>';
  function formatCell(value, columnKey) {
    return PH.format.cell(value, columnKey);
  }
  function createTable(container, opts) {
    var ROW_H = rowHeight();
    var state = {
      columns: opts.columns,
      rows: [],
      filterRows: opts.filterRows || [],
      scopeRowIds: opts.scopeRowIds || null,
      rowKind: opts.rowKind || function(row) {
        return row && row.__pageBreak ? "page-break" : "data";
      },
      onRowDelete: opts.onRowDelete || null,
      onRowDrilldown: opts.onRowDrilldown || null,
      fillableColumns: opts.fillableColumns || [],
      quantityColumns: opts.quantityColumns || [],
      selection: null,
      activeFillMenu: null,
      activeFilterMenu: null
    };
    var root = el("div", {
      class: "table-wrap"
    });
    if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
    container.style.outline = "none";
    var scroller = el("div", {
      class: "grid-scroller"
    });
    var sizer = el("div", {
      style: "position:relative;"
    });
    var headerWrap = el("div", {
      class: "grid-header"
    });
    var headerTable = el("table", {
      class: "grid",
      role: "presentation"
    });
    var bodyTable = el("table", {
      class: "grid",
      role: "grid",
      "aria-label": "جدول التقرير"
    });
    bodyTable.style.position = "absolute";
    bodyTable.style.top = "0";
    bodyTable.style.width = "100%";
    var columnWeights = cfg.COLUMN_WEIGHTS;
    var totalWeight = state.columns.reduce(function(sum, col) {
      return sum + (columnWeights[col] || 1);
    }, 0);
    function addColgroup(table) {
      var group = el("colgroup");
      state.columns.forEach(function(col) {
        group.appendChild(el("col", {
          style: "width:" + ((columnWeights[col] || 1) / totalWeight * 100).toFixed(3) + "%;"
        }));
      });
      table.appendChild(group);
    }
    addColgroup(headerTable);
    addColgroup(bodyTable);
    var thead = el("thead");
    var thByCol = Object.create(null);
    function sortInfo(col) {
      var levels = opts.queryState && opts.queryState.sortLevels || [];
      for (var si = 0; si < levels.length; si++) {
        if (levels[si].column === col) return {
          level: levels[si],
          index: si,
          count: levels.length
        };
      }
      return null;
    }
    function sortGlyph(info) {
      if (!info) return "";
      var arrow = info.level.direction === "asc" ? "▲" : "▼";
      return info.count > 1 ? arrow + (info.index + 1) : arrow;
    }
    function renderHeader() {
      thead.innerHTML = "";
      var headerRow = el("tr");
      state.columns.forEach(function(col) {
        var isNum = cfg.isNumericColumn(col);
        var th = el("th", {
          scope: "col",
          tabindex: "0",
          role: "columnheader",
          "data-col": col,
          class: isNum ? "is-num" : "",
          title: "انقر للفرز · Shift للفرز المتعدد"
        });
        var inner = el("div", {
          class: "th-inner"
        });
        var label = el("span", {
          class: "th-label"
        }, [ text(cfg.COLUMN_LABELS[col] || col) ]);
        var sortEl = el("span", {
          class: "th-sort",
          "aria-hidden": "true"
        });
        inner.appendChild(label);
        inner.appendChild(sortEl);
        if (col !== "actions" && col !== "id") {
          var filterBtn = PH.dom.trustedSvg("button", {
            class: "th-btn",
            type: "button",
            "aria-label": "تصفية " + (cfg.COLUMN_LABELS[col] || col),
            title: "تصفية"
          }, FILTER_ICON);
          filterBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            toggleFilterMenu(col, filterBtn);
          });
          inner.appendChild(filterBtn);
          th.__filterBtn = filterBtn;
        }
        if (state.fillableColumns.indexOf(col) !== -1) {
          var menuBtn = PH.dom.trustedSvg("button", {
            class: "th-btn",
            type: "button",
            "aria-label": "ملء الفراغات",
            title: "ملء الفراغات"
          }, FILL_ICON);
          menuBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            toggleFillMenu(col, menuBtn);
          });
          inner.appendChild(menuBtn);
        }
        th.appendChild(inner);
        th.__sortEl = sortEl;
        thByCol[col] = th;
        function triggerSort(e) {
          if (col === "actions") return;
          if (opts.onSort) opts.onSort(col, e.shiftKey);
        }
        th.addEventListener("click", function(e) {
          if (e.target.closest && e.target.closest(".th-btn")) return;
          triggerSort(e);
        });
        th.addEventListener("keydown", function(e) {
          if (e.target !== th) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            triggerSort(e);
          }
        });
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      updateHeaderState();
    }
    function updateHeaderState() {
      var filters = opts.queryState && opts.queryState.filters || [];
      state.columns.forEach(function(col) {
        var th = thByCol[col];
        if (!th) return;
        var info = sortInfo(col);
        th.__sortEl.textContent = sortGlyph(info);
        th.setAttribute("aria-sort", info ? info.level.direction === "asc" ? "ascending" : "descending" : "none");
        var hasFilter = filters.some(function(f) {
          return f.column === col;
        });
        th.classList.toggle("has-filter", hasFilter);
        if (th.__filterBtn) th.__filterBtn.classList.toggle("th-btn--active", hasFilter);
      });
    }
    renderHeader();
    headerTable.appendChild(thead);
    function filterLabel(val, column) {
      if (val === null) return "(فارغ)";
      if (typeof val === "bigint" || typeof val === "number" || typeof val === "boolean") return formatCell(val, column);
      return String(val);
    }
    function toggleFilterMenu(column, anchorEl) {
      var wasOpenFor = state.activeFilterMenu && state.activeFilterMenu.__column;
      closeFillMenu();
      closeFilterMenu();
      if (wasOpenFor === column) return;
      var uniqueValues = [];
      var seen = new Map;
      var hasBlanks = false;
      (state.filterRows.length ? state.filterRows : state.rows).forEach(function(row) {
        if (!row || row.__pageBreak || row.isGrandTotal || row.isSubtotal) return;
        var v = row[column];
        if (util.isBlank(v)) {
          hasBlanks = true;
          return;
        }
        if (!seen.has(v)) {
          seen.set(v, true);
          uniqueValues.push(v);
        }
      });
      uniqueValues.sort(function(a, b) {
        if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : a > b ? 1 : 0;
        if (typeof a === "number" && typeof b === "number") return a - b;
        return util.collatorAr().compare(String(a), String(b));
      });
      var optionValues = uniqueValues.slice();
      if (hasBlanks) optionValues.push(null);
      var activeFilter = null;
      if (opts.queryState && opts.queryState.filters) {
        activeFilter = opts.queryState.filters.filter(function(f) {
          return f.column === column && f.kind === "text-checklist";
        })[0];
      }
      var activeValues = activeFilter ? activeFilter.values : optionValues.slice();
      var menu = el("div", {
        class: "panel-2 fill-menu filter-menu-open",
        style: "position:fixed; z-index:95; max-height:320px; width:240px; display:flex; flex-direction:column; padding:6px;"
      });
      menu.__column = column;
      var checkboxes = [];
      var itemEls = [];
      function emitChange() {
        var selected = checkboxes.filter(function(b) {
          return b.checked;
        }).map(function(b) {
          return b.__value;
        });
        if (opts.onFilterChange) opts.onFilterChange(column, selected, optionValues.length);
      }
      if (optionValues.length > 8) {
        var findInput = el("input", {
          class: "input",
          type: "search",
          placeholder: "بحث في القيم…",
          style: "height:32px; margin-bottom:6px; flex:none;"
        });
        findInput.addEventListener("input", function() {
          var q = PH.normalize.arabicNormalize(findInput.value);
          itemEls.forEach(function(item) {
            item.style.display = !q || item.__norm.indexOf(q) !== -1 ? "" : "none";
          });
        });
        menu.appendChild(findInput);
        setTimeout(function() {
          findInput.focus();
        }, 0);
      }
      if (optionValues.length > 1) {
        var headerRow = el("div", {
          class: "row",
          style: "gap:var(--sp-1); padding:0 2px 6px; border-bottom:1px solid var(--line); margin-bottom:4px; flex:none;"
        });
        var selectAllBtn = el("button", {
          class: "btn btn--tertiary",
          type: "button",
          style: "font-size:var(--fs-caption);"
        }, [ text("تحديد الكل") ]);
        selectAllBtn.addEventListener("click", function() {
          checkboxes.forEach(function(b) {
            b.checked = true;
          });
          emitChange();
        });
        var selectNoneBtn = el("button", {
          class: "btn btn--tertiary",
          type: "button",
          style: "font-size:var(--fs-caption);"
        }, [ text("إلغاء التحديد") ]);
        selectNoneBtn.addEventListener("click", function() {
          checkboxes.forEach(function(b) {
            b.checked = false;
          });
          emitChange();
        });
        headerRow.appendChild(selectAllBtn);
        headerRow.appendChild(selectNoneBtn);
        menu.appendChild(headerRow);
      }
      var list = el("div", {
        style: "overflow:auto; min-height:0;"
      });
      if (!optionValues.length) list.appendChild(el("div", {
        class: "fs-caption text-soft",
        style: "padding:8px 10px;"
      }, [ text("لا توجد قيم") ]));
      optionValues.forEach(function(val) {
        var checked = activeValues.indexOf(val) !== -1;
        var item = el("label", {
          class: "fill-menu__item"
        });
        var box = el("input", {
          type: "checkbox"
        });
        box.checked = checked;
        box.__value = val;
        checkboxes.push(box);
        var labelText = filterLabel(val, column);
        item.__norm = PH.normalize.arabicNormalize(labelText);
        item.appendChild(box);
        item.appendChild(el("span", {
          style: "overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
        }, [ text(labelText) ]));
        box.addEventListener("change", emitChange);
        itemEls.push(item);
        list.appendChild(item);
      });
      menu.appendChild(list);
      document.body.appendChild(menu);
      var MENU_POS = {
        margin: 6,
        gap: 4,
        fallbackWidth: 240,
        align: "start"
      };
      PH.popover.position(menu, anchorEl, MENU_POS);
      state.activeFilterMenu = menu;
      var popHandle = PH.popover.attach(menu, anchorEl, {
        onClose: closeFilterMenu,
        closeOnEscape: true,
        returnFocus: false,
        position: MENU_POS
      });
      menu.__cleanup = popHandle.cleanup;
    }
    function closeFilterMenu() {
      if (state.activeFilterMenu) {
        if (state.activeFilterMenu.__cleanup) state.activeFilterMenu.__cleanup();
        PH.popover.fadeOutAndRemove(state.activeFilterMenu);
        state.activeFilterMenu = null;
      }
    }
    var tbody = el("tbody");
    bodyTable.appendChild(tbody);
    scroller.appendChild(sizer);
    sizer.appendChild(bodyTable);
    headerWrap.appendChild(headerTable);
    root.appendChild(headerWrap);
    root.appendChild(scroller);
    container.innerHTML = "";
    container.appendChild(root);
    function toggleFillMenu(column, anchorEl) {
      var wasOpenFor = state.activeFillMenu && state.activeFillMenu.__column;
      closeFillMenu();
      closeFilterMenu();
      if (wasOpenFor === column) return;
      var isQuantity = state.quantityColumns.indexOf(column) !== -1;
      var menu = el("div", {
        class: "panel-2 fill-menu",
        style: "position:fixed; z-index:95;"
      });
      menu.__column = column;
      function makeItem(labelText, dir) {
        var item = el("button", {
          class: "fill-menu__item",
          type: "button",
          style: "width:100%; text-align:start;"
        }, [ text(labelText) ]);
        item.addEventListener("click", function() {
          runFillFromMenu(column, dir, isQuantity, menu);
        });
        return item;
      }
      menu.appendChild(el("div", {
        class: "fs-caption text-soft",
        style: "padding:4px 10px 6px;"
      }, [ text("ملء الفراغات — " + (cfg.COLUMN_LABELS[column] || column)) ]));
      menu.appendChild(makeItem("↓ من القيمة السابقة (لأسفل)", "down"));
      menu.appendChild(makeItem("↑ من القيمة التالية (لأعلى)", "up"));
      menu.appendChild(el("div", {
        class: "fs-caption text-faint",
        style: "padding:6px 10px 2px;"
      }, [ text("اختصار: Ctrl+D على خلية محددة") ]));
      document.body.appendChild(menu);
      var FILL_MENU_POS = {
        margin: 6,
        gap: 4,
        fallbackWidth: 220,
        align: "end"
      };
      PH.popover.position(menu, anchorEl, FILL_MENU_POS);
      state.activeFillMenu = menu;
      var popHandle = PH.popover.attach(menu, anchorEl, {
        onClose: closeFillMenu,
        closeOnEscape: true,
        returnFocus: false,
        position: FILL_MENU_POS
      });
      menu.__cleanup = popHandle.cleanup;
    }
    function closeFillMenu() {
      if (state.activeFillMenu) {
        if (state.activeFillMenu.__cleanup) state.activeFillMenu.__cleanup();
        PH.popover.fadeOutAndRemove(state.activeFillMenu);
        state.activeFillMenu = null;
      }
    }
    function runFillFromMenu(column, direction, isQuantity, menu) {
      if (isQuantity) {
        menu.innerHTML = "";
        var confirmBox = el("div", {
          class: "fill-confirm"
        }, [ text("ملء الكميات ينشئ حركات غير موجودة في المصدر.") ]);
        var confirmBtn = el("button", {
          class: "btn--secondary btn",
          type: "button",
          style: "height:28px;"
        }, [ text("تأكيد") ]);
        confirmBtn.addEventListener("click", function() {
          doFill(column, direction);
          closeFillMenu();
        });
        confirmBox.appendChild(confirmBtn);
        menu.appendChild(confirmBox);
        return;
      }
      doFill(column, direction);
      closeFillMenu();
    }
    function doFill(column, direction) {
      if (state.fillableColumns.indexOf(column) === -1) {
        if (opts.onToast) opts.onToast("لا يمكن ملء هذا العمود", false);
        return;
      }
      var rows = store.getSourceRows();
      var result = store.fillBlanks(rows, {
        column,
        direction,
        mode: "blanksOnly",
        boundaryColumn: "book",
        scopeRowIds: state.scopeRowIds
      });
      if (!result.filledCount) {
        if (opts.onToast) opts.onToast("لا توجد خلايا فارغة قابلة للملء في «" + (cfg.COLUMN_LABELS[column] || column) + "»", false);
        return;
      }
      store.setSourceRows(result.rows, "ملء الفراغات: " + (cfg.COLUMN_LABELS[column] || column));
      if (opts.onToast) opts.onToast("تم ملء " + result.filledCount + " خلية", true);
    }
    function setRows(rows, moreOpts) {
      state.rows = rows;
      if (moreOpts) {
        if (moreOpts.filterRows !== undefined) state.filterRows = moreOpts.filterRows;
        if (moreOpts.scopeRowIds !== undefined) state.scopeRowIds = moreOpts.scopeRowIds;
      }
      updateHeaderState();
      bodyTable.setAttribute("aria-rowcount", String(rows.length));
      sizer.style.height = rows.length * ROW_H + "px";
      renderWindow(true);
    }
    var lastFirstIdx = -1, lastLastIdx = -1, lastRowsRef = null;
    function renderWindow(force) {
      var scrollTop = scroller.scrollTop;
      var viewportH = scroller.clientHeight || 600;
      var firstIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - BUFFER_ROWS);
      var lastIdx = Math.min(state.rows.length, Math.ceil((scrollTop + viewportH) / ROW_H) + BUFFER_ROWS);
      if (!force && firstIdx === lastFirstIdx && lastIdx === lastLastIdx && state.rows === lastRowsRef) return;
      lastFirstIdx = firstIdx;
      lastLastIdx = lastIdx;
      lastRowsRef = state.rows;
      bodyTable.style.transform = "translateY(" + firstIdx * ROW_H + "px)";
      var frag = document.createDocumentFragment();
      for (let i = firstIdx; i < lastIdx; i++) {
        let row = state.rows[i];
        if (!row) continue;
        var kind = state.rowKind(row, i);
        var tr = el("tr", {
          style: "height:" + ROW_H + "px;",
          "aria-rowindex": String(i + 1),
          "data-row-id": row.id || "",
          "data-row-index": String(i)
        });
        if (kind === "page-break") {
          tr.className = "page-break-row";
          var pbTd = el("td", {
            colspan: String(state.columns.length)
          }, [ el("span", {
            class: "page-break-row__caption"
          }, [ text("نهاية الصفحة " + (row.__pageBreakPage || "")) ]) ]);
          tr.appendChild(pbTd);
          frag.appendChild(tr);
          continue;
        }
        if (opts.onRowEdit) tr.title = "نقر مزدوج للتعديل"; else if (opts.onRowDrilldown && row.sourceIds && row.sourceIds.length) tr.title = "نقر مزدوج لعرض الصفوف المصدرية";
        if (row.isGrandTotal) tr.classList.add("row-total"); else if (row.isSubtotal) tr.classList.add("row-subtotal");
        if (row.cumulative !== null && row.cumulative !== undefined) tr.classList.add("block-close");
        state.columns.forEach(function(col) {
          var val = row[col];
          var td = el("td", {
            "data-row-index": String(i),
            "data-col": col
          });
          if (col === "actions") {
            td.appendChild(el("button", {
              class: "btn btn--tertiary row-delete-btn",
              type: "button",
              "aria-label": "حذف الصف",
              "data-row-delete": "1"
            }, [ text("حذف") ]));
            tr.appendChild(td);
            return;
          }
          if (cfg.MONEY_COLUMNS[col]) td.classList.add("cell-num", "money"); else if (cfg.alignEnd(col, val)) td.classList.add("cell-num");
          if (col === "negativeStock" && val === true) td.classList.add("cell--alert");
          if (row.__filled && row.__filled[col]) {
            td.classList.add("cell--filled");
            td.title = "قيمة مملوءة تلقائيًا";
          }
          if (state.selection && state.selection.column === col && (state.selection.rowId ? row.id === state.selection.rowId : state.selection.rowIndex === i)) {
            state.selection.rowIndex = i;
            td.classList.add("cell--selected");
          }
          var display = formatCell(val, col);
          td.appendChild(text(display));
          if (display && display.length > 14) td.title = td.title || display;
          tr.appendChild(td);
        });
        frag.appendChild(tr);
      }
      tbody.textContent = "";
      tbody.appendChild(frag);
    }
    function rowAt(index) {
      return state.rows[index];
    }
    function activateRow(row) {
      if (!row || row.__pageBreak) return;
      if (opts.onRowEdit) opts.onRowEdit(row); else if (opts.onRowDrilldown && row.sourceIds && row.sourceIds.length) opts.onRowDrilldown(row.sourceIds);
    }
    tbody.addEventListener("dblclick", function(e) {
      if (e.target.closest && e.target.closest("[data-row-delete]")) return;
      var tr = e.target.closest && e.target.closest("tr[data-row-index]");
      if (!tr) return;
      activateRow(rowAt(Number(tr.getAttribute("data-row-index"))));
    });
    function setSelection(rowIndex, col, scrollIntoView) {
      var prev = state.selection;
      if (prev) {
        var prevTd = tbody.querySelector('td[data-row-index="' + prev.rowIndex + '"][data-col="' + prev.column + '"]');
        if (prevTd) prevTd.classList.remove("cell--selected");
      }
      var selRow = state.rows[rowIndex];
      state.selection = {
        rowIndex,
        rowId: selRow && selRow.id ? selRow.id : null,
        column: col
      };
      if (scrollIntoView) {
        var top = rowIndex * ROW_H;
        var viewH = scroller.clientHeight;
        if (top < scroller.scrollTop) scroller.scrollTop = top; else if (top + ROW_H > scroller.scrollTop + viewH) scroller.scrollTop = top + ROW_H - viewH;
        renderWindow(false);
      }
      var newTd = tbody.querySelector('td[data-row-index="' + rowIndex + '"][data-col="' + col + '"]');
      if (newTd) newTd.classList.add("cell--selected");
      container.focus({
        preventScroll: true
      });
    }
    tbody.addEventListener("click", function(e) {
      var deleteBtn = e.target.closest && e.target.closest("[data-row-delete]");
      if (deleteBtn) {
        e.stopPropagation();
        var deleteTd = deleteBtn.closest("td[data-row-index]");
        if (deleteTd && opts.onRowDelete) {
          var delRow = state.rows[Number(deleteTd.getAttribute("data-row-index"))];
          if (delRow) opts.onRowDelete(delRow);
        }
        return;
      }
      var td = e.target.closest && e.target.closest("td[data-col]");
      if (!td || !tbody.contains(td)) return;
      setSelection(Number(td.getAttribute("data-row-index")), td.getAttribute("data-col"), false);
    });
    var rafPending = false;
    scroller.addEventListener("scroll", function() {
      headerWrap.scrollLeft = scroller.scrollLeft;
      if (rafPending) return;
      rafPending = true;
      window.requestAnimationFrame(function() {
        rafPending = false;
        renderWindow(false);
      });
    }, {
      passive: true
    });
    function nextDataIndex(from, step) {
      var i = from + step;
      while (i >= 0 && i < state.rows.length) {
        if (state.rowKind(state.rows[i], i) !== "page-break") return i;
        i += step;
      }
      return from;
    }
    function handleKeys(e) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        if (state.selection && state.selection.column) doFill(state.selection.column, e.shiftKey ? "up" : "down");
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var sel = state.selection;
      if (!sel) return;
      var colIdx = state.columns.indexOf(sel.column);
      if (colIdx === -1) return;
      var rtl = getComputedStyle(root).direction === "rtl";
      var handled = true;
      if (e.key === "ArrowDown") setSelection(nextDataIndex(sel.rowIndex, 1), sel.column, true); else if (e.key === "ArrowUp") setSelection(nextDataIndex(sel.rowIndex, -1), sel.column, true); else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        var forward = e.key === "ArrowLeft" === rtl;
        var nextCol = Math.max(0, Math.min(state.columns.length - 1, colIdx + (forward ? 1 : -1)));
        setSelection(sel.rowIndex, state.columns[nextCol], true);
      } else if (e.key === "Home") setSelection(nextDataIndex(-1, 1), sel.column, true); else if (e.key === "End") setSelection(nextDataIndex(state.rows.length, -1), sel.column, true); else if (e.key === "PageDown" || e.key === "PageUp") {
        var jump = Math.max(1, Math.floor(scroller.clientHeight / ROW_H) - 1) * (e.key === "PageDown" ? 1 : -1);
        var target = Math.max(0, Math.min(state.rows.length - 1, sel.rowIndex + jump));
        if (state.rowKind(state.rows[target], target) === "page-break") target = nextDataIndex(target, jump > 0 ? 1 : -1);
        setSelection(target, sel.column, true);
      } else if (e.key === "Enter") activateRow(rowAt(sel.rowIndex)); else if (e.key === "Escape") {
        var td = tbody.querySelector(".cell--selected");
        if (td) td.classList.remove("cell--selected");
        state.selection = null;
      } else handled = false;
      if (handled) e.preventDefault();
    }
    container.addEventListener("keydown", handleKeys);
    function syncHeaderGutter() {
      var sbw = scroller.offsetWidth - scroller.clientWidth;
      headerWrap.style.paddingInlineEnd = (sbw > 0 ? sbw : 0) + "px";
      renderWindow(false);
    }
    window.requestAnimationFrame(syncHeaderGutter);
    window.addEventListener("resize", syncHeaderGutter);
    return {
      setRows,
      destroy: function() {
        closeFillMenu();
        closeFilterMenu();
        container.removeEventListener("keydown", handleKeys);
        window.removeEventListener("resize", syncHeaderGutter);
      }
    };
  }
  return {
    createTable,
    formatCell
  };
}();
