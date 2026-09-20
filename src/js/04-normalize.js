PH.normalize = function() {
  var TASHKEEL = /[\u064B-\u0652\u0670]/g;
  var TATWEEL = /\u0640/g;
  var INVISIBLE = /[\u200E\u200F\u061C\u00A0]/g;
  var ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
  var EASTERN_INDIC = "۰۱۲۳۴۵۶۷۸۹";
  var DIGIT_MAP = {};
  for (var digitIdx = 0; digitIdx < 10; digitIdx++) {
    DIGIT_MAP[ARABIC_INDIC[digitIdx]] = String(digitIdx);
    DIGIT_MAP[EASTERN_INDIC[digitIdx]] = String(digitIdx);
  }
  var NON_ASCII_DIGITS = /[٠-٩۰-۹]/g;
  var ALEF_VARIANTS = /[إأآٱ]/g;
  var CURRENCY_WORDS = /(ج\.م\.?|جنيه\s*مصري|جنيه|EGP|egp)/g;
  function digitsToAscii(str) {
    return str.replace(NON_ASCII_DIGITS, function(ch) {
      return DIGIT_MAP[ch];
    });
  }
  function collapseWhitespace(str) {
    return str.replace(/\s+/g, " ").trim();
  }
  var NEEDS_NFD_CHECK = /[^\x00-\x7F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  var arabicNormalizeCache = PH.cache.capped(5e3, "map");
  function arabicNormalizeUncached(input) {
    if (input === null || input === undefined) return "";
    var str = String(input);
    str = str.replace(TASHKEEL, "");
    str = str.replace(TATWEEL, "");
    str = str.replace(ALEF_VARIANTS, "ا");
    str = str.replace(/ى/g, "ي");
    str = str.replace(/ؤ/g, "و");
    str = str.replace(/ئ/g, "ي");
    str = str.replace(/ة/g, "ه");
    str = str.replace(INVISIBLE, "");
    str = digitsToAscii(str);
    if (NEEDS_NFD_CHECK.test(str)) str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    str = str.toLowerCase();
    str = collapseWhitespace(str);
    return str;
  }
  function arabicNormalize(input) {
    if (!arabicNormalizeCache) return arabicNormalizeUncached(input);
    var key = input === null || input === undefined ? "" : typeof input === "string" ? input : String(input);
    var cached = arabicNormalizeCache.get(key);
    if (cached !== undefined) return cached;
    var out = arabicNormalizeUncached(input);
    arabicNormalizeCache.set(key, out);
    return out;
  }
  function stripLeadingAl(normalized) {
    if (normalized.indexOf("ال") === 0 && normalized.length > 2) {
      return normalized.slice(2);
    }
    return normalized;
  }
  function normalizeForMatch(input) {
    var n = arabicNormalize(input);
    return {
      full: n,
      noArticle: stripLeadingAl(n)
    };
  }
  function matchesIgnoringArticle(a, b) {
    var na = normalizeForMatch(a);
    var nb = normalizeForMatch(b);
    return na.full === nb.full || na.full === nb.noArticle || na.noArticle === nb.full || na.noArticle === nb.noArticle;
  }
  function stripParenNegative(str) {
    var trimmed = str.trim();
    if (trimmed.length >= 2 && trimmed[0] === "(" && trimmed[trimmed.length - 1] === ")") {
      return {
        text: trimmed.slice(1, -1),
        negative: true
      };
    }
    return {
      text: trimmed,
      negative: false
    };
  }
  function parseNumber(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") {
      return isFinite(raw) ? raw : null;
    }
    var str = String(raw);
    str = str.replace(INVISIBLE, "");
    str = str.trim();
    if (str === "") return null;
    var paren = stripParenNegative(str);
    str = paren.text;
    str = str.replace(CURRENCY_WORDS, "");
    str = str.replace(/[جJj]$/, "");
    str = digitsToAscii(str);
    str = str.replace(/\u066B/g, ".");
    str = str.replace(/\u066C/g, "");
    str = str.trim();
    var negative = paren.negative;
    if (str.indexOf("-") === 0) {
      negative = true;
      str = str.slice(1);
    }
    if (str.indexOf("+") === 0) {
      str = str.slice(1);
    }
    str = str.replace(/,/g, "");
    str = str.replace(/\s/g, "");
    if (str === "" || !/^(\d+\.?\d*|\.\d+)$/.test(str)) return null;
    var value = parseFloat(str);
    if (!isFinite(value)) return null;
    return negative ? -value : value;
  }
  function parseInteger(raw) {
    var n = parseNumber(raw);
    if (n === null) return null;
    return Math.round(n);
  }
  function excelSerialToMonthString(serial) {
    var utcDays = Math.floor(serial - 25569);
    var utcMs = utcDays * 86400 * 1e3;
    var d = new Date(utcMs);
    var y = d.getUTCFullYear();
    var m = d.getUTCMonth() + 1;
    return y + "-" + (m < 10 ? "0" + m : String(m));
  }
  function parseMonthValue(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number" && raw > 2e4 && raw < 8e4) {
      return excelSerialToMonthString(raw);
    }
    var str = String(raw).trim();
    if (str === "") return null;
    if (/^\d{5}$/.test(str)) {
      var serial = parseInt(str, 10);
      if (serial > 2e4 && serial < 8e4) return excelSerialToMonthString(serial);
    }
    str = collapseWhitespace(digitsToAscii(str));
    var isoMatch = /^(\d{4})[-\/](\d{1,2})$/.exec(str);
    if (isoMatch) {
      var isoMonth = parseInt(isoMatch[2], 10);
      if (isoMonth >= 1 && isoMonth <= 12) return isoMatch[1] + "-" + (isoMonth < 10 ? "0" + isoMonth : String(isoMonth));
    }
    var monthYearMatch = /^(\d{1,2})[-\/](\d{4})$/.exec(str);
    if (monthYearMatch) {
      var myMonth = parseInt(monthYearMatch[1], 10);
      if (myMonth >= 1 && myMonth <= 12) return monthYearMatch[2] + "-" + (myMonth < 10 ? "0" + myMonth : String(myMonth));
    }
    return str;
  }
  function identityKey(input) {
    if (input === null || input === undefined) return "";
    return collapseWhitespace(String(input).normalize("NFC"));
  }
  return {
    arabicNormalize,
    stripLeadingAl,
    normalizeForMatch,
    matchesIgnoringArticle,
    parseNumber,
    parseInteger,
    parseMonthValue,
    excelSerialToMonthString,
    digitsToAscii,
    collapseWhitespace,
    identityKey
  };
}();


