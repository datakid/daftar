PH.dom = function() {
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function(k) {
      if (k === "class") e.className = attrs[k]; else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function(c) {
      if (c) e.appendChild(c);
    });
    return e;
  }
  function text(t) {
    return document.createTextNode(t === null || t === undefined ? "" : String(t));
  }
  function trustedSvg(tag, attrs, svgMarkup) {
    var e = el(tag, attrs, []);
    e.innerHTML = svgMarkup;
    return e;
  }
  return {
    el,
    text,
    trustedSvg
  };
}();


