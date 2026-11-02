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
  // scrollWidth/Height and clientWidth/Height are rounded differently, so a
  // title that fits (e.g. one 14.35px-wide column: client 14, scroll 15)
  // can look 1px too big; only overflow of more than 1px counts.
  // All titles shrink together, one step per pass (read every title, then
  // resize the ones that overflow), so the page is laid out once per pass
  // rather than once per step of every title. This works in List view too:
  // the hidden shelf is collapsed, not removed, so its books keep their size.
  var SLACK = 1;
  var titles = Array.prototype.slice.call(document.querySelectorAll('.spine-title'));
  function fitTitles() {
    titles.forEach(function (el) { el.style.fontSize = ''; });
    var sizes = titles.map(function (el) { return parseFloat(getComputedStyle(el).fontSize); });
    var todo = titles.map(function (el, i) { return i; });
    for (var pass = 0; pass < 40 && todo.length; pass++) {
      todo = todo.filter(function (i) {
        var el = titles[i];
        return (el.scrollWidth > el.clientWidth + SLACK || el.scrollHeight > el.clientHeight + SLACK)
               && sizes[i] > 5;
      });
      todo.forEach(function (i) {
        sizes[i] *= 0.94;
        titles[i].style.fontSize = sizes[i].toFixed(2) + 'px';
      });
    }
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
  // (During a view change they wait, see deferred: loading changes the
  // page, which would make every moving book be restyled.)
  var deferred = [];
  if (window.matchMedia('(hover: none)').matches && 'IntersectionObserver' in window) {
    var near = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          if (morph) deferred.push(e.target);
          else load(e.target);
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
      if (morph) return;   // the view is changing (morphTo)
      if (current === slot) {
        close(slot);
      } else {
        open(slot, current);
      }
    });
  });

  // A click anywhere that isn't a book puts the open book back
  document.addEventListener('click', function (e) {
    if (current && !morph && !(e.target.closest && e.target.closest('.hit'))) close(current);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) {
      var slot = current;
      close(slot);
      slot.querySelector('.hit').focus();
    }
  });

  // Put an open (or closing) book back at once, with no turn, and drop any
  // glide in progress, so a view change measures books at rest
  // (only elements that need it are touched: a write to every book would
  // make the browser restyle the whole shelf)
  function closeNow() {
    slots.forEach(function (slot) {
      var book = slot.querySelector('.book');
      if (/\b(open|captioned|closing|to-tilt)\b/.test(slot.className)) {
        slot.classList.remove('open', 'captioned', 'closing', 'to-tilt');
        slot.querySelector('.hit').setAttribute('aria-expanded', 'false');
      }
      if (book.style.transform || book.style.transition) book.style.transition = book.style.transform = '';
      if (slot.style.transform || slot.style.transition) slot.style.transition = slot.style.transform = '';
    });
    Array.prototype.forEach.call(document.querySelectorAll('.view section, .foot'), function (el) {
      if (el.style.transform || el.style.transition) el.style.transition = el.style.transform = '';
    });
    current = null;
  }

  // ---- Shelf / List switch ---------------------------------------------
  // The view is a data-view attribute on <html> (set before paint from the
  // saved choice by the inline script in <head>), so a saved List view
  // never flashes the shelf first.
  var root = document.documentElement;
  var switcher = document.querySelector('.view-switch');
  if (!switcher) return;
  var buttons = Array.prototype.slice.call(switcher.querySelectorAll('button'));
  var pill = switcher.querySelector('.vs-pill');
  var viewShelf = document.querySelector('.view-shelf');
  var viewList = document.querySelector('.view-list');
  var entries = Array.prototype.slice.call(document.querySelectorAll('.book-list li'));
  var foot = document.querySelector('.foot');
  var animates = typeof Element.prototype.animate === 'function';
  var morph = null;     // the view change in progress, if any (morphTo)

  function viewNow() { return root.getAttribute('data-view') === 'list' ? 'list' : 'shelf'; }

  // The page's view (the switch's buttons follow press(), which comes first)
  function setView(view) {
    var list = view === 'list';
    if (list) root.setAttribute('data-view', 'list');
    else root.removeAttribute('data-view');
    // The collapsed view is still there (see bookshelf.css): keep it from
    // screen readers and the keyboard
    viewShelf.setAttribute('aria-hidden', list ? 'true' : 'false');
    viewList.setAttribute('aria-hidden', list ? 'false' : 'true');
    slots.forEach(function (slot) {
      var hit = slot.querySelector('.hit');
      if (list) hit.setAttribute('tabindex', '-1');
      else hit.removeAttribute('tabindex');
    });
  }

  // The pill behind the pressed button. Moving, it first stretches its
  // leading edge to the new button, then pulls its trailing edge after,
  // overshooting a little (a squish) before it settles. Only its transform
  // is animated (scaleX from its left edge; it gets its final width at
  // once): any animation the compositor can't run alone, such as width,
  // makes Chrome restyle every moving book on every frame.
  var pillAt = null, pillAnim = null, pressed = viewNow();
  function press(view, animate) {
    pressed = view;
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false');
    });
    placePill(animate);
  }
  function placePill(animate) {
    var b = buttons.filter(function (x) { return x.dataset.view === pressed; })[0];
    var to = { x: b.offsetLeft, w: b.offsetWidth }, from = pillAt;
    pillAt = to;
    if (pillAnim) { pillAnim.cancel(); pillAnim = null; }
    pill.style.width = to.w + 'px';
    pill.style.transform = 'translateX(' + to.x + 'px)';
    if (!animate || !from || !animates || still.matches) return;
    var left = Math.min(from.x, to.x);
    var right = Math.max(from.x + from.w, to.x + to.w);
    var at = function (x, w) {
      return 'translateX(' + x.toFixed(1) + 'px) scaleX(' + (w / to.w).toFixed(4) + ')';
    };
    pillAnim = pill.animate([
      { offset: 0, transform: at(from.x, from.w), easing: 'cubic-bezier(0.5, 0, 0.75, 0.45)' },
      { offset: 0.42, transform: at(left, right - left), easing: 'cubic-bezier(0.2, 0.6, 0.3, 1.3)' },
      { offset: 1, transform: at(to.x, to.w) }
    ], { duration: 600 });
  }

  // ---- The view change -------------------------------------------------
  // Every book near the screen is carried between its list entry and its
  // spine by ghosts in a layer over the page (see .morph-layer in
  // bookshelf.css): the list title (.mg-a) and a copy of the spine title
  // (.mg-b) fly the same arc, turning a quarter turn and changing size, and
  // cross-fade half way; the spine's cloth (.mg-c) builds up from the shelf
  // around the arriving title (to Shelf), or sinks into it as the title
  // lifts off (to List). Headings, section rules, shelves and the footer
  // glide or fade to their new places. Both copies are exact at their own
  // end, so the real book or entry takes over without a jump. The first
  // book on screen keeps its place on screen, so the books fly within view.
  // Only transform and opacity are animated, with fixed values
  // (no CSS variables, which Safari mishandles in animations).

  function listBox(li) {       // the title's top-left and the entry's width
    var r = li.getBoundingClientRect(), cs = getComputedStyle(li);
    var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
    return { x: r.left + pl, y: r.top + (parseFloat(cs.paddingTop) || 0),
             w: r.width - pl - pr, top: r.top, bottom: r.bottom };
  }

  function spineBox(slot) {    // the spine, its title's box, text and type
    var face = slot.querySelector('.spine-face'), title = slot.querySelector('.spine-title');
    var range = document.createRange();
    range.selectNodeContents(title);
    var f = face.getBoundingClientRect(), b = title.getBoundingClientRect();
    var t = range.getBoundingClientRect(), cs = getComputedStyle(title);
    if (!t.width || !t.height) t = b;
    return { face: f, box: b, text: t, top: f.top, bottom: f.bottom, shown: title.textContent,
             font: { size: cs.fontSize, weight: cs.fontWeight, lh: cs.lineHeight, ls: cs.letterSpacing },
             color: cs.color };
  }

  function sectionsOf(view) {
    return Array.prototype.map.call(view.querySelectorAll('section'), function (s) {
      var r = s.getBoundingClientRect(), h = s.querySelector('h2');
      return { el: s, h2: h, top: r.top, left: r.left, width: r.width,
               h2Top: h.getBoundingClientRect().top, rule: getComputedStyle(s).borderTopColor };
    });
  }

  function px(el, x, y, w, h) {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (w != null) el.style.width = w + 'px';
    if (h != null) el.style.height = h + 'px';
  }

  function remove(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  // The list title (and its author line) where the entry is
  function ghostTitle(li, b, sx, sy) {
    var a = document.createElement('div');
    a.className = 'mg-a';
    a.appendChild(li.querySelector('.bl-t').cloneNode(true));
    var ko = li.querySelector('.bl-ko');
    if (ko) {
      a.appendChild(document.createTextNode(' '));
      a.appendChild(ko.cloneNode(true));
    }
    var au = li.querySelector('.bl-a').cloneNode(true);
    au.className += ' mg-au';
    au.style.width = b.w + 'px';
    a.appendChild(au);
    px(a, b.x + sx, b.y + sy);
    a.style.maxWidth = b.w + 'px';
    return a;
  }

  // A copy of the spine title, turning about the middle of its text
  function ghostSpineTitle(b, sx, sy) {
    var g = document.createElement('div');
    g.className = 'mg-b';
    g.textContent = b.shown;
    px(g, b.box.left + sx, b.box.top + sy, b.box.width, b.box.height);
    g.style.fontSize = b.font.size;
    g.style.fontWeight = b.font.weight;
    g.style.lineHeight = b.font.lh;
    g.style.letterSpacing = b.font.ls;
    g.style.transformOrigin = (b.text.left + b.text.width / 2 - b.box.left) + 'px ' +
                              (b.text.top + b.text.height / 2 - b.box.top) + 'px';
    return g;
  }

  // A copy of the spine's cloth (bands and surname; the title stays hidden)
  function ghostCloth(slot, b, sx, sy) {
    var c = document.createElement('div');
    c.className = 'mg-c' + (slot.classList.contains('thin') ? ' thin' : '');
    c.style.setProperty('--cloth', slot.style.getPropertyValue('--cloth'));
    c.style.setProperty('--ink-on', slot.style.getPropertyValue('--ink-on'));
    px(c, b.face.left + sx, b.face.top + sy, b.face.width, b.face.height);
    var face = slot.querySelector('.spine-face').cloneNode(true);
    face.querySelector('.spine-title').style.visibility = 'hidden';
    c.appendChild(face);
    c.band = document.createElement('div');
    c.band.className = 'mg-band';
    c.appendChild(c.band);
    return c;
  }

  // The flight, as poses relative to the list title: x/y move its text
  // centre, r turns it, s scales it. The spine-title copy flies the same
  // poses, offset by the list-to-spine difference (tf, spine = true).
  function route(g, toShelf) {
    var arc = Math.min(70, 14 + Math.abs(g.dx) * 0.06 + Math.abs(g.dy) * 0.05);
    var up = 'cubic-bezier(0.3, 0, 0.3, 1)';
    var go = 'cubic-bezier(0.45, 0, 0.75, 0.6)';      // speeding up...
    var arrive = 'cubic-bezier(0.2, 0.45, 0.2, 1)';   // ...and settling
    if (toShelf) return [
      { o: 0, x: 0, y: 0, r: 0, s: 1, e: up },
      { o: 0.14, x: 0, y: -4, r: 0, s: 1.04, e: go },
      { o: 0.55, x: g.dx * 0.5, y: g.dy * 0.5 - arc, r: 60, s: 1.04 + (g.s - 1.04) * 0.55, e: arrive },
      { o: 0.88, x: g.dx, y: g.dy, r: 90, s: g.s, e: 'linear' },
      { o: 1, x: g.dx, y: g.dy, r: 90, s: g.s }
    ];
    var lift = g.s * 1.08;
    return [
      { o: 0, x: g.dx, y: g.dy, r: 90, s: g.s, e: up },
      { o: 0.22, x: g.dx, y: g.dy - 8, r: 90, s: lift, e: go },
      { o: 0.6, x: g.dx * 0.5, y: g.dy * 0.5 - arc, r: 30, s: lift + (1 - lift) * 0.55, e: arrive },
      { o: 0.92, x: 0, y: 0, r: 0, s: 1, e: 'linear' },
      { o: 1, x: 0, y: 0, r: 0, s: 1 }
    ];
  }

  function tf(p, g, spine) {
    var x = p.x, y = p.y, r = p.r, s = p.s;
    if (spine) { x -= g.dx; y -= g.dy; r -= 90; s /= g.s; }
    return 'translate(' + x.toFixed(2) + 'px, ' + y.toFixed(2) + 'px) rotate(' +
           r.toFixed(2) + 'deg) scale(' + s.toFixed(4) + ')';
  }

  function poses(path, g, spine) {
    return path.map(function (p) {
      var k = { offset: p.o, transform: tf(p, g, spine) };
      if (p.e) k.easing = p.e;
      return k;
    });
  }

  function steps(prop, list) {
    return list.map(function (v) {
      var k = { offset: v[0] };
      k[prop] = v[1];
      return k;
    });
  }

  function morphTo(view) {
    if (morph) morph.finish();
    if (view === viewNow()) return;
    closeNow();
    var toShelf = view === 'shelf';
    if (still.matches || !animates || entries.length !== slots.length) {
      setView(view);
      return;
    }

    var n = slots.length, i;
    var vh = window.innerHeight;
    var near = function (r) { return r.bottom > -60 && r.top < vh + 60; };
    var srcView = toShelf ? viewList : viewShelf, dstView = toShelf ? viewShelf : viewList;
    var measure = function (i) { return toShelf ? spineBox(slots[i]) : listBox(entries[i]); };
    var listSize = parseFloat(getComputedStyle(viewList).fontSize) || 17;

    // 1. Read where everything is now. Steps 1, 2 and 4 only read and step
    //    3 only writes, so the page is laid out a few times in all rather
    //    than once per book.
    var src = [];
    for (i = 0; i < n; i++) src.push(toShelf ? listBox(entries[i]) : spineBox(slots[i]));
    var srcSecs = sectionsOf(srcView);
    var srcFoot = foot ? foot.getBoundingClientRect().top : 0;
    var shelves = Array.prototype.slice.call(viewShelf.querySelectorAll('.shelf'));
    var planks = [];
    if (!toShelf) shelves.forEach(function (ul) {
      var r = ul.getBoundingClientRect();
      if (!near(r)) return;
      var cs = getComputedStyle(ul);   // copied now, before the shelf view is hidden
      planks.push({ r: r, image: cs.backgroundImage, size: cs.backgroundSize,
                    repeat: cs.backgroundRepeat, position: cs.backgroundPosition });
    });
    var anchor = -1;
    if (srcView.getBoundingClientRect().top < 0) {
      for (i = 0; i < n; i++) if (src[i].bottom > 0) { anchor = i; break; }
    }

    // 2. Switch, keep the first book on screen in place, and read where
    //    everything goes
    setView(view);
    if (anchor >= 0) {
      window.scrollTo(window.pageXOffset, window.pageYOffset + measure(anchor).top - src[anchor].top);
    }
    var dst = [];
    for (i = 0; i < n; i++) dst.push(measure(i));
    var dstSecs = sectionsOf(dstView);
    var dstFoot = foot ? foot.getBoundingClientRect().top : 0;
    var grow = toShelf ? shelves.filter(function (ul) { return near(ul.getBoundingClientRect()); }) : [];
    var sx = window.pageXOffset, sy = window.pageYOffset;
    var docW = root.clientWidth, docH = root.scrollHeight;

    // 3. Build the ghosts
    var layer = document.createElement('div');
    layer.className = 'morph-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.width = docW + 'px';     // a fixed size, so with contain: strict
    layer.style.height = docH + 'px';    // the layer is laid out on its own
    var base = document.createDocumentFragment();   // shelves and rules
    var cloth = document.createDocumentFragment();  // spines, under...
    var text = document.createDocumentFragment();   // ...the titles

    planks.forEach(function (p) {
      var d = document.createElement('div');
      px(d, p.r.left + sx, p.r.top + sy, p.r.width, p.r.height);
      d.style.backgroundImage = p.image;
      d.style.backgroundSize = p.size;
      d.style.backgroundRepeat = p.repeat;
      d.style.backgroundPosition = p.position;
      d.style.transformOrigin = '100% 50%';
      base.appendChild(d);
      p.el = d;
    });
    var secs = srcSecs.length !== dstSecs.length ? [] : dstSecs.map(function (t, k) {
      var line = document.createElement('div');
      line.className = 'mg-line';
      px(line, t.left + sx, srcSecs[k].top + sy, t.width);
      line.style.background = srcSecs[k].rule;
      base.appendChild(line);
      t.el.style.borderTopColor = 'transparent';
      return { s: srcSecs[k], t: t, line: line };
    });

    var ghosts = [];
    for (i = 0; i < n; i++) {
      if (!near(src[i]) && !near(dst[i])) continue;
      var L = toShelf ? src[i] : dst[i], S = toShelf ? dst[i] : src[i];
      var g = { slot: slots[i], li: entries[i], S: S,
                a: ghostTitle(entries[i], L, sx, sy),
                b: ghostSpineTitle(S, sx, sy),
                c: ghostCloth(slots[i], S, sx, sy) };
      cloth.appendChild(g.c);
      text.appendChild(g.a);
      text.appendChild(g.b);
      (toShelf ? g.slot : g.li).style.opacity = '0';
      ghosts.push(g);
    }
    layer.appendChild(base);
    layer.appendChild(cloth);
    layer.appendChild(text);
    document.body.appendChild(layer);

    // 4. Each flight: a quarter turn from the list title to the spine
    //    title, pivoting on the part of the title the spine shows (the
    //    spine drops a subtitle) and scaled by the two font sizes, so both
    //    copies keep the same letter size all the way and line up as they
    //    cross-fade. Read every title first, then set the pivots.
    var geo = ghosts.map(function (g) {
      var node = g.a.firstChild.firstChild;             // the .bl-t text
      var range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, node.nodeValue.indexOf(g.S.shown) === 0 ? g.S.shown.length : node.nodeValue.length);
      return { t: range.getBoundingClientRect(), box: g.a.getBoundingClientRect() };
    });
    ghosts.forEach(function (g, k) {
      var t = geo[k].t, box = geo[k].box, St = g.S.text;
      var cx = t.left + t.width / 2, cy = t.top + t.height / 2;
      g.a.style.transformOrigin = (cx - box.left) + 'px ' + (cy - box.top) + 'px';
      g.dx = St.left + St.width / 2 - cx;
      g.dy = St.top + St.height / 2 - cy;
      g.s = (parseFloat(g.S.font.size) || 12) / listSize;
      g.b.style.color = g.S.color;
    });

    // Timing. Every animation starts at once and runs the same length (T);
    // a book's turn in the stagger is a hold on its first pose, written
    // into its keyframes (stretch). Chrome restyles animations that have a
    // delay on every frame, while these run wholly on the compositor.
    var D = toShelf ? 1000 : 1250;                                // one flight (ms)
    var step = Math.min(26, 520 / Math.max(1, ghosts.length));    // stagger
    var T = D + step * Math.max(0, ghosts.length - 1);
    var anims = [], ends = [], timers = [];
    var state = {
      finish: function () {
        timers.forEach(clearTimeout);
        anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
        remove(layer);
        ghosts.forEach(function (g) { g.slot.style.opacity = g.li.style.opacity = ''; });
        secs.forEach(function (p) { p.t.el.style.borderTopColor = ''; });
        ends.forEach(function (f) { f(); });
        if (morph === state) morph = null;
        deferred.splice(0).forEach(load);   // covers that came into view meanwhile
      }
    };
    morph = state;

    function copy(f, offset) {
      var k = {};
      for (var p in f) if (p !== 'offset') k[p] = f[p];
      k.offset = offset;
      return k;
    }

    // Keyframes running from `at` to `at + D` (ms) on the shared timeline,
    // holding the first pose before and the last after
    function stretch(frames, at) {
      var a = at / T, w = D / T;
      var out = frames.map(function (f) { return copy(f, Math.min(1, a + f.offset * w)); });
      if (a > 0) {
        var first = copy(frames[0], 0);
        delete first.easing;
        out.unshift(first);
      }
      if (out[out.length - 1].offset < 1) out.push(copy(frames[frames.length - 1], 1));
      return out;
    }

    function play(el, frames, opts) {
      var an = el.animate(frames, opts || { duration: T, fill: 'both' });
      anims.push(an);
      return an;
    }

    // A landed book's ghosts hold their last pose, which matches the real
    // spine (or entry) exactly, until every book has landed; then all the
    // real ones take their place at once. (Swapping each book as it landed
    // would change the page on every frame, and Chrome would then restyle
    // every moving ghost each time.) The timer checks the animations' own
    // clock, so nothing is swapped early.
    var clock = null;
    function done() {
      if (morph !== state) return;
      var now = clock && clock.currentTime;
      if (clock && (now == null || now < T)) {
        timers.push(setTimeout(done, Math.max(16, T - (now || 0))));
        return;
      }
      state.finish();
    }

    ghosts.forEach(function (g, k) {
      var at = k * step, path = route(g, toShelf);
      var fly = play(g.a, stretch(poses(path, g, false), at));
      if (!clock) clock = fly;
      play(g.b, stretch(poses(path, g, true), at));
      // The two titles swap while the cloth is there: the spine-coloured
      // copy only ever shows over the cloth, the page-coloured title only
      // off it (no colour animation, which would repaint every frame)
      if (toShelf) {
        play(g.a.lastChild, stretch(steps('opacity', [[0, 1], [0.16, 0], [1, 0]]), at));
        play(g.c, stretch([
          { offset: 0, opacity: 0, transform: 'scaleY(0.4)' },
          { offset: 0.4, opacity: 0, transform: 'scaleY(0.4)',
            easing: 'cubic-bezier(0.25, 0.8, 0.35, 1.15)' },
          { offset: 0.84, opacity: 1, transform: 'scaleY(1)' },
          { offset: 1, opacity: 1, transform: 'scaleY(1)' }
        ], at));
        play(g.c.band, stretch(steps('transform', [[0, 'translateY(260%)'], [0.42, 'translateY(260%)'],
                                                   [0.95, 'translateY(-110%)'], [1, 'translateY(-110%)']]), at));
        play(g.a, stretch(steps('opacity', [[0, 1], [0.58, 1], [0.8, 0], [1, 0]]), at));
        play(g.b, stretch(steps('opacity', [[0, 0], [0.58, 0], [0.8, 1], [1, 1]]), at));
      } else {
        play(g.c, stretch([
          { offset: 0, opacity: 1, transform: 'scaleY(1)' },
          { offset: 0.04, opacity: 1, transform: 'scaleY(1)',
            easing: 'cubic-bezier(0.5, 0, 0.75, 0.5)' },
          { offset: 0.42, opacity: 0, transform: 'scaleY(0.4)' },
          { offset: 1, opacity: 0, transform: 'scaleY(0.4)' }
        ], at));
        play(g.c.band, stretch(steps('transform', [[0, 'translateY(-110%)'], [0.03, 'translateY(-110%)'],
                                                   [0.38, 'translateY(260%)'], [1, 'translateY(260%)']]), at));
        play(g.b, stretch(steps('opacity', [[0, 1], [0.1, 1], [0.32, 0], [1, 0]]), at));
        play(g.a, stretch(steps('opacity', [[0, 0], [0.1, 0], [0.32, 1], [1, 1]]), at));
        play(g.a.lastChild, stretch(steps('opacity', [[0, 0], [0.8, 0], [1, 1]]), at));
      }
    });

    // Headings, rules and the footer glide; shelves grow in from the left,
    // or shrink away to the right once the books have left them
    var glide = { duration: 850, easing: 'cubic-bezier(0.6, 0, 0.2, 1)', fill: 'both' };
    var once = { duration: 850, easing: 'cubic-bezier(0.6, 0, 0.2, 1)', fill: 'backwards' };
    secs.forEach(function (p) {
      play(p.line, [{ transform: 'translateY(0px)' },
                    { transform: 'translateY(' + (p.t.top - p.s.top).toFixed(1) + 'px)' }], glide);
      play(p.t.h2, [{ transform: 'translateY(' + (p.s.h2Top - p.t.h2Top).toFixed(1) + 'px)' },
                    { transform: 'translateY(0px)' }], once);
    });
    if (foot) {
      play(foot, [{ transform: 'translateY(' + (srcFoot - dstFoot).toFixed(1) + 'px)' },
                  { transform: 'translateY(0px)' }], once);
    }
    if (toShelf) {
      grow.forEach(function (ul) {
        ul.style.transformOrigin = '0 50%';
        ends.push(function () { ul.style.transformOrigin = ''; });
        play(ul, [{ opacity: 0, transform: 'scaleX(0.1)' }, { opacity: 1, transform: 'scaleX(1)' }],
             { duration: 650, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'backwards' });
      });
    } else {
      planks.forEach(function (p) {
        play(p.el, [{ offset: 0, opacity: 1, transform: 'scaleX(1)' },
                    { offset: 0.33, opacity: 1, transform: 'scaleX(1)', easing: 'cubic-bezier(0.5, 0, 0.8, 0.4)' },
                    { offset: 1, opacity: 0, transform: 'scaleX(0.1)' }],
             { duration: 900, fill: 'both' });
      });
    }

    timers.push(setTimeout(done, T + 20));
    // In case the clock never gets there (e.g. a tab in the background)
    timers.push(setTimeout(state.finish, T + 1500));
  }

  // A click presses the button at once (pill and icon, which run on the
  // compositor), lets that frame be drawn, and only then prepares the view
  // change, which takes the main thread for a moment (about a tenth of a
  // second on a laptop): the switch answers straight away and the books
  // follow. Clicks in between just change which view the books go to.
  var queued = false;
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var view = b.dataset.view;
      if (view === pressed) return;
      switcher.classList.add('vs-played');
      press(view, true);
      try { localStorage.setItem('books-view', view); } catch (e) {}
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        setTimeout(function () {
          queued = false;
          morphTo(pressed);
        }, 0);
      });
    });
  });

  setView(viewNow());
  switcher.hidden = false;
  press(viewNow(), false);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placePill(false); });
  window.addEventListener('resize', function () { placePill(false); });
})();
