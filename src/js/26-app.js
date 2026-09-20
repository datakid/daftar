PH.app = function() {
  var cfg = PH.config;
  var store = PH.store;
  var reports = PH.reports;
  var matrix = PH.matrix;
  var query = PH.query;
  var validate = PH.validate;
  var importer = PH.importer;
  var average = PH.average;
  var norm = PH.normalize;
  var blk = PH.blocks;
  var util = PH.util;
  var dialogStack = [];
  var state = {
    activeReportId: "movement",
    activeCombination: matrix.allValuesCombination(),
    activeMonth: null,
    dimensionGroups: {
      budget: null,
      shift: null,
      dispense: null
    },
    queryState: {
      filters: [],
      searchText: "",
      sortLevels: []
    },
    settingsOverrides: {
      global: {},
      report: {},
      linked: {}
    },
    settingsVersion: 0,
    sourceRowFilterIds: null,
    sourceRowFilterVersion: 0,
    applyToPrintExport: true,
    hiddenColumns: {},
    savedExportPlan: null,
    settingsPanelAdvancedOpen: false,
    userProfile: defaultUserProfile(),
    pharmacyProfile: defaultPharmacyProfile(),
    savedReportPresets: []
  };
  function defaultUserProfile() {
    return {
      displayName: ""
    };
  }
  function defaultPharmacyProfile() {
    return {
      name: "",
      code: "",
      logo: null,
      address: "",
      license: "",
      printNote: "",
      signatureRoles: []
    };
  }
  function saveUserProfile(fields) {
    var merged = Object.assign(defaultUserProfile(), state.userProfile, fields);
    state.userProfile = merged;
    return store.saveSettings("meta", "userProfile", merged);
  }
  function savePharmacyProfile(fields) {
    var merged = Object.assign(defaultPharmacyProfile(), state.pharmacyProfile, fields);
    state.pharmacyProfile = merged;
    return store.saveSettings("meta", "pharmacyProfile", merged);
  }
  function saveReportPresets(presets) {
    state.savedReportPresets = presets;
    return store.saveSettings("meta", "savedReportPresets", presets);
  }
  function getUserProfile() {
    return state.userProfile;
  }
  function getPharmacyProfile() {
    return state.pharmacyProfile;
  }
  function getSavedReportPresets() {
    return state.savedReportPresets;
  }
  function setSourceRowFilterIds(ids) {
    state.sourceRowFilterIds = ids;
    state.sourceRowFilterVersion++;
  }
  function resetQueryState() {
    state.queryState = {
      filters: [],
      searchText: "",
      sortLevels: []
    };
    setSourceRowFilterIds(null);
  }
  function el(tag, attrs, children) {
    return PH.dom.el(tag, attrs, children);
  }
  function text(t) {
    return PH.dom.text(t);
  }
  function $(id) {
    return document.getElementById(id);
  }
  function getFocusableIn(container) {
    var nodes = container.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
    return Array.prototype.slice.call(nodes).filter(function(e) {
      return e.getClientRects().length > 0;
    });
  }
  function setAppShellInert(inert) {
    var shell = document.querySelector(".app-shell");
    if (!shell) return;
    shell.inert = inert;
    if (inert) shell.setAttribute("aria-hidden", "true"); else shell.removeAttribute("aria-hidden");
  }
  function registerDialog(overlay, opts) {
    if (PH.ui.__closeOpenDropdown) PH.ui.__closeOpenDropdown();
    opts = opts || {};
    var triggerEl = document.activeElement;
    overlay.classList.add("dialog-overlay-fade");
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    setAppShellInert(true);
    dialogStack.push(overlay);
    function onKeydown(e) {
      if (e.key !== "Tab") return;
      var focusable = getFocusableIn(overlay);
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    overlay.addEventListener("keydown", onKeydown);
    var closed = false;
    overlay.__dialogClose = function() {
      if (closed) return;
      closed = true;
      overlay.removeEventListener("keydown", onKeydown);
      PH.popover.fadeOutAndRemove(overlay);
      var stackIdx = dialogStack.indexOf(overlay);
      if (stackIdx !== -1) dialogStack.splice(stackIdx, 1);
      if (!dialogStack.length) {
        document.body.classList.remove("modal-open");
        setAppShellInert(false);
      }
      if (opts.onClose) opts.onClose();
      if (triggerEl && typeof triggerEl.focus === "function" && document.body.contains(triggerEl)) triggerEl.focus();
    };
    var initial = opts.initialFocus || getFocusableIn(overlay)[0];
    if (initial) initial.focus();
  }
  function removeDialog(dialog) {
    if (dialog && dialog.__dialogClose) {
      dialog.__dialogClose();
      return;
    }
    if (dialog) {
      dialog.remove();
      var stackIdx = dialogStack.indexOf(dialog);
      if (stackIdx !== -1) dialogStack.splice(stackIdx, 1);
    }
    if (!dialogStack.length) {
      document.body.classList.remove("modal-open");
      setAppShellInert(false);
    }
  }
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var settled = false;
      function settle(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        removeDialog(overlay);
      }
      var overlay = el("div", {
        role: "dialog", "aria-modal": "true", "aria-label": opts.title || "تأكيد",
        style: "position:fixed; inset:0; z-index:95; background:var(--scrim); display:flex; align-items:center; justify-content:center; padding:var(--sp-4);"
      });
      var panel = el("div", { class: "panel-2 glass", style: "width:min(420px, 92vw); display:flex; flex-direction:column; gap:var(--sp-4);" });
      if (opts.title) panel.appendChild(el("div", { class: "fs-title", style: "font-weight:600;" }, [text(opts.title)]));
      panel.appendChild(el("div", { class: "fs-body", style: "color:var(--text-soft); line-height:1.6;" }, [text(opts.message)]));
      var actionsRow = el("div", { class: "row", style: "justify-content:flex-end; gap:var(--sp-2);" });
      (opts.actions || []).forEach(function (action) {
        var cls = action.variant === "primary" ? "btn btn--primary" : action.variant === "danger" ? "btn btn--primary btn--danger" : "btn btn--secondary";
        var btn = el("button", { class: cls, type: "button" }, [text(action.label)]);
        btn.addEventListener("click", function () { settle(action.value); });
        actionsRow.appendChild(btn);
      });
      panel.appendChild(actionsRow);
      overlay.appendChild(panel);
      registerDialog(overlay, {
        onClose: function () { settle(opts.cancelValue !== undefined ? opts.cancelValue : false); }
      });
    });
  }
  function resolveSettings(reportId) {
    return PH.settings.resolve(reportId, state.settingsOverrides);
  }
  function activeCombinationForFiltering(combination) {
    var scopedCombination = {};
    for (var key in combination) scopedCombination[key] = combination[key];
    if (state.activeMonth) scopedCombination.month = state.activeMonth;
    return scopedCombination;
  }
  function filterActiveRows(rows, combination) {
    return reports.filterToCombination(rows, activeCombinationForFiltering(combination));
  }
  function applySettingChange(scopeName, scopeKey, fields) {
    var sanitized = {};
    if (scopeName === "report") {
      for (var k in fields) sanitized[k] = PH.settings.sanitize(scopeKey, k, fields[k]);
    } else if (scopeName === "global") {
      Object.keys(fields).forEach(function(k) {
        sanitized[k] = PH.settings.sanitizeGlobal(k, fields[k]);
      });
    } else {
      sanitized = fields;
    }
    if (scopeName === "global") {
      var globalBucket = state.settingsOverrides.global;
      for (var gk in sanitized) globalBucket[gk] = sanitized[gk];
      state.settingsVersion++;
      return store.saveSettingsMulti("global", sanitized);
    }
    var bucket = state.settingsOverrides[scopeName];
    if (!bucket[scopeKey]) bucket[scopeKey] = {};
    for (var k2 in sanitized) bucket[scopeKey][k2] = sanitized[k2];
    state.settingsVersion++;
    return store.saveSettingsMulti(scopeName + ":" + scopeKey, sanitized);
  }
  function applyLinkedSettingChange(reportId, value) {
    state.settingsOverrides.linked[reportId] = value;
    state.settingsVersion++;
    store.saveSettings("meta", "linked", state.settingsOverrides.linked);
  }
  function resetSettingsScope(scopeName, scopeKey) {
    if (scopeName === "global") {
      state.settingsOverrides.global = {};
      state.settingsVersion++;
      return store.clearSettingsScope("global");
    }
    state.settingsOverrides[scopeName][scopeKey] = {};
    state.settingsVersion++;
    return store.clearSettingsScope(scopeName + ":" + scopeKey);
  }
  var GLOBAL_SETTING_FIELDS = [ "rowsPerPage", "showPageMarkers", "printOrientation" ];
  function applySettingsToAllReports(fields) {
    var promoted = {};
    GLOBAL_SETTING_FIELDS.forEach(function(f) {
      if (f in fields) promoted[f] = fields[f];
    });
    var promotedKeys = Object.keys(promoted);
    return applySettingChange("global", null, promoted).then(function() {
      var clears = [];
      Object.keys(cfg.REPORTS_BY_ID).forEach(function(rid) {
        var bucket = state.settingsOverrides.report[rid];
        if (!bucket) return;
        var hadAny = false;
        promotedKeys.forEach(function(f) {
          if (f in bucket) {
            delete bucket[f];
            hadAny = true;
          }
        });
        if (hadAny) clears.push(store.deleteSettingsFields("report:" + rid, promotedKeys));
      });
      state.settingsVersion++;
      return Promise.all(clears);
    });
  }
  function fieldWrap(labelText, controlEl) {
    return PH.ui.field(labelText, controlEl);
  }
  function presetRow(presets, currentValue, onPick) {
    return PH.ui.pillRow(presets, currentValue, onPick);
  }
  function checkPrintGeometry(rowsPerPage, orientation) {
    return PH.paginate.assertGeometry(Object.assign({}, PH.print.DEFAULT_GEO, {
      rowsPerPage,
      orientation
    }));
  }
  function fadeRefresh(el) {
    el.classList.remove("dialog-refresh-fade");
    void el.offsetWidth;
    el.classList.add("dialog-refresh-fade");
  }
  function resolvePrintTotalField(repDef) {
    return repDef.printTotalField;
  }
  function drawerSection(titleText) {
    return PH.ui.drawerSection(titleText);
  }
  function switchRow(labelText, checked, onToggle) {
    return PH.ui.switchRow(labelText, checked, onToggle);
  }
  function openPharmacyProfileDialog() {
    var draft = Object.assign(defaultPharmacyProfile(), state.pharmacyProfile);
    var userDraft = Object.assign(defaultUserProfile(), state.userProfile);
    var overlay = el("div", {
      class: "drawer-overlay",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "بيانات الصيدلية"
    });
    var drawer = el("div", {
      class: "drawer"
    });
    overlay.appendChild(drawer);
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) removeDialog(overlay);
    });
    var header = el("div", {
      class: "drawer__header"
    }, [ el("div", {
      class: "fs-title"
    }, [ text("بيانات الصيدلية والمستخدم") ]) ]);
    var closeBtn = el("button", {
      class: "btn btn--ghost btn--icon",
      type: "button",
      "aria-label": "إغلاق"
    }, [ text("✕") ]);
    closeBtn.addEventListener("click", function() {
      removeDialog(overlay);
    });
    header.appendChild(closeBtn);
    drawer.appendChild(header);
    var body = el("div", {
      class: "drawer__body"
    });
    drawer.appendChild(body);
    function persistPharmacy(fields) {
      Object.assign(draft, fields);
      savePharmacyProfile(fields);
    }
    function persistUser(fields) {
      Object.assign(userDraft, fields);
      saveUserProfile(fields);
    }
    var pharmSec = drawerSection("بيانات الصيدلية (تظهر في ترويسة الطباعة)");
    var nameInput = el("input", {
      class: "input",
      type: "text",
      placeholder: "اسم الصيدلية"
    });
    nameInput.value = draft.name || "";
    nameInput.addEventListener("change", function() {
      persistPharmacy({
        name: nameInput.value.trim()
      });
    });
    pharmSec.appendChild(fieldWrap("اسم الصيدلية", nameInput));
    var codeInput = el("input", {
      class: "input",
      type: "text",
      placeholder: "كود الصيدلية"
    });
    codeInput.value = draft.code || "";
    codeInput.addEventListener("change", function() {
      persistPharmacy({
        code: codeInput.value.trim()
      });
    });
    pharmSec.appendChild(fieldWrap("كود الصيدلية", codeInput));
    var addressInput = el("input", {
      class: "input",
      type: "text",
      placeholder: "العنوان"
    });
    addressInput.value = draft.address || "";
    addressInput.addEventListener("change", function() {
      persistPharmacy({
        address: addressInput.value.trim()
      });
    });
    pharmSec.appendChild(fieldWrap("العنوان", addressInput));
    var licenseInput = el("input", {
      class: "input",
      type: "text",
      placeholder: "رقم الترخيص"
    });
    licenseInput.value = draft.license || "";
    licenseInput.addEventListener("change", function() {
      persistPharmacy({
        license: licenseInput.value.trim()
      });
    });
    pharmSec.appendChild(fieldWrap("رقم الترخيص", licenseInput));
    var noteInput = el("textarea", {
      class: "input",
      rows: "2",
      placeholder: "ملاحظة تظهر أسفل ترويسة الطباعة (اختياري)"
    });
    noteInput.value = draft.printNote || "";
    noteInput.addEventListener("change", function() {
      persistPharmacy({
        printNote: noteInput.value.trim()
      });
    });
    pharmSec.appendChild(fieldWrap("ملاحظة الطباعة", noteInput));
    var logoWrap = el("div", {
      class: "row",
      style: "gap:var(--sp-2); align-items:center; flex-wrap:wrap;"
    });
    var logoPreview = el("img", {
      alt: "",
      style: "height:40px; max-width:120px; object-fit:contain; border-radius:6px;" + (draft.logo ? "" : " display:none;")
    });
    if (draft.logo) logoPreview.src = draft.logo;
    var logoInput = el("input", {
      type: "file",
      accept: "image/png,image/jpeg,image/svg+xml"
    });
    logoInput.addEventListener("change", function() {
      var file = logoInput.files && logoInput.files[0];
      if (!file) return;
      if (file.size > 512 * 1024) {
        showToast("حجم الشعار كبير جدًا (الحد 512 كيلوبايت)", false);
        logoInput.value = "";
        return;
      }
      var fr = new FileReader;
      fr.onload = function() {
        var dataUrl = String(fr.result || "");
        persistPharmacy({
          logo: dataUrl
        });
        logoPreview.src = dataUrl;
        logoPreview.style.display = "";
      };
      fr.readAsDataURL(file);
    });
    var removeLogoBtn = el("button", {
      class: "btn btn--ghost",
      type: "button"
    }, [ text("إزالة الشعار") ]);
    removeLogoBtn.addEventListener("click", function() {
      persistPharmacy({
        logo: null
      });
      logoPreview.style.display = "none";
      logoInput.value = "";
    });
    logoWrap.appendChild(logoInput);
    logoWrap.appendChild(logoPreview);
    logoWrap.appendChild(removeLogoBtn);
    pharmSec.appendChild(fieldWrap("شعار الصيدلية", logoWrap));
    body.appendChild(pharmSec);
    var sigSec = drawerSection("توقيعات الطباعة");
    var sigList = el("div", {
      style: "display:flex; flex-direction:column; gap:var(--sp-1);"
    });
    function renderSigList() {
      sigList.innerHTML = "";
      (draft.signatureRoles || []).forEach(function(role, idx) {
        var row = el("div", {
          class: "row",
          style: "gap:var(--sp-1); align-items:center;"
        });
        var roleInput = el("input", {
          class: "input",
          type: "text",
          placeholder: "مسمى التوقيع"
        });
        roleInput.value = role;
        roleInput.addEventListener("change", function() {
          var next = draft.signatureRoles.slice();
          next[idx] = roleInput.value.trim();
          persistPharmacy({
            signatureRoles: next
          });
        });
        var delBtn = el("button", {
          class: "btn btn--ghost btn--icon",
          type: "button",
          "aria-label": "حذف"
        }, [ text("✕") ]);
        delBtn.addEventListener("click", function() {
          var next = draft.signatureRoles.slice();
          next.splice(idx, 1);
          persistPharmacy({
            signatureRoles: next
          });
          renderSigList();
        });
        row.appendChild(roleInput);
        row.appendChild(delBtn);
        sigList.appendChild(row);
      });
    }
    renderSigList();
    sigSec.appendChild(sigList);
    var addSigBtn = el("button", {
      class: "btn btn--ghost",
      type: "button"
    }, [ text("+ إضافة توقيع") ]);
    addSigBtn.addEventListener("click", function() {
      if ((draft.signatureRoles || []).length >= 4) {
        showToast("الحد الأقصى 4 توقيعات", false);
        return;
      }
      var next = (draft.signatureRoles || []).concat([ "" ]);
      persistPharmacy({
        signatureRoles: next
      });
      renderSigList();
    });
    sigSec.appendChild(addSigBtn);
    body.appendChild(sigSec);
    var userSec = drawerSection("المستخدم");
    var nameUserInput = el("input", {
      class: "input",
      type: "text",
      placeholder: "الاسم"
    });
    nameUserInput.value = userDraft.displayName || "";
    nameUserInput.addEventListener("change", function() {
      persistUser({
        displayName: nameUserInput.value.trim()
      });
    });
    userSec.appendChild(fieldWrap("اسم المستخدم (يظهر في تذييل الطباعة)", nameUserInput));
    body.appendChild(userSec);
    registerDialog(overlay, {
      initialFocus: nameInput
    });
  }
  function capturePresetFromCurrentView(name) {
    var reportId = state.activeReportId;
    var settings = resolveSettings(reportId);
    return {
      id: "preset-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
      name: name,
      createdAt: new Date().toISOString(),
      reportId: reportId,
      combination: JSON.parse(JSON.stringify(state.activeCombination)),
      activeMonth: state.activeMonth,
      dimensionGroups: JSON.parse(JSON.stringify(state.dimensionGroups)),
      hiddenColumns: (state.hiddenColumns[reportId] || []).slice(),
      filters: JSON.parse(JSON.stringify(state.queryState.filters || [])),
      sortLevels: JSON.parse(JSON.stringify(state.queryState.sortLevels || [])),
      reportSettings: {
        rowsPerPage: settings.rowsPerPage,
        blockSize: settings.blockSize,
        cumulativeMode: settings.cumulativeMode,
        cumulativeAgg: settings.cumulativeAgg,
        showPartialBlockTotal: settings.showPartialBlockTotal,
        showPageMarkers: settings.showPageMarkers,
        printOrientation: settings.printOrientation,
        windowSize: settings.windowSize,
        linked: settings.linked
      }
    };
  }
  function applyPreset(preset) {
    var repDef = cfg.REPORTS_BY_ID[preset.reportId];
    if (!repDef) {
      showToast("هذا التقرير لم يعد متاحًا", false);
      return;
    }
    state.activeReportId = preset.reportId;
    state.activeCombination = preset.combination || matrix.allValuesCombination();
    state.activeMonth = preset.activeMonth || null;
    state.dimensionGroups = preset.dimensionGroups || {
      budget: null,
      shift: null,
      dispense: null
    };
    state.hiddenColumns[preset.reportId] = (preset.hiddenColumns || []).slice();
    store.saveSettings("meta", "hiddenColumns", state.hiddenColumns).catch(function() {});
    state.queryState.filters = (preset.filters || []).slice();
    state.queryState.sortLevels = (preset.sortLevels || []).slice();
    state.queryState.searchText = "";
    if (preset.reportSettings) {
      var fields = Object.assign({}, preset.reportSettings);
      delete fields.linked;
      applySettingChange("report", preset.reportId, fields);
      if (preset.reportSettings.linked === false) applyLinkedSettingChange(preset.reportId, false);
    }
    render();
  }
  function openSavedViewsDialog() {
    var overlay = el("div", {
      class: "drawer-overlay",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "العروض المحفوظة"
    });
    var drawer = el("div", {
      class: "drawer"
    });
    overlay.appendChild(drawer);
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) removeDialog(overlay);
    });
    var header = el("div", {
      class: "drawer__header"
    }, [ el("div", {
      class: "fs-title"
    }, [ text("العروض المحفوظة") ]) ]);
    var closeBtn = el("button", {
      class: "btn btn--ghost btn--icon",
      type: "button",
      "aria-label": "إغلاق"
    }, [ text("✕") ]);
    closeBtn.addEventListener("click", function() {
      removeDialog(overlay);
    });
    header.appendChild(closeBtn);
    drawer.appendChild(header);
    var body = el("div", {
      class: "drawer__body"
    });
    drawer.appendChild(body);
    function buildBody() {
      body.innerHTML = "";
      var saveSec = drawerSection("حفظ العرض الحالي");
      var nameInput = el("input", {
        class: "input",
        type: "text",
        placeholder: "اسم العرض"
      });
      var saveRow = el("div", {
        class: "row",
        style: "gap:var(--sp-1);"
      });
      var saveBtn = el("button", {
        class: "btn btn--primary",
        type: "button"
      }, [ text("حفظ") ]);
      saveBtn.addEventListener("click", function() {
        var name = nameInput.value.trim();
        if (!name) {
          showToast("اكتب اسمًا للعرض أولًا", false);
          return;
        }
        if (state.savedReportPresets.length >= 50) {
          showToast("الحد الأقصى 50 عرضًا محفوظًا", false);
          return;
        }
        var preset = capturePresetFromCurrentView(name);
        var next = state.savedReportPresets.concat([ preset ]);
        saveReportPresets(next);
        nameInput.value = "";
        buildBody();
      });
      saveRow.appendChild(nameInput);
      saveRow.appendChild(saveBtn);
      saveSec.appendChild(fieldWrap("اسم العرض الجديد", saveRow));
      body.appendChild(saveSec);
      var listSec = drawerSection("العروض المحفوظة (" + state.savedReportPresets.length + ")");
      if (!state.savedReportPresets.length) {
        listSec.appendChild(el("div", {
          class: "fs-caption text-soft"
        }, [ text("لا توجد عروض محفوظة بعد.") ]));
      }
      state.savedReportPresets.forEach(function(preset) {
        var row = el("div", {
          class: "row",
          style: "gap:var(--sp-1); align-items:center; justify-content:space-between;"
        });
        var repDef = cfg.REPORTS_BY_ID[preset.reportId];
        var infoCol = el("div", {
          style: "display:flex; flex-direction:column;"
        }, [ el("div", {
          class: "fs-body"
        }, [ text(preset.name) ]), el("div", {
          class: "fs-caption text-soft"
        }, [ text(repDef ? repDef.label : preset.reportId) ]) ]);
        var btnRow = el("div", {
          class: "row",
          style: "gap:var(--sp-1);"
        });
        var applyBtn = el("button", {
          class: "btn btn--ghost",
          type: "button"
        }, [ text("تطبيق") ]);
        applyBtn.addEventListener("click", function() {
          applyPreset(preset);
          removeDialog(overlay);
        });
        var delBtn = el("button", {
          class: "btn btn--ghost btn--icon",
          type: "button",
          "aria-label": "حذف"
        }, [ text("✕") ]);
        delBtn.addEventListener("click", function() {
          var next = state.savedReportPresets.filter(function(p) {
            return p.id !== preset.id;
          });
          saveReportPresets(next);
          buildBody();
        });
        btnRow.appendChild(applyBtn);
        btnRow.appendChild(delBtn);
        row.appendChild(infoCol);
        row.appendChild(btnRow);
        listSec.appendChild(row);
      });
      body.appendChild(listSec);
    }
    buildBody();
    registerDialog(overlay);
  }
  function openSettingsDrawer() {
    if (!store.getSourceRows().length) {
      showToast("لا توجد بيانات لعرض الإعدادات", false);
      return;
    }
    var reportId = state.activeReportId;
    var combination = state.activeCombination;
    var repDef = cfg.REPORTS_BY_ID[reportId];
    if (!repDef) return;
    var supportsBlocking = repDef.defaults.blockSize !== null;
    var overlay = el("div", {
      class: "drawer-overlay",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "الإعدادات"
    });
    var drawer = el("div", {
      class: "drawer"
    });
    overlay.appendChild(drawer);
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) removeDialog(overlay);
    });
    var header = el("div", {
      class: "drawer__header"
    }, [ el("div", {
      class: "fs-title"
    }, [ text("الإعدادات") ]) ]);
    var closeBtn = el("button", {
      class: "btn btn--ghost btn--icon",
      type: "button",
      "aria-label": "إغلاق"
    }, [ text("✕") ]);
    closeBtn.addEventListener("click", function() {
      removeDialog(overlay);
    });
    header.appendChild(closeBtn);
    drawer.appendChild(header);
    var body = el("div", {
      class: "drawer__body"
    });
    drawer.appendChild(body);
    function onSettingsMutated() {
      var tableArea = $("table-area");
      if (tableArea) renderTableArea(tableArea);
      buildBody();
    }
    function onSettingChange(field, value) {
      var settings = resolveSettings(reportId);
      if (field === "rowsPerPage" || field === "printOrientation") {
        var orientation = field === "printOrientation" ? value : settings.printOrientation;
        var rowsPerPage = field === "rowsPerPage" ? value : settings.rowsPerPage;
        var geoCheck = checkPrintGeometry(rowsPerPage, orientation);
        if (!geoCheck.ok) {
          showToast("هذا الإعداد كبير جدًا ليُطبع بوضوح على الصفحة", false);
          return;
        }
        var otherOrientation = orientation === "portrait" ? "landscape" : "portrait";
        if (!checkPrintGeometry(rowsPerPage, otherOrientation).ok) {
          showToast("تنبيه: هذا العدد قد لا يتّسع بوضوح عند التحويل إلى الاتجاه الآخر", false);
        }
      }
      var fields;
      if (field === "rowsPerPage" || field === "blockSize") {
        var next = PH.settings.applyLinkedChange(settings, field, value);
        fields = {
          rowsPerPage: next.rowsPerPage
        };
        if (supportsBlocking && next.blockSize !== null && next.blockSize !== undefined) fields.blockSize = next.blockSize;
      } else {
        fields = {};
        fields[field] = value;
      }
      applySettingChange("report", reportId, fields);
      onSettingsMutated();
    }
    function buildBody() {
      body.innerHTML = "";
      var settings = resolveSettings(reportId);
      var pageSec = drawerSection("الصفحة والطباعة — " + repDef.label);
      if (state.settingsOverrides.report[reportId] && Object.keys(state.settingsOverrides.report[reportId]).length) {
        pageSec.appendChild(el("div", {
          class: "fs-caption",
          style: "color:var(--brass);"
        }, [ text("هذا التقرير يتجاوز الإعدادات العامة.") ]));
      }
      pageSec.appendChild(fieldWrap("عدد الصفوف في الصفحة", presetRow(cfg.ROWS_PER_PAGE_PRESETS, settings.rowsPerPage, function(v) {
        onSettingChange("rowsPerPage", v);
      })));
      var orientRow = el("div", {
        class: "row",
        style: "gap:var(--sp-1);"
      });
      [ [ "portrait", "عمودي" ], [ "landscape", "أفقي" ] ].forEach(function(pair) {
        var obtn = el("button", {
          class: "pill",
          type: "button",
          "aria-pressed": settings.printOrientation === pair[0] ? "true" : "false"
        }, [ text(pair[1]) ]);
        obtn.addEventListener("click", function() {
          onSettingChange("printOrientation", pair[0]);
        });
        orientRow.appendChild(obtn);
      });
      pageSec.appendChild(fieldWrap("اتجاه الطباعة", orientRow));
      pageSec.appendChild(switchRow("إظهار حدود الصفحات في الجدول", settings.showPageMarkers !== false, function(v) {
        onSettingChange("showPageMarkers", v);
      }));
      var pageCount = PH.settings.estimatedPageCount(computeSheetFor(reportId, combination).rows.length, settings.rowsPerPage);
      pageSec.appendChild(el("div", {
        class: "fs-caption text-soft"
      }, [ text("~" + pageCount + " صفحة عند الطباعة") ]));
      pageSec.appendChild(switchRow("تطبيق الفرز/التصفية/البحث الحالي على الطباعة والتصدير", !!state.applyToPrintExport, function(v) {
        state.applyToPrintExport = v;
        store.saveSettingsMulti("global", {
          applyToPrintExport: v
        }).catch(function() {});
        onSettingsMutated();
      }));
      var calibrateEntryBtn = el("button", {
        class: "btn btn--tertiary",
        type: "button",
        style: "align-self:flex-start;"
      }, [ text("معايرة الطباعة") ]);
      calibrateEntryBtn.addEventListener("click", function() {
        openPrintPreview({
          openCalibration: true
        });
      });
      pageSec.appendChild(calibrateEntryBtn);
      body.appendChild(pageSec);
      var printable = cfg.printableColumns(repDef.columns);
      if (printable.length > 1) {
        var colsSec = drawerSection("الأعمدة");
        var hidden = state.hiddenColumns[reportId] || [];
        var visibleCount = printable.length - hidden.length;
        var colsHost = el("div", {
          style: "display:flex; flex-direction:column; gap:4px;"
        });
        printable.forEach(function(c) {
          var isHidden = hidden.indexOf(c) !== -1;
          var row = el("label", {
            class: "row",
            style: "gap:var(--sp-2); align-items:center; font-size:var(--fs-caption); cursor:pointer;"
          });
          var cb = el("input", {
            type: "checkbox"
          });
          cb.checked = !isHidden;
          if (!isHidden && visibleCount <= 1) cb.disabled = true;
          cb.addEventListener("change", function() {
            var next = (state.hiddenColumns[reportId] || []).slice();
            if (cb.checked) next = next.filter(function(x) {
              return x !== c;
            }); else if (next.indexOf(c) === -1) next.push(c);
            if (next.length >= printable.length) {
              showToast("لا يمكن إخفاء كل الأعمدة", false);
              cb.checked = true;
              return;
            }
            state.hiddenColumns[reportId] = next;
            store.saveSettings("meta", "hiddenColumns", state.hiddenColumns).catch(function() {});
            onSettingsMutated();
          });
          row.appendChild(cb);
          row.appendChild(el("span", {}, [ text(cfg.COLUMN_LABELS[c] || c) ]));
          colsHost.appendChild(row);
        });
        colsSec.appendChild(colsHost);
        if (hidden.length) {
          var showAllBtn = el("button", {
            class: "btn btn--tertiary",
            type: "button"
          }, [ text("إظهار كل الأعمدة") ]);
          showAllBtn.addEventListener("click", function() {
            delete state.hiddenColumns[reportId];
            store.saveSettings("meta", "hiddenColumns", state.hiddenColumns).catch(function() {});
            onSettingsMutated();
          });
          colsSec.appendChild(showAllBtn);
        }
        body.appendChild(colsSec);
      }
      if (supportsBlocking || reportId === "movingAverage") {
        var advOpen = state.settingsPanelAdvancedOpen === true;
        var advSec = drawerSection(null);
        var advBtn = el("button", {
          class: "btn btn--tertiary",
          type: "button",
          style: "align-self:flex-start;"
        }, [ text((advOpen ? "▾ " : "◂ ") + "متقدم") ]);
        advBtn.addEventListener("click", function() {
          state.settingsPanelAdvancedOpen = !advOpen;
          buildBody();
        });
        advSec.appendChild(advBtn);
        if (advOpen && reportId === "movingAverage") {
          var windowInput = el("input", { class: "input", type: "number", min: "0", step: "1", style: "max-width:120px;" });
          windowInput.value = settings.windowSize || 0;
          windowInput.addEventListener("change", function() { onSettingChange("windowSize", windowInput.value); });
          advSec.appendChild(fieldWrap("نافذة المتوسط (عدد آخر عمليات التوريد، ٠ = بلا حد)", windowInput));
        }
        if (advOpen && supportsBlocking) {
          advSec.appendChild(switchRow("استخدم حجم كتلة مختلف عن حجم الصفحة", settings.linked === false, function(v) {
            applyLinkedSettingChange(reportId, !v);
            onSettingsMutated();
          }));
          if (settings.linked === false) {
            advSec.appendChild(fieldWrap("حجم الكتلة", presetRow(cfg.BLOCK_SIZE_PRESETS, settings.blockSize, function(v) {
              onSettingChange("blockSize", v);
            })));
          }
          if (PH.settings.isDivergent(settings)) {
            advSec.appendChild(el("div", {
              class: "fs-caption",
              style: "color:var(--brass);"
            }, [ text("حجم الكتلة يختلف عن عدد صفوف الصفحة.") ]));
          }
          var modeRow = el("div", {
            class: "row",
            style: "gap:var(--sp-1); flex-wrap:wrap;"
          });
          [ [ "none", "بدون" ], [ "block", "تراكم لكل كتلة" ], [ "running", "تراكم مستمر" ] ].forEach(function(pair) {
            var btn = el("button", {
              class: "pill",
              type: "button",
              "aria-pressed": settings.cumulativeMode === pair[0] ? "true" : "false"
            }, [ text(pair[1]) ]);
            btn.addEventListener("click", function() {
              onSettingChange("cumulativeMode", pair[0]);
            });
            modeRow.appendChild(btn);
          });
          advSec.appendChild(fieldWrap("نمط التراكم", modeRow));
          if (settings.cumulativeMode !== "none") {
            advSec.appendChild(switchRow("إظهار إجمالي الكتلة الجزئية الأخيرة", !!settings.showPartialBlockTotal, function(v) {
              onSettingChange("showPartialBlockTotal", v);
            }));
          }
        }
        body.appendChild(advSec);
      }
      var actionsSec = el("div", {
        style: "display:flex; flex-direction:column; gap:var(--sp-2); padding-top:var(--sp-3); border-top:1px solid var(--line);"
      });
      var resetBtn = el("button", {
        class: "btn btn--tertiary",
        type: "button"
      }, [ text("إعادة ضبط هذا التقرير للافتراضي") ]);
      resetBtn.addEventListener("click", function() {
        resetSettingsScope("report", reportId).then(onSettingsMutated);
      });
      actionsSec.appendChild(resetBtn);
      var applyAllBtn = el("button", {
        class: "btn btn--tertiary",
        type: "button"
      }, [ text("طبّق هذه الإعدادات على كل التقارير") ]);
      applyAllBtn.addEventListener("click", function() {
        var current = resolveSettings(reportId);
        applySettingsToAllReports({
          rowsPerPage: current.rowsPerPage,
          showPageMarkers: current.showPageMarkers,
          printOrientation: current.printOrientation
        }).then(function() {
          showToast("تم تطبيق الإعدادات على كل التقارير");
          onSettingsMutated();
        });
      });
      actionsSec.appendChild(applyAllBtn);
      body.appendChild(actionsSec);
      fadeRefresh(body);
    }
    buildBody();
    registerDialog(overlay);
  }
  var activeToasts = Object.create(null);
  function showToast(message, withUndo) {
    var stack = $("toast-stack");
    if (!stack) return;
    if (!withUndo && activeToasts[message] && activeToasts[message].el.isConnected) {
      var existing = activeToasts[message];
      clearTimeout(existing.dismissTimer);
      clearTimeout(existing.removeTimer);
      existing.el.classList.remove("is-leaving");
      existing.dismissTimer = setTimeout(function() {
        existing.el.classList.add("is-leaving");
        existing.removeTimer = setTimeout(function() {
          existing.el.remove();
          if (activeToasts[message] === existing) delete activeToasts[message];
        }, 250);
      }, 4e3);
      return;
    }
    var toast = el("div", {
      class: "toast"
    }, [ text(message) ]);
    if (withUndo) {
      var versionAtCreation = store.getRowsVersion();
      var undoBtn = el("button", {
        class: "toast__undo"
      }, [ text("تراجع") ]);
      undoBtn.addEventListener("click", function() {
        if (store.getRowsVersion() !== versionAtCreation) {
          showToast("تعذّر التراجع — حدث تغيير آخر بعد هذا الإجراء", false);
          return;
        }
        store.undo();
      });
      toast.appendChild(undoBtn);
    }
    while (stack.children.length >= 3) stack.firstChild.remove();
    stack.appendChild(toast);
    var entry = {
      el: toast
    };
    if (!withUndo) activeToasts[message] = entry;
    entry.dismissTimer = setTimeout(function() {
      toast.classList.add("is-leaving");
      entry.removeTimer = setTimeout(function() {
        toast.remove();
        if (activeToasts[message] === entry) delete activeToasts[message];
      }, 250);
    }, 4e3);
  }
  function computeSheetFor(reportId, combination) {
    var rows = store.getSourceRows();
    var settings = resolveSettings(reportId);
    var signature = matrix.buildSignature([ "sheet", reportId, matrix.combinationKey(combination), state.activeMonth || "*", state.sourceRowFilterVersion, state.dimensionGroups, settings, state.settingsVersion, store.getRowsVersion() ]);
    return matrix.computeMemoized(signature, function() {
      var scoped = filterActiveRows(rows, combination);
      if (reportId === "movement") return reports.computeMovement(scoped, settings);
      if (reportId === "groups") return reports.computeGroups(scoped, settings);
      if (reportId === "yearlyInventory") return reports.computeYearlyInventory(scoped, settings);
      if (reportId === "balanceReport") return reports.computeBalance(scoped, settings);
      if (reportId === "averagePrices") return average.computeAveragePrices(scoped, settings);
      if (reportId === "movingAverage") return average.computeMovingAverage(scoped, settings);
      if (reportId === "sourceRows") {
        var sourceRows = state.sourceRowFilterIds && state.sourceRowFilterIds.length ? scoped.filter(function(row) {
          return state.sourceRowFilterIds.indexOf(row.id) !== -1;
        }) : scoped;
        return {
          rows: sourceRows,
          sourceCount: sourceRows.length
        };
      }
      if (reportId === "pages") {
        var combos = matrix.nonEmpty(matrix.materialize(scoped, state.dimensionGroups));
        var perCombo = combos.map(function(m) {
          var subset = reports.filterToCombination(scoped, m.combination);
          var movementSettings = resolveSettings("movement");
          return {
            combination: m.combination,
            pages: reports.computePagesForCombination(subset, m.combination, movementSettings)
          };
        });
        return reports.computePagesConsolidated(perCombo);
      }
      return {
        rows: []
      };
    });
  }
  function computeActiveSheet() {
    return computeSheetFor(state.activeReportId, state.activeCombination);
  }
  function renderReportTabs(container) {
    container.innerHTML = "";
    var rows = store.getSourceRows();
    var columnHasData = {};
    function hasDataForColumn(col) {
      if (columnHasData[col] === undefined) columnHasData[col] = rows.some(function(r) {
        return r[col] !== undefined && r[col] !== null;
      });
      return columnHasData[col];
    }
    function isDisabled(rep) {
      return rows.length > 0 && rep.requiresOptional.some(function(col) {
        return !hasDataForColumn(col);
      });
    }
    var sortedReports = cfg.REPORTS.slice().sort(function(a, b) {
      return a.order - b.order;
    });
    var enabledReports = sortedReports.filter(function(rep) {
      return !isDisabled(rep);
    });
    sortedReports.forEach(function(rep) {
      var disabled = isDisabled(rep);
      var tab = el("div", {
        class: "report-tab-h",
        id: "tab-" + rep.id,
        role: "tab",
        "aria-selected": state.activeReportId === rep.id ? "true" : "false",
        "aria-disabled": disabled ? "true" : "false",
        tabindex: state.activeReportId === rep.id ? "0" : "-1",
        "aria-controls": "main-content"
      }, [ el("span", {}, [ text(rep.label) ]), el("span", {
        class: "report-tab-h__shortcut"
      }, [ text("Alt+" + rep.shortcut) ]) ]);
      if (!disabled) {
        var activateTab = function() {
          if (state.activeReportId !== rep.id) resetQueryState();
          state.activeReportId = rep.id;
          render();
        };
        tab.addEventListener("click", activateTab);
        tab.addEventListener("keydown", function(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activateTab();
            return;
          }
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          var index = enabledReports.indexOf(rep);
          var next = enabledReports[(index + (e.key === "ArrowLeft" ? 1 : -1) + enabledReports.length) % enabledReports.length];
          if (next) {
            state.activeReportId = next.id;
            resetQueryState();
            render();
            setTimeout(function() {
              var node = document.querySelector('[role="tab"][aria-selected="true"]');
              if (node) node.focus();
            }, 0);
          }
        });
      } else {
        var missingCols = rep.requiresOptional.filter(function(col) {
          return !hasDataForColumn(col);
        }).map(function(col) {
          return cfg.COLUMN_LABELS[col] || col;
        });
        var neededCol = missingCols.join("، ");
        tab.title = "يحتاج عمود " + neededCol + " — انقر لمعرفة المزيد";
        tab.addEventListener("click", function() {
          showToast('تقرير "' + rep.label + '" يحتاج عمود "' + neededCol + '" في بياناتك. حمّل نموذج البيانات من الشاشة الفارغة لمعرفة الأعمدة المطلوبة.', false);
        });
      }
      container.appendChild(tab);
    });
    var panel = document.getElementById("main-content");
    if (panel) panel.setAttribute("aria-labelledby", "tab-" + state.activeReportId);
  }
  var overflowMenuOpen = false;
  function refreshScope() {
    render();
    if (activeAnchoredPopover && activeAnchoredPopover.el === scopePopoverEl) {
      renderScopePopoverContent(scopePopoverEl);
      PH.popover.position(scopePopoverEl, activeAnchoredPopover.anchor, {
        margin: 8,
        gap: 8,
        fallbackWidth: 280,
        align: "end"
      });
    }
  }
  function toggleChip(dim, group, isSelected) {
    var full = cfg.DIMENSIONS[dim];
    var cur = state.activeCombination[dim];
    var isFilteredNow = cur.length < full.length;
    var base = isFilteredNow ? cur.slice() : [];
    var next;
    if (isSelected) {
      next = base.filter(function(v) {
        return group.indexOf(v) === -1;
      });
    } else {
      next = base.slice();
      group.forEach(function(v) {
        if (next.indexOf(v) === -1) next.push(v);
      });
    }
    state.activeCombination[dim] = next.length ? next : full.slice();
    resetQueryState();
    refreshScope();
  }
  function applyPartitionForDim(dim, next) {
    state.dimensionGroups[dim] = next;
    resetQueryState();
    state.activeCombination[dim] = cfg.DIMENSIONS[dim].slice();
    refreshScope();
  }
  function groupKey(g) {
    return g.join("\0");
  }
  function mergeSelectedChips(dim, selectedGroups) {
    var partition = matrix.resolvePartition(dim, state.dimensionGroups);
    var selectedSet = {};
    selectedGroups.forEach(function(g) {
      selectedSet[groupKey(g)] = true;
    });
    var remaining = partition.filter(function(g) {
      return !selectedSet[groupKey(g)];
    });
    var merged = [].concat.apply([], selectedGroups);
    applyPartitionForDim(dim, remaining.concat([ merged ]));
  }
  function splitSelectedChips(dim, selectedGroups) {
    var partition = matrix.resolvePartition(dim, state.dimensionGroups);
    var selectedSet = {};
    selectedGroups.forEach(function(g) {
      selectedSet[groupKey(g)] = true;
    });
    var next = [];
    partition.forEach(function(g) {
      if (selectedSet[groupKey(g)]) g.forEach(function(v) {
        next.push([ v ]);
      }); else next.push(g);
    });
    applyPartitionForDim(dim, next.length === cfg.DIMENSIONS[dim].length ? null : next);
  }
  function resetScope() {
    var full = {};
    cfg.DIMENSION_ORDER.forEach(function(dim) {
      full[dim] = cfg.DIMENSIONS[dim].slice();
    });
    state.activeCombination = full;
    state.activeMonth = null;
    resetQueryState();
    refreshScope();
  }
  function scopeDimensionBlock(dim, rows) {
    var block = el("div", {
      style: "display:flex; flex-direction:column; gap:var(--sp-2);"
    });
    block.appendChild(el("div", {
      class: "fs-caption",
      style: "font-weight:600; color:var(--text-soft);"
    }, [ text(cfg.DIMENSION_LABELS[dim]) ]));
    var partition = matrix.resolvePartition(dim, state.dimensionGroups);
    var currentValues = state.activeCombination[dim];
    var isFiltered = currentValues.length < cfg.DIMENSIONS[dim].length;
    var selectedGroups = [];
    var neutralCombination = {};
    for (var k in state.activeCombination) neutralCombination[k] = state.activeCombination[k];
    neutralCombination[dim] = cfg.DIMENSIONS[dim].slice();
    var baseRows = filterActiveRows(rows, neutralCombination);
    var valueToGroupIndex = {};
    partition.forEach(function(group, gi) {
      group.forEach(function(v) {
        valueToGroupIndex[v] = gi;
      });
    });
    var counts = partition.map(function() {
      return 0;
    });
    baseRows.forEach(function(row) {
      var gi = valueToGroupIndex[row[dim]];
      if (gi !== undefined) counts[gi]++;
    });
    var chipRow = el("div", {
      class: "row",
      style: "gap:var(--sp-1); flex-wrap:wrap;"
    });
    partition.forEach(function(group, gi) {
      var label = group.length === 1 ? group[0] : group.join(" + ");
      var isSelected = isFiltered && group.every(function(v) {
        return currentValues.indexOf(v) !== -1;
      });
      if (isSelected) selectedGroups.push(group);
      var chip = el("button", {
        class: "pill",
        type: "button",
        "aria-pressed": isSelected ? "true" : "false"
      }, [ text(label), el("span", {
        class: "pill__count"
      }, [ text(String(counts[gi])) ]) ]);
      chip.addEventListener("click", function() {
        toggleChip(dim, group, isSelected);
      });
      chipRow.appendChild(chip);
    });
    block.appendChild(chipRow);
    if (selectedGroups.length >= 2) {
      var actionRow = el("div", {
        class: "row",
        style: "gap:var(--sp-2);"
      });
      var mergeBtn = el("button", {
        class: "btn btn--tertiary",
        type: "button"
      }, [ text("دمج") ]);
      mergeBtn.addEventListener("click", function() {
        mergeSelectedChips(dim, selectedGroups);
      });
      var splitBtn = el("button", {
        class: "btn btn--tertiary",
        type: "button"
      }, [ text("فصل") ]);
      splitBtn.addEventListener("click", function() {
        splitSelectedChips(dim, selectedGroups);
      });
      actionRow.appendChild(mergeBtn);
      actionRow.appendChild(splitBtn);
      block.appendChild(actionRow);
    }
    return block;
  }
  function scopeMonthBlock(rows) {
    var months = rows.map(function(row) {
      return row.month;
    }).filter(function(v, i, arr) {
      return v && arr.indexOf(v) === i;
    }).sort();
    if (!months.length) return null;
    var block = el("div", {
      style: "display:flex; flex-direction:column; gap:var(--sp-2);"
    });
    block.appendChild(el("div", {
      class: "fs-caption",
      style: "font-weight:600; color:var(--text-soft);"
    }, [ text("الشهر") ]));
    var baseRows = reports.filterToCombination(rows, state.activeCombination);
    var counts = {};
    baseRows.forEach(function(row) {
      if (row.month) counts[row.month] = (counts[row.month] || 0) + 1;
    });
    var chipRow = el("div", {
      class: "row",
      style: "gap:var(--sp-1); flex-wrap:wrap;"
    });
    months.forEach(function(month) {
      var isSelected = state.activeMonth === month;
      var chip = el("button", {
        class: "pill",
        type: "button",
        "aria-pressed": isSelected ? "true" : "false"
      }, [ text(month), el("span", {
        class: "pill__count"
      }, [ text(String(counts[month] || 0)) ]) ]);
      chip.addEventListener("click", function() {
        state.activeMonth = isSelected ? null : month;
        resetQueryState();
        refreshScope();
      });
      chipRow.appendChild(chip);
    });
    block.appendChild(chipRow);
    return block;
  }
  function renderScopePopoverContent(container) {
    container.innerHTML = "";
    var rows = store.getSourceRows();
    cfg.DIMENSION_ORDER.forEach(function(dim) {
      container.appendChild(scopeDimensionBlock(dim, rows));
    });
    var monthBlock = scopeMonthBlock(rows);
    if (monthBlock) container.appendChild(monthBlock);
    var footer = el("div", {
      class: "row",
      style: "justify-content:space-between; align-items:center; padding-top:var(--sp-3); box-shadow:inset 0 .5px 0 0 var(--line);"
    });
    var resetBtn = el("button", {
      class: "btn btn--tertiary",
      type: "button"
    }, [ text("إعادة تعيين النطاق") ]);
    resetBtn.addEventListener("click", resetScope);
    footer.appendChild(resetBtn);
    footer.appendChild(el("span", {
      class: "fs-caption text-soft"
    }, [ text(filterActiveRows(rows, state.activeCombination).length + " صف مطابق") ]));
    container.appendChild(footer);
  }
  var scopeClickAwayBound = false;
  function ensureScopeClickAwayListener() {
    if (scopeClickAwayBound) return;
    scopeClickAwayBound = true;
    document.addEventListener("click", function() {
      if (overflowMenuOpen) {
        closeOverflowMenu();
      }
    });
  }
  function closeOverflowMenu() {
    overflowMenuOpen = false;
    var menu = $("overflow-menu");
    var toggle = $("btn-overflow-toggle");
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }
  function positionOverflowMenu() {
    var toggle = $("btn-overflow-toggle");
    var menu = $("overflow-menu");
    if (!toggle || !menu) return;
    PH.popover.position(menu, toggle, {
      margin: 8,
      gap: 8,
      fallbackWidth: 200,
      align: "end"
    });
  }
  function bindOverflowMenu() {
    var toggle = $("btn-overflow-toggle");
    var menu = $("overflow-menu");
    if (!toggle || !menu) return;
    toggle.addEventListener("click", function(e) {
      e.stopPropagation();
      overflowMenuOpen = !overflowMenuOpen;
      menu.hidden = !overflowMenuOpen;
      toggle.setAttribute("aria-expanded", overflowMenuOpen ? "true" : "false");
      if (overflowMenuOpen) positionOverflowMenu();
    });
    menu.addEventListener("click", function(e) {
      e.stopPropagation();
      if (e.target && e.target.tagName === "BUTTON") closeOverflowMenu();
    });
  }
  var activeAnchoredPopover = null;
  function closeAnchoredPopover() {
    if (!activeAnchoredPopover) return;
    var p = activeAnchoredPopover;
    activeAnchoredPopover = null;
    if (p.cleanup) p.cleanup();
    PH.popover.fadeOutAndRemove(p.el);
    if (p.anchor) p.anchor.setAttribute("aria-expanded", "false");
  }
  function openAnchoredPopover(anchorEl, buildFn, opts) {
    opts = opts || {};
    closeAnchoredPopover();
    var pop = el("div", {
      class: "panel-2 glass anchored-popover",
      role: opts.role || "region",
      style: "position:fixed; z-index:95; padding:var(--sp-4);"
    });
    buildFn(pop);
    document.body.appendChild(pop);
    var posOpts = {
      margin: 8,
      gap: 8,
      fallbackWidth: 280,
      align: opts.align === "start" ? "start" : "end"
    };
    PH.popover.position(pop, anchorEl, posOpts);
    anchorEl.setAttribute("aria-expanded", "true");
    var popHandle = PH.popover.attach(pop, anchorEl, {
      onClose: closeAnchoredPopover,
      closeOnEscape: true,
      returnFocus: opts.returnFocus !== false,
      delayAll: true,
      position: posOpts
    });
    activeAnchoredPopover = {
      el: pop,
      anchor: anchorEl,
      cleanup: popHandle.cleanup
    };
    return pop;
  }
  function scopeSummaryLabel() {
    var parts = cfg.DIMENSION_ORDER.map(function(dim) {
      return reports.dimLabel(state.activeCombination, dim);
    });
    if (state.activeMonth) parts.push(state.activeMonth);
    return parts.join(" · ");
  }
  function updateScopeButton() {
    var btn = $("btn-scope");
    var label = $("scope-btn-label");
    var badge = $("scope-btn-badge");
    if (!btn || !label) return;
    var hasData = store.getSourceRows().length > 0;
    btn.style.display = hasData ? "" : "none";
    if (!hasData) return;
    label.textContent = scopeSummaryLabel();
    if (badge) badge.textContent = String(filterActiveRows(store.getSourceRows(), state.activeCombination).length);
  }
  var scopePopoverEl = null;
  function openScopePopover() {
    if (!store.getSourceRows().length) return;
    scopePopoverEl = openAnchoredPopover($("btn-scope"), function(pop) {
      pop.style.width = "360px";
      pop.style.maxHeight = "70vh";
      pop.style.overflow = "auto";
      pop.style.display = "flex";
      pop.style.flexDirection = "column";
      pop.style.gap = "var(--sp-4)";
      renderScopePopoverContent(pop);
    }, {
      align: "end"
    });
  }
  function reportSwitcherDropdownLabel() {
    var rep = cfg.REPORTS_BY_ID[state.activeReportId];
    return rep ? rep.label : "";
  }
  function updateReportSwitcherDropdown() {
    var label = $("report-switcher-dropdown-label");
    if (label) label.textContent = reportSwitcherDropdownLabel();
  }
  function openReportSwitcherMenu() {
    var rows = store.getSourceRows();
    openAnchoredPopover($("btn-report-switcher-dropdown"), function(pop) {
      pop.setAttribute("role", "menu");
      pop.style.width = "240px";
      pop.style.padding = "var(--sp-1)";
      cfg.REPORTS.slice().sort(function(a, b) {
        return a.order - b.order;
      }).forEach(function(rep) {
        var disabled = rows.length > 0 && rep.requiresOptional.some(function(col) {
          return !rows.some(function(r) {
            return r[col] !== undefined && r[col] !== null;
          });
        });
        var row = el("div", {
          role: "menuitem",
          class: "command-palette__item" + (disabled ? " text-faint" : "")
        }, [ el("span", {}, [ text(rep.label) ]), state.activeReportId === rep.id ? el("span", {
          class: "fs-caption",
          style: "color:var(--ink);"
        }, [ text("✓") ]) : text("") ]);
        if (!disabled) {
          row.addEventListener("click", function() {
            if (state.activeReportId !== rep.id) resetQueryState();
            state.activeReportId = rep.id;
            render();
            closeAnchoredPopover();
          });
        }
        pop.appendChild(row);
      });
    }, {
      align: "start"
    });
  }
  var THEME_KEY = "daftar-theme";
  var THEME_ICONS = {
    light: '<circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6L19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4L19 5"></path>',
    dark: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"></path>',
    system: '<rect x="3" y="5" width="18" height="12" rx="2"></rect><path d="M8 21h8M12 17v4"></path>'
  };
  var THEME_TITLES = {
    light: "المظهر: فاتح",
    dark: "المظهر: داكن",
    system: "المظهر: تلقائي (النظام)"
  };
  function getThemeMode() {
    var saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {}
    return saved === "dark" || saved === "light" ? saved : "system";
  }
  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function effectiveTheme(mode) {
    return mode === "system" ? systemPrefersDark() ? "dark" : "light" : mode;
  }
  function applyTheme(mode) {
    document.documentElement.setAttribute("data-theme", effectiveTheme(mode));
    var btn = $("btn-theme");
    var icon = $("theme-icon");
    if (icon) icon.innerHTML = THEME_ICONS[mode];
    if (btn) btn.title = THEME_TITLES[mode];
  }
  function setThemeMode(mode) {
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch (e) {}
    document.body.classList.add("theme-transition-lock");
    applyTheme(mode);
    setTimeout(function() {
      document.body.classList.remove("theme-transition-lock");
    }, 260);
  }
  function toggleTheme() {
    var order = [ "light", "dark", "system" ];
    var next = order[(order.indexOf(getThemeMode()) + 1) % 3];
    setThemeMode(next);
  }
  function initTheme() {
    applyTheme(getThemeMode());
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function() {
        if (getThemeMode() === "system") applyTheme("system");
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange);
    }
  }
  function bindTopSearchField() {
    var field = $("search-field");
    var iconBtn = $("search-field-icon-btn");
    if (!field) return;
    var debounce = null;
    var selected = 0;
    var listPop = null;
    function isCommandMode() {
      return field.value.charAt(0) === ">";
    }
    function closeList() {
      if (listPop && activeAnchoredPopover && activeAnchoredPopover.el === listPop) closeAnchoredPopover();
      listPop = null;
    }
    function runRowSearch() {
      clearTimeout(debounce);
      debounce = setTimeout(function() {
        state.queryState.searchText = field.value;
        var tableArea = $("table-area");
        if (tableArea) renderTableArea(tableArea);
      }, 120);
    }
    function renderCommandList() {
      var q = norm.arabicNormalize(field.value.slice(1).trim());
      var all = commandPaletteItems();
      var filtered = !q ? all : all.filter(function(it) {
        return norm.arabicNormalize(it.label).indexOf(q) !== -1;
      });
      if (selected >= filtered.length) selected = Math.max(0, filtered.length - 1);
      function renderItems(pop) {
        pop.innerHTML = "";
        filtered.slice(0, 60).forEach(function(it, i) {
          var row = el("div", {
            role: "option",
            "aria-selected": i === selected ? "true" : "false",
            class: "command-palette__item" + (i === selected ? " command-palette__item--sel" : "")
          }, [ el("span", {}, [ text(it.label) ]), el("span", {
            class: "fs-caption text-faint"
          }, [ text(it.hint || "") ]) ]);
          row.addEventListener("mousedown", function(e) {
            e.preventDefault();
            it.run();
            field.value = "";
            closeList();
            field.blur();
          });
          pop.appendChild(row);
        });
      }
      if (listPop && activeAnchoredPopover && activeAnchoredPopover.el === listPop) {
        renderItems(listPop);
      } else {
        listPop = openAnchoredPopover(field, function(pop) {
          pop.setAttribute("role", "listbox");
          pop.style.width = Math.max(280, field.offsetWidth) + "px";
          pop.style.maxHeight = "50vh";
          pop.style.overflow = "auto";
          pop.style.padding = "var(--sp-1)";
          renderItems(pop);
        }, {
          align: "start",
          returnFocus: false
        });
      }
      listPop.__filtered = filtered;
    }
    field.addEventListener("input", function() {
      if (isCommandMode()) {
        selected = 0;
        renderCommandList();
        return;
      }
      closeList();
      runRowSearch();
    });
    field.addEventListener("focus", function() {
      if (isCommandMode()) renderCommandList();
    });
    field.addEventListener("keydown", function(e) {
      if (!isCommandMode()) {
        if (e.key === "Escape" && field.value) {
          field.value = "";
          runRowSearch();
        }
        return;
      }
      var filtered = listPop && listPop.__filtered || [];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selected = Math.min(filtered.length - 1, selected + 1);
        renderCommandList();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selected = Math.max(0, selected - 1);
        renderCommandList();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selected]) {
          filtered[selected].run();
          field.value = "";
          closeList();
          field.blur();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        field.value = "";
        closeList();
        field.blur();
        var wrapOnEscape = $("search-field-wrap");
        if (wrapOnEscape) wrapOnEscape.classList.remove("is-expanded");
      }
    });
    field.addEventListener("blur", function() {
      setTimeout(function() {
        if (document.activeElement !== field) closeList();
      }, 180);
      var wrap = $("search-field-wrap");
      if (wrap) wrap.classList.remove("is-expanded");
    });
    if (iconBtn) iconBtn.addEventListener("click", function() {
      var wrap = $("search-field-wrap");
      if (wrap) wrap.classList.add("is-expanded");
      field.focus();
    });
  }
  function renderMain(container) {
    var rows = store.getSourceRows();
    var mode = rows.length === 0 ? "empty" : "data";
    if (mode === "data" && container.__mainMode === "data" && container.querySelector("#table-area") && updateMainChrome(container)) {
      renderTableArea(container.querySelector("#table-area"));
      renderAuditPanel(container.querySelector(".audit-panel"));
      return;
    }
    container.innerHTML = "";
    container.__mainMode = mode;
    if (rows.length === 0) {
      container.appendChild(renderEmptyState());
      return;
    }
    var repDefForCrumb = cfg.REPORTS_BY_ID[state.activeReportId];
    var crumbParts = cfg.DIMENSION_ORDER.map(function(dim) {
      return reports.dimLabel(state.activeCombination, dim);
    });
    if (state.activeMonth) crumbParts.push(state.activeMonth);
    var breadcrumb = el("div", {
      id: "scope-crumb",
      class: "scope-breadcrumb",
      style: "padding:var(--sp-2) var(--sp-6) 0;"
    }, [ text((repDefForCrumb ? repDefForCrumb.label : "") + "  —  " + crumbParts.join(" · ")) ]);
    container.appendChild(breadcrumb);
    var toolbar = el("div", {
      class: "main__toolbar"
    });
    var countLabel = el("span", {
      class: "fs-caption text-soft",
      id: "row-count-label",
      "aria-live": "polite"
    });
    toolbar.appendChild(countLabel);
    if (isViewCustomized()) {
      var filterChip = el("button", {
        id: "filter-apply-chip",
        class: "pill",
        type: "button",
        "aria-pressed": state.applyToPrintExport ? "true" : "false",
        title: "عند التفعيل، تعكس الطباعة والتصدير الفرز والتصفية والبحث الحاليين في الجدول"
      }, [ text(state.applyToPrintExport ? "مصفّى — يُطبَّق على الإخراج" : "مصفّى — لا يُطبَّق") ]);
      filterChip.addEventListener("click", function() {
        state.applyToPrintExport = !state.applyToPrintExport;
        store.saveSettingsMulti("global", {
          applyToPrintExport: state.applyToPrintExport
        }).catch(function() {});
        render();
      });
      toolbar.appendChild(filterChip);
    }
    container.appendChild(toolbar);
    var tableArea = el("div", {
      class: "card",
      id: "table-area"
    });
    container.appendChild(tableArea);
    renderTableArea(tableArea);
    var auditPanel = el("div", {
      class: "audit-panel"
    });
    container.appendChild(auditPanel);
    renderAuditPanel(auditPanel);
  }
  function updateMainChrome(container) {
    var crumb = container.querySelector("#scope-crumb");
    if (crumb) {
      var repDef = cfg.REPORTS_BY_ID[state.activeReportId];
      var parts = cfg.DIMENSION_ORDER.map(function(dim) {
        return reports.dimLabel(state.activeCombination, dim);
      });
      if (state.activeMonth) parts.push(state.activeMonth);
      crumb.textContent = (repDef ? repDef.label : "") + "  —  " + parts.join(" · ");
    }
    var chip = container.querySelector("#filter-apply-chip");
    var shouldShow = isViewCustomized();
    if (chip) {
      chip.style.display = shouldShow ? "" : "none";
      chip.setAttribute("aria-pressed", state.applyToPrintExport ? "true" : "false");
      chip.textContent = state.applyToPrintExport ? "مصفّى — يُطبَّق على الإخراج" : "مصفّى — لا يُطبَّق";
    } else if (shouldShow) {
      return false;
    }
    return true;
  }
  var tableController = null;
  var tableControllerKey = null;
  var tableControllerContainer = null;
  function visibleColumnsFor(reportId, columns) {
    return cfg.withoutHiddenColumns(columns, state.hiddenColumns[reportId]);
  }
  function columnTypesFor(columns) {
    var types = {};
    columns.forEach(function(c) {
      types[c] = cfg.isNumericColumn(c) ? "number" : "text";
    });
    return types;
  }
  function openSourceRowEditor(original) {
    var overlay = el("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "تعديل صف مصدر",
      style: "position:fixed; inset:0; z-index:80; background:var(--scrim); display:flex; align-items:center; justify-content:center; padding:var(--sp-6);"
    });
    var panel = el("div", {
      class: "panel-2",
      style: "width:min(820px, 100%); max-height:90vh; overflow:auto; display:flex; flex-direction:column; gap:var(--sp-4);"
    });
    panel.appendChild(el("div", {
      class: "fs-title"
    }, [ text("تعديل صف مصدر") ]));
    panel.appendChild(el("div", {
      class: "fs-caption text-soft"
    }, [ text("النقر المزدوج على أي صف يفتح هذا المحرر. المعرّف ثابت ولا يتغير.") ]));
    var form = el("div", {
      style: "display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:var(--sp-3);"
    });
    var controls = {};
    cfg.FIELDS.forEach(function(field) {
      if (field.key === "dispensedValue") return;
      var control;
      if (field.dimension) {
        var dimOptions = [ {
          value: "",
          label: "غير محدد"
        } ].concat(cfg.DIMENSIONS[field.key].map(function(value) {
          return {
            value,
            label: value
          };
        }));
        control = PH.ui.select(dimOptions, original[field.key] || "", function() {});
      } else {
        control = el("input", {
          class: "input",
          type: field.type === "number" || field.type === "integer" ? "number" : "text"
        });
        control.value = original[field.key] === null || original[field.key] === undefined ? "" : original[field.key];
      }
      controls[field.key] = control;
      form.appendChild(el("div", {
        class: "field"
      }, [ el("label", {}, [ text(field.header) ]), control ]));
    });
    panel.appendChild(form);
    var actions = el("div", {
      class: "row",
      style: "justify-content:flex-start;"
    });
    var saveBtn = el("button", {
      class: "btn btn--primary",
      type: "button"
    }, [ text("حفظ التعديل") ]);
    var cancelBtn = el("button", {
      class: "btn btn--secondary",
      type: "button"
    }, [ text("إلغاء") ]);
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    registerDialog(overlay);
    cancelBtn.addEventListener("click", function() {
      removeDialog(overlay);
    });
    saveBtn.addEventListener("click", function() {
      var next = Object.assign({}, original, {
        __raw: Object.assign({}, original.__raw || {})
      });
      cfg.FIELDS.forEach(function(field) {
        if (!controls[field.key]) return;
        var raw = controls[field.key].value;
        next.__raw[field.key] = raw;
        next[field.key] = importer.coerceField(field.key, raw);
      });
      if (next.dispensed !== null && next.price !== null) next.dispensedValue = reports.scaleValueOf(next.dispensed, next.price); else next.dispensedValue = null;
      store.setSourceRows(store.getSourceRows().map(function(row) {
        return row.id === original.id ? next : row;
      }), "تعديل صف مصدر", false);
      removeDialog(overlay);
      showToast("تم تعديل الصف");
    });
    controls.name && controls.name.focus();
  }
  var commandPaletteItemsCache = null;
  function commandPaletteItems() {
    var cacheKey = store.getRowsVersion() + "|" + JSON.stringify(state.dimensionGroups);
    if (commandPaletteItemsCache && commandPaletteItemsCache.key === cacheKey) return commandPaletteItemsCache.items;
    var items = [];
    cfg.REPORTS.forEach(function(r) {
      items.push({
        label: "الانتقال إلى: " + r.label,
        hint: "تقرير",
        run: function() {
          resetQueryState();
          state.activeReportId = r.id;
          render();
        }
      });
    });
    var actionList = [ {
      label: "طباعة",
      hint: "Ctrl P",
      run: function() {
        openPrintPreview();
      }
    }, {
      label: "تصدير Excel",
      hint: "Ctrl E",
      run: function() {
        openExportDialog();
      }
    }, {
      label: "الإعدادات",
      hint: "Ctrl ,",
      run: function() {
        openSettingsDrawer();
      }
    }, {
      label: "إضافة صف",
      hint: "",
      run: function() {
        openGuidedFormOverlay();
      }
    }, {
      label: "استيراد ملف",
      hint: "",
      run: function() {
        var i = $("btn-import");
        if (i) i.click();
      }
    }, {
      label: "تنزيل نموذج بيانات",
      hint: "",
      run: function() {
        downloadTemplate();
      }
    }, {
      label: "نسخة احتياطية",
      hint: "",
      run: function() {
        exportWorkspaceBackup();
      }
    }, {
      label: "استعادة نسخة احتياطية",
      hint: "",
      run: function() {
        var i = $("btn-restore");
        if (i) i.click();
      }
    }, {
      label: "تبديل المظهر",
      hint: "",
      run: function() {
        var i = $("btn-theme");
        if (i) i.click();
      }
    }, {
      label: "فحص ذاتي",
      hint: "Ctrl Shift T",
      run: function() {
        runSelfTestOverlay();
      }
    } ];
    items = items.concat(actionList);
    var rows = store.getSourceRows();
    if (rows.length) {
      var combos = matrix.nonEmpty(matrix.materialize(rows, state.dimensionGroups));
      combos.forEach(function(c) {
        var label = cfg.DIMENSION_ORDER.map(function(d) {
          return reports.dimLabel(c.combination, d);
        }).join(" · ");
        items.push({
          label: "الانتقال إلى: " + label,
          hint: "شريحة · " + c.count,
          run: function() {
            resetQueryState();
            state.activeCombination = c.combination;
            render();
          }
        });
      });
    }
    commandPaletteItemsCache = {
      key: cacheKey,
      items
    };
    return items;
  }
  function openSourceRowsForIds(ids) {
    if (!ids || !ids.length) return;
    resetQueryState();
    state.activeReportId = "sourceRows";
    setSourceRowFilterIds(ids.slice());
    render();
    showToast("تم فتح " + ids.length + " صف مصدر مرتبط");
  }
  function renderTableArea(container) {
    if (!container || !container.isConnected) {
      var liveContainer = $("table-area");
      if (!liveContainer) return;
      container = liveContainer;
    }
    var sheet = computeActiveSheet();
    var repDef = cfg.REPORTS_BY_ID[state.activeReportId];
    var tableColumns = visibleColumnsFor(repDef.id, repDef.columns);
    if (repDef.id === "pages" && sheet.rows.length === 0 && store.getSourceRows().length > 0) {
      var movementSettingsForPages = resolveSettings("movement");
      if (movementSettingsForPages.cumulativeMode === "none") {
        if (tableController) {
          tableController.destroy();
          tableController = null;
          tableControllerKey = null;
          tableControllerContainer = null;
        }
        container.innerHTML = "";
        container.appendChild(el("div", {
          class: "table-empty-state"
        }, [ el("div", {
          class: "fs-body",
          style: "font-weight:600;"
        }, [ text("هذا التقرير يعتمد على تراكم تقرير الحركة، وهو معطّل حاليًا.") ]), el("div", {
          class: "fs-caption text-soft"
        }, [ text("فعّل نمط التراكم في إعدادات تقرير الحركة لإظهار صفحات الإغلاق هنا.") ]) ]));
        var staleCount = $("row-count-label");
        if (staleCount) staleCount.textContent = "";
        return;
      }
    }
    var pipeline = computeViewRows(sheet, repDef);
    var displayRows = pipeline.rows;
    var countLabel = $("row-count-label");
    if (countLabel) countLabel.textContent = "عرض " + pipeline.resultCount + " من " + pipeline.totalCount;
    var tableSettings = resolveSettings(repDef.id);
    if (tableSettings.showPageMarkers !== false && tableSettings.rowsPerPage > 0 && displayRows.length > 0) {
      var withMarkers = [];
      var pageNum = 1;
      for (var mi = 0; mi < displayRows.length; mi++) {
        withMarkers.push(displayRows[mi]);
        if ((mi + 1) % tableSettings.rowsPerPage === 0 && mi !== displayRows.length - 1) {
          withMarkers.push({
            __pageBreak: true,
            __pageBreakPage: pageNum
          });
          pageNum++;
        }
      }
      displayRows = withMarkers;
    }
    var scopeRowIds = filterActiveRows(store.getSourceRows(), state.activeCombination).map(function(row) {
      return row.id;
    });
    if (pipeline.resultCount === 0 && pipeline.totalCount > 0) {
      if (tableController) {
        tableController.destroy();
        tableController = null;
        tableControllerKey = null;
        tableControllerContainer = null;
      }
      container.innerHTML = "";
      var clearFilterBtn = el("button", {
        class: "btn btn--secondary"
      }, [ text("مسح الفلاتر والبحث") ]);
      clearFilterBtn.addEventListener("click", function() {
        resetQueryState();
        render();
      });
      container.appendChild(el("div", {
        class: "table-empty-state"
      }, [ el("div", {
        class: "fs-body",
        style: "font-weight:600;"
      }, [ text("لا توجد نتائج مطابقة") ]), el("div", {
        class: "fs-caption text-soft"
      }, [ text("جرّب تعديل الفلاتر أو مصطلح البحث.") ]), clearFilterBtn ]));
      var emptyStateIcon = container.querySelector(".table-empty-state");
      if (emptyStateIcon) emptyStateIcon.insertAdjacentHTML("afterbegin", '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" style="width:28px; height:28px; color:var(--text-faint);"><circle cx="10" cy="10" r="6"></circle><path d="M14.5 14.5L20 20M8 8l4 4M12 8l-4 4" stroke-linecap="round"></path></svg>');
      return;
    }
    var newKey = state.activeReportId + "|" + matrix.combinationKey(state.activeCombination) + "|month=" + (state.activeMonth || "*") + "|filterIds=" + state.sourceRowFilterVersion + "|cols=" + tableColumns.join(",");
    if (tableController && tableControllerKey === newKey && tableControllerContainer === container) {
      tableController.setRows(displayRows, {
        filterRows: sheet.rows,
        scopeRowIds
      });
      return;
    }
    if (tableController) tableController.destroy();
    container.innerHTML = "";
    tableControllerKey = newKey;
    tableControllerContainer = container;
    tableController = PH.viewTable.createTable(container, {
      columns: tableColumns,
      filterRows: sheet.rows,
      fillableColumns: validate.FILL_PRONE_TEXT_FIELDS,
      quantityColumns: [ "dispensed", "received", "balance" ],
      scopeRowIds,
      onToast: showToast,
      queryState: state.queryState,
      onRowEdit: state.activeReportId === "sourceRows" ? openSourceRowEditor : null,
      onRowDrilldown: state.activeReportId !== "sourceRows" ? openSourceRowsForIds : null,
      onRowDelete: state.activeReportId === "sourceRows" ? function(row) {
        confirmDialog({
          message: "حذف هذا الصف من البيانات المصدر؟",
          actions: [
            { label: "إلغاء", value: false, variant: "secondary" },
            { label: "حذف", value: true, variant: "danger" }
          ]
        }).then(function (confirmed) {
          if (!confirmed) return;
          store.setSourceRows(store.getSourceRows().filter(function(sourceRow) {
            return sourceRow.id !== row.id;
          }), "حذف صف مصدر", false);
          showToast("تم حذف الصف", true);
        });
      } : null,
      onSort: function(column, additive) {
        var levels = state.queryState.sortLevels.slice();
        var existingIdx = -1;
        for (var i = 0; i < levels.length; i++) if (levels[i].column === column) {
          existingIdx = i;
          break;
        }
        if (!additive) {
          if (existingIdx === 0 && levels.length === 1) {
            levels[0].direction = levels[0].direction === "asc" ? "desc" : levels[0].direction === "desc" ? null : "asc";
            if (levels[0].direction === null) levels = [];
          } else {
            levels = [ {
              column,
              direction: "asc"
            } ];
          }
        } else {
          if (existingIdx !== -1) {
            levels[existingIdx].direction = levels[existingIdx].direction === "asc" ? "desc" : "asc";
          } else {
            levels.push({
              column,
              direction: "asc"
            });
          }
        }
        state.queryState.sortLevels = levels;
        renderTableArea(container);
      },
      onFilterChange: function(column, selectedValues, totalCount) {
        var filters = state.queryState.filters.filter(function(f) {
          return f.column !== column;
        });
        if (selectedValues.length < totalCount) {
          filters.push({
            kind: "text-checklist",
            column,
            values: selectedValues
          });
        }
        state.queryState.filters = filters;
        renderTableArea(container);
      }
    });
    tableController.setRows(displayRows);
  }
  function grandTotalValueS(grandTotal) {
    if (grandTotal === undefined || grandTotal === null) return null;
    if (typeof grandTotal === "bigint") return grandTotal;
    if (typeof grandTotal === "object" && typeof grandTotal.value === "bigint") return grandTotal.value;
    return null;
  }
  function renderAuditPanel(container) {
    var rows = store.getSourceRows();
    var sheet = computeActiveSheet();
    var repDef = cfg.REPORTS_BY_ID[state.activeReportId];
    var filtered = hasActiveFilterOrSearch();
    container.innerHTML = "";
    var dl = el("dl");
    dl.appendChild(el("dt", {}, [ text("صفوف المصدر") ]));
    dl.appendChild(el("dd", {
      class: "num"
    }, [ text(String(rows.length)) ]));
    var gtValue = grandTotalValueS(sheet.grandTotal);
    if (gtValue !== null) {
      dl.appendChild(el("dt", {}, [ text(filtered ? "إجمالي النطاق قبل التصفية" : "الإجمالي المحسوب") ]));
      dl.appendChild(el("dd", {
        class: "num"
      }, [ text(PH.blocks.formatScaled(gtValue, cfg.decimalsForColumn("value"), true)) ]));
    }
    if (filtered && repDef && repDef.printTotalField) {
      var visibleTotal = computeViewRows(sheet, repDef).visibleTotal;
      if (visibleTotal !== null && visibleTotal !== undefined) {
        dl.appendChild(el("dt", {
          style: "color:var(--ink);"
        }, [ text("إجمالي النتائج الظاهرة") ]));
        dl.appendChild(el("dd", {
          class: "num",
          style: "color:var(--ink); font-weight:600;"
        }, [ text(PH.blocks.formatScaled(visibleTotal, cfg.decimalsForColumn(repDef.printTotalField), true)) ]));
      }
    }
    if (sheet.excludedNullOrZero !== undefined) {
      dl.appendChild(el("dt", {}, [ text("صفوف مستبعدة من الحركة") ]));
      dl.appendChild(el("dd", {
        class: "num"
      }, [ text(String(sheet.excludedNullOrZero)) ]));
    }
    container.appendChild(el("div", {
      class: "fs-caption text-faint"
    }, [ text("تدقيق") ]));
    container.appendChild(dl);
  }
  function buildDropZone(opts) {
    opts = opts || {};
    var dz = el("div", {
      class: "drop-zone",
      role: "button",
      tabindex: "0",
      style: "width:" + (opts.width || "480px") + ";"
    }, [ el("div", {
      class: "drop-zone__headline"
    }, [ text("اسحب ملف Excel أو CSV هنا، أو اضغط للاختيار") ]), el("div", {
      class: "fs-caption"
    }, [ text(opts.caption || "يدعم .xlsx .xls .xlsm .csv — أو الصق نطاقًا من Excel بـ Ctrl+V") ]) ]);
    dz.insertAdjacentHTML("afterbegin", '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" style="width:40px; height:40px;"><path d="M12 15V4m0 0l-3.5 3.5M12 4l3.5 3.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" stroke-linecap="round" stroke-linejoin="round"></path></svg>');
    var fileInput = el("input", {
      type: "file",
      accept: ".xlsx,.xls,.xlsm,.csv",
      style: "display:none;"
    });
    function open() {
      fileInput.click();
    }
    dz.addEventListener("click", open);
    dz.addEventListener("keydown", function(e) {
      if (e.target !== dz) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    var dragDepth = 0;
    dz.addEventListener("dragenter", function(e) {
      e.preventDefault();
      e.stopPropagation();
      dragDepth++;
      dz.setAttribute("data-dragover", "true");
    });
    dz.addEventListener("dragover", function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
    dz.addEventListener("dragleave", function(e) {
      e.stopPropagation();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) dz.setAttribute("data-dragover", "false");
    });
    dz.addEventListener("drop", function(e) {
      e.preventDefault();
      e.stopPropagation();
      dragDepth = 0;
      dz.setAttribute("data-dragover", "false");
      if (opts.onFile && e.dataTransfer && e.dataTransfer.files.length) opts.onFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener("change", function() {
      var file = fileInput.files.length ? fileInput.files[0] : null;
      fileInput.value = "";
      if (file && opts.onFile) opts.onFile(file);
    });
    return {
      node: dz,
      input: fileInput,
      open
    };
  }
  function openImportSourceDialog() {
    var overlay = el("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "استيراد بيانات",
      style: "position:fixed; inset:0; z-index:95; background:var(--scrim); display:flex; align-items:center; justify-content:center; padding:var(--sp-4);"
    });
    var panel = el("div", {
      class: "panel-2 glass",
      style: "width:min(540px, 94vw); display:flex; flex-direction:column; gap:var(--sp-4);"
    });
    panel.appendChild(el("div", {
      class: "fs-title"
    }, [ text("استيراد بيانات") ]));
    var zone = buildDropZone({
      width: "100%",
      caption: "يدعم .xlsx .xls .xlsm .csv",
      onFile: function(file) {
        removeDialog(overlay);
        handleFile(file);
      }
    });
    panel.appendChild(zone.node);
    panel.appendChild(zone.input);
    var row = el("div", {
      class: "row",
      style: "justify-content:flex-end; gap:var(--sp-2);"
    });
    var cancel = el("button", {
      class: "btn btn--secondary",
      type: "button"
    }, [ text("إلغاء") ]);
    cancel.addEventListener("click", function() {
      removeDialog(overlay);
    });
    var pick = el("button", {
      class: "btn btn--primary",
      type: "button"
    }, [ text("اختيار ملف") ]);
    pick.addEventListener("click", function() {
      zone.open();
    });
    row.appendChild(cancel);
    row.appendChild(pick);
    panel.appendChild(row);
    overlay.appendChild(panel);
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) removeDialog(overlay);
    });
    registerDialog(overlay, {
      initialFocus: pick
    });
  }
  function renderEmptyState() {
    var wrap = el("div", {
      class: "stack",
      style: "align-items:center; padding-top:60px;"
    });
    var zone = buildDropZone({
      onFile: handleFile
    });
    wrap.appendChild(zone.node);
    wrap.appendChild(zone.input);
    var actionsRow = el("div", {
      class: "row",
      style: "gap:var(--sp-2);"
    });
    var sampleBtn = el("button", {
      class: "btn btn--secondary"
    }, [ text("جرّب ببيانات تجريبية") ]);
    sampleBtn.addEventListener("click", loadSampleData);
    actionsRow.appendChild(sampleBtn);
    var templateBtn = el("button", {
      class: "btn btn--tertiary"
    });
    templateBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 4v11m0 0l-3.5-3.5M12 15l3.5-3.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M5 18.5h14" stroke-linecap="round"></path></svg><span>تحميل نموذج البيانات</span>';
    templateBtn.title = "ملف إكسل فارغ بالأعمدة الصحيحة وأمثلة، مع دليل الحقول المطلوبة والاختيارية";
    templateBtn.addEventListener("click", downloadTemplate);
    actionsRow.appendChild(templateBtn);
    wrap.appendChild(actionsRow);
    return wrap;
  }
  function decodeTextBuffer(buffer) {
    if (typeof TextDecoder === "undefined") return String(buffer || "");
    try {
      return new TextDecoder("utf-8", {
        fatal: true
      }).decode(buffer);
    } catch (utf8Error) {
      try {
        return new TextDecoder("windows-1256").decode(buffer);
      } catch (legacyError) {
        return new TextDecoder("utf-8").decode(buffer);
      }
    }
  }
  function handleFile(file) {
    var MAX_IMPORT_BYTES = 25 * 1024 * 1024;
    if (file && file.size > MAX_IMPORT_BYTES) {
      showToast("حجم الملف أكبر من الحد المسموح للاستيراد (25 ميجابايت)", false);
      return;
    }
    var ext = importer.fileExtensionOf(file.name);
    var reader = new FileReader;
    reader.onload = function() {
      try {
        var wb;
        if (ext === "csv") {
          var csvText = decodeTextBuffer(reader.result);
          var delimiter = csvText.indexOf("\t") !== -1 ? "\t" : csvText.indexOf(";") !== -1 ? ";" : ",";
          wb = importer.readWorkbookFromText(csvText, delimiter);
        } else wb = importer.readWorkbookFromArrayBuffer(reader.result);
        startImportFlow(wb);
      } catch (err) {
        showToast("تعذّرت قراءة الملف: " + (err && err.message ? err.message : "ملف غير صالح"), false);
      }
    };
    reader.onerror = function() {
      showToast("تعذّرت قراءة الملف من القرص", false);
    };
    reader.readAsArrayBuffer(file);
  }
  function bindPaste() {
    document.addEventListener("paste", function(e) {
      var target = e.target;
      var isEditable = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (isEditable) return;
      if (dialogStack.length) return;
      var text = e.clipboardData && e.clipboardData.getData("text");
      if (!text || text.indexOf("\n") === -1 && text.indexOf("\t") === -1) return;
      e.preventDefault();
      try {
        var wb = importer.parseClipboardText(text);
        if (wb && wb.SheetNames && wb.SheetNames.length) startImportFlow(wb);
      } catch (err) {
        showToast("تعذّرت قراءة المحتوى الملصق", false);
      }
    });
  }
  function openImportWizard(workbook) {
    var wiz = {
      step: workbook.SheetNames.length > 1 ? 0 : 1,
      workbook,
      sheetName: workbook.SheetNames[0],
      sampleAoa: [],
      headerRowIndex: 0,
      mapping: {},
      mergeSuggestions: {},
      mergeDecisions: {},
      extracted: [],
      enumCoercions: [],
      excludedRowIndexes: {},
      validation: null,
      reviewDirty: false
    };
    var STEP_LABELS = [ "الملف والورقة", "صف العناوين", "الأعمدة", "التعبئة التلقائية", "المراجعة" ];
    var overlay = el("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "استيراد البيانات",
      style: "position:fixed; inset:0; background:var(--paper-sunken); z-index:60; display:flex; flex-direction:column;"
    });
    var headerBar = el("div", {
      style: "padding:var(--sp-4) var(--sp-6); border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:var(--sp-2);"
    });
    var stepsHost = el("div", {
      class: "row",
      style: "gap:var(--sp-2); flex-wrap:wrap;"
    });
    var cancelBtn = el("button", {
      class: "btn btn--tertiary"
    }, [ text("إلغاء الاستيراد") ]);
    headerBar.appendChild(stepsHost);
    headerBar.appendChild(cancelBtn);
    var body = el("div", {
      style: "flex:1; overflow:auto; padding:var(--sp-6);"
    });
    var footer = el("div", {
      style: "padding:var(--sp-4) var(--sp-6); border-top:1px solid var(--line); display:flex; justify-content:space-between; align-items:center;"
    });
    overlay.appendChild(headerBar);
    overlay.appendChild(body);
    overlay.appendChild(footer);
    registerDialog(overlay);
    cancelBtn.addEventListener("click", function() {
      removeDialog(overlay);
    });
    function initFromSheet() {
      var ws = wiz.workbook.Sheets[wiz.sheetName];
      wiz.sampleAoa = importer.sheetToAoa(ws, importer.boundedRange(ws, 15)).slice(0, 15);
      var detect = importer.detectHeaderRow(wiz.sampleAoa);
      wiz.headerRowIndex = detect.rowIndex;
      recomputeMapping();
    }
    function recomputeMapping() {
      var headerRow = wiz.sampleAoa[wiz.headerRowIndex] || [];
      wiz.mapping = importer.buildMapping(headerRow);
      recomputeExtraction();
    }
    function recomputeExtraction() {
      var ws = wiz.workbook.Sheets[wiz.sheetName];
      wiz.mergeSuggestions = importer.detectMergeFillSuggestions(ws, wiz.mapping, wiz.headerRowIndex);
      wiz.mergeDecisions = {};
      Object.keys(wiz.mergeSuggestions).forEach(function(c) {
        wiz.mergeDecisions[c] = true;
      });
      applyMergeDecisions();
    }
    function applyMergeDecisions() {
      var MAX_IMPORT_ROWS = 1e5;
      var ws = wiz.workbook.Sheets[wiz.sheetName];
      var rows = importer.extractRows(ws, wiz.headerRowIndex, wiz.mapping);
      if (rows.length > MAX_IMPORT_ROWS) {
        rows = rows.slice(0, MAX_IMPORT_ROWS);
        if (!wiz.__rowLimitWarned) {
          wiz.__rowLimitWarned = true;
          showToast("الملف يحتوي على أكثر من " + MAX_IMPORT_ROWS + " صف — تم الاقتصار على أول " + MAX_IMPORT_ROWS + " صف", false);
        }
      }
      Object.keys(wiz.mergeDecisions).forEach(function(c) {
        if (!wiz.mergeDecisions[c]) return;
        var sugg = wiz.mergeSuggestions[c];
        var sheetRowToIndex = {};
        rows.forEach(function(row, i) {
          sheetRowToIndex[row.__sheetRow] = i;
        });
        var scopeRowIds = [];
        (sugg.rowRanges || []).forEach(function(range) {
          for (var wr = range.startRow; wr <= range.endRow; wr++) {
            if (sheetRowToIndex[wr] !== undefined) scopeRowIds.push(sheetRowToIndex[wr]);
          }
        });
        var result = store.fillBlanks(rows, {
          column: sugg.fieldKey,
          direction: "down",
          mode: "blanksOnly",
          boundaryColumn: "book",
          scopeRowIds
        });
        rows = result.rows;
      });
      wiz.extracted = rows;
      wiz.extracted.forEach(function(row, i) {
        row.__idx = i;
      });
      wiz.enumCoercions = [];
      [ "budget", "shift", "dispense" ].forEach(function(key) {
        var domain = cfg.DIMENSIONS[key];
        rows.forEach(function(row, rowIndex) {
          if (validate.isBlank(row[key])) return;
          var match = validate.closestEnumMatch(row[key], domain);
          if (match && match !== row[key]) {
            wiz.enumCoercions.push({
              rowIndex,
              column: key,
              from: row[key],
              to: match
            });
            row[key] = match;
          }
        });
      });
      wiz.excludedRowIndexes = {};
      revalidate();
    }
    function revalidate() {
      var rows = wiz.extracted.filter(function(r) {
        return !wiz.excludedRowIndexes[r.__idx];
      });
      wiz.validation = validate.validateDataset(rows, wiz.mapping);
      wiz.rowsForCommit = rows;
    }
    function renderSteps() {
      stepsHost.innerHTML = "";
      STEP_LABELS.forEach(function(label, i) {
        if (i === 0 && workbook.SheetNames.length <= 1) return;
        var pill = el("span", {
          class: "pill",
          "aria-pressed": wiz.step === i ? "true" : "false"
        }, [ text(i + 1 + ". " + label) ]);
        stepsHost.appendChild(pill);
      });
    }
    function goTo(step) {
      wiz.step = step;
      renderAll();
    }
    function renderFooter() {
      footer.innerHTML = "";
      var minStep = workbook.SheetNames.length > 1 ? 0 : 1;
      var backBtn = el("button", {
        class: "btn btn--secondary"
      }, [ text("رجوع") ]);
      var blockBack = wiz.step === 4 && wiz.reviewDirty;
      backBtn.disabled = wiz.step <= minStep || blockBack;
      if (blockBack) backBtn.title = "لا يمكن الرجوع بعد تطبيق تصحيحات في هذه الخطوة";
      backBtn.addEventListener("click", function() {
        goTo(wiz.step - 1);
      });
      footer.appendChild(backBtn);
      if (wiz.step < 4) {
        var nextBtn = el("button", {
          class: "btn btn--primary"
        }, [ text("التالي") ]);
        nextBtn.addEventListener("click", function() {
          goTo(wiz.step + 1);
        });
        footer.appendChild(nextBtn);
      } else {
        var commitBtn = el("button", {
          class: "btn btn--primary"
        }, [ text("استيراد " + wiz.rowsForCommit.length + " صف") ]);
        commitBtn.disabled = !wiz.validation.canCommit;
        if (!wiz.validation.canCommit) commitBtn.title = "يجب إصلاح أو استبعاد كل الصفوف التي بها أخطاء قبل الاستيراد";
        commitBtn.addEventListener("click", function() {
          confirmDialog({
            message: store.getSourceRows().length ? "توجد بيانات حالية. هل تريد إضافة الصفوف المستوردة إليها أم استبدالها؟" : "استيراد " + wiz.rowsForCommit.length + " صف؟",
            actions: store.getSourceRows().length ? [
              { label: "إلغاء", value: null, variant: "secondary" },
              { label: "إضافة", value: "append", variant: "secondary" },
              { label: "استبدال", value: "replace", variant: "danger" }
            ] : [
              { label: "إلغاء", value: null, variant: "secondary" },
              { label: "استيراد", value: "append", variant: "primary" }
            ]
          }).then(function (choice) {
            if (!choice) return;
            var replace = choice === "replace";
            var nextRows = replace ? wiz.rowsForCommit : store.getSourceRows().concat(wiz.rowsForCommit);
            store.setSourceRows(nextRows, replace ? "استبدال بالاستيراد" : "إضافة استيراد", replace);
            showToast("تم استيراد " + wiz.validation.summary.validCount + " صف صالح، " + wiz.validation.summary.problemRowCount + " صف به مشكلة", !replace);
            removeDialog(overlay);
          });
        });
        footer.appendChild(commitBtn);
      }
    }
    function renderAll() {
      renderSteps();
      renderFooter();
      body.innerHTML = "";
      if (wiz.step === 0) renderSheetStep(); else if (wiz.step === 1) renderHeaderStep(); else if (wiz.step === 2) renderMappingStep(); else if (wiz.step === 3) renderMergeStep(); else renderReviewStep();
      fadeRefresh(body);
      var toFocus = footer.querySelector(".btn--primary:not(:disabled)") || body.querySelector("input, select, button");
      if (toFocus) toFocus.focus({ preventScroll: true });
    }
    function renderSheetStep() {
      body.appendChild(el("div", {
        class: "fs-title"
      }, [ text("اختر الورقة") ]));
      var thumbs = importer.sheetThumbnails(wiz.workbook);
      var grid = el("div", {
        style: "display:grid; grid-template-columns:repeat(auto-fill, minmax(220px,1fr)); gap:var(--sp-4); margin-top:var(--sp-4);"
      });
      thumbs.forEach(function(t) {
        var card = el("div", {
          class: "panel-2",
          style: "cursor:pointer; border-color:" + (t.name === wiz.sheetName ? "var(--ink)" : "var(--line)") + ";"
        });
        card.appendChild(el("div", {
          style: "font-weight:600;"
        }, [ text(t.name) ]));
        var table = el("table", {
          class: "fs-caption",
          style: "margin-top:var(--sp-2); width:100%;"
        });
        t.preview.slice(0, 4).forEach(function(r) {
          var tr = el("tr");
          (r || []).slice(0, 4).forEach(function(c) {
            tr.appendChild(el("td", {
              style: "padding:1px 4px; color:var(--text-soft);"
            }, [ text(c === null || c === undefined ? "" : String(c).slice(0, 14)) ]));
          });
          table.appendChild(tr);
        });
        card.appendChild(table);
        card.addEventListener("click", function() {
          wiz.sheetName = t.name;
          initFromSheet();
          renderAll();
        });
        grid.appendChild(card);
      });
      body.appendChild(grid);
    }
    function renderHeaderStep() {
      if (!wiz.sampleAoa.length) initFromSheet();
      body.appendChild(el("div", {
        class: "fs-title"
      }, [ text("أي صف يحتوي عناوين الأعمدة؟") ]));
      body.appendChild(el("div", {
        class: "fs-caption text-soft"
      }, [ text("انقر على الصف الصحيح إن لم يكن الاختيار التلقائي مطابقًا.") ]));
      var table = el("table", {
        class: "fs-body",
        style: "margin-top:var(--sp-4); border-collapse:collapse; width:100%;"
      });
      wiz.sampleAoa.forEach(function(row, i) {
        var tr = el("tr", {
          style: "cursor:pointer; background:" + (i === wiz.headerRowIndex ? "var(--ink-wash)" : "transparent") + "; border-bottom:1px solid var(--line);"
        });
        tr.appendChild(el("td", {
          class: "fs-caption text-faint",
          style: "padding:var(--sp-1) var(--sp-2);"
        }, [ text(String(i + 1)) ]));
        (row || []).slice(0, 8).forEach(function(c) {
          tr.appendChild(el("td", {
            style: "padding:var(--sp-1) var(--sp-2);"
          }, [ text(c === null || c === undefined ? "" : String(c)) ]));
        });
        tr.addEventListener("click", function() {
          wiz.headerRowIndex = i;
          recomputeMapping();
          renderAll();
        });
        table.appendChild(tr);
      });
      body.appendChild(table);
    }
    function renderMappingStep() {
      body.appendChild(el("div", {
        class: "fs-title"
      }, [ text("تحقّق من ربط الأعمدة") ]));
      var missing = cfg.FIELDS.filter(function(f) {
        return f.required;
      }).filter(function(f) {
        return Object.keys(wiz.mapping).every(function(c) {
          return wiz.mapping[c] !== f.key;
        });
      });
      if (missing.length) {
        body.appendChild(el("div", {
          class: "fs-caption",
          style: "color:var(--err); margin:var(--sp-2) 0;"
        }, [ text("أعمدة مطلوبة غير مربوطة: " + missing.map(function(f) {
          return f.header;
        }).join("، ")) ]));
      }
      var headerRow = wiz.sampleAoa[wiz.headerRowIndex] || [];
      var table = el("table", {
        class: "fs-body",
        style: "margin-top:var(--sp-2); border-collapse:collapse; width:100%;"
      });
      var head = el("tr");
      head.appendChild(el("th", {
        class: "fs-caption text-soft",
        style: "text-align:start; padding:var(--sp-1) var(--sp-2);"
      }, [ text("عمود الملف") ]));
      head.appendChild(el("th", {
        class: "fs-caption text-soft",
        style: "text-align:start; padding:var(--sp-1) var(--sp-2);"
      }, [ text("يُربط بـ") ]));
      table.appendChild(head);
      headerRow.forEach(function(headerText, c) {
        if (headerText === null || headerText === undefined || String(headerText).trim() === "") return;
        var tr = el("tr", {
          style: "border-bottom:1px solid var(--line);"
        });
        tr.appendChild(el("td", {
          style: "padding:var(--sp-1) var(--sp-2);"
        }, [ text(String(headerText)) ]));
        var mappingOptions = [ {
          value: "",
          label: "— تجاهل —"
        } ].concat(cfg.FIELDS.map(function(f) {
          return {
            value: f.key,
            label: f.header + (f.required ? " *" : "")
          };
        }));
        var select = PH.ui.select(mappingOptions, wiz.mapping[c] || "", function(value) {
          wiz.mapping[c] = value || null;
          recomputeExtraction();
          renderAll();
        });
        var td = el("td", {
          style: "padding:var(--sp-1) var(--sp-2);"
        });
        td.appendChild(select);
        tr.appendChild(td);
        table.appendChild(tr);
      });
      body.appendChild(table);
    }
    function renderMergeStep() {
      body.appendChild(el("div", {
        class: "fs-title"
      }, [ text("تعبئة الخلايا المدمجة") ]));
      var colIdxs = Object.keys(wiz.mergeSuggestions);
      if (!colIdxs.length) {
        body.appendChild(el("div", {
          class: "fs-caption text-soft",
          style: "margin-top:var(--sp-2);"
        }, [ text("لا توجد خلايا مدمجة تحتاج تعبئة في هذا الملف.") ]));
        return;
      }
      body.appendChild(el("div", {
        class: "fs-caption text-soft"
      }, [ text("اكتشفنا أعمدة بها خلايا مدمجة رأسيًا في مصدر إكسل. التعبئة تنسخ القيمة للأسفل حتى تغيّر الدفتر.") ]));
      colIdxs.forEach(function(c) {
        var sugg = wiz.mergeSuggestions[c];
        var row = el("div", {
          class: "builder-row",
          style: "margin-top:var(--sp-2); justify-content:space-between;"
        });
        row.appendChild(el("div", {}, [ text(cfg.COLUMN_LABELS[sugg.fieldKey] + " — " + sugg.ranges + " نطاق، " + sugg.blankCells + " خلية") ]));
        var toggle = PH.ui.switchRow("تعبئة", wiz.mergeDecisions[c], function(newChecked) {
          wiz.mergeDecisions[c] = newChecked;
          applyMergeDecisions();
          renderAll();
        });
        row.appendChild(toggle);
        body.appendChild(row);
      });
    }
    function applyGroupFix(group, action) {
      if (action === "fill-down" || action === "fill-up") {
        var direction = action === "fill-down" ? "down" : "up";
        var columns = util.uniq(group.items.filter(function(p) {
          return p.rowIndex !== null;
        }).map(function(p) {
          return p.column;
        }));
        columns.forEach(function(column) {
          var result = store.fillBlanks(wiz.extracted, {
            column,
            direction,
            mode: "blanksOnly",
            boundaryColumn: "book"
          });
          wiz.extracted = result.rows;
        });
      } else {
        group.items.forEach(function(p) {
          if (p.rowIndex === null) return;
          var row = wiz.extracted[p.rowIndex];
          if (!row) return;
          if (action === "exclude-row") {
            wiz.excludedRowIndexes[p.rowIndex] = true;
          } else if (action === "set-zero") {
            row[p.column] = 0;
          } else if (action === "strip-non-numeric") {
            if (!row.__raw || !(p.column in row.__raw)) return;
            var stripped = norm.parseNumber(String(row.__raw[p.column]).replace(/[^\d.,٠-٩\u066B\u066C-]/g, ""));
            row[p.column] = stripped;
          } else if (action === "replace" && p.fix && p.fix.value) {
            row[p.column] = p.fix.value;
          } else if (action === "keep-one") {
            wiz.excludedRowIndexes[p.rowIndex] = true;
          }
        });
      }
      wiz.reviewDirty = true;
      revalidate();
      renderAll();
    }
    function renderReviewStep() {
      revalidate();
      var s = wiz.validation.summary;
      body.appendChild(el("div", {
        class: "fs-title"
      }, [ text("مراجعة قبل الاستيراد") ]));
      var summaryRow = el("div", {
        class: "row",
        style: "gap:var(--sp-4); margin:var(--sp-3) 0;"
      });
      summaryRow.appendChild(el("div", {
        class: "fs-body"
      }, [ text(String(s.validCount) + " صف صالح") ]));
      if (s.problemRowCount) summaryRow.appendChild(el("div", {
        class: "fs-body",
        style: "color:var(--err);"
      }, [ text(String(s.problemRowCount) + " صف به مشكلة") ]));
      if (s.duplicateCount) summaryRow.appendChild(el("div", {
        class: "fs-caption text-soft"
      }, [ text(String(s.duplicateCount) + " صف مكرر") ]));
      if (Object.keys(wiz.excludedRowIndexes).length) summaryRow.appendChild(el("div", {
        class: "fs-caption text-soft"
      }, [ text(Object.keys(wiz.excludedRowIndexes).length + " صف مستبعد") ]));
      if (wiz.enumCoercions.length) summaryRow.appendChild(el("div", {
        class: "fs-caption",
        style: "color:var(--ok);"
      }, [ text("طُبِّقت " + wiz.enumCoercions.length + " تصحيحات تلقائية للقيم المعروفة") ]));
      body.appendChild(summaryRow);
      var groups = validate.groupRepeats(wiz.validation.problems);
      if (!groups.length) {
        body.appendChild(el("div", {
          class: "fs-caption text-soft"
        }, [ text("لا توجد مشاكل — جاهز للاستيراد.") ]));
      }
      groups.forEach(function(g) {
        var sevColor = g.severity === "blocker" || g.severity === "error" ? "var(--err)" : g.severity === "warning" ? "var(--brass)" : "var(--text-soft)";
        var row = el("div", {
          class: "builder-row",
          style: "margin-top:var(--sp-2); justify-content:space-between; border-inline-start:2px solid " + sevColor + ";"
        });
        row.appendChild(el("div", {}, [ text(g.count + "× — " + g.sample.message) ]));
        var actions = el("div", {
          class: "row",
          style: "gap:var(--sp-1);"
        });
        if (g.sample.fix && g.sample.fix.type === "choice") {
          g.sample.fix.options.forEach(function(opt) {
            var label = {
              "fill-down": "تعبئة من الأعلى",
              "fill-up": "تعبئة من الأسفل",
              "exclude-row": "استبعاد الصفوف",
              "set-zero": "تصفير القيمة",
              "keep-one": "الاحتفاظ بواحد فقط",
              "keep-both": "الاحتفاظ بالكل"
            }[opt] || opt;
            var btn = el("button", {
              class: "btn btn--secondary"
            }, [ text(label) ]);
            btn.addEventListener("click", function() {
              applyGroupFix(g, opt);
            });
            actions.appendChild(btn);
          });
        } else if (g.sample.fix && g.sample.fix.type === "replace") {
          var btn2 = el("button", {
            class: "btn btn--secondary"
          }, [ text('استبدال بـ "' + g.sample.fix.value + '" للكل') ]);
          btn2.addEventListener("click", function() {
            applyGroupFix(g, "replace");
          });
          actions.appendChild(btn2);
        } else if (g.sample.fix && g.sample.fix.type === "strip-non-numeric") {
          var btn3 = el("button", {
            class: "btn btn--secondary"
          }, [ text("إزالة الأحرف غير الرقمية") ]);
          btn3.addEventListener("click", function() {
            applyGroupFix(g, "strip-non-numeric");
          });
          actions.appendChild(btn3);
        } else if (g.sample.fix && g.sample.fix.type === "scroll-to-mapping") {
          var btn4 = el("button", {
            class: "btn btn--secondary"
          }, [ text("الذهاب إلى ربط الأعمدة") ]);
          btn4.addEventListener("click", function() {
            goTo(2);
          });
          actions.appendChild(btn4);
        }
        row.appendChild(actions);
        body.appendChild(row);
      });
    }
    initFromSheet();
    renderAll();
  }
  function startImportFlow(workbook) {
    openImportWizard(workbook);
  }
  function loadSampleData() {
    function proceed() {
      var source = window.PH_FIXTURES && window.PH_FIXTURES.source || PH.selftest.generateFixtureSource(20260701, 40);
      store.setSourceRows(source.slice(0, 40), "تحميل بيانات تجريبية", true);
    }
    if (!store.getSourceRows().length) { proceed(); return; }
    confirmDialog({
      message: "سيؤدي تحميل البيانات التجريبية إلى استبدال البيانات الحالية. هل تريد المتابعة؟",
      actions: [
        { label: "إلغاء", value: false, variant: "secondary" },
        { label: "استبدال", value: true, variant: "danger" }
      ]
    }).then(function (confirmed) { if (confirmed) proceed(); });
  }
  function updateSaveStateEl() {
    var saveEl = $("save-state");
    if (saveEl) {
      var s = store.getSaveState();
      saveEl.textContent = s === "saved" ? "تم الحفظ" : s === "pending" ? "جارِ الحفظ…" : s === "error" ? "تعذّر الحفظ — صدّر نسخة احتياطية" : "";
      saveEl.style.color = s === "error" ? "var(--err)" : "";
    }
    updateSaveErrorBanner();
  }
  var saveErrorBannerDismissed = false;
  var lastSaveStateSeen = null;
  function updateSaveErrorBanner() {
    var banner = $("save-error-banner");
    var dot = $("save-status-dot");
    if (!banner) return;
    var s = store.getSaveState();
    if (s === "error" && lastSaveStateSeen !== "error") saveErrorBannerDismissed = false;
    lastSaveStateSeen = s;
    if (dot) dot.style.display = s === "error" ? "block" : "none";
    if (s !== "error" || saveErrorBannerDismissed) {
      banner.style.display = "none";
      return;
    }
    banner.innerHTML = "";
    var reason = store.getDbUnavailableReason();
    var msg = reason === "blocked" ? "التخزين المحلي بانتظار إغلاق تبويب آخر لهذا التطبيق — أغلق التبويبات الأخرى ثم أعد تحميل الصفحة. صدّر نسخة احتياطية للاحتياط" : store.isDbUnavailable() ? "التخزين المحلي غير متاح — البيانات لن تُحفظ عند إغلاق الصفحة. صدّر نسخة احتياطية قبل الإغلاق" : "تعذّر حفظ آخر التعديلات — صدّر نسخة احتياطية قبل إغلاق الصفحة";
    banner.appendChild(text(msg));
    var exportBtn = el("button", {
      class: "btn btn--secondary"
    }, [ text("تصدير نسخة احتياطية") ]);
    exportBtn.addEventListener("click", exportWorkspaceBackup);
    banner.appendChild(exportBtn);
    var dismissBtn = el("button", {
      class: "btn btn--ghost btn--icon",
      type: "button",
      title: "إغلاق",
      style: "width:28px; height:28px;"
    }, [ text("✕") ]);
    dismissBtn.addEventListener("click", function() {
      saveErrorBannerDismissed = true;
      banner.style.display = "none";
    });
    banner.appendChild(dismissBtn);
    banner.style.display = "flex";
  }
  function render() {
    renderReportTabs($("report-tabs"));
    updateReportSwitcherDropdown();
    updateScopeButton();
    var sf = $("search-field");
    if (sf && document.activeElement !== sf && sf.value.charAt(0) !== ">") {
      sf.value = state.queryState.searchText || "";
    }
    renderMain($("main-content"));
    var hasData = store.getSourceRows().length > 0;
    var printBtn = $("btn-print");
    var exportBtn = $("btn-export");
    var settingsDrawerBtn = $("btn-settings-drawer");
    if (printBtn) printBtn.style.display = hasData ? "" : "none";
    if (exportBtn) exportBtn.style.display = hasData ? "" : "none";
    if (settingsDrawerBtn) settingsDrawerBtn.style.display = hasData ? "" : "none";
    if (!hasData) closeAnchoredPopover();
    updateSaveStateEl();
  }
  function bindKeyboard() {
    document.addEventListener("keydown", function(e) {
      if ((e.key === "Enter" || e.key === " ") && e.target && e.target.getAttribute("role") === "switch") {
        e.preventDefault();
        e.target.click();
      }
    });
    document.addEventListener("keydown", function(e) {
      var ctrl = e.ctrlKey || e.metaKey;
      var alt = e.altKey;
      var target = e.target;
      var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.key === "Escape") {
        if (dialogStack.length) {
          e.preventDefault();
          removeDialog(dialogStack[dialogStack.length - 1]);
          return;
        }
        if (overflowMenuOpen) {
          e.preventDefault();
          closeOverflowMenu();
          var t = $("btn-overflow-toggle");
          if (t) t.focus();
          return;
        }
      }
      var editable = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (ctrl && key === "k") {
        e.preventDefault();
        var sf = $("search-field");
        if (sf) {
          var wrap = $("search-field-wrap");
          if (wrap) wrap.classList.add("is-expanded");
          if (sf.value.charAt(0) !== ">") sf.value = ">";
          sf.focus();
          sf.select();
          sf.dispatchEvent(new Event("input"));
        }
        return;
      }
      if (editable) return;
      if (ctrl && key === "f") {
        var search = $("search-field");
        if (search) {
          var searchWrap = $("search-field-wrap");
          if (searchWrap) searchWrap.classList.add("is-expanded");
          e.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }
      if (ctrl && key === "z" && !e.shiftKey) {
        e.preventDefault();
        var l = store.undo();
        if (l) {
          showToast("تراجع: " + l);
        }
      } else if (ctrl && (key === "y" || key === "z" && e.shiftKey)) {
        e.preventDefault();
        var l2 = store.redo();
        if (l2) {
          showToast("إعادة: " + l2);
        }
      } else if (alt && /^Digit[1-8]$/.test(e.code)) {
        e.preventDefault();
        var shortcutDigit = e.code.slice(5);
        var rep = cfg.REPORTS.filter(function(r) {
          return r.shortcut === shortcutDigit;
        })[0];
        if (rep) {
          if (state.activeReportId !== rep.id) resetQueryState();
          state.activeReportId = rep.id;
          render();
        }
      } else if (ctrl && key === "p") {
        e.preventDefault();
        openPrintPreview();
      } else if (ctrl && key === "e") {
        e.preventDefault();
        openExportDialog();
      } else if (ctrl && key === ",") {
        e.preventDefault();
        openSettingsDrawer();
      } else if (ctrl && e.shiftKey && key === "t") {
        e.preventDefault();
        runSelfTestOverlay();
      }
    });
  }
  function isViewCustomized() {
    return state.queryState.filters.length > 0 || !!state.queryState.searchText || state.queryState.sortLevels.length > 0;
  }
  function hasActiveFilterOrSearch() {
    return state.queryState.filters.length > 0 || !!state.queryState.searchText;
  }
  function reportUsesBlocking(repDef) {
    return repDef.columns.indexOf("cumulative") !== -1;
  }
  function computeViewRows(sheet, repDef) {
    var textCols = repDef.columns.filter(function(c) {
      return !cfg.MONEY_COLUMNS[c] && c !== "pageNo" && c !== "printPageNo";
    });
    var pipeline = query.runPipeline(sheet.rows, state.queryState, textCols, columnTypesFor(repDef.columns));
    var rows = pipeline.sorted;
    if (reportUsesBlocking(repDef) && isViewCustomized()) {
      var settings = resolveSettings(repDef.id);
      rows = blk.applyBlocks(rows, {
        blockSize: settings.blockSize,
        cumulativeMode: settings.cumulativeMode,
        cumulativeAgg: settings.cumulativeAgg || "sum",
        showPartialBlockTotal: settings.showPartialBlockTotal,
        valueField: repDef.printTotalField || "value"
      });
    }
    if (hasActiveFilterOrSearch()) {
      pipeline.visibleTotal = query.visibleTotalFor(rows, repDef.printTotalField);
      rows = query.markScopeTotals(rows);
    }
    pipeline.rows = rows;
    return pipeline;
  }
  function outputRowsFor(sheet, repDef) {
    if (!state.applyToPrintExport || !isViewCustomized()) return sheet.rows;
    return computeViewRows(sheet, repDef).rows;
  }
  function activeScopeSuffix() {
    var parts = cfg.DIMENSION_ORDER.map(function(dim) {
      return reports.dimLabel(state.activeCombination, dim);
    }).filter(function(label) {
      return label !== "الكل";
    });
    if (state.activeMonth) parts.push("الشهر: " + state.activeMonth);
    return parts.length ? " — " + parts.join(" · ") : "";
  }
  function openPrintPreview(opts) {
    opts = opts || {};
    if (!store.getSourceRows().length) {
      showToast("لا توجد بيانات لمعاينة الطباعة", false);
      return;
    }
    var sheet = computeActiveSheet();
    var repDef = cfg.REPORTS_BY_ID[state.activeReportId];
    var settings = resolveSettings(state.activeReportId);
    var outputRows = outputRowsFor(sheet, repDef);
    var printColumns = visibleColumnsFor(repDef.id, cfg.printableColumns(repDef.columns));
    var isFilteredForDisplay = hasActiveFilterOrSearch();
    var reportLabel = repDef.label + activeScopeSuffix() + (isFilteredForDisplay ? " (مصفّى)" : "");
    var orientation = settings.printOrientation || "portrait";
    var largePreviewConfirmed = false;
    var calibration = {
      offsetTopMm: 0,
      offsetBottomMm: 0,
      offsetInnerMm: 0,
      offsetOuterMm: 0,
      scalePercent: 0
    };
    var showingRuler = false;
    var overlay = el("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "معاينة الطباعة",
      style: "position:fixed; inset:0; background:var(--paper-sunken); z-index:50; display:flex; flex-direction:column;"
    });
    var calibrateBtnEl = el("button", {
      class: "btn btn--tertiary"
    });
    calibrateBtnEl.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"></circle><path d="M12 3.5v2.1M12 18.4v2.1M20.5 12h-2.1M5.6 12H3.5M17.66 6.34l-1.49 1.49M7.83 16.17l-1.49 1.49M17.66 17.66l-1.49-1.49M7.83 7.83L6.34 6.34" stroke-linecap="round"></path></svg><span>معايرة الطباعة</span>';
    var toolbar = el("div", {
      class: "print-preview-toolbar"
    }, [ el("button", {
      class: "btn btn--secondary"
    }, [ text("إغلاق") ]), calibrateBtnEl, el("button", {
      class: "btn btn--tertiary"
    }, [ text(orientation === "portrait" ? "الاتجاه: رأسي" : "الاتجاه: أفقي") ]), el("button", {
      class: "btn btn--primary"
    }, [ text("طباعة") ]) ]);
    var closeBtn = toolbar.children[0];
    var calibrateBtn = toolbar.children[1];
    var orientationBtn = toolbar.children[2];
    var printBtn = toolbar.children[3];
    var body = el("div", {
      style: "flex:1; display:flex; overflow:hidden;"
    });
    var previewContainer = el("div", {
      style: "flex:1; overflow:auto;"
    });
    var calPanel = el("div", {
      class: "panel-2",
      style: "width:280px; margin:var(--sp-4); display:none; flex-direction:column; gap:var(--sp-3); overflow:auto;"
    });
    body.appendChild(previewContainer);
    body.appendChild(calPanel);
    overlay.appendChild(toolbar);
    overlay.appendChild(body);
    registerDialog(overlay, {
      onClose: function() {
        PH.print.clearMeasureCache();
        if (previewContainer.__pageObserver) previewContainer.__pageObserver.disconnect();
      }
    });
    function refreshPreview() {
      if (showingRuler) {
        previewContainer.innerHTML = "";
        var shell = el("div", {
          class: "print-preview-shell"
        });
        shell.appendChild(PH.print.buildCalibrationRulerPage(calibration, orientation));
        previewContainer.appendChild(shell);
        fadeRefresh(previewContainer);
      } else {
        var previewOpts = {
          rowsPerPage: settings.rowsPerPage || 24,
          columns: printColumns,
          reportLabel,
          orientation,
          calibration,
          isFiltered: isFilteredForDisplay,
          hasFilledMoney: outputRows.some(function(r) {
            return r.__filled || r.__fromFilled;
          }),
          printTotalField: resolvePrintTotalField(repDef),
          largeConfirmed: largePreviewConfirmed,
          pharmacyProfile: state.pharmacyProfile,
          userProfile: state.userProfile
        };
        var result = PH.print.renderPreview(previewContainer, outputRows, previewOpts);
        if (result && result.needsConfirm) {
          confirmDialog({
            message: "هذا التقرير يحتوي على " + result.pageCount + " صفحة، وقد يستغرق عرضها وقتًا طويلاً. هل تريد المتابعة؟",
            actions: [
              { label: "إلغاء", value: false, variant: "secondary" },
              { label: "متابعة", value: true, variant: "primary" }
            ]
          }).then(function (confirmed) {
            if (confirmed) {
              largePreviewConfirmed = true;
              refreshPreview();
            } else {
              previewContainer.innerHTML = "";
              previewContainer.appendChild(el("div", {
                class: "print-preview-page",
                style: "padding:var(--sp-6); text-align:center;"
              }, [ text("تم إلغاء المعاينة (" + result.pageCount + " صفحة).") ]));
              fadeRefresh(previewContainer);
            }
          });
        } else {
          fadeRefresh(previewContainer);
        }
      }
    }
    function persistCalibration() {
      store.saveCalibrationProfile("default", calibration);
    }
    function numField(labelText, key, min, max, step) {
      var input = el("input", {
        class: "input",
        type: "number",
        min: String(min),
        max: String(max),
        step: String(step),
        style: "width:100%;"
      });
      input.value = calibration[key];
      input.addEventListener("change", function() {
        var v = parseFloat(input.value);
        if (isNaN(v)) v = 0;
        v = Math.max(min, Math.min(max, v));
        input.value = v;
        calibration[key] = v;
        persistCalibration();
        refreshPreview();
      });
      return el("div", {
        class: "field"
      }, [ el("label", {}, [ text(labelText) ]), input ]);
    }
    function buildCalPanel() {
      calPanel.innerHTML = "";
      calPanel.appendChild(el("div", {
        class: "fs-body",
        style: "font-weight:600;"
      }, [ text("معايرة الطباعة") ]));
      calPanel.appendChild(el("div", {
        class: "fs-caption text-soft"
      }, [ text("اطبع صفحة المعايرة، قِس الهامش الفعلي بمسطرة، ثم عدّل القيم هنا حتى يطابق التصميم المطبوع.") ]));
      calPanel.appendChild(numField("إزاحة الهامش العلوي (مم)", "offsetTopMm", -15, 15, .5));
      calPanel.appendChild(numField("إزاحة الهامش السفلي (مم)", "offsetBottomMm", -15, 15, .5));
      calPanel.appendChild(numField("إزاحة الهامش الداخلي (مم)", "offsetInnerMm", -15, 15, .5));
      calPanel.appendChild(numField("إزاحة الهامش الخارجي (مم)", "offsetOuterMm", -15, 15, .5));
      calPanel.appendChild(numField("تصحيح المقياس (%)", "scalePercent", -5, 5, .5));
      var geo = PH.print.resolveGeo(PH.print.DEFAULT_GEO, calibration);
      var assertion = PH.paginate.assertGeometry(Object.assign({
        rowsPerPage: settings.rowsPerPage || 24,
        orientation
      }, geo));
      if (!assertion.ok) {
        calPanel.appendChild(el("div", {
          class: "fs-caption",
          style: "color:var(--err);"
        }, [ text("القيم الحالية تجعل الصفحة غير قابلة للطباعة: " + assertion.errors.join("، ")) ]));
      }
      var rulerBtn = el("button", {
        class: "btn btn--secondary"
      }, [ text(showingRuler ? "عرض المعاينة العادية" : "معاينة صفحة المعايرة") ]);
      rulerBtn.addEventListener("click", function() {
        showingRuler = !showingRuler;
        refreshPreview();
        buildCalPanel();
      });
      calPanel.appendChild(rulerBtn);
      var resetBtn = el("button", {
        class: "btn btn--tertiary"
      }, [ text("إعادة الضبط للافتراضي") ]);
      resetBtn.addEventListener("click", function() {
        calibration = {
          offsetTopMm: 0,
          offsetBottomMm: 0,
          offsetInnerMm: 0,
          offsetOuterMm: 0,
          scalePercent: 0
        };
        persistCalibration();
        refreshPreview();
        buildCalPanel();
      });
      calPanel.appendChild(resetBtn);
    }
    closeBtn.addEventListener("click", function() {
      removeDialog(overlay);
    });
    calibrateBtn.addEventListener("click", function() {
      var isOpen = calPanel.style.display !== "none";
      calPanel.style.display = isOpen ? "none" : "flex";
    });
    orientationBtn.addEventListener("click", function() {
      var nextOrientation = orientation === "portrait" ? "landscape" : "portrait";
      var geoCheck = checkPrintGeometry(settings.rowsPerPage || 24, nextOrientation);
      if (!geoCheck.ok) {
        showToast("عدد الصفوف الحالي كبير جدًا لهذا الاتجاه", false);
        return;
      }
      orientation = nextOrientation;
      orientationBtn.textContent = orientation === "portrait" ? "الاتجاه: رأسي" : "الاتجاه: أفقي";
      applySettingChange("report", state.activeReportId, {
        printOrientation: orientation
      });
      refreshPreview();
      if (calPanel.style.display !== "none") buildCalPanel();
    });
    printBtn.addEventListener("click", function() {
      runPrintJobWithConfirm(false, false);
    });
    function runPrintJobWithConfirm(largeConfirmed, geometryConfirmed) {
      var result = PH.print.runPrintJob(outputRows, {
        rowsPerPage: settings.rowsPerPage || 24,
        columns: printColumns,
        reportLabel,
        orientation,
        calibration,
        isFiltered: isFilteredForDisplay,
        hasFilledMoney: outputRows.some(function(r) {
          return r.__filled || r.__fromFilled;
        }),
        printTotalField: resolvePrintTotalField(repDef),
        largeConfirmed,
        geometryConfirmed,
        pharmacyProfile: state.pharmacyProfile,
        userProfile: state.userProfile
      });
      if (result && result.geometryInvalid) {
        showToast("هوامش الصفحة الحالية غير صالحة للطباعة: " + result.geometryErrors.join(" — "), false);
        return;
      }
      if (result && result.needsConfirm) {
        confirmDialog({
          message: "هذا التقرير يحتوي على " + result.pageCount + " صفحة، وقد تستغرق طباعتها وقتًا طويلاً. هل تريد المتابعة؟",
          actions: [
            { label: "إلغاء", value: false, variant: "secondary" },
            { label: "متابعة", value: true, variant: "primary" }
          ]
        }).then(function (confirmed) {
          if (confirmed) runPrintJobWithConfirm(true, geometryConfirmed);
        });
      }
    }
    store.loadCalibrationProfiles().then(function(profiles) {
      if (profiles && profiles["default"]) calibration = Object.assign({
        offsetTopMm: 0,
        offsetBottomMm: 0,
        offsetInnerMm: 0,
        offsetOuterMm: 0,
        scalePercent: 0
      }, profiles["default"]);
      buildCalPanel();
      refreshPreview();
      if (opts.openCalibration) calibrateBtn.click();
    }).catch(function() {
      buildCalPanel();
      refreshPreview();
      if (opts.openCalibration) calibrateBtn.click();
    });
  }
  function exportPipelineRows(sheet, repDef, applyView) {
    if (!applyView || !isViewCustomized() || repDef.id !== state.activeReportId) return sheet.rows;
    return computeViewRows(sheet, repDef).rows;
  }
  function totalsDiagram(kind) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 90 36");
    svg.setAttribute("width", "90");
    svg.setAttribute("height", "36");
    function cell(x, y, w, h, fill) {
      var r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", x);
      r.setAttribute("y", y);
      r.setAttribute("width", w);
      r.setAttribute("height", h);
      r.setAttribute("rx", "1.5");
      r.setAttribute("fill", fill);
      r.setAttribute("stroke", "var(--line-strong)");
      svg.appendChild(r);
      return r;
    }
    for (var row = 0; row < 3; row++) {
      cell(2, 2 + row * 11, 60, 9, "var(--paper-sunken)");
    }
    if (kind === "cumsum") {
      cell(66, 2, 22, 31, "var(--brass)");
    } else if (kind === "sum") {
      cell(72, 2, 16, 31, "var(--brass)");
    } else if (kind === "group") {
      cell(2, 25, 84, 8, "var(--brass)");
    }
    return svg;
  }
  function openExportDialog() {
    var rows = store.getSourceRows();
    var monthValues = rows.map(function(r) {
      return r.month;
    }).filter(function(v, i, a) {
      return v && a.indexOf(v) === i;
    });
    var exportMonth = monthValues.length === 1 ? monthValues[0] : monthValues.length ? "متعدد" : "غير-محدد";
    var combos = matrix.nonEmpty(matrix.materialize(rows, state.dimensionGroups));
    var availableReports = cfg.REPORTS.slice().sort(function(a, b) {
      return a.order - b.order;
    }).filter(function(rep) {
      return !(rows.length > 0 && rep.requiresOptional.some(function(col) {
        return !rows.some(function(r) {
          return r[col] !== undefined && r[col] !== null;
        });
      }));
    });
    if (!availableReports.length || !combos.length) {
      showToast("لا توجد بيانات لتصديرها بعد.", false);
      return;
    }
    var comboMap = {};
    combos.forEach(function(c) {
      comboMap[c.key] = c;
    });
    var plan = {
      reports: availableReports.some(function(r) {
        return r.id === state.activeReportId;
      }) ? [ state.activeReportId ] : [ availableReports[0].id ],
      slices: combos.map(function(c) {
        return c.key;
      }),
      layout: "one-workbook",
      sheetSplit: "per-slice",
      applyView: !!state.applyToPrintExport,
      grandTotal: {
        enabled: true,
        field: null
      },
      layers: []
    };
    function reportById(id) {
      return cfg.REPORTS_BY_ID[id];
    }
    function numericColumnsForPlan() {
      var repDefs = plan.reports.map(reportById).filter(Boolean);
      if (!repDefs.length) return [];
      var order = [];
      var seen = {};
      repDefs[0].columns.forEach(function(c) {
        if (cfg.isNumericColumn(c) && !seen[c]) {
          seen[c] = true;
          order.push(c);
        }
      });
      return order.filter(function(c) {
        return repDefs.every(function(r) {
          return r.columns.indexOf(c) !== -1;
        });
      });
    }
    function defaultFieldForPlan() {
      var firstRep = reportById(plan.reports[0]);
      return firstRep && firstRep.printTotalField || numericColumnsForPlan()[0] || null;
    }
    function ensureGrandTotalValid() {
      if (plan.grandTotal.enabled && (!plan.grandTotal.field || numericColumnsForPlan().indexOf(plan.grandTotal.field) === -1)) {
        plan.grandTotal.field = defaultFieldForPlan();
        if (!plan.grandTotal.field) plan.grandTotal.enabled = false;
      }
    }
    plan.grandTotal.field = defaultFieldForPlan();
    if (!plan.grandTotal.field) plan.grandTotal.enabled = false;
    var layerIdSeq = 0;
    function makeLayerId() {
      layerIdSeq++;
      return "l" + layerIdSeq + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    function freshDraftLayer() {
      return {
        id: null,
        field: defaultFieldForPlan(),
        reset: "block",
        resetOn: null,
        running: false,
        every: false,
        place: "column",
        label: null
      };
    }
    var draftLayer = freshDraftLayer();
    function previewLayers() {
      if (!draftLayer.field) return plan.layers;
      if (draftLayer.reset === "group" && !draftLayer.resetOn) return plan.layers;
      var draftCopy = {};
      for (var k in draftLayer) draftCopy[k] = draftLayer[k];
      draftCopy.id = draftLayer.id || "__draft__";
      return plan.layers.concat([ draftCopy ]);
    }
    function exportContractPlan() {
      return {
        reports: plan.reports,
        sheetSplit: plan.sheetSplit,
        grandTotal: plan.grandTotal,
        layers: plan.layers
      };
    }
    function textColumnsForPlan() {
      var firstRep = reportById(plan.reports[0]);
      if (!firstRep) return [];
      return firstRep.columns.filter(function(c) {
        return !cfg.MONEY_COLUMNS[c] && c !== "id" && c !== "actions";
      });
    }
    function onlyPages() {
      return plan.reports.length === 1 && plan.reports[0] === "pages";
    }
    function applySavedPlan(saved) {
      if (!saved) return;
      if (Array.isArray(saved.reports)) {
        var validIds = availableReports.map(function(r) {
          return r.id;
        });
        var filteredReports = saved.reports.filter(function(id) {
          return validIds.indexOf(id) !== -1;
        });
        if (filteredReports.length) plan.reports = filteredReports;
      }
      if (Array.isArray(saved.slices)) {
        var validKeys = combos.map(function(c) {
          return c.key;
        });
        var filteredSlices = saved.slices.filter(function(k) {
          return validKeys.indexOf(k) !== -1;
        });
        if (filteredSlices.length) plan.slices = filteredSlices;
      }
      if (saved.layout === "one-workbook" || saved.layout === "zip" || saved.layout === "csv") plan.layout = saved.layout;
      if (saved.sheetSplit === "per-slice" || saved.sheetSplit === "combined") plan.sheetSplit = saved.sheetSplit;
      if (typeof saved.applyView === "boolean") plan.applyView = saved.applyView;
      if (saved.grandTotal || saved.layers) {
        var candidate = {
          reports: plan.reports,
          sheetSplit: plan.sheetSplit,
          grandTotal: saved.grandTotal,
          layers: saved.layers
        };
        var v = PH.exportPlan.validatePlan(candidate);
        if (v.ok) {
          plan.grandTotal = saved.grandTotal;
          plan.layers = saved.layers;
        } else {
          plan.grandTotal.field = defaultFieldForPlan();
          showToast("تعذّرت قراءة إعدادات الإجمالي المحفوظة، تمت إعادة التعيين للافتراضي.", false);
        }
      } else if (saved.totals) {
        showToast("تعذّرت قراءة إعدادات الإجمالي المحفوظة (صيغة قديمة)، تمت إعادة التعيين للافتراضي.", false);
      }
    }
    function sheetCountEstimate() {
      var n = 0;
      plan.reports.forEach(function(id) {
        if (id === "pages") {
          n += 1;
          return;
        }
        var sliceCount = plan.slices.length || 1;
        n += plan.sheetSplit === "combined" && sliceCount > 1 ? 1 : sliceCount;
      });
      return n;
    }
    function checklistRow(labelText, checked, onToggle, disabledReason) {
      var row = el("label", {
        class: "row",
        style: "gap:var(--sp-2); align-items:center; font-size:var(--fs-body); cursor:" + (disabledReason ? "default" : "pointer") + "; opacity:" + (disabledReason ? "0.5" : "1") + ";"
      });
      var cb = el("input", {
        type: "checkbox"
      });
      cb.checked = checked;
      if (disabledReason) cb.disabled = true;
      cb.addEventListener("change", function() {
        onToggle(cb.checked);
        refresh();
      });
      row.appendChild(cb);
      row.appendChild(el("span", {}, [ text(labelText) ]));
      if (disabledReason) row.appendChild(el("span", {
        class: "fs-caption text-soft"
      }, [ text("— " + disabledReason) ]));
      return row;
    }
    function diagramKindForReset(reset) {
      if (reset === "none") return "sum";
      if (reset === "group") return "group";
      return "cumsum";
    }
    function buildPreviewData() {
      try {
        var reportId = plan.reports[0];
        if (!reportId) return null;
        var repDef = reportById(reportId);
        if (!repDef) return null;
        var entry;
        if (reportId === "pages") {
          var all = matrix.allValuesCombination();
          var sheet = computeSheetFor("pages", all);
          entry = {
            reportId: "pages",
            sliceKey: "*",
            combination: null,
            rows: sheet.rows,
            columns: visibleColumnsFor(repDef.id, cfg.printableColumns(repDef.columns)),
            hiddenColumns: (state.hiddenColumns[repDef.id] || []).slice(),
            settings: resolveSettings("pages"),
            reportLabel: repDef.label,
            printTotalField: repDef.printTotalField
          };
        } else {
          var chosenSlices = plan.slices.length ? plan.slices : combos.map(function(c) {
            return c.key;
          });
          var key = chosenSlices[0];
          var c = key ? comboMap[key] : null;
          if (!c) return null;
          var sheetData = computeSheetFor(reportId, c.combination);
          var settings = resolveSettings(reportId);
          var filtered = exportPipelineRows(sheetData, repDef, plan.applyView);
          entry = {
            reportId,
            sliceKey: key,
            combination: {
              budget: reports.dimLabel(c.combination, "budget"),
              shift: reports.dimLabel(c.combination, "shift"),
              dispense: reports.dimLabel(c.combination, "dispense")
            },
            rows: filtered,
            columns: visibleColumnsFor(repDef.id, cfg.printableColumns(repDef.columns)),
            hiddenColumns: (state.hiddenColumns[repDef.id] || []).slice(),
            settings,
            reportLabel: repDef.label,
            printTotalField: repDef.printTotalField
          };
        }
        var previewContractPlan = {
          reports: [ reportId ],
          sheetSplit: "per-slice",
          grandTotal: plan.grandTotal,
          layers: previewLayers()
        };
        var full = PH.exportPlan.buildSheets(previewContractPlan, {
          sheets: [ entry ]
        })[0];
        var preview = PH.exportPlan.preview(previewContractPlan, entry, 20);
        return { preview, fullCount: full ? full.rows.length : preview.rows.length };
      } catch (err) {
        return null;
      }
    }
    function renderPreviewStrip(container) {
      container.innerHTML = "";
      var data = buildPreviewData();
      if (!data || !data.preview.rows.length) {
        container.appendChild(el("div", {
          class: "fs-caption text-soft"
        }, [ text("لا توجد بيانات كافية لمعاينة النتيجة.") ]));
        return;
      }
      var preview = data.preview;
      var table = el("table", {
        style: "width:100%; border-collapse:collapse; font-size:12px;"
      });
      var thead = el("thead");
      var headRow = el("tr");
      preview.columns.forEach(function(c) {
        headRow.appendChild(el("th", {
          style: "text-align:start; padding:4px 6px; border-bottom:1px solid var(--line); color:var(--text-soft); font-weight:600; white-space:nowrap;"
        }, [ text(preview.columnLabels[c] || cfg.COLUMN_LABELS[c] || c) ]));
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      var tbody = el("tbody");
      preview.rows.forEach(function(row) {
        var tr = el("tr", row.__totalsRow ? {
          style: "background:var(--paper-sunken); font-weight:600;"
        } : {});
        preview.columns.forEach(function(c) {
          tr.appendChild(el("td", {
            style: "padding:4px 6px; border-bottom:1px solid var(--line); white-space:nowrap;"
          }, [ text(PH.format.cell(row[c], c)) ]));
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
      if (data.fullCount > preview.rows.length) {
        container.appendChild(el("div", {
          class: "fs-caption text-soft",
          style: "margin-top:4px;"
        }, [ text("+ " + (data.fullCount - preview.rows.length) + " صفوف أخرى") ]));
      }
    }
    function section(title) {
      return PH.ui.section(title);
    }
    function segmented(options, current, onPick, scope) {
      return PH.ui.pillRow(options, current, function(value) {
        update(function() {
          onPick(value);
        }, scope);
      });
    }
    function selectField(labelText, options, current, onChange, scope) {
      var sel = PH.ui.select(options, current || "", function(value) {
        update(function() {
          onChange(value);
        }, scope);
      });
      return fieldWrap(labelText, sel);
    }
    function update(mutator, scope) {
      var scrollTop = body.scrollTop;
      mutator();
      if (scope === "totals") {
        refreshTotals();
      } else {
        refresh();
      }
      body.scrollTop = scrollTop;
    }
    var overlay = el("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "تصدير",
      style: "position:fixed; inset:0; z-index:80; background:var(--scrim); display:flex; align-items:center; justify-content:center; padding:var(--sp-6);"
    });
    var panel = el("div", {
      class: "panel-2",
      style: "width:min(760px, 100%); max-height:90vh; display:flex; flex-direction:column; padding:0;"
    });
    var header = el("div", {
      style: "display:flex; align-items:center; justify-content:space-between; padding:var(--sp-4); border-bottom:1px solid var(--line);"
    });
    header.appendChild(el("div", {
      class: "fs-title"
    }, [ text("تصدير") ]));
    var headerCloseBtn = el("button", {
      class: "btn btn--ghost btn--icon",
      type: "button",
      title: "إغلاق (Escape)"
    });
    headerCloseBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"></path></svg>';
    headerCloseBtn.addEventListener("click", function() {
      removeDialog(overlay);
    });
    header.appendChild(headerCloseBtn);
    panel.appendChild(header);
    var body = el("div", {
      style: "flex:1; overflow:auto; padding:var(--sp-4); display:flex; flex-direction:column; gap:var(--sp-4);"
    });
    panel.appendChild(body);
    var footer = el("div", {
      class: "row",
      style: "justify-content:space-between; align-items:center; padding:var(--sp-4); border-top:1px solid var(--line);"
    });
    var footerSummary = el("div", {
      class: "fs-caption text-soft"
    });
    var footerActions = el("div", {
      class: "row",
      style: "gap:var(--sp-2);"
    });
    var exportBtn = el("button", {
      class: "btn btn--primary",
      type: "button"
    }, [ text("تصدير") ]);
    var cancelBtn = el("button", {
      class: "btn btn--secondary",
      type: "button"
    }, [ text("إلغاء") ]);
    footerActions.appendChild(exportBtn);
    footerActions.appendChild(cancelBtn);
    footer.appendChild(footerSummary);
    footer.appendChild(footerActions);
    panel.appendChild(footer);
    var progressFillEl = el("div", {
      class: "progress-bar__fill",
      style: "width:0%;"
    });
    var progressCaptionEl = el("div", {
      class: "fs-caption text-soft"
    }, [ text("0 / 0") ]);
    var progressCancelBtn = el("button", {
      class: "btn btn--tertiary",
      type: "button"
    }, [ text("إلغاء") ]);
    var progressWrap = el("div", {
      style: "display:none; flex-direction:column; gap:var(--sp-3); padding:var(--sp-4); border-top:1px solid var(--line);"
    }, [ el("div", {
      class: "fs-body"
    }, [ text("جارٍ التصدير…") ]), el("div", {
      class: "progress-bar"
    }, [ progressFillEl ]), progressCaptionEl, progressCancelBtn ]);
    var currentAbortToken = null;
    progressCancelBtn.addEventListener("click", function() {
      if (currentAbortToken) currentAbortToken.cancelled = true;
    });
    panel.appendChild(progressWrap);
    overlay.appendChild(panel);
    var mountedTotalsSec = null;
    function renderTotalsSection() {
      var totalsSec = section("الإجماليات");
      if (!numericColumnsForPlan().length) {
        totalsSec.appendChild(el("div", {
          class: "fs-caption text-soft"
        }, [ text("لا يوجد عمود رقمي في التقارير المحدَّدة.") ]));
      } else {
        totalsSec.appendChild(switchRow("إضافة صف الإجمالي الكلي", plan.grandTotal.enabled, function(newVal) {
          update(function() {
            plan.grandTotal.enabled = newVal;
            if (newVal && !plan.grandTotal.field) plan.grandTotal.field = defaultFieldForPlan();
          }, "totals");
        }));
        if (plan.grandTotal.enabled) {
          totalsSec.appendChild(selectField("عمود الإجمالي الكلي", numericColumnsForPlan().map(function(f) {
            return {
              value: f,
              label: cfg.COLUMN_LABELS[f] || f
            };
          }), plan.grandTotal.field || "", function(v) {
            plan.grandTotal.field = v || null;
          }, "totals"));
        }
        var columnsListSec = el("div", {
          style: "display:flex; flex-direction:column; gap:var(--sp-2); padding-top:var(--sp-2);"
        });
        columnsListSec.appendChild(el("div", {
          class: "fs-caption",
          style: "font-weight:600; color:var(--text-soft);"
        }, [ text("طبقات الإجمالي") ]));
        plan.layers.forEach(function(layerCfg) {
          var row = el("div", {
            class: "row",
            style: "justify-content:space-between; align-items:center; gap:var(--sp-2); padding:var(--sp-2); background:var(--paper-sunken); border-radius:var(--r-inner);"
          });
          row.appendChild(el("span", {
            class: "fs-body"
          }, [ text(PH.exportPlan.explain(layerCfg)) ]));
          var actions = el("div", {
            class: "row",
            style: "gap:4px;"
          });
          var editBtn = el("button", {
            class: "btn btn--tertiary",
            type: "button"
          }, [ text("تعديل") ]);
          editBtn.addEventListener("click", function() {
            update(function() {
              draftLayer = layerCfg;
              plan.layers = plan.layers.filter(function(l) {
                return l !== layerCfg;
              });
            }, "totals");
          });
          var removeBtn = el("button", {
            class: "btn btn--ghost btn--icon",
            type: "button",
            title: "إزالة"
          }, [ text("✕") ]);
          removeBtn.addEventListener("click", function() {
            update(function() {
              plan.layers = plan.layers.filter(function(l) {
                return l !== layerCfg;
              });
            }, "totals");
          });
          actions.appendChild(editBtn);
          actions.appendChild(removeBtn);
          row.appendChild(actions);
          columnsListSec.appendChild(row);
        });
        if (plan.layers.length >= 4) {
          columnsListSec.appendChild(el("div", {
            class: "fs-caption",
            style: "color:var(--brass);"
          }, [ text("تنبيه: أكثر من 4 طبقات إجمالي قد يجعل الملف صعب القراءة.") ]));
        }
        var editorBox = el("div", {
          style: "display:flex; flex-direction:column; gap:var(--sp-2); padding:var(--sp-2); border:1px dashed var(--line); border-radius:var(--r-inner);"
        });
        editorBox.appendChild(totalsDiagram(diagramKindForReset(draftLayer.reset)));
        editorBox.appendChild(fieldWrap("إعادة الضبط", segmented([ {
          value: "none",
          label: "بلا (الورقة كاملة)"
        }, {
          value: "page",
          label: "لكل صفحة"
        }, {
          value: "block",
          label: "لكل كتلة"
        }, {
          value: "group",
          label: "لكل مجموعة"
        } ], draftLayer.reset, function(v) {
          draftLayer.reset = v;
          if (v !== "group") draftLayer.resetOn = null;
        }, "totals")));
        editorBox.appendChild(fieldWrap("المدى", segmented([ {
          value: false,
          label: "لكل وحدة على حدة"
        }, {
          value: true,
          label: "تراكمي منذ البداية"
        } ], draftLayer.running, function(v) {
          draftLayer.running = v;
        }, "totals")));
        editorBox.appendChild(fieldWrap("القيمة تظهر", segmented([ {
          value: false,
          label: "عند نهاية الوحدة فقط"
        }, {
          value: true,
          label: "في كل صف"
        } ], draftLayer.every, function(v) {
          draftLayer.every = v;
        }, "totals")));
        editorBox.appendChild(fieldWrap("الإخراج", segmented([ {
          value: "column",
          label: "عمود جديد"
        }, {
          value: "row",
          label: "صف بين البيانات"
        }, {
          value: "both",
          label: "كلاهما"
        } ], draftLayer.place, function(v) {
          draftLayer.place = v;
        }, "totals")));
        editorBox.appendChild(selectField("العمود", numericColumnsForPlan().map(function(f) {
          return {
            value: f,
            label: cfg.COLUMN_LABELS[f] || f
          };
        }), draftLayer.field || defaultFieldForPlan() || "", function(v) {
          draftLayer.field = v || null;
        }, "totals"));
        if (draftLayer.reset === "group") {
          editorBox.appendChild(selectField("إعادة البدء عند تغيّر", [ {
            value: "",
            label: "اختر عمودًا"
          } ].concat(textColumnsForPlan().map(function(c) {
            return {
              value: c,
              label: cfg.COLUMN_LABELS[c] || c
            };
          })), draftLayer.resetOn || "", function(v) {
            draftLayer.resetOn = v || null;
          }, "totals"));
        }
        if (draftLayer.reset === "page") {
          var rppCaption;
          if (plan.reports.length === 1) {
            var repSettings = resolveSettings(plan.reports[0]);
            rppCaption = "حجم الصفحة الحالي: " + (repSettings && repSettings.rowsPerPage || 24) + " صفًا — يُغيَّر من إعدادات الصفحة";
          } else {
            rppCaption = "حجم الصفحة يختلف حسب التقرير المحدَّد — يُغيَّر من إعدادات كل تقرير";
          }
          editorBox.appendChild(el("div", {
            class: "fs-caption text-soft"
          }, [ text(rppCaption) ]));
        }
        var labelInput = el("input", {
          class: "input",
          type: "text",
          placeholder: "عنوان مخصَّص (اختياري)"
        });
        labelInput.value = draftLayer.label || "";
        labelInput.addEventListener("input", function() {
          draftLayer.label = labelInput.value || null;
        });
        editorBox.appendChild(fieldWrap("عنوان مخصَّص", labelInput));
        if (draftLayer.field) {
          editorBox.appendChild(el("div", {
            class: "fs-caption text-soft"
          }, [ text(PH.exportPlan.explain({
            id: "draft",
            field: draftLayer.field,
            reset: draftLayer.reset,
            resetOn: draftLayer.resetOn,
            running: draftLayer.running,
            every: draftLayer.every,
            place: draftLayer.place,
            label: null
          })) ]));
        }
        var addBtn = el("button", {
          class: "btn btn--secondary",
          type: "button"
        }, [ text("+ إضافة طبقة إجمالي") ]);
        addBtn.addEventListener("click", function() {
          var candidate = draftLayer;
          if (!candidate.field) candidate.field = defaultFieldForPlan();
          if (candidate.reset === "group" && !candidate.resetOn) {
            showToast("اختر عمود إعادة البدء أولًا", false);
            return;
          }
          var sig = PH.exportPlan.layerSignature(candidate);
          var isDup = plan.layers.some(function(l) {
            return PH.exportPlan.layerSignature(l) === sig;
          });
          if (isDup) {
            showToast("هذا الإعداد مضاف بالفعل", false);
            return;
          }
          if (!candidate.id) candidate.id = makeLayerId();
          update(function() {
            plan.layers.push(candidate);
            draftLayer = freshDraftLayer();
          }, "totals");
        });
        editorBox.appendChild(addBtn);
        columnsListSec.appendChild(editorBox);
        totalsSec.appendChild(columnsListSec);
        var planCheck = PH.exportPlan.validatePlan(exportContractPlan());
        if (!planCheck.ok) {
          var errBox = el("div", {
            class: "fs-caption",
            style: "color:var(--brass); padding-top:var(--sp-2);"
          }, [ text("تعذّر بناء خطة صالحة: " + planCheck.errors.join("، ")) ]);
          totalsSec.appendChild(errBox);
        }
        var previewSec = el("div", {
          style: "display:flex; flex-direction:column; gap:var(--sp-2); padding-top:var(--sp-2);"
        });
        previewSec.appendChild(el("div", {
          class: "fs-caption",
          style: "font-weight:600; color:var(--text-soft);"
        }, [ text("معاينة النتيجة") ]));
        var previewBox = el("div", {
          style: "overflow:auto; max-height:220px; border:1px solid var(--line); border-radius:var(--r-inner); padding:var(--sp-2);"
        });
        renderPreviewStrip(previewBox);
        previewSec.appendChild(previewBox);
        totalsSec.appendChild(previewSec);
      }
      return totalsSec;
    }
    function refreshTotals() {
      var scrollTop = body.scrollTop;
      var next = renderTotalsSection();
      next.classList.add("dialog-refresh-fade");
      if (mountedTotalsSec && mountedTotalsSec.parentNode) {
        mountedTotalsSec.replaceWith(next);
      } else {
        body.appendChild(next);
      }
      mountedTotalsSec = next;
      body.scrollTop = scrollTop;
    }
    function buildBody() {
      ensureGrandTotalValid();
      body.innerHTML = "";
      var includesPages = onlyPages();
      var picker = el("div", {
        style: "display:grid; grid-template-columns:1fr 1fr; gap:var(--sp-4);"
      });
      var reportsSec = section("التقارير");
      var reportsBox = el("div", {
        style: "display:flex; flex-direction:column; gap:4px; max-height:180px; overflow:auto; border:1px solid var(--line); border-radius:var(--r-inner); padding:var(--sp-2);"
      });
      availableReports.forEach(function(rep) {
        var checked = plan.reports.indexOf(rep.id) !== -1;
        reportsBox.appendChild(checklistRow(rep.label, checked, function(isChecked) {
          if (isChecked) {
            if (plan.reports.indexOf(rep.id) === -1) plan.reports.push(rep.id);
          } else {
            plan.reports = plan.reports.filter(function(id) {
              return id !== rep.id;
            });
          }
        }));
      });
      reportsSec.appendChild(reportsBox);
      picker.appendChild(reportsSec);
      var slicesSec = section("الشرائح");
      var slicesBox = el("div", {
        style: "display:flex; flex-direction:column; gap:4px; max-height:180px; overflow:auto; border:1px solid var(--line); border-radius:var(--r-inner); padding:var(--sp-2);"
      });
      if (includesPages) {
        slicesBox.appendChild(el("div", {
          class: "fs-caption text-soft"
        }, [ text("تقرير الصفحات يجمع كل الشرائح بالفعل.") ]));
      } else {
        combos.forEach(function(c) {
          var label = cfg.DIMENSION_ORDER.map(function(d) {
            return reports.dimLabel(c.combination, d);
          }).join(" · ");
          var checked = plan.slices.indexOf(c.key) !== -1;
          slicesBox.appendChild(checklistRow(label + " (" + c.count + ")", checked, function(isChecked) {
            if (isChecked) {
              if (plan.slices.indexOf(c.key) === -1) plan.slices.push(c.key);
            } else {
              plan.slices = plan.slices.filter(function(k) {
                return k !== c.key;
              });
            }
          }));
        });
      }
      slicesSec.appendChild(slicesBox);
      picker.appendChild(slicesSec);
      body.appendChild(picker);
      var layoutSec = section("طريقة الحفظ");
      layoutSec.appendChild(segmented([ {
        value: "one-workbook",
        label: "ملف Excel واحد"
      }, {
        value: "zip",
        label: "ملف ZIP — ورقة لكل شريحة"
      }, {
        value: "csv",
        label: "ملف CSV"
      } ], plan.layout, function(v) {
        plan.layout = v;
      }));
      if (plan.slices.length > 1 && !includesPages) {
        layoutSec.appendChild(segmented([ {
          value: "per-slice",
          label: "ورقة لكل شريحة"
        }, {
          value: "combined",
          label: "ورقة واحدة مجمّعة"
        } ], plan.sheetSplit, function(v) {
          plan.sheetSplit = v;
        }));
      }
      body.appendChild(layoutSec);
      mountedTotalsSec = renderTotalsSection();
      body.appendChild(mountedTotalsSec);
      if (isViewCustomized() && plan.reports.length === 1 && plan.reports[0] === state.activeReportId) {
        body.appendChild(switchRow("تطبيق التصفية/الفرز/البحث الحالي", plan.applyView, function(newVal) {
          update(function() {
            plan.applyView = newVal;
          });
        }));
      }
    }
    function refresh() {
      buildBody();
      fadeRefresh(body);
      var n = sheetCountEstimate();
      footerSummary.textContent = plan.reports.length + " تقرير × حتى " + n + " ورقة";
      var planOk = PH.exportPlan.validatePlan(exportContractPlan()).ok;
      exportBtn.disabled = !plan.reports.length || !onlyPages() && !plan.slices.length || !planOk;
    }
    function buildEntriesForExport() {
      var entries = [];
      var rawCombos = {};
      plan.reports.forEach(function(reportId) {
        var repDef = reportById(reportId);
        if (!repDef) return;
        if (reportId === "pages") {
          var all = matrix.allValuesCombination();
          var sheet = computeSheetFor("pages", all);
          entries.push({
            reportId: "pages",
            sliceKey: "*",
            combination: null,
            rows: sheet.rows,
            columns: visibleColumnsFor(repDef.id, cfg.printableColumns(repDef.columns)),
            hiddenColumns: (state.hiddenColumns[repDef.id] || []).slice(),
            settings: resolveSettings("pages"),
            reportLabel: repDef.label,
            printTotalField: repDef.printTotalField
          });
          rawCombos["pages|*"] = all;
          return;
        }
        var chosenSlices = plan.slices.length ? plan.slices : combos.map(function(c) {
          return c.key;
        });
        chosenSlices.forEach(function(key) {
          var c = comboMap[key];
          if (!c) return;
          var sheet = computeSheetFor(reportId, c.combination);
          var settings = resolveSettings(reportId);
          var filtered = exportPipelineRows(sheet, repDef, plan.applyView);
          var labelCombo = {
            budget: reports.dimLabel(c.combination, "budget"),
            shift: reports.dimLabel(c.combination, "shift"),
            dispense: reports.dimLabel(c.combination, "dispense")
          };
          entries.push({
            reportId,
            sliceKey: key,
            combination: labelCombo,
            rows: filtered,
            columns: visibleColumnsFor(repDef.id, cfg.printableColumns(repDef.columns)),
            hiddenColumns: (state.hiddenColumns[repDef.id] || []).slice(),
            settings,
            reportLabel: repDef.label,
            printTotalField: repDef.printTotalField
          });
          rawCombos[reportId + "|" + key] = c.combination;
        });
      });
      return {
        entries,
        rawCombos
      };
    }
    function doExport() {
      var built = buildEntriesForExport();
      if (!built.entries.length) {
        showToast("لا توجد بيانات في التحديد الحالي.", false);
        return;
      }
      var contractPlan = exportContractPlan();
      var sheets;
      try {
        sheets = PH.exportPlan.buildSheets(contractPlan, {
          sheets: built.entries
        });
      } catch (err) {
        showToast("تعذّر بناء التقرير: " + (err && err.message ? err.message : "خطأ غير معروف"), false);
        return;
      }
      if (!sheets.length) {
        showToast("لا توجد بيانات في التحديد الحالي.", false);
        return;
      }
      sheets.forEach(function(s) {
        if (s.meta.combined) {
          s.combination = {
            budget: null,
            shift: null,
            dispense: null
          };
          return;
        }
        var key = s.meta.reportId + "|" + s.meta.sliceKey;
        s.combination = built.rawCombos[key] || {
          budget: null,
          shift: null,
          dispense: null
        };
      });
      var reportLabelForFile = plan.reports.length === 1 ? reportById(plan.reports[0]).label : plan.reports.length + "-تقارير";
      var descriptor = PH.exportPlan.descriptorForLayers(plan.layers);
      var abortToken = {
        cancelled: false
      };
      body.style.display = "none";
      footer.style.display = "none";
      progressWrap.style.display = "flex";
      currentAbortToken = abortToken;
      var writer = plan.layout === "zip" ? PH.exporter.exportZipPerSheet : plan.layout === "csv" ? PH.exporter.exportCsvBundle : PH.exporter.exportSingleWorkbook;
      writer(sheets, {
        month: exportMonth,
        reportLabel: reportLabelForFile,
        descriptor,
        plan: contractPlan,
        abortToken,
        onProgress: function(done, total, percent) {
          var pct = percent !== undefined ? percent : total ? done / total * 100 : 0;
          progressFillEl.style.width = Math.max(0, Math.min(100, pct)) + "%";
          progressCaptionEl.textContent = percent !== undefined ? "ضغط الملف… " + Math.round(percent) + "%" : done + " / " + total;
        }
      }).then(function(name) {
        store.saveSettings("meta", "exportPlan", plan).catch(function() {});
        state.savedExportPlan = plan;
        removeDialog(overlay);
        showToast("تم تصدير " + name);
      }).catch(function(err) {
        body.style.display = "";
        footer.style.display = "";
        progressWrap.style.display = "none";
        showToast("تعذّر التصدير: " + (err && err.message ? err.message : "خطأ غير معروف"), false);
      });
    }
    cancelBtn.addEventListener("click", function() {
      removeDialog(overlay);
    });
    exportBtn.addEventListener("click", doExport);
    registerDialog(overlay, {
      onClose: function() {
        if (currentAbortToken) currentAbortToken.cancelled = true;
      }
    });
    loadMeta().then(function(meta) {
      applySavedPlan(meta.exportPlan);
      refresh();
    }).catch(function() {
      refresh();
    });
  }
  function runSelfTestOverlay() {
    var overlay = el("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "الفحص الذاتي",
      style: "position:fixed; inset:0; background:var(--paper); z-index:100; padding:var(--sp-6); overflow:auto;"
    });
    overlay.appendChild(el("div", {
      class: "fs-title"
    }, [ text("فحص ذاتي — جارٍ التشغيل…") ]));
    registerDialog(overlay);
    PH.selftest.runAll().then(function(result) {
      overlay.innerHTML = "";
      overlay.appendChild(el("div", {
        class: "fs-title"
      }, [ text("نتائج الفحص الذاتي") ]));
      overlay.appendChild(el("div", {
        class: "fs-body"
      }, [ text("نجاح: " + result.totalPass + "   ·   فشل: " + result.totalFail) ]));
      if (result.failures.length) {
        var list = el("ul", {
          style: "list-style:disc; padding-inline-start:20px;"
        });
        result.failures.forEach(function(f) {
          list.appendChild(el("li", {
            class: "fs-caption"
          }, [ text(f) ]));
        });
        overlay.appendChild(list);
      }
      var closeBtn = el("button", {
        class: "btn btn--secondary",
        style: "margin-top:var(--sp-4);"
      }, [ text("إغلاق") ]);
      closeBtn.addEventListener("click", function() {
        removeDialog(overlay);
      });
      overlay.appendChild(closeBtn);
    });
  }
  function init() {
    if (!window.XLSX) showToast("مكتبة Excel غير متاحة — الاستيراد والتصدير يحتاجان اتصالًا أو نسخة محلية.", false);
    if (!window.JSZip) showToast("مكتبة ZIP غير متاحة — تصدير الكل لن يعمل حتى تُحمّل المكتبة.", false);
    Promise.all([ store.loadPersisted(), store.getAllSettingsScopes(), loadMeta() ]).then(function(results) {
      var scopes = results[1];
      var meta = results[2];
      state.settingsOverrides.global = scopes.global;
      state.applyToPrintExport = typeof scopes.global.applyToPrintExport === "boolean" ? scopes.global.applyToPrintExport : true;
      state.settingsOverrides.report = scopes.report;
      state.settingsOverrides.linked = scopes.linked;
      state.hiddenColumns = scopes.hiddenColumns || {};
      state.savedExportPlan = meta.exportPlan || null;
      state.userProfile = Object.assign(defaultUserProfile(), meta.userProfile || {});
      state.pharmacyProfile = Object.assign(defaultPharmacyProfile(), meta.pharmacyProfile || {});
      state.savedReportPresets = Array.isArray(meta.savedReportPresets) ? meta.savedReportPresets : [];
      migrateSheetScopeSettings(scopes.sheet);
      render();
    }).catch(function() {
      render();
    });
    bindKeyboard();
    bindPaste();
    function dragHasFiles(e) {
      var types = e.dataTransfer && e.dataTransfer.types;
      return !!types && Array.prototype.indexOf.call(types, "Files") !== -1;
    }
    window.addEventListener("dragover", function(e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "none";
    });
    window.addEventListener("drop", function(e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
    });
    ensureScopeClickAwayListener();
    bindOverflowMenu();
    bindTopSearchField();
    initTheme();
    var scopeBtn = $("btn-scope");
    if (scopeBtn) scopeBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      openScopePopover();
    });
    var reportDropdownBtn = $("btn-report-switcher-dropdown");
    if (reportDropdownBtn) reportDropdownBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      openReportSwitcherMenu();
    });
    var saveStatusDot = $("save-status-dot");
    if (saveStatusDot) saveStatusDot.addEventListener("click", function() {
      saveErrorBannerDismissed = false;
      updateSaveErrorBanner();
    });
    store.onChange(function(event) {
      if (event && event.type === "save-state") {
        updateSaveStateEl();
        return;
      }
      render();
    });
    document.getElementById("btn-add").addEventListener("click", openGuidedFormOverlay);
    var settingsDrawerBtn = document.getElementById("btn-settings-drawer");
    if (settingsDrawerBtn) settingsDrawerBtn.addEventListener("click", openSettingsDrawer);
    document.getElementById("btn-export").addEventListener("click", openExportDialog);
    document.getElementById("btn-print").addEventListener("click", openPrintPreview);
    document.getElementById("btn-selftest").addEventListener("click", runSelfTestOverlay);
    document.getElementById("btn-theme").addEventListener("click", toggleTheme);
    document.getElementById("btn-template").addEventListener("click", downloadTemplate);
    document.getElementById("btn-backup").addEventListener("click", exportWorkspaceBackup);
    document.getElementById("btn-pharmacy-profile").addEventListener("click", openPharmacyProfileDialog);
    document.getElementById("btn-saved-views").addEventListener("click", openSavedViewsDialog);
    document.getElementById("btn-restore").addEventListener("click", function() {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.addEventListener("change", function() {
        if (input.files.length) restoreWorkspaceBackup(input.files[0]);
      });
      input.click();
    });
    document.getElementById("btn-import").addEventListener("click", openImportSourceDialog);
    window.addEventListener("beforeunload", function(e) {
      var s = store.getSaveState();
      if ((s === "pending" || s === "error") && store.getSourceRows().length) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "hidden") store.flushAutosave();
    });
    if (/[?&]selftest=1/.test(window.location.search)) runSelfTestOverlay();
  }
  function loadMeta() {
    return store.loadSettings("meta").then(function(meta) {
      meta = meta || {};
      return {
        linked: meta.linked || {},
        hiddenColumns: meta.hiddenColumns || {},
        exportPlan: meta.exportPlan || null,
        migratedSettings: meta.migratedSettings || 0,
        userProfile: meta.userProfile || null,
        pharmacyProfile: meta.pharmacyProfile || null,
        savedReportPresets: meta.savedReportPresets || []
      };
    });
  }
  function migrateSheetScopeSettings(sheetScope) {
    var sheetKeys = Object.keys(sheetScope || {});
    var clears = sheetKeys.map(function(k) {
      return store.clearSettingsScope("sheet:" + k);
    });
    return Promise.all(clears).then(function(results) {
      var allCleared = results.every(function(ok) {
        return ok !== false;
      });
      if (!allCleared) return false;
      return store.saveSettings("meta", "migratedSettings", 2);
    }).catch(function() {
      return false;
    });
  }
  function openGuidedFormOverlay() {
    var overlay = el("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "إضافة صف",
      style: "position:fixed; inset-inline-end:0; top:56px; bottom:0; z-index:40; padding:var(--sp-4); overflow:auto; background:var(--paper);"
    });
    var closeBtn = el("button", {
      class: "btn btn--tertiary"
    }, [ text("إغلاق ✕") ]);
    closeBtn.addEventListener("click", function() {
      removeDialog(overlay);
    });
    overlay.appendChild(closeBtn);
    var existingMonths = store.getSourceRows().map(function(r) {
      return r.month;
    }).filter(function(v, i, a) {
      return v && a.indexOf(v) === i;
    });
    var defaultMonth = state.activeMonth || (existingMonths.length === 1 ? existingMonths[0] : "");
    PH.viewEntry.createGuidedForm(overlay, {
      defaultMonth,
      onCommit: function() {
        showToast("تمت الإضافة");
      }
    });
    registerDialog(overlay);
  }
  function downloadTemplate() {
    try {
      var name = PH.exporter.exportImportTemplate();
      showToast("تم تحميل " + name);
    } catch (e) {
      showToast("تعذّر إنشاء النموذج", false);
    }
  }
  function exportWorkspaceBackup() {
    var payload = {
      format: "daftar-workspace",
      version: 1,
      exportedAt: (new Date).toISOString(),
      rows: store.getSourceRows(),
      settingsOverrides: state.settingsOverrides,
      activeMonth: state.activeMonth,
      activeReportId: state.activeReportId,
      dimensionGroups: state.dimensionGroups,
      hiddenColumns: state.hiddenColumns,
      userProfile: state.userProfile,
      pharmacyProfile: state.pharmacyProfile,
      savedReportPresets: state.savedReportPresets
    };
    var blob = new Blob([ JSON.stringify(payload, null, 2) ], {
      type: "application/json;charset=utf-8"
    });
    PH.exporter.downloadBlob(blob, "daftar-workspace-backup.json");
    showToast("تم حفظ النسخة الاحتياطية");
  }
  var MAX_BACKUP_BYTES = 50 * 1024 * 1024;
  var MAX_BACKUP_ROWS = 1e5;
  var SUPPORTED_BACKUP_VERSION = 1;
  function validateBackupPayload(payload) {
    if (!payload || payload.format !== "daftar-workspace") throw new Error("صيغة نسخة غير معروفة");
    if (payload.version !== SUPPORTED_BACKUP_VERSION) throw new Error("إصدار نسخة احتياطية غير مدعوم: " + payload.version);
    if (!Array.isArray(payload.rows)) throw new Error("صيغة نسخة غير معروفة");
    if (payload.rows.length > MAX_BACKUP_ROWS) throw new Error("عدد الصفوف في النسخة الاحتياطية يتجاوز الحد المسموح (" + MAX_BACKUP_ROWS + ")");
    var rowsWellFormed = payload.rows.every(function(r) {
      return r && typeof r === "object" && !Array.isArray(r);
    });
    if (!rowsWellFormed) throw new Error("النسخة الاحتياطية تحتوي على صفوف بصيغة غير صحيحة");
    return true;
  }
  function restoreWorkspaceBackup(file) {
    if (file && file.size > MAX_BACKUP_BYTES) {
      showToast("ملف النسخة الاحتياطية أكبر من الحد المسموح (50 ميجابايت)", false);
      return;
    }
    var reader = new FileReader;
    reader.onload = function() {
      var payload;
      try {
        payload = JSON.parse(String(reader.result || ""));
        validateBackupPayload(payload);
      } catch (err) {
        showToast("تعذّرت استعادة النسخة: " + (err && err.message ? err.message : "ملف غير صالح"), false);
        return;
      }
      confirmDialog({
        message: "سيؤدي الاستعادة إلى استبدال البيانات الحالية. هل تريد المتابعة؟",
        actions: [
          { label: "إلغاء", value: false, variant: "secondary" },
          { label: "استبدال", value: true, variant: "danger" }
        ]
      }).then(function (confirmed) {
        if (!confirmed) return;
        try {
        store.setSourceRows(payload.rows, "استعادة نسخة احتياطية", true);
        if (payload.settingsOverrides) {
          var restored = payload.settingsOverrides || {};
          var sanitizedGlobal = {};
          if (restored.global && "rowsPerPage" in restored.global) {
            sanitizedGlobal.rowsPerPage = PH.settings.sanitizeGlobal("rowsPerPage", restored.global.rowsPerPage);
          }
          var sanitizedReport = {};
          Object.keys(restored.report || {}).forEach(function(rid) {
            if (!cfg.REPORTS_BY_ID[rid]) return;
            var bucket = restored.report[rid] || {};
            var clean = {};
            Object.keys(bucket).forEach(function(k) {
              clean[k] = PH.settings.sanitize(rid, k, bucket[k]);
            });
            sanitizedReport[rid] = clean;
          });
          var sanitizedLinked = {};
          Object.keys(restored.linked || {}).forEach(function(rid) {
            if (cfg.REPORTS_BY_ID[rid] && typeof restored.linked[rid] === "boolean") sanitizedLinked[rid] = restored.linked[rid];
          });
          state.settingsOverrides = {
            global: sanitizedGlobal,
            report: sanitizedReport,
            linked: sanitizedLinked
          };
          state.settingsVersion++;
          var writes = [ store.saveSettingsMulti("global", sanitizedGlobal) ];
          Object.keys(sanitizedReport).forEach(function(rid) {
            writes.push(store.saveSettingsMulti("report:" + rid, sanitizedReport[rid]));
          });
          writes.push(store.saveSettings("meta", "linked", state.settingsOverrides.linked));
          Promise.all(writes).catch(function() {});
        }
        if (payload.activeMonth !== undefined) state.activeMonth = payload.activeMonth;
        if (payload.activeReportId && cfg.REPORTS_BY_ID[payload.activeReportId]) state.activeReportId = payload.activeReportId;
        if (payload.dimensionGroups) {
          var sanitizedDimensionGroups = {};
          cfg.DIMENSION_ORDER.forEach(function(dim) {
            var groups = payload.dimensionGroups[dim];
            if (!Array.isArray(groups)) return;
            var validValues = cfg.DIMENSIONS[dim];
            var seen = {};
            var cleanGroups = [];
            groups.forEach(function(g) {
              if (!Array.isArray(g)) return;
              var cleanGroup = g.filter(function(v) {
                return validValues.indexOf(v) !== -1 && !seen[v];
              });
              cleanGroup.forEach(function(v) {
                seen[v] = true;
              });
              if (cleanGroup.length) cleanGroups.push(cleanGroup);
            });
            if (cleanGroups.length) sanitizedDimensionGroups[dim] = cleanGroups;
          });
          state.dimensionGroups = sanitizedDimensionGroups;
        }
        if (payload.hiddenColumns) {
          var sanitizedHidden = {};
          Object.keys(payload.hiddenColumns).forEach(function(rid) {
            var repDef = cfg.REPORTS_BY_ID[rid];
            if (!repDef) return;
            var legal = cfg.printableColumns(repDef.columns);
            var list = (payload.hiddenColumns[rid] || []).filter(function(c) {
              return legal.indexOf(c) !== -1;
            });
            if (list.length && list.length < legal.length) sanitizedHidden[rid] = list;
          });
          state.hiddenColumns = sanitizedHidden;
          store.saveSettings("meta", "hiddenColumns", sanitizedHidden).catch(function() {});
        }
        if (payload.userProfile && typeof payload.userProfile === "object") {
          var cleanUser = {
            displayName: typeof payload.userProfile.displayName === "string" ? payload.userProfile.displayName.slice(0, 200) : ""
          };
          saveUserProfile(cleanUser);
        }
        if (payload.pharmacyProfile && typeof payload.pharmacyProfile === "object") {
          var srcPharmacy = payload.pharmacyProfile;
          var cleanPharmacy = {
            name: typeof srcPharmacy.name === "string" ? srcPharmacy.name.slice(0, 200) : "",
            code: typeof srcPharmacy.code === "string" ? srcPharmacy.code.slice(0, 100) : "",
            address: typeof srcPharmacy.address === "string" ? srcPharmacy.address.slice(0, 300) : "",
            license: typeof srcPharmacy.license === "string" ? srcPharmacy.license.slice(0, 100) : "",
            printNote: typeof srcPharmacy.printNote === "string" ? srcPharmacy.printNote.slice(0, 300) : "",
            logo: typeof srcPharmacy.logo === "string" && srcPharmacy.logo.indexOf("data:image") === 0 ? srcPharmacy.logo.slice(0, 700000) : null,
            signatureRoles: Array.isArray(srcPharmacy.signatureRoles) ? srcPharmacy.signatureRoles.filter(function(r) {
              return typeof r === "string";
            }).slice(0, 4) : []
          };
          savePharmacyProfile(cleanPharmacy);
        }
        if (Array.isArray(payload.savedReportPresets)) {
          var cleanPresets = payload.savedReportPresets.filter(function(p) {
            return p && typeof p === "object" && typeof p.reportId === "string" && typeof p.name === "string";
          }).slice(0, 50);
          saveReportPresets(cleanPresets);
        }
        render();
        showToast("تمت استعادة النسخة الاحتياطية");
        } catch (err) {
          showToast("تعذّرت استعادة النسخة: " + (err && err.message ? err.message : "ملف غير صالح"), false);
        }
      });
    };
    reader.readAsText(file, "utf-8");
  }
  return {
    init,
    computeActiveSheet,
    render,
    decodeTextBuffer,
    downloadTemplate,
    exportWorkspaceBackup,
    restoreWorkspaceBackup,
    validateBackupPayload,
    handleFile,
    openExportDialog,
    openPrintPreview,
    runSelfTest: runSelfTestOverlay,
    toggleTheme,
    defaultUserProfile,
    defaultPharmacyProfile,
    saveUserProfile,
    savePharmacyProfile,
    saveReportPresets,
    getUserProfile,
    getPharmacyProfile,
    getSavedReportPresets,
    capturePresetFromCurrentView,
    applyPreset
  };
}();

