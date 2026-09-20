PH.viewTable = function() {
  var cfg = PH.config;
  var store = PH.store;
  var util = PH.util;
  var el = PH.dom.el;
  var text = PH.dom.text;
  var ROW_H = function() {
    var fromCss = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-h"));
    return Number.isFinite(fromCss) && fromCss > 0 ? fromCss : 40;
  }();
  var BUFFER_ROWS = 12;
  function formatCell(value, columnKey) {
    return PH.format.cell(value, columnKey);
  }
  function createTable(container, opts) {
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
      scrollTop: 0,
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
      class: "grid-scroller",
      style: "overflow:auto; max-height:70vh; position:relative; scrollbar-gutter:stable;"
    });
    var sizer = el("div", {
      style: "position:relative;"
    });
    var headerWrap = el("div", {
      style: "overflow:hidden;"
    });
    var headerTable = el("table", {
      class: "grid"
    });
    var bodyTable = el("table", {
      class: "grid"
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
    function renderHeader() {
      thead.innerHTML = "";
      var headerRow = el("tr");
      state.columns.forEach(function(col) {
        var sortLevel = null, sortIdx = -1;
        if (opts.queryState && opts.queryState.sortLevels) {
          for (var si = 0; si < opts.queryState.sortLevels.length; si++) {
            if (opts.queryState.sortLevels[si].column === col) {
              sortLevel = opts.queryState.sortLevels[si];
              sortIdx = si;
              break;
            }
          }
        }
        var arrow = sortLevel ? sortLevel.direction === "asc" ? " ▲" : " ▼" : "";
        var order = sortLevel && opts.queryState.sortLevels.length > 1 ? String(sortIdx + 1) : "";
        var th = el("th", {
          scope: "col",
          tabindex: "0",
          role: "columnheader",
          "data-col": col,
          style: "position:relative; cursor:pointer;" + (cfg.isNumericColumn(col) ? " text-align:end;" : "")
        }, []);
        var thLabel = el("span", {
          style: "pointer-events:none;"
        }, [ text((cfg.COLUMN_LABELS[col] || col) + arrow + (order ? " " + order : "")) ]);
        th.appendChild(thLabel);
        th.__label = thLabel;
        thByCol[col] = th;
        th.setAttribute("aria-sort", sortLevel ? sortLevel.direction === "asc" ? "ascending" : "descending" : "none");
        var headerFilter = opts.queryState && opts.queryState.filters ? opts.queryState.filters.filter(function(filter) {
          return filter.column === col;
        })[0] : null;
        if (headerFilter) {
          th.classList.add("has-filter");
          th.title = "تصفية نشطة — انقر لفرز العمود";
        }
        function triggerSort(e) {
          if (opts.onSort) opts.onSort(col, e.shiftKey);
        }
        th.addEventListener("click", function(e) {
          if (e.target !== th) return;
          triggerSort(e);
        });
        th.addEventListener("keydown", function(e) {
          if (e.target !== th) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            triggerSort(e);
          }
        });
        var filterBtn = el("button", {
          class: "btn--icon",
          style: "position:absolute; inset-inline-start:2px; top:6px; width:20px; height:20px; background:transparent; color:var(--text-faint);",
          "aria-label": "تصفية " + (cfg.COLUMN_LABELS[col] || col),
          onclick: function(e) {
            e.stopPropagation();
            toggleFilterMenu(col, th);
          }
        }, [ text("▾") ]);
        if (col !== "actions" && col !== "id") th.appendChild(filterBtn);
        if (state.fillableColumns.indexOf(col) !== -1) {
          var menuBtn = el("button", {
            class: "btn--icon",
            style: "position:absolute; inset-inline-end:2px; top:6px; background:transparent; color:var(--text-faint);",
            "aria-label": "قائمة ملء الفراغات",
            onclick: function(e) {
              e.stopPropagation();
              toggleFillMenu(col, th);
            }
          }, [ text("⋮") ]);
          th.appendChild(menuBtn);
        }
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
    }
    function updateHeaderState() {
      var levels = opts.queryState && opts.queryState.sortLevels || [];
      var filters = opts.queryState && opts.queryState.filters || [];
      state.columns.forEach(function(col) {
        var th = thByCol[col];
        if (!th || !th.__label) return;
        var sortLevel = null, sortIdx = -1;
        for (var si = 0; si < levels.length; si++) {
          if (levels[si].column === col) {
            sortLevel = levels[si];
            sortIdx = si;
            break;
          }
        }
        var arrow = sortLevel ? sortLevel.direction === "asc" ? " ▲" : " ▼" : "";
        var order = sortLevel && levels.length > 1 ? " " + (sortIdx + 1) : "";
        th.__label.textContent = (cfg.COLUMN_LABELS[col] || col) + arrow + order;
        th.setAttribute("aria-sort", sortLevel ? sortLevel.direction === "asc" ? "ascending" : "descending" : "none");
        var hasFilter = filters.some(function(f) {
          return f.column === col;
        });
        th.classList.toggle("has-filter", hasFilter);
        if (hasFilter) th.title = "تصفية نشطة — انقر لفرز العمود"; else th.removeAttribute("title");
      });
    }
    renderHeader();
    headerTable.appendChild(thead);
    function toggleFilterMenu(column, anchorEl) {
      closeFillMenu();
      closeFilterMenu();
      var uniqueValues = [];
      var seen = Object.create(null);
      var hasBlanks = false;
      (state.filterRows.length ? state.filterRows : state.rows).forEach(function(row) {
        var v = row[column];
        if (util.isBlank(v)) {
          hasBlanks = true;
          return;
        }
        if (!seen[v]) {
          seen[v] = true;
          uniqueValues.push(v);
        }
      });
      uniqueValues.sort(function(a, b) {
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
        class: "panel-2 glass fill-menu filter-menu-open",
        style: "position:fixed; z-index:95; max-height:280px; overflow:auto;"
      });
      var checkboxes = [];
      function emitChange() {
        var selected = checkboxes.filter(function(b) {
          return b.checked;
        }).map(function(b) {
          return b.__value;
        });
        if (opts.onFilterChange) opts.onFilterChange(column, selected, optionValues.length);
      }
      if (optionValues.length > 1) {
        var headerRow = el("div", {
          class: "row",
          style: "gap:var(--sp-3); padding:4px var(--sp-2); border-bottom:.5px solid var(--line);"
        });
        var selectAllBtn = el("button", {
          class: "btn btn--tertiary",
          type: "button",
          style: "font-size:var(--fs-caption); padding:2px 6px; height:auto;"
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
          style: "font-size:var(--fs-caption); padding:2px 6px; height:auto;"
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
      optionValues.forEach(function(val) {
        var checked = activeValues.indexOf(val) !== -1;
        var item = el("label", {
          class: "fill-menu__item",
          style: "display:flex; gap:var(--sp-2);"
        });
        var box = el("input", {
          type: "checkbox"
        });
        box.checked = checked;
        box.__value = val;
        checkboxes.push(box);
        item.appendChild(box);
        item.appendChild(text(val === null ? "(فارغ)" : String(val)));
        box.addEventListener("change", emitChange);
        item.addEventListener("click", function(e) {
          if (e.target !== box) {
            e.preventDefault();
            box.checked = !box.checked;
            emitChange();
          }
        });
        menu.appendChild(item);
      });
      document.body.appendChild(menu);
      var ESCAPED_MENU_POS = {
        margin: 6,
        gap: 4,
        fallbackWidth: 220
      };
      PH.popover.position(menu, anchorEl, Object.assign({
        align: "start"
      }, ESCAPED_MENU_POS));
      state.activeFilterMenu = menu;
      var popHandle = PH.popover.attach(menu, anchorEl, {
        onClose: closeFilterMenu,
        closeOnEscape: false,
        anchorHit: function(a, t) {
          return t === a;
        },
        position: Object.assign({
          align: "start"
        }, ESCAPED_MENU_POS)
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
      closeFillMenu();
      closeFilterMenu();
      var isQuantity = state.quantityColumns.indexOf(column) !== -1;
      var menu = el("div", {
        class: "panel-2 glass fill-menu",
        style: "position:fixed; z-index:95;"
      });
      function makeItem(labelText, dir) {
        return el("div", {
          class: "fill-menu__item",
          onclick: function() {
            runFillFromMenu(column, dir, isQuantity, menu);
          }
        }, [ text(labelText) ]);
      }
      menu.appendChild(makeItem("ملء الفراغات ▾ لأسفل", "down"));
      menu.appendChild(makeItem("ملء الفراغات ▴ لأعلى", "up"));
      if (isQuantity) {
        menu.appendChild(el("div", {
          class: "fs-caption text-soft",
          style: "padding: var(--sp-2) var(--sp-3);"
        }, [ text("الكميات تتطلب تأكيدًا") ]));
      }
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
        anchorHit: function(a, t) {
          return t === a;
        },
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
      var rows = store.getSourceRows();
      var result = store.fillBlanks(rows, {
        column,
        direction,
        mode: "blanksOnly",
        boundaryColumn: "book",
        scopeRowIds: state.scopeRowIds
      });
      store.setSourceRows(result.rows, "ملء الفراغات: " + (cfg.COLUMN_LABELS[column] || column));
      if (opts.onToast) opts.onToast("تم ملء " + result.filledCount + " خلية · تراجع", true);
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
      renderWindow();
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
      tbody.innerHTML = "";
      for (let i = firstIdx; i < lastIdx; i++) {
        let row = state.rows[i];
        if (!row) continue;
        var kind = state.rowKind(row, i);
        var tr = el("tr", {
          style: "height:" + ROW_H + "px;",
          "aria-rowindex": String(i + 1),
          "data-row-id": row.id || ""
        });
        if (opts.onRowEdit) tr.addEventListener("dblclick", function() {
          opts.onRowEdit(row);
        }); else if (opts.onRowDrilldown && row.sourceIds && row.sourceIds.length) {
          tr.title = "نقر مزدوج لعرض الصفوف المصدرية";
          tr.addEventListener("dblclick", function() {
            opts.onRowDrilldown(row.sourceIds);
          });
        }
        if (kind === "page-break") {
          tr.className = "page-break-row";
          var pbTd = el("td", {
            colspan: String(state.columns.length)
          }, [ el("span", {
            class: "page-break-row__caption"
          }, [ text("نهاية الصفحة " + (row.__pageBreakPage || "")) ]) ]);
          tr.appendChild(pbTd);
          tbody.appendChild(tr);
          continue;
        }
        if (row.cumulative !== null && row.cumulative !== undefined) tr.classList.add("block-close");
        state.columns.forEach(function(col) {
          var val = row[col];
          var rowIndex = i;
          var td = el("td", {
            "data-row-index": String(rowIndex),
            "data-col": col
          });
          if (col === "actions") {
            td.appendChild(el("button", {
              class: "btn btn--tertiary",
              type: "button",
              "aria-label": "حذف الصف",
              "data-row-delete": "1"
            }, [ text("حذف") ]));
            tr.appendChild(td);
            return;
          }
          if (cfg.MONEY_COLUMNS[col]) td.classList.add("cell-num", "money"); else if (cfg.alignEnd(col, val)) td.classList.add("cell-num");
          if (row.__filled && row.__filled[col]) {
            td.classList.add("cell--filled");
            td.title = "مملوء";
          }
          if (state.selection && state.selection.column === col && (state.selection.rowId ? row.id === state.selection.rowId : state.selection.rowIndex === rowIndex)) {
            state.selection.rowIndex = rowIndex;
            td.classList.add("cell--selected");
          }
          var display;
          if (typeof val === "bigint") {
            display = val === null || val === undefined ? "" : PH.blocks.formatScaled(val, cfg.decimalsForColumn(col), true);
          } else {
            display = formatCell(val, col);
          }
          td.appendChild(text(display));
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
    }
    function setSelection(rowIndex, col) {
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
          var delRowIndex = Number(deleteTd.getAttribute("data-row-index"));
          var delRow = state.rows[delRowIndex];
          if (delRow) opts.onRowDelete(delRow);
        }
        return;
      }
      var td = e.target.closest && e.target.closest("td[data-col]");
      if (!td || !tbody.contains(td)) return;
      var rowIndex = Number(td.getAttribute("data-row-index"));
      var col = td.getAttribute("data-col");
      setSelection(rowIndex, col);
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
    }, { passive: true });
    function handleFillShortcut(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        if (state.selection && state.selection.column) {
          doFill(state.selection.column, e.shiftKey ? "up" : "down");
        }
      }
    }
    container.addEventListener("keydown", handleFillShortcut);
    function syncHeaderGutter() {
      var sbw = scroller.offsetWidth - scroller.clientWidth;
      headerWrap.style.paddingInlineEnd = (sbw > 0 ? sbw : 0) + "px";
    }
    window.requestAnimationFrame(syncHeaderGutter);
    window.addEventListener("resize", syncHeaderGutter);
    return {
      setRows,
      destroy: function() {
        closeFillMenu();
        closeFilterMenu();
        container.removeEventListener("keydown", handleFillShortcut);
        window.removeEventListener("resize", syncHeaderGutter);
      }
    };
  }
  return {
    createTable,
    formatCell
  };
}();


