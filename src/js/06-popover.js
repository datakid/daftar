PH.popover = function() {
  function position(el, anchorEl, opts) {
    opts = opts || {};
    var margin = typeof opts.margin === "number" ? opts.margin : 8;
    var gap = typeof opts.gap === "number" ? opts.gap : 6;
    var fallbackWidth = opts.fallbackWidth || 0;
    var align = opts.align || "start";
    var rect = anchorEl.getBoundingClientRect();
    if (!rect.width && !rect.height && !rect.top && !rect.left) return;
    var w = el.offsetWidth || fallbackWidth;
    var h = el.offsetHeight || 0;
    var left = align === "end" ? rect.right - w : rect.left;
    if (left < margin) left = margin;
    if (left + w > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - margin - w);
    var top = rect.bottom + gap;
    if (top + h > window.innerHeight - margin) top = Math.max(margin, rect.top - h - gap);
    el.style.left = left + "px";
    el.style.top = top + "px";
  }
  function attach(el, anchorEl, opts) {
    opts = opts || {};
    var onClose = opts.onClose || function() {};
    var closeOnEscape = opts.closeOnEscape !== false;
    var closeOnClickAway = opts.closeOnClickAway !== false;
    var repositionOnResize = opts.repositionOnResize !== false;
    var repositionOnScroll = opts.repositionOnScroll !== false;
    var returnFocus = opts.returnFocus !== false;
    var delayAll = !!opts.delayAll;
    var posOpts = opts.position || {};
    var anchorHit = opts.anchorHit || function(a, t) {
      return a.contains(t);
    };
    var repoPending = false;
    function reposition() {
      if (repoPending) return;
      repoPending = true;
      window.requestAnimationFrame(function() {
        repoPending = false;
        if (!el.isConnected) return;
        if (anchorEl && anchorEl.isConnected === false) return;
        position(el, anchorEl, posOpts);
      });
    }
    function onDocClick(e) {
      if (el.contains(e.target) || anchorEl && anchorHit(anchorEl, e.target)) return;
      onClose();
    }
    function onDocKey(e) {
      if (e.key === "Escape") {
        onClose();
        if (returnFocus && anchorEl && anchorEl.focus) anchorEl.focus();
      }
    }
    var cancelled = false;
    if (!delayAll) {
      if (repositionOnResize) window.addEventListener("resize", reposition);
      if (repositionOnScroll) window.addEventListener("scroll", reposition, { capture: true, passive: true });
      if (closeOnEscape) document.addEventListener("keydown", onDocKey);
    }
    setTimeout(function() {
      if (cancelled) return;
      if (closeOnClickAway) document.addEventListener("click", onDocClick);
      if (delayAll) {
        if (closeOnEscape) document.addEventListener("keydown", onDocKey);
        if (repositionOnResize) window.addEventListener("resize", reposition);
        if (repositionOnScroll) window.addEventListener("scroll", reposition, { capture: true, passive: true });
      }
    }, 0);
    function cleanup() {
      cancelled = true;
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onDocKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    }
    return {
      close: onClose,
      cleanup,
      reposition
    };
  }
  function fadeOutAndRemove(el) {
    if (!el || !el.parentNode) return;
    el.classList.add("is-closing");
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      el.remove();
    }
    el.addEventListener("animationend", finish, {
      once: true
    });
    setTimeout(finish, 300);
  }
  return {
    position,
    attach,
    fadeOutAndRemove
  };
}();


