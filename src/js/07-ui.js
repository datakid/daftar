PH.ui = function() {
  var el = PH.dom.el;
  var text = PH.dom.text;
  function field(labelText, controlEl) {
    return el("div", {
      class: "field"
    }, [ el("label", {}, [ text(labelText) ]), controlEl ]);
  }
  function pillRow(items, current, onPick) {
    var row = el("div", {
      class: "row",
      style: "gap:var(--sp-1); flex-wrap:wrap;"
    });
    items.forEach(function(item) {
      var isObj = item && typeof item === "object";
      var value = isObj ? item.value : item;
      var label = isObj ? item.label : String(item);
      var btn = el("button", {
        class: "pill",
        type: "button",
        "aria-pressed": current === value ? "true" : "false"
      }, [ text(label) ]);
      btn.addEventListener("click", function() {
        onPick(value);
      });
      row.appendChild(btn);
    });
    return row;
  }
  function switchRow(labelText, checked, onToggle) {
    var sw = el("div", {
      class: "switch",
      role: "switch",
      tabindex: "0",
      "aria-checked": checked ? "true" : "false"
    }, [ el("span", {
      class: "switch__track"
    }), el("span", {}, [ text(labelText) ]) ]);
    sw.addEventListener("click", function() {
      onToggle(!checked);
    });
    return sw;
  }
  function drawerSection(titleText) {
    var sec = el("div", {
      class: "drawer__section"
    });
    if (titleText) sec.appendChild(el("div", {
      class: "fs-body",
      style: "font-weight:600;"
    }, [ text(titleText) ]));
    return sec;
  }
  function section(title) {
    var wrap = el("div", {
      style: "display:flex; flex-direction:column; gap:var(--sp-2);"
    });
    wrap.appendChild(el("div", {
      class: "fs-caption",
      style: "font-weight:600; text-transform:uppercase; letter-spacing:.02em; color:var(--text-soft);"
    }, [ text(title) ]));
    return wrap;
  }
  function select(options, current, onChange, opts) {
    opts = opts || {};
    var popover = PH.popover;
    var currentValue = current;
    var openState = null;
    var trigger = el("button", {
      class: "select select--dropdown",
      type: "button",
      role: "combobox",
      "aria-haspopup": "listbox",
      "aria-expanded": "false"
    });
    var labelSpan = el("span", {
      class: "select__label"
    });
    trigger.appendChild(labelSpan);
    trigger.appendChild(PH.dom.trustedSvg("span", {
      class: "select__chevron",
      "aria-hidden": "true"
    }, '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"></path></svg>'));
    function labelFor(value) {
      for (var i = 0; i < options.length; i++) if (options[i].value === value) return options[i].label;
      return opts.placeholder || "";
    }
    function renderLabel() {
      labelSpan.textContent = labelFor(currentValue);
    }
    renderLabel();
    function closeMenu() {
      if (!openState) return;
      var s = openState;
      openState = null;
      s.cleanup();
      popover.fadeOutAndRemove(s.menu);
      document.removeEventListener("keydown", s.onMenuKey);
      trigger.setAttribute("aria-expanded", "false");
    }
    function pick(value) {
      currentValue = value;
      renderLabel();
      closeMenu();
      trigger.focus();
      onChange(value);
    }
    function openMenu() {
      if (PH.ui.__closeOpenDropdown) PH.ui.__closeOpenDropdown();
      var rows = [];
      var highlightIndex = Math.max(0, options.map(function(o) {
        return o.value;
      }).indexOf(currentValue));
      var menu = el("div", {
        class: "panel-2 glass command-palette",
        role: "listbox",
        style: "position:fixed; z-index:95; min-width:" + Math.max(160, trigger.offsetWidth) + "px; max-height:280px; overflow:auto; padding:var(--sp-1);"
      });
      function setHighlight(i) {
        highlightIndex = i;
        rows.forEach(function(row, idx) {
          row.classList.toggle("command-palette__item--sel", idx === highlightIndex);
          row.setAttribute("aria-selected", idx === highlightIndex ? "true" : "false");
        });
      }
      options.forEach(function(opt, idx) {
        var row = el("div", {
          role: "option",
          class: "command-palette__item"
        }, [ el("span", {}, [ text(opt.label) ]) ]);
        row.addEventListener("mouseenter", function() {
          setHighlight(idx);
        });
        row.addEventListener("mousedown", function(e) {
          e.preventDefault();
          pick(opt.value);
        });
        rows.push(row);
        menu.appendChild(row);
      });
      document.body.appendChild(menu);
      var posOpts = {
        margin: 8,
        gap: 4,
        fallbackWidth: Math.max(160, trigger.offsetWidth),
        align: "start"
      };
      popover.position(menu, trigger, posOpts);
      setHighlight(highlightIndex);
      trigger.setAttribute("aria-expanded", "true");
      function onMenuKey(e) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlight(Math.min(rows.length - 1, highlightIndex + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlight(Math.max(0, highlightIndex - 1));
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (options[highlightIndex]) pick(options[highlightIndex].value);
        }
      }
      document.addEventListener("keydown", onMenuKey);
      var handle = popover.attach(menu, trigger, {
        onClose: closeMenu,
        closeOnEscape: true,
        returnFocus: true,
        position: posOpts
      });
      openState = {
        cleanup: handle.cleanup,
        menu,
        onMenuKey
      };
      PH.ui.__closeOpenDropdown = closeMenu;
    }
    trigger.addEventListener("click", function() {
      if (openState) closeMenu(); else openMenu();
    });
    trigger.addEventListener("keydown", function(e) {
      if (openState) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
    });
    Object.defineProperty(trigger, "value", {
      get: function() {
        return currentValue;
      },
      set: function(v) {
        currentValue = v;
        renderLabel();
      }
    });
    return trigger;
  }
  return {
    field,
    pillRow,
    switchRow,
    drawerSection,
    section,
    select
  };
}();


