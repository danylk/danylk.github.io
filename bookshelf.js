// Bookshelf: each book is a 3D box (see bookshelf.css). Clicking a book
// turns it so its cover faces out (title and author fade in above the book)
// and widens its slot; clicking it again,
// pressing Escape, clicking anywhere off the books, or opening another book
// turns it back. Cover images
// load the first time a book is hovered, focused or opened.
(function () {
  var slots = Array.prototype.slice.call(document.querySelectorAll('.slot'));
  if (!slots.length) return;

  var still = window.matchMedia('(prefers-reduced-motion: reduce)');
  var canHover = window.matchMedia('(hover: hover)');
  var current = null;

  // Show every word of every spine title: start from the stylesheet's size
  // and shrink until the title no longer overflows its spine (text wraps
  // into extra columns across the spine as it gets smaller).
  var titles = Array.prototype.slice.call(document.querySelectorAll('.spine-title'));
  function fitTitles() {
    titles.forEach(function (el) {
      el.style.fontSize = '';
      var size = parseFloat(getComputedStyle(el).fontSize);
      var guard = 0;
      while ((el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5)
             && size > 5 && guard++ < 40) {
        size *= 0.94;
        el.style.fontSize = size.toFixed(2) + 'px';
      }
    });
  }
  fitTitles();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitles);
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitTitles, 150);
  });

  function load(slot) {
    var img = slot.querySelector('img[data-src]');
    if (img && !img.getAttribute('src')) img.src = img.dataset.src;
  }

  // Touch screens have no hover to load a cover ahead of the tap, so a
  // cover could arrive mid-turn and pop in. Load covers of books that come
  // near the screen instead.
  if (window.matchMedia('(hover: none)').matches && 'IntersectionObserver' in window) {
    var near = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          load(e.target);
          near.unobserve(e.target);
        }
      });
    }, { rootMargin: '300px 0px' });
    slots.forEach(function (slot) { near.observe(slot); });
  }

  // Once the opened book has glided into its final place (see flip), show
  // the caption above the book, shifted sideways (--dx) to stay
  // inside the shelf, then scroll only if the caption or cover is partly
  // off screen. This runs at 0.6s, before the turn ends at 0.8s, so the
  // turn's last frames have no layout or scrolling to compete with.
  function settle(slot) {
    var cap = slot.querySelector('.cover-caption');
    cap.style.setProperty('--dx', '0px');
    var c = cap.getBoundingClientRect();
    var s = slot.parentNode.getBoundingClientRect();
    var dx = 0;
    if (c.left < s.left) dx = s.left - c.left;
    else if (c.right > s.right) dx = s.right - c.right;
    cap.style.setProperty('--dx', dx.toFixed(1) + 'px');
    slot.classList.add('captioned');

    var top = c.top, bottom = slot.querySelector('.cover-face').getBoundingClientRect().bottom;
    var vh = window.innerHeight, pad = 12, dy = 0;
    if (top < pad) dy = top - pad;
    else if (bottom > vh - pad) dy = Math.min(bottom - vh + pad, top - pad);
    if (Math.abs(dy) >= 1) {
      window.scrollBy({ top: dy, behavior: still.matches ? 'auto' : 'smooth' });
    }
  }

  // Opening or closing a book changes its slot's width at once, which can
  // move books along the row, onto the next row, and shift the sections
  // below. flip() measures everything that can move, lets the change
  // happen, then glides each item from where it was to where it is now
  // (FLIP), so nothing jumps. The toggled books are measured by their
  // centre, so a book stays put while its slot widens around it.
  var OPEN_GLIDE = '0.6s cubic-bezier(0.3, 0.7, 0.2, 1)';
  var CLOSE_GLIDE = '0.45s cubic-bezier(0.45, 0, 0.25, 1) 0.26s';

  function movers(toggled) {
    var list = [];
    toggled.forEach(function (slot) {
      Array.prototype.forEach.call(slot.parentNode.children, function (el) { list.push(el); });
      // Everything after the book's section: the sections below it, then
      // what follows the shelf view (the footer)
      for (var a = slot.closest('section'); a && !a.classList.contains('page'); a = a.parentNode) {
        for (var n = a.nextElementSibling; n; n = n.nextElementSibling) list.push(n);
      }
    });
    return list.filter(function (el, i) { return list.indexOf(el) === i; });
  }

  function flip(toggled, change, glide) {
    if (still.matches) { change(); return; }
    var els = movers(toggled);
    function at(el) {
      var r = el.getBoundingClientRect();
      return { x: toggled.indexOf(el) >= 0 ? r.left + r.width / 2 : r.left, y: r.top };
    }
    var first = els.map(at);
    els.forEach(function (el) { el.style.transition = 'none'; el.style.transform = ''; });
    change();
    var delta = els.map(function (el, i) {
      var last = at(el);
      return { x: first[i].x - last.x, y: first[i].y - last.y };
    });
    // A book inside a section that moves as a whole moves with it already
    els.forEach(function (el, i) {
      for (var p = el.parentNode; p && p !== document; p = p.parentNode) {
        var j = els.indexOf(p);
        if (j >= 0) { delta[i].x -= delta[j].x; delta[i].y -= delta[j].y; break; }
      }
    });
    els.forEach(function (el, i) {
      var d = delta[i];
      if (Math.abs(d.x) < 0.5 && Math.abs(d.y) < 0.5) { el.style.transition = ''; return; }
      el.style.transform = 'translate(' + d.x.toFixed(1) + 'px, ' + d.y.toFixed(1) + 'px)';
    });
    void document.body.offsetWidth;   // apply the starting offsets before gliding
    els.forEach(function (el) {
      if (!el.style.transform) return;
      el.style.transition = 'transform ' + glide;
      el.style.transform = '';
      el.addEventListener('transitionend', function end(e) {
        if (e.target !== el || e.propertyName !== 'transform') return;
        el.style.transition = '';
        el.removeEventListener('transitionend', end);
      });
    });
  }

  function markOpen(slot) {
    load(slot);
    slot.classList.remove('closing');
    slot.classList.add('open');
    slot.querySelector('.hit').setAttribute('aria-expanded', 'true');
    current = slot;
    // Caption and any scroll once the glide is done (0.6s), before the
    // turn ends (0.8s)
    setTimeout(function () { if (current === slot) settle(slot); }, still.matches ? 0 : 620);
  }

  function open(slot, closing) {
    if (closing) {
      flip([closing, slot], function () { markClosed(closing); markOpen(slot); }, OPEN_GLIDE);
    } else {
      flip([slot], function () { markOpen(slot); }, OPEN_GLIDE);
    }
  }

  function close(slot) {
    if (!slot) return;
    flip([slot], function () { markClosed(slot); }, CLOSE_GLIDE);
  }

  function markClosed(slot) {
    if (current === slot) current = null;
    slot.classList.remove('open', 'captioned');
    slot.querySelector('.hit').setAttribute('aria-expanded', 'false');
    if (still.matches) return;
    slot.classList.add('closing');
    // Closing under the pointer ends in the hover tilt (book-close-tilt)
    if (canHover.matches && slot.matches(':hover')) slot.classList.add('to-tilt');
    var book = slot.querySelector('.book');
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      book.removeEventListener('animationend', onEnd);
      // Hand the book's final pose to the plain hover transition: hold it
      // inline, drop the turn, then let go, so if the pointer came or went
      // during the close the book eases to the right pose instead of
      // snapping (and nothing moves if it already matches).
      var pose = getComputedStyle(book).transform;
      book.style.transition = 'none';
      book.style.transform = pose;
      slot.classList.remove('closing', 'to-tilt');
      void book.offsetWidth;
      book.style.transition = '';
      book.style.transform = '';
    }
    function onEnd(e) { if (e.animationName.indexOf('book-close') === 0) finish(); }
    book.addEventListener('animationend', onEnd);
    setTimeout(finish, 1000);
  }

  slots.forEach(function (slot) {
    var hit = slot.querySelector('.hit');
    hit.addEventListener('pointerenter', function () { load(slot); });
    hit.addEventListener('focus', function () { load(slot); });
    hit.addEventListener('click', function () {
      if (current === slot) {
        close(slot);
      } else {
        open(slot, current);
      }
    });
  });

  // A click anywhere that isn't a book puts the open book back
  document.addEventListener('click', function (e) {
    if (current && !(e.target.closest && e.target.closest('.hit'))) close(current);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) {
      var slot = current;
      close(slot);
      slot.querySelector('.hit').focus();
    }
  });

  // Shelf / List switch. The view is a data-view attribute on <html>
  // (set before paint from the saved choice by the inline script in
  // <head>), so a saved List view never flashes the shelf first.
  var root = document.documentElement;
  var switcher = document.querySelector('.view-switch');
  if (switcher) {
    var buttons = Array.prototype.slice.call(switcher.querySelectorAll('button'));
    var show = function (view) {
      if (view === 'list') root.setAttribute('data-view', 'list');
      else root.removeAttribute('data-view');
      buttons.forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false');
      });
    };
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        var view = b.dataset.view;
        if (view === 'list' && current) markClosed(current);
        show(view);
        // Titles can't be measured while the shelf is hidden
        if (view === 'shelf') fitTitles();
        try { localStorage.setItem('books-view', view); } catch (e) {}
      });
    });
    show(root.getAttribute('data-view') === 'list' ? 'list' : 'shelf');
    switcher.hidden = false;
  }
})();
