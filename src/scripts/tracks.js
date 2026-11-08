/*!
 * CICADA — the Tracks page (templates/tracks.html): one mode per screen.
 *
 * The overview and the four modes are slides in one place. Scrolling (wheel or trackpad), swiping, the arrow and
 * Page keys, the picker and the Previous / Next steps replace the slide on screen with its neighbour: the leaving
 * one lifts away while the arriving one rises into its place part by part, and its mode is written to
 * [data-tracks][data-active] (seed | core | frontier | forge; "all" on the overview) so tracks.css deepens that
 * world's drawing and tints the paper. The address keeps #track-<key> for the mode on screen, and a link to one
 * opens on it. A mode taller than the window scrolls inside itself first; past the last mode the page scrolls on to
 * the footer as usual.
 *
 * tracks.html sets html.tracks-deck before the first frame, so the page is laid out as slides from the start;
 * without JavaScript the modes stay one scroll.
 */
(() => {
  'use strict';
  const root = document.querySelector('[data-tracks]');
  if (!root || !document.documentElement.classList.contains('tracks-deck')) return;
  const slides = Array.from(root.querySelectorAll('[data-slide]'));
  if (slides.length < 2) return;
  const column = root.querySelector('.tracks__column');
  const links = Array.from(root.querySelectorAll('[data-track-link]'));
  const nav = root.querySelector('[data-deck-nav]');
  const prevBtn = root.querySelector('[data-deck-prev]');
  const nextBtn = root.querySelector('[data-deck-next]');
  const prevLabel = root.querySelector('[data-deck-prev-label]');
  const nextLabel = root.querySelector('[data-deck-next-label]');
  const count = root.querySelector('[data-deck-count]');
  const live = root.querySelector('[data-deck-live]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const modes = slides.length - 1;                      // the overview isn't counted

  const EASE_OUT = 'cubic-bezier(.22, .74, .16, 1)';   // the curve of the page transitions to and from the homepage
  const EASE_IN = 'cubic-bezier(.5, 0, .75, .15)';

  let index = -1;
  let running = [];                                      // the animations of the change in progress

  const nameOf = (slide) => slide.dataset.slideName || '';
  const byHash = (hash) => slides.findIndex((s) => s.id && '#' + s.id === hash);
  const pad = (n) => String(n).padStart(2, '0');
  const atTop = () => window.scrollY < 2;
  const canScroll = (slide, dir) => (dir > 0
    ? slide.scrollTop + slide.clientHeight < slide.scrollHeight - 2
    : slide.scrollTop > 2);
  const partsOf = (slide) => Array.from(slide.children);

  /* everything but the motion: which slide is on, and what the page says about it */
  function paint(i) {
    slides.forEach((s, j) => {
      const on = j === i;
      s.classList.toggle('is-current', on);
      s.classList.toggle('is-active', on && j > 0);    // the bead on the thread glows (tracks.css)
      s.inert = !on;
      if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
    });
    const slide = slides[i];
    root.dataset.active = slide.dataset.track || 'all';
    links.forEach((a) => {
      if (a.hash === '#' + slide.id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    const prev = slides[i - 1];
    const next = slides[i + 1];
    const focused = document.activeElement;
    prevBtn.classList.toggle('is-off', !prev);
    nextBtn.classList.toggle('is-off', !next);
    prevBtn.setAttribute('aria-disabled', String(!prev));
    nextBtn.setAttribute('aria-disabled', String(!next));
    if (prev) { prevLabel.textContent = nameOf(prev); prevBtn.setAttribute('aria-label', 'Previous: ' + nameOf(prev)); }
    if (next) { nextLabel.textContent = nameOf(next); nextBtn.setAttribute('aria-label', 'Next: ' + nameOf(next)); }
    // a step that has just run out hands the focus to the other one
    if (focused === nextBtn && !next) prevBtn.focus({ preventScroll: true });
    if (focused === prevBtn && !prev) nextBtn.focus({ preventScroll: true });
    count.textContent = i === 0 ? 'Overview' : pad(i) + ' / ' + pad(modes);
  }

  /* a change still running is brought to its end at once (animations already let go of are left alone:
     finishing a cancelled one would bring it back) */
  function settle() {
    const now = running;
    running = [];
    now.forEach((a) => { if (a.playState === 'running' || a.playState === 'paused') a.finish(); });
  }
  const release = (list) => {
    list.forEach((a) => a.cancel());
    running = running.filter((a) => !list.includes(a));
  };

  function go(i, opts) {
    const o = opts || {};
    if (i < 0 || i >= slides.length || i === index) return false;
    settle();
    const from = index;
    const leaving = slides[from];
    const arriving = slides[i];
    const dir = i > from ? 1 : -1;
    const hadFocus = leaving && leaving.contains(document.activeElement);
    index = i;
    arriving.classList.remove('is-leaving');
    arriving.scrollTop = 0;
    paint(i);
    if (!o.quiet) {
      const url = i === 0 ? location.pathname + location.search : '#' + arriving.id;
      try { history.replaceState(history.state, '', url); } catch (err) { /* sandboxed */ }
      live.textContent = i === 0 ? 'Overview' : nameOf(arriving) + ', mode ' + i + ' of ' + modes;
    }
    if (hadFocus) arriving.focus({ preventScroll: true });
    if (!leaving || o.instant) return true;

    leaving.classList.add('is-leaving');
    const mine = [];
    if (reduce.matches) {
      // no motion: the slides simply cross over
      mine.push(leaving.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'linear', fill: 'both' }));
      mine.push(arriving.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 80, easing: 'linear', fill: 'both' }));
    } else {
      // the leaving slide lifts away (down when going back), fading out of focus before it has gone far
      partsOf(leaving).forEach((el, k) => {
        const delay = k * 14;
        mine.push(el.animate([{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(3px)' }],
          { duration: 280, delay, easing: 'cubic-bezier(.33, 0, .67, 1)', fill: 'both' }));
        mine.push(el.animate([{ transform: 'none' }, { transform: 'translateY(' + (-dir * 26) + 'px)' }],
          { duration: 380, delay, easing: EASE_IN, fill: 'both' }));
      });
      // the arriving one rises into place part by part, coming into focus
      partsOf(arriving).forEach((el, k) => mine.push(el.animate([
        { opacity: 0, transform: 'translateY(' + (dir * 34) + 'px)', filter: 'blur(5px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ], { duration: 780, delay: 230 + k * 60, easing: EASE_OUT, fill: 'both' })));
      // and the mode's name settles its tracking as it lands
      const title = arriving.querySelector('.track__title');
      if (title) {
        const spacing = getComputedStyle(title).letterSpacing;
        mine.push(title.animate([{ letterSpacing: '.3em' }, { letterSpacing: spacing }],
          { duration: 1100, delay: 290, easing: EASE_OUT, fill: 'both' }));
      }
    }
    running = running.concat(mine);
    // each slide lets go of its animations as soon as its own are done: the leaving one is then hidden
    const outgoing = mine.filter((a) => leaving.contains(a.effect.target));
    const incoming = mine.filter((a) => !outgoing.includes(a));
    Promise.all(outgoing.map((a) => a.finished)).then(() => {
      if (!leaving.classList.contains('is-current')) leaving.classList.remove('is-leaving');
      release(outgoing);
    }, () => {});
    Promise.all(incoming.map((a) => a.finished)).then(() => release(incoming), () => {});
    return true;
  }

  const step = (dir) => {
    if (!atTop()) window.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
    go(index + dir);
  };

  /* ── scrolling: one gesture, one slide ──
     A trackpad keeps sending wheel events long after a flick; a gesture ends only after a quiet moment, and it
     moves one slide however far it goes. A mode taller than the window scrolls first; at either end, and once the
     page itself has been scrolled down to the footer, the page scrolls as usual. */
  let lastWheel = 0;
  let spent = false;
  let travel = 0;
  function onWheel(e) {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // pinch-zoom, sideways
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
    if (!dy) return;
    const dir = dy > 0 ? 1 : -1;
    const now = performance.now();
    if (now - lastWheel > 240) { spent = false; travel = 0; }
    lastWheel = now;
    if (!atTop()) { spent = true; return; }           // the page is scrolled down to the footer: it scrolls back
    const slide = slides[index];
    if (canScroll(slide, dir)) {
      if (!slide.contains(e.target)) { e.preventDefault(); slide.scrollTop += dy; }
      spent = true;                                     // this gesture belongs to the slide's own scroll
      return;
    }
    if (!slides[index + dir]) { spent = true; return; }   // past either end the page scrolls as usual
    e.preventDefault();
    if (spent) return;
    travel += dy;
    if (Math.abs(travel) >= 42) { spent = true; travel = 0; go(index + dir); }
  }
  window.addEventListener('wheel', onWheel, { passive: false });

  /* ── keys ── */
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    let dir = 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) dir = 1;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) dir = -1;
    if (!dir || !atTop()) return;
    if (e.key === ' ' && t && /^(BUTTON|A|SUMMARY)$/.test(t.tagName)) return;   // Space presses the focused control
    const slide = slides[index];
    const vertical = e.key !== 'ArrowLeft' && e.key !== 'ArrowRight';
    if (vertical && canScroll(slide, dir)) {                                    // a tall mode scrolls first
      e.preventDefault();
      const by = e.key.startsWith('Arrow') ? 64 : slide.clientHeight * 0.85;
      slide.scrollBy({ top: dir * by, behavior: reduce.matches ? 'auto' : 'smooth' });
      return;
    }
    if (!slides[index + dir]) return;                                           // past the ends: the page's own keys
    e.preventDefault();
    go(index + dir);
  });

  /* ── swipes: up / left for the next slide, down / right for the previous ── */
  let touch = null;
  root.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { touch = null; return; }
    const t = e.touches[0];
    const slide = slides[index];
    touch = { x: t.clientX, y: t.clientY, up: canScroll(slide, -1), down: canScroll(slide, 1), axis: '', dir: 0 };
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    if (!touch || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    if (!touch.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
      touch.axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
      const dir = touch.axis === 'y' ? (dy < 0 ? 1 : -1) : (dx < 0 ? 1 : -1);
      const inside = touch.axis === 'y' && (dir > 0 ? touch.down : touch.up);     // a tall mode scrolls first
      touch.dir = !inside && atTop() && slides[index + dir] ? dir : 0;
    }
    if (touch.dir && touch.axis === 'y' && e.cancelable) e.preventDefault();       // the deck answers, not the page
  }, { passive: false });
  root.addEventListener('touchend', (e) => {
    if (!touch) return;
    const t = e.changedTouches[0];
    const moved = touch.axis === 'y' ? t.clientY - touch.y : t.clientX - touch.x;
    if (touch.dir && Math.abs(moved) > 44) go(index + touch.dir);
    touch = null;
  }, { passive: true });
  root.addEventListener('touchcancel', () => { touch = null; }, { passive: true });

  /* ── the picker and the steps ── */
  links.forEach((a) => a.addEventListener('click', (e) => {
    const i = byHash(a.hash);
    if (i < 0) return;
    e.preventDefault();
    if (!atTop()) window.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
    go(i);
  }));
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  window.addEventListener('hashchange', () => {
    const i = byHash(location.hash);
    go(i < 0 ? 0 : i, { quiet: i < 0 });
  });

  /* ── leaving: only the homepage takes the drawings back (home.css); for any other page the browser's
     cross-document transition is skipped quietly (those pages don't take part in one) ── */
  window.addEventListener('pageswap', (e) => {
    const vt = e.viewTransition;
    if (!vt) return;
    vt.finished.catch(() => {});
    const url = e.activation && e.activation.entry && e.activation.entry.url;
    let path = null;
    try { path = url ? new URL(url).pathname : null; } catch (err) { path = null; }
    if (path !== null && path !== '/') vt.skipTransition();
  });

  /* ── start: on the overview, or on the mode the address names ── */
  column.setAttribute('role', 'region');
  column.setAttribute('aria-roledescription', 'carousel');
  column.setAttribute('aria-label', 'Participation modes');
  slides.forEach((s) => {
    s.tabIndex = -1;
    s.setAttribute('role', 'group');
    s.setAttribute('aria-roledescription', 'slide');
  });
  const start = Math.max(0, byHash(location.hash));
  go(start, { instant: true, quiet: true });
  root.classList.add('deck-live');
  nav.hidden = false;
  if (start > 0 && !atTop()) window.scrollTo(0, 0);     // the deck, not the browser's jump to the anchor, shows it
})();
