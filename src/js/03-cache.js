PH.cache = function() {
  function cappedMap(limit) {
    if (typeof Map === "undefined") return null;
    var m = new Map;
    return {
      has: function(key) {
        return m.has(key);
      },
      get: function(key) {
        return m.get(key);
      },
      set: function(key, val) {
        if (m.size >= limit) m.clear();
        m.set(key, val);
      },
      clear: function() {
        m.clear();
      },
      size: function() {
        return m.size;
      }
    };
  }
  function cappedObject(limit) {
    var obj = {};
    var count = 0;
    return {
      has: function(key) {
        return obj[key] !== undefined;
      },
      get: function(key) {
        return obj[key];
      },
      set: function(key, val) {
        if (count >= limit) {
          obj = {};
          count = 0;
        }
        obj[key] = val;
        count++;
      },
      clear: function() {
        obj = {};
        count = 0;
      },
      size: function() {
        return count;
      }
    };
  }
  function capped(limit, kind) {
    return kind === "object" ? cappedObject(limit) : cappedMap(limit);
  }
  return {
    capped
  };
}();


