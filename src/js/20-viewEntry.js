PH.viewEntry = function() {
  var cfg = PH.config;
  var norm = PH.normalize;
  var store = PH.store;
  var reports = PH.reports;
  var el = PH.dom.el;
  var text = PH.dom.text;
  var lastUsed = {
    budget: null,
    shift: null,
    dispense: null,
    book: ""
  };
  function nextSerial(rows, book) {
    var max = 0;
    rows.forEach(function(r) {
      if (r.book === book && typeof r.serial === "number" && r.serial > max) max = r.serial;
    });
    return max + 1;
  }
  function findDuplicate(rows, candidate) {
    if (!candidate.name) return null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (norm.matchesIgnoringArticle(r.name || "", candidate.name || "") && (r.book || "") === (candidate.book || "") && (r.unit || "") === (candidate.unit || "") && (r.month || "") === (candidate.month || "")) {
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
    if (!q) return [];
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
  function valueOrEmpty(v) {
    return v === null || v === undefined ? "" : String(v);
  }
  function createGuidedForm(container, opts) {
    opts = opts || {};
    var defaults = opts.defaults || {};
    var state = {
      budget: defaults.budget || lastUsed.budget,
      shift: defaults.shift || lastUsed.shift,
      dispense: defaults.dispense || lastUsed.dispense,
      month: opts.defaultMonth || ""
    };
    var root = el("div", {
      class: "entry-form"
    });
    function step(num, title) {
      var box = el("section", {
        class: "entry-form__step"
      }, [ el("div", {
        class: "entry-form__step-title"
      }, [ el("span", {}, [ text(String(num)) ]), text(title) ]) ]);
      root.appendChild(box);
      return box;
    }
    function field(labelText, control) {
      return el("div", {
        class: "field"
      }, [ el("label", {}, [ text(labelText) ]), control ]);
    }
    var segmentedGroups = {};
    function segmented(labelText, key, options) {
      var group = el("div", {
        class: "row row--wrap",
        role: "radiogroup",
        "aria-label": labelText,
        style: "gap:6px;"
      });
      options.forEach(function(opt) {
        var btn = el("button", {
          class: "pill",
          type: "button",
          role: "radio",
          "aria-pressed": state[key] === opt ? "true" : "false",
          "aria-checked": state[key] === opt ? "true" : "false"
        }, [ text(opt) ]);
        btn.addEventListener("click", function() {
          state[key] = opt;
          Array.prototype.forEach.call(group.children, function(c) {
            c.setAttribute("aria-pressed", c === btn ? "true" : "false");
            c.setAttribute("aria-checked", c === btn ? "true" : "false");
          });
          group.classList.remove("input--invalid");
          errorBox.textContent = "";
        });
        group.appendChild(btn);
      });
      segmentedGroups[key] = group;
      return field(labelText, group);
    }
    var s1 = step(1, "أين؟");
    s1.appendChild(segmented(cfg.DIMENSION_LABELS.budget, "budget", cfg.DIMENSIONS.budget));
    s1.appendChild(segmented(cfg.DIMENSION_LABELS.shift, "shift", cfg.DIMENSIONS.shift));
    s1.appendChild(segmented(cfg.DIMENSION_LABELS.dispense, "dispense", cfg.DIMENSIONS.dispense));
    var s2 = step(2, "ماذا؟");
    var nameInput = el("input", {
      class: "input",
      autocomplete: "off",
      placeholder: "اسم الصنف",
      "aria-autocomplete": "list"
    });
    var suggestBox = el("div", {
      class: "suggest-box",
      role: "listbox"
    });
    var nameField = field("الاسم *", nameInput);
    nameField.appendChild(suggestBox);
    s2.appendChild(nameField);
    var unitInput = el("input", {
      class: "input",
      placeholder: "مثال: 20 T"
    });
    var priceInput = el("input", {
      class: "input",
      inputmode: "decimal",
      placeholder: "0.00"
    });
    var groupInput = el("input", {
      class: "input",
      placeholder: "اختياري"
    });
    var grid1 = el("div", {
      class: "entry-form__grid"
    }, [ field("الوحدة", unitInput), field("السعر *", priceInput) ]);
    s2.appendChild(grid1);
    s2.appendChild(field("المجموعة", groupInput));
    var bookInput = el("input", {
      class: "input",
      placeholder: "مثال: A"
    });
    bookInput.value = lastUsed.book || "";
    var serialInput = el("input", {
      class: "input",
      readonly: "readonly",
      tabindex: "-1"
    });
    var monthInput = el("input", {
      class: "input",
      placeholder: "2026-01"
    });
    monthInput.value = state.month;
    monthInput.addEventListener("input", function() {
      state.month = monthInput.value;
    });
    s2.appendChild(el("div", {
      class: "entry-form__grid"
    }, [ field("دفتر", bookInput), field("الرقم (تلقائي)", serialInput) ]));
    s2.appendChild(field("الشهر", monthInput));
    var duplicateNotice = el("div", {
      class: "fill-confirm",
      style: "display:none;"
    });
    s2.appendChild(duplicateNotice);
    var s3 = step(3, "كم؟");
    var dispensedInput = el("input", {
      class: "input input--lg",
      inputmode: "decimal",
      placeholder: "المنصرف"
    });
    var receivedInput = el("input", {
      class: "input",
      inputmode: "decimal",
      placeholder: "0"
    });
    var balanceInput = el("input", {
      class: "input",
      inputmode: "decimal",
      placeholder: "اختياري"
    });
    s3.appendChild(field("المنصرف *", dispensedInput));
    s3.appendChild(el("div", {
      class: "entry-form__grid"
    }, [ field("الوارد", receivedInput), field("الرصيد", balanceInput) ]));
    var liveValueNum = el("div", {
      class: "num"
    });
    var liveValue = el("div", {
      class: "entry-form__value",
      "aria-live": "polite"
    }, [ el("div", {
      class: "fs-caption"
    }, [ text("قيمة المنصرف") ]), liveValueNum ]);
    s3.appendChild(liveValue);
    var errorBox = el("div", {
      class: "entry-form__error",
      role: "alert"
    });
    root.appendChild(errorBox);
    function zeroValue() {
      return PH.blocks.formatScaled(0n, cfg.decimalsForColumn("dispensedValue"), true);
    }
    liveValueNum.textContent = zeroValue();
    function updateLiveValue() {
      var d = norm.parseNumber(dispensedInput.value) || 0;
      var p = norm.parseNumber(priceInput.value) || 0;
      liveValueNum.textContent = PH.blocks.formatScaled(reports.scaleValueOf(d, p), cfg.decimalsForColumn("dispensedValue"), true);
    }
    function refreshSerial() {
      serialInput.value = String(nextSerial(store.getSourceRows(), bookInput.value.trim()));
    }
    refreshSerial();
    dispensedInput.addEventListener("input", updateLiveValue);
    priceInput.addEventListener("input", updateLiveValue);
    function clearSuggestions() {
      suggestBox.innerHTML = "";
    }
    nameInput.addEventListener("input", function() {
      var matches = autocompleteNames(store.getSourceRows(), nameInput.value);
      clearSuggestions();
      matches.forEach(function(m) {
        var item = el("div", {
          class: "fill-menu__item",
          role: "option"
        }, [ el("span", {
          style: "flex:1;"
        }, [ text(m.name) ]), el("span", {
          class: "fs-caption text-faint"
        }, [ text([ m.unit, m.price !== null && m.price !== undefined ? String(m.price) : "" ].filter(Boolean).join(" · ")) ]) ]);
        item.addEventListener("mousedown", function(e) {
          e.preventDefault();
          nameInput.value = m.name;
          unitInput.value = valueOrEmpty(m.unit);
          priceInput.value = valueOrEmpty(m.price);
          groupInput.value = valueOrEmpty(m.group);
          clearSuggestions();
          updateLiveValue();
          checkDuplicate();
          dispensedInput.focus();
        });
        suggestBox.appendChild(item);
      });
    });
    nameInput.addEventListener("blur", function() {
      setTimeout(clearSuggestions, 120);
      checkDuplicate();
    });
    nameInput.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && suggestBox.children.length) {
        e.stopPropagation();
        clearSuggestions();
      }
    });
    function checkDuplicate() {
      var dup = findDuplicate(store.getSourceRows(), {
        name: nameInput.value.trim(),
        book: bookInput.value.trim(),
        unit: unitInput.value.trim(),
        month: state.month.trim()
      });
      if (dup) {
        duplicateNotice.style.display = "flex";
        duplicateNotice.textContent = "هذا الصنف مسجّل بالفعل في دفتر " + (dup.row.book || "—") + " رقم " + (dup.row.serial || "—") + ". سيُضاف صف جديد منفصل.";
      } else {
        duplicateNotice.style.display = "none";
      }
    }
    bookInput.addEventListener("input", function() {
      refreshSerial();
      checkDuplicate();
    });
    unitInput.addEventListener("change", checkDuplicate);
    function flagInvalid(input) {
      input.classList.add("input--invalid");
      input.addEventListener("input", function once() {
        input.classList.remove("input--invalid");
        input.removeEventListener("input", once);
      });
    }
    function validate() {
      var missing = [];
      [ "budget", "shift", "dispense" ].forEach(function(k) {
        if (!state[k]) {
          missing.push(cfg.DIMENSION_LABELS[k]);
          segmentedGroups[k].classList.add("input--invalid");
        }
      });
      if (!nameInput.value.trim()) {
        missing.push("الاسم");
        flagInvalid(nameInput);
      }
      var price = norm.parseNumber(priceInput.value);
      if (price === null || price < 0) {
        missing.push("السعر");
        flagInvalid(priceInput);
      }
      var dispensed = norm.parseNumber(dispensedInput.value);
      if (dispensed === null || dispensed < 0) {
        missing.push("المنصرف");
        flagInvalid(dispensedInput);
      }
      [ receivedInput, balanceInput ].forEach(function(inp) {
        if (inp.value.trim() && norm.parseNumber(inp.value) === null) {
          missing.push(inp === receivedInput ? "الوارد" : "الرصيد");
          flagInvalid(inp);
        }
      });
      if (missing.length) {
        errorBox.textContent = "أكمل الحقول: " + missing.join("، ");
        return false;
      }
      errorBox.textContent = "";
      return true;
    }
    function commit() {
      if (!validate()) return;
      var dispensed = norm.parseNumber(dispensedInput.value);
      var price = norm.parseNumber(priceInput.value);
      var month = state.month.trim() ? norm.parseMonthValue(state.month.trim()) : null;
      var book = bookInput.value.trim();
      var candidate = {
        budget: state.budget,
        shift: state.shift,
        dispense: state.dispense,
        name: nameInput.value.trim(),
        unit: unitInput.value.trim() || null,
        price,
        group: groupInput.value.trim() || null,
        book: book || null,
        serial: norm.parseInteger(serialInput.value),
        dispensed,
        dispensedValue: reports.scaleValueOf(dispensed, price),
        received: norm.parseNumber(receivedInput.value),
        balance: norm.parseNumber(balanceInput.value),
        month,
        __raw: {}
      };
      lastUsed.budget = state.budget;
      lastUsed.shift = state.shift;
      lastUsed.dispense = state.dispense;
      lastUsed.book = book;
      var nextRows = store.getSourceRows().concat([ candidate ]);
      store.setSourceRows(nextRows, "إضافة صف: " + candidate.name);
      [ nameInput, unitInput, priceInput, groupInput, dispensedInput, receivedInput, balanceInput ].forEach(function(i) {
        i.value = "";
      });
      duplicateNotice.style.display = "none";
      refreshSerial();
      liveValueNum.textContent = zeroValue();
      nameInput.focus();
      if (opts.onCommit) opts.onCommit(candidate);
    }
    root.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && e.target && e.target.tagName === "INPUT" && !e.isComposing) {
        if (e.target === nameInput && suggestBox.children.length) {
          var first = suggestBox.firstChild;
          if (first) {
            first.dispatchEvent(new MouseEvent("mousedown", {
              bubbles: true,
              cancelable: true
            }));
            e.preventDefault();
            return;
          }
        }
        e.preventDefault();
        commit();
      }
    });
    container.appendChild(root);
    return {
      root,
      commit,
      focus: function() {
        nameInput.focus();
      }
    };
  }
  return {
    createGuidedForm,
    nextSerial,
    findDuplicate,
    autocompleteNames
  };
}();
