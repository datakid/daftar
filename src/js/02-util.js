PH.util = function() {
  var arCollator = null;
  function collatorAr() {
    if (!arCollator) arCollator = new Intl.Collator("ar", {
      numeric: true,
      sensitivity: "base"
    });
    return arCollator;
  }
  function isBlank(v) {
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    return false;
  }
  function shallowCopy(obj) {
    var out = {};
    for (var k in obj) out[k] = obj[k];
    return out;
  }
  function uniq(arr) {
    var seen = new Set;
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!seen.has(arr[i])) {
        seen.add(arr[i]);
        out.push(arr[i]);
      }
    }
    return out;
  }
  return {
    collatorAr,
    isBlank,
    shallowCopy,
    uniq
  };
}();


