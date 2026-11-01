// Bookshelf: each book is a 3D box (see bookshelf.css). Clicking a book
// turns it so its cover faces out and widens its slot; clicking it again,
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

  function open(slot) {
    load(slot);
    slot.classList.remove('closing');
    slot.classList.add('open');
    slot.querySelector('.hit').setAttribute('aria-expanded', 'true');
    current = slot;
    setTimeout(function () {
      if (current === slot) {
        slot.scrollIntoView({ block: 'nearest', inline: 'nearest',
                              behavior: still.matches ? 'auto' : 'smooth' });
      }
    }, still.matches ? 0 : 780);
  }

  function close(slot) {
    if (!slot) return;
    if (current === slot) current = null;
    slot.classList.remove('open');
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
    function onEnd(e) { if (e.animationName === 'book-close') finish(); }
    book.addEventListener('animationend', onEnd);
    setTimeout(finish, 900);
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
