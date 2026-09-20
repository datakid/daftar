PH.config = function() {
  var SCALE_QTY = 1e3;
  var SCALE_PRICE = 1e4;
  var SCALE_VALUE = 1e4;
  var SCALE_AVG = 1e8;
  var DIMENSIONS = {
    budget: [ "قوى عاملة", "طلاب", "مواليد", "غير محدد" ],
    shift: [ "صباحي", "مسائي", "غير محدد" ],
    dispense: [ "مجاني", "منفذ", "تحمل", "أحكام قضائية", "مستهلك", "مبادرة", "سكر", "غير محدد" ]
  };
  var DIMENSION_ORDER = [ "budget", "shift", "dispense" ];
  var DIMENSION_LABELS = {
    budget: "الموازنة",
    shift: "الفترة",
    dispense: "الصرف"
  };
  var FIELDS = [ {
    key: "budget",
    header: "الموازنة",
    type: "enum",
    required: true,
    dimension: "budget"
  }, {
    key: "shift",
    header: "الفترة",
    type: "enum",
    required: true,
    dimension: "shift"
  }, {
    key: "dispense",
    header: "الصرف",
    type: "enum",
    required: true,
    dimension: "dispense"
  }, {
    key: "book",
    header: "دفتر",
    type: "text",
    required: true
  }, {
    key: "serial",
    header: "الرقم",
    type: "integer",
    required: true
  }, {
    key: "name",
    header: "الاسم",
    type: "text",
    required: true
  }, {
    key: "unit",
    header: "الوحدة",
    type: "text",
    required: true
  }, {
    key: "dispensed",
    header: "المنصرف",
    type: "number",
    required: true
  }, {
    key: "price",
    header: "السعر",
    type: "number",
    required: true
  }, {
    key: "dispensedValue",
    header: "قيمة المنصرف",
    type: "number",
    required: false
  }, {
    key: "group",
    header: "المجموعة",
    type: "text",
    required: false
  }, {
    key: "month",
    header: "الشهر",
    type: "text",
    required: false
  }, {
    key: "received",
    header: "الوارد",
    type: "number",
    required: false
  }, {
    key: "balance",
    header: "الرصيد",
    type: "number",
    required: false
  }, {
    key: "pharmacy",
    header: "الصيدلية",
    type: "text",
    required: false
  }, {
    key: "pageNo",
    header: "رقم الصفحة",
    type: "integer",
    required: false
  } ];
  var FIELDS_BY_KEY = {};
  for (var i = 0; i < FIELDS.length; i++) FIELDS_BY_KEY[FIELDS[i].key] = FIELDS[i];
  var TOTAL_ROW_MARKER = "Total";
  var REPORTS = [ {
    id: "movement",
    label: "الحركة",
    order: 1,
    shortcut: "1",
    requiresOptional: [],
    defaults: {
      rowsPerPage: 10,
      blockSize: 10,
      cumulativeMode: "block",
      cumulativeAgg: "sum",
      showPartialBlockTotal: true,
      showPageMarkers: true,
      printOrientation: "portrait"
    },
    columns: [ "name", "unit", "dispensed", "price", "value", "cumulative" ],
    printTotalField: "value"
  }, {
    id: "yearlyInventory",
    label: "الجرد السنوي",
    order: 2,
    shortcut: "2",
    requiresOptional: [ "balance" ],
    defaults: {
      rowsPerPage: 24,
      blockSize: 24,
      cumulativeMode: "running",
      cumulativeAgg: "sum",
      showPartialBlockTotal: true,
      showPageMarkers: true,
      printOrientation: "portrait"
    },
    columns: [ "name", "unit", "balance", "price", "value", "cumulative" ],
    printTotalField: "value"
  }, {
    id: "balanceReport",
    label: "الرصيد",
    order: 3,
    shortcut: "3",
    requiresOptional: [ "balance" ],
    defaults: {
      rowsPerPage: 24,
      blockSize: null,
      cumulativeMode: "none",
      cumulativeAgg: "sum",
      showPartialBlockTotal: true,
      showPageMarkers: true,
      printOrientation: "portrait"
    },
    columns: [ "book", "serial", "name", "unit", "dispensed", "balance" ],
    printTotalField: null
  }, {
    id: "pages",
    label: "الصفحات المطبوعة",
    order: 4,
    shortcut: "4",
    requiresOptional: [],
    defaults: {
      rowsPerPage: 24,
      blockSize: null,
      cumulativeMode: "none",
      cumulativeAgg: "sum",
      showPartialBlockTotal: true,
      showPageMarkers: true,
      printOrientation: "portrait"
    },
    columns: [ "printPageNo", "value", "budget", "shift", "dispense" ],
    printTotalField: "value"
  }, {
    id: "groups",
    label: "المجموعات الدوائية",
    order: 5,
    shortcut: "5",
    requiresOptional: [ "group" ],
    defaults: {
      rowsPerPage: 9,
      blockSize: null,
      cumulativeMode: "none",
      cumulativeAgg: "sum",
      showPartialBlockTotal: true,
      showPageMarkers: true,
      printOrientation: "portrait"
    },
    columns: [ "group", "value" ],
    printTotalField: "value"
  }, {
    id: "averagePrices",
    label: "متوسط الأسعار",
    order: 6,
    shortcut: "6",
    requiresOptional: [],
    defaults: {
      rowsPerPage: 24,
      blockSize: null,
      cumulativeMode: "none",
      cumulativeAgg: "wmean",
      showPartialBlockTotal: true,
      showPageMarkers: true,
      printOrientation: "portrait"
    },
    columns: [ "name", "unit", "priceCount", "priceMin", "priceMax", "priceAvg", "qty", "value", "variancePct" ],
    printTotalField: "value"
  }, {
    id: "sourceRows",
    label: "البيانات المصدر",
    order: 7,
    shortcut: "7",
    requiresOptional: [],
    defaults: {
      rowsPerPage: 24,
      blockSize: null,
      cumulativeMode: "none",
      cumulativeAgg: "sum",
      showPartialBlockTotal: true,
      showPageMarkers: true,
      printOrientation: "portrait"
    },
    columns: [ "id", "budget", "shift", "dispense", "book", "serial", "name", "unit", "dispensed", "price", "dispensedValue", "group", "month", "received", "balance", "pharmacy", "pageNo", "actions" ],
    printTotalField: null
  }, {
    id: "movingAverage",
    label: "متوسط التكلفة المتحرك",
    order: 8,
    shortcut: "8",
    requiresOptional: [ "received", "month" ],
    defaults: {
      rowsPerPage: 24,
      blockSize: null,
      cumulativeMode: "none",
      cumulativeAgg: "sum",
      showPartialBlockTotal: true,
      showPageMarkers: true,
      printOrientation: "portrait",
      windowSize: 0
    },
    columns: [ "book", "serial", "name", "unit", "received", "dispensed", "price", "movingAvg", "valueOut", "negativeStock" ],
    printTotalField: "valueOut"
  } ];
  var REPORTS_BY_ID = {};
  for (var r = 0; r < REPORTS.length; r++) REPORTS_BY_ID[REPORTS[r].id] = REPORTS[r];
  var ROWS_PER_PAGE_PRESETS = [ 9, 10, 12, 16, 20, 24, 30 ];
  var BLOCK_SIZE_PRESETS = [ 9, 10, 12, 16, 20, 24, 30, 40, 50 ];
  var PRINT_ORIENTATIONS = [ "portrait", "landscape" ];
  var COLUMN_LABELS = {
    name: "الاسم",
    unit: "الوحدة",
    dispensed: "المنصرف",
    dispensedValue: "قيمة الصرف",
    price: "السعر",
    value: "القيمة",
    cumulative: "التراكمي",
    cumulative2: "التراكمي (٢)",
    sum1: "الإجمالي الجاري",
    sum2: "الإجمالي الجاري (٢)",
    group1: "إجمالي الفئة",
    group2: "إجمالي الفئة (٢)",
    balance: "الرصيد",
    book: "دفتر",
    serial: "الرقم",
    pageNo: "رقم الصفحة",
    printPageNo: "صفحة الطباعة",
    budget: "الموازنة",
    shift: "الفترة",
    dispense: "الصرف",
    group: "المجموعة",
    received: "الوارد",
    pharmacy: "الصيدلية",
    month: "الشهر",
    priceCount: "عدد الأسعار",
    priceMin: "أقل سعر",
    priceMax: "أعلى سعر",
    priceAvg: "السعر المتوسط",
    qty: "الكمية",
    variancePct: "نسبة التباين",
    id: "المعرّف",
    actions: "إجراء",
    movingAvg: "متوسط التكلفة",
    valueOut: "قيمة المنصرف بالتكلفة",
    negativeStock: "رصيد سالب"
  };
  var MONEY_COLUMNS = {
    value: true,
    cumulative: true,
    cumulative2: true,
    sum1: true,
    sum2: true,
    group1: true,
    group2: true,
    price: true,
    priceAvg: true,
    priceMin: true,
    priceMax: true,
    movingAvg: true,
    valueOut: true,
    dispensedValue: true
  };
  var MAX_SAFE_SCALED = BigInt(Number.MAX_SAFE_INTEGER);
  var VIRTUAL_COLUMNS = {
    id: true,
    actions: true
  };
  function printableColumns(columns) {
    return columns.filter(function(c) {
      return !VIRTUAL_COLUMNS[c];
    });
  }
  function withoutHiddenColumns(columns, hidden) {
    if (!hidden || !hidden.length) return columns;
    var filtered = columns.filter(function(c) {
      return VIRTUAL_COLUMNS[c] || hidden.indexOf(c) === -1;
    });
    return filtered.length ? filtered : columns;
  }
  var COLUMN_DECIMALS = {
    value: 4,
    cumulative: 4,
    cumulative2: 4,
    sum1: 4,
    sum2: 4,
    group1: 4,
    group2: 4,
    price: 4,
    priceMin: 4,
    priceMax: 4,
    priceAvg: 4,
    movingAvg: 4,
    valueOut: 4,
    dispensedValue: 4,
    qty: 3,
    variancePct: 4
  };
  var COLUMN_WEIGHTS = {
    name: 2.8,
    unit: 1.1,
    group: 1.6,
    book: 1,
    serial: .7,
    dispensed: 1.1,
    balance: 1.1,
    price: 1.1,
    value: 1.2,
    cumulative: 1.3,
    cumulative2: 1.3,
    sum1: 1.2,
    sum2: 1.2,
    group1: 1.2,
    group2: 1.2,
    pageNo: .8,
    printPageNo: .8,
    budget: 1.2,
    shift: 1.1,
    dispense: 1.1,
    priceCount: .9,
    priceMin: 1.1,
    priceMax: 1.1,
    priceAvg: 1.2,
    qty: 1.1,
    variancePct: 1.1,
    movingAvg: 1.2,
    valueOut: 1.3,
    negativeStock: 1.1,
    dispensedValue: 1.2
  };
  function decimalsForColumn(columnKey) {
    return COLUMN_DECIMALS[columnKey] !== undefined ? COLUMN_DECIMALS[columnKey] : 4;
  }
  var COMPUTED_NUMERIC_COLUMNS = {
    qty: true,
    priceCount: true,
    variancePct: true,
    printPageNo: true
  };
  function isNumericColumn(columnKey) {
    if (MONEY_COLUMNS[columnKey]) return true;
    var fieldDef = FIELDS_BY_KEY[columnKey];
    if (fieldDef && (fieldDef.type === "number" || fieldDef.type === "integer")) return true;
    return !!COMPUTED_NUMERIC_COLUMNS[columnKey];
  }
  function alignEnd(columnKey, value) {
    if (MONEY_COLUMNS[columnKey]) return true;
    if (typeof value === "number" || typeof value === "bigint") return true;
    return false;
  }
  return {
    SCALE_QTY,
    SCALE_PRICE,
    SCALE_VALUE,
    SCALE_AVG,
    COLUMN_DECIMALS,
    decimalsForColumn,
    isNumericColumn,
    alignEnd,
    DIMENSIONS,
    DIMENSION_ORDER,
    DIMENSION_LABELS,
    FIELDS,
    FIELDS_BY_KEY,
    TOTAL_ROW_MARKER,
    REPORTS,
    REPORTS_BY_ID,
    ROWS_PER_PAGE_PRESETS,
    BLOCK_SIZE_PRESETS,
    PRINT_ORIENTATIONS,
    COLUMN_LABELS,
    MONEY_COLUMNS,
    MAX_SAFE_SCALED,
    VIRTUAL_COLUMNS,
    COLUMN_WEIGHTS,
    printableColumns,
    withoutHiddenColumns
  };
}();


