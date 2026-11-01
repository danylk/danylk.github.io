// Bookshelf: clicking a spine opens a gap right after it on the shelf and
// swings the book's cover in to face out. Clicking the spine or the cover
// again, pressing Escape, or opening another book puts it back.
(function () {
  var spines = Array.prototype.slice.call(document.querySelectorAll('.spine'));
  if (!spines.length) return;

  var still = window.matchMedia('(prefers-reduced-motion: reduce)');
  var current = null; // { spine, slot }
  var count = 0;

  function build(spine) {
    var slot = document.createElement('li');
    slot.className = 'cover-slot';
    slot.id = 'cover-' + (++count);

    var card = document.createElement('div');
    card.className = 'cover-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Close ' + spine.dataset.title);

    var cover = spine.dataset.cover;
    if (cover) {
      var img = document.createElement('img');
      img.src = cover;
      img.alt = 'Cover of ' + spine.dataset.title;
      img.decoding = 'async';
      card.appendChild(img);
    } else {
      // No published cover: draw a simple one in the spine's cloth colour
      var typo = document.createElement('div');
      typo.className = 'cover-typo';
      typo.style.setProperty('--cloth', spine.style.getPropertyValue('--cloth'));
      typo.style.setProperty('--ink-on', spine.style.getPropertyValue('--ink-on'));
      var t = document.createElement('span');
      t.className = 't';
      t.textContent = spine.dataset.title;
      var a = document.createElement('span');
      a.className = 'a';
      a.textContent = spine.dataset.author;
      typo.appendChild(t);
      typo.appendChild(a);
      card.appendChild(typo);
    }

    var cap = document.createElement('p');
    cap.className = 'cover-caption';
    var b = document.createElement('b');
    b.textContent = spine.dataset.title;
    cap.appendChild(b);
    cap.appendChild(document.createTextNode(' · ' + spine.dataset.author));
    card.appendChild(cap);

    slot.appendChild(card);
    card.addEventListener('click', function () { close(true); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(true); }
    });
    return slot;
  }

  function open(spine) {
    var slot = build(spine);
    spine.parentNode.parentNode.insertBefore(slot, spine.parentNode.nextSibling);
    spine.setAttribute('aria-expanded', 'true');
    spine.setAttribute('aria-controls', slot.id);
    current = { spine: spine, slot: slot };
    // Let the empty gap render first so its width can animate open
    slot.getBoundingClientRect();
    slot.classList.add('open');
    var wait = still.matches ? 0 : 520;
    setTimeout(function () {
      if (current && current.slot === slot) {
        slot.scrollIntoView({ block: 'nearest', behavior: still.matches ? 'auto' : 'smooth' });
      }
    }, wait);
  }

  function close(refocus) {
    if (!current) return;
    var spine = current.spine;
    var slot = current.slot;
    current = null;
    spine.setAttribute('aria-expanded', 'false');
    spine.removeAttribute('aria-controls');
    if (refocus) spine.focus();
    slot.classList.remove('open');
    if (still.matches) { slot.remove(); return; }
    var done = false;
    function finish() { if (!done) { done = true; slot.remove(); } }
    slot.addEventListener('transitionend', function (e) {
      if (e.target === slot && e.propertyName === 'width') finish();
    });
    setTimeout(finish, 700);
  }

  spines.forEach(function (spine) {
    spine.addEventListener('click', function () {
      var same = current && current.spine === spine;
      close(false);
      if (!same) open(spine);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) close(true);
  });
})();
