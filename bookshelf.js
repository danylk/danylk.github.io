// Bookshelf: each book is a 3D box (see bookshelf.css). Clicking a book
// turns it so its cover faces out (title and author fade in above the book)
// and widens its slot; clicking it again,
// pressing Escape, or opening another book turns it back. Cover images
// load the first time a book is hovered, focused or opened.
(function () {
  var slots = Array.prototype.slice.call(document.querySelectorAll('.slot'));
  if (!slots.length) return;

  var still = window.matchMedia('(prefers-reduced-motion: reduce)');
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

  // Once the opened slot has finished widening (and so sits in its final
  // row), show the caption above the book, shifted sideways (--dx) to stay
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

  function open(slot) {
    load(slot);
    slot.classList.remove('closing');
    slot.classList.add('open');
    slot.querySelector('.hit').setAttribute('aria-expanded', 'true');
    current = slot;
    var done = false;
    function go() {
      if (done) return;
      done = true;
      slot.removeEventListener('transitionend', onEnd);
      if (current === slot) settle(slot);
    }
    function onEnd(e) { if (e.target === slot && e.propertyName === 'width') go(); }
    if (still.matches) { go(); return; }
    slot.addEventListener('transitionend', onEnd);
    setTimeout(go, 650);
  }

  function close(slot) {
    if (!slot) return;
    if (current === slot) current = null;
    slot.classList.remove('open', 'captioned');
    slot.querySelector('.hit').setAttribute('aria-expanded', 'false');
    if (still.matches) return;
    slot.classList.add('closing');
    var book = slot.querySelector('.book');
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      slot.classList.remove('closing');
      book.removeEventListener('animationend', onEnd);
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
        close(current);
        open(slot);
      }
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) {
      var slot = current;
      close(slot);
      slot.querySelector('.hit').focus();
    }
  });
})();
