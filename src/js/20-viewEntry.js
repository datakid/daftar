PH.viewEntry = function() {
  var cfg = PH.config;
  var norm = PH.normalize;
  var store = PH.store;
  var reports = PH.reports;
  var el = PH.dom.el;
  var text = PH.dom.text;
  function nextSerial(rows, book) {
    var max = 0;
    rows.forEach(function(r) {
      if (r.book === book && typeof r.serial === "number" && r.serial > max) max = r.serial;
    });
    return max + 1;
  }
  function findDuplicate(rows, candidate) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (norm.matchesIgnoringArticle(r.name || "", candidate.name || "") && r.book === candidate.book && r.unit === candidate.unit && r.month === candidate.month) {
        return {
          row: r,
          index: i
        };
      }
    }
    return null;
  }
  function autocompleteNames(rows, queryText) {
    if (!queryText) return [];
    var q = norm.arabicNormalize(queryText);
    var seen = Object.create(null);
    var prefixMatches = [];
    var otherMatches = [];
    rows.forEach(function(r) {
      if (!r.name || seen[r.name]) return;
      var nf = norm.arabicNormalize(r.name);
      var idx = nf.indexOf(q);
      if (idx === -1) return;
      seen[r.name] = true;
      var entry = {
        name: r.name,
        unit: r.unit,
        price: r.price,
        group: r.group
      };
      if (idx === 0) prefixMatches.push(entry); else otherMatches.push(entry);
    });
    return prefixMatches.concat(otherMatches).slice(0, 8);
  }
  function createGuidedForm(container, opts) {
    var state = {
      budget: null,
      shift: null,
      dispense: null,
      name: "",
      unit: "",
      price: null,
      group: "",
      book: "",
      serial: null,
      dispensed: null,
      received: 0,
      month: opts && opts.defaultMonth || ""
    };
    var root = el("div", {
      class: "panel-2 stack",
      style: "width:360px;"
    });
    function segmented(labelText, key, options) {
      var wrap = el("div", {
        class: "field"
      }, [ el("label", {}, [ text(labelText) ]) ]);
      var group = el("div", {
        class: "row row--wrap"
      });
      options.forEach(function(opt) {
        var btn = el("button", {
          class: "pill",
          type: "button"
        }, [ text(opt) ]);
        btn.addEventListener("click", function() {
          state[key] = opt;
          Array.prototype.forEach.call(group.children, function(c) {
            c.setAttribute("aria-pressed", "false");
          });
          btn.setAttribute("aria-pressed", "true");
        });
        group.appendChild(btn);
      });
      wrap.appendChild(group);
      return wrap;
    }
    root.appendChild(el("div", {
      class: "fs-title"
    }, [ text("أين؟") ]));
    root.appendChild(segmented(cfg.DIMENSION_LABELS.budget, "budget", cfg.DIMENSIONS.budget));
    root.appendChild(segmented(cfg.DIMENSION_LABELS.shift, "shift", cfg.DIMENSIONS.shift));
    root.appendChild(segmented(cfg.DIMENSION_LABELS.dispense, "dispense", cfg.DIMENSIONS.dispense));
    root.appendChild(el("div", {
      class: "fs-title",
      style: "margin-top:var(--sp-4);"
    }, [ text("ماذا؟") ]));
    var nameField = el("div", {
      class: "field"
    }, [ el("label", {}, [ text("الاسم") ]) ]);
    var nameInput = el("input", {
      class: "input",
      autocomplete: "off"
    });
    var suggestBox = el("div", {
      class: "stack",
      style: "gap:0;"
    });
    nameField.appendChild(nameInput);
    nameField.appendChild(suggestBox);
    root.appendChild(nameField);
    var unitInput = el("input", {
      class: "input",
      placeholder: "الوحدة"
    });
    var priceInput = el("input", {
      class: "input",
      placeholder: "السعر"
    });
    var groupInput = el("input", {
      class: "input",
      placeholder: "المجموعة"
    });
    root.appendChild(el("div", {
      class: "field"
    }, [ el("label", {}, [ text("الوحدة") ]), unitInput ]));
    root.appendChild(el("div", {
      class: "field"
    }, [ el("label", {}, [ text("السعر") ]), priceInput ]));
    root.appendChild(el("div", {
      class: "field"
    }, [ el("label", {}, [ text("المجموعة") ]), groupInput ]));
    var bookInput = el("input", {
      class: "input",
      placeholder: "دفتر"
    });
    var serialInput = el("input", {
      class: "input",
      placeholder: "الرقم",
      readonly: "readonly"
    });
    var monthInput = el("input", {
      class: "input",
      placeholder: "الشهر (مثال: 2026-01)"
    });
    monthInput.value = state.month;
    monthInput.addEventListener("input", function() {
      state.month = monthInput.value;
    });
    root.appendChild(el("div", {
      class: "field"
    }, [ el("label", {}, [ text("الشهر") ]), monthInput ]));
    root.appendChild(el("div", {
      class: "field"
    }, [ el("label", {}, [ text("دفتر") ]), bookInput ]));
    root.appendChild(el("div", {
      class: "field"
    }, [ el("label", {}, [ text("الرقم") ]), serialInput ]));
    var duplicateNotice = el("div", {
      class: "fs-caption",
      style: "color:var(--warn); display:none;"
    });
    root.appendChild(duplicateNotice);
    root.appendChild(el("div", {
      class: "fs-title",
      style: "margin-top:var(--sp-4);"
    }, [ text("كم؟") ]));
    var dispensedInput = el("input", {
      class: "input input--lg",
      placeholder: "المنصرف"
    });
    var receivedInput = el("input", {
      class: "input",
      placeholder: "الوارد"
    });
    root.appendChild(el("div", {
      class: "field"
    }, [ el("label", {}, [ text("المنصرف") ]), dispensedInput ]));
    root.appendChild(el("div", {
      class: "field"
    }, [ el("label", {}, [ text("الوارد") ]), receivedInput ]));
    var liveValue = el("div", {
      class: "fs-display num",
      style: "color:var(--brass); text-align:center; padding:var(--sp-4);"
    }, [ text(PH.blocks.formatScaled(0n, cfg.decimalsForColumn("dispensedValue"), true)) ]);
    root.appendChild(liveValue);
    function updateLiveValue() {
      var d = norm.parseNumber(dispensedInput.value) || 0;
      var p = norm.parseNumber(priceInput.value) || 0;
      liveValue.textContent = PH.blocks.formatScaled(reports.scaleValueOf(d, p), cfg.decimalsForColumn("dispensedValue"), true);
    }
    dispensedInput.addEventListener("input", updateLiveValue);
    priceInput.addEventListener("input", updateLiveValue);
    nameInput.addEventListener("input", function() {
      var rows = store.getSourceRows();
      var matches = autocompleteNames(rows, nameInput.value);
      suggestBox.innerHTML = "";
      matches.forEach(function(m) {
        var item = el("div", {
          class: "fill-menu__item"
        }, [ text(m.name) ]);
        item.addEventListener("click", function() {
          nameInput.value = m.name;
          unitInput.value = m.unit || "";
          priceInput.value = m.price || "";
          groupInput.value = m.group || "";
          suggestBox.innerHTML = "";
          updateLiveValue();
        });
        suggestBox.appendChild(item);
      });
    });
    function checkDuplicate() {
      var rows = store.getSourceRows();
      var dup = findDuplicate(rows, {
        name: nameInput.value,
        book: bookInput.value,
        unit: unitInput.value,
        month: state.month || undefined
      });
      if (dup) {
        duplicateNotice.style.display = "block";
        duplicateNotice.textContent = "هذا الصنف مسجّل في دفتر " + dup.row.book + " رقم " + dup.row.serial + " — تعديل الموجود أم إضافة صف جديد؟";
      } else {
        duplicateNotice.style.display = "none";
      }
    }
    nameInput.addEventListener("blur", checkDuplicate);
    bookInput.addEventListener("input", function() {
      var rows = store.getSourceRows();
      serialInput.value = nextSerial(rows, bookInput.value);
      checkDuplicate();
    });
    var commitBtn = el("button", {
      class: "btn btn--primary"
    }, [ text("إضافة") ]);
    commitBtn.addEventListener("click", function() {
      if (!nameInput.value || !state.budget || !state.shift || !state.dispense) return;
      var candidate = {
        budget: state.budget,
        shift: state.shift,
        dispense: state.dispense,
        name: nameInput.value,
        unit: unitInput.value,
        price: norm.parseNumber(priceInput.value),
        group: groupInput.value,
        book: bookInput.value,
        serial: norm.parseInteger(serialInput.value),
        dispensed: norm.parseNumber(dispensedInput.value),
        received: norm.parseNumber(receivedInput.value) || 0,
        month: state.month || undefined,
        __raw: {}
      };
      var rows = store.getSourceRows();
      var nextRows = rows.concat([ candidate ]);
      store.setSourceRows(nextRows, "إضافة صف: " + candidate.name);
      [ nameInput, unitInput, priceInput, groupInput, dispensedInput, receivedInput ].forEach(function(i) {
        i.value = "";
      });
      serialInput.value = nextSerial(nextRows, bookInput.value);
      liveValue.textContent = PH.blocks.formatScaled(0n, cfg.decimalsForColumn("dispensedValue"), true);
      if (opts.onCommit) opts.onCommit(candidate);
    });
    root.appendChild(commitBtn);
    container.appendChild(root);
    return {
      root
    };
  }
  return {
    createGuidedForm,
    nextSerial,
    findDuplicate,
    autocompleteNames
  };
}();


