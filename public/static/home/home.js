/*!
 * CICADA — homepage hero (static/home/home.js). Loaded only by templates/index.html.
 *
 * ONE master progress value drives the whole page:
 *
 *   scroll ─► targetProgress ─► smoothing (rAF) ─► progress ─► derive() ─► renderer + theme
 *
 *   progress:  -1 ········· 0 ········· +1
 *              BIO       CICADA        OS
 *              life   intersection  computation
 *
 * Which way the journey goes is chosen by the visitor: the world their pointer (or finger) is on
 * when they start scrolling survives, and the content opens on the other side of the screen.
 * Back at CICADA the choice is open again. Everything is a pure function of
 * (progress, reading, pointer), so every state is reversible.
 *
 * Native WebGL (no libraries) renders the painting, the ink/pigment dissolve and the particles;
 * an SVG/CSS renderer consumes the exact same derived state as the fallback.
 */
(() => {
  'use strict';

  /* ════════════════════════════════ CONFIG ════════════════════════════════ */
  const CONFIG = {
    // The path is chosen by where the pointer / finger is when scrolling starts:
    //   left half  → BIO  (the human stays on the left, content opens on the right)
    //   right half → OS   (the machine stays on the right, content opens on the left)
    PATH_FROM_POINTER: true,
    // Keep the opening portion of the hero neutral so visitors can change sides
    // without having to return to the exact first pixel of the page.
    PATH_SWITCH_BUFFER: 0.3,   // viewport heights, capped during measurement
    // Used when nothing has chosen yet (keyboard scrolling, first load). -1 = BIO, +1 = OS.
    DIRECTION: -1,
    SMOOTHING: 5.5,            // how quickly progress follows the scroll (1/s)
    POINTER_SMOOTHING: 1.4,    // the pointer is slower and softer than scroll
    POINTER_PREVIEW: 0.14,     // before scrolling, a faint warm/cool hint of the path the pointer would choose
    POINTER_LEAN: 4,           // …and the world that would survive leans in by this many art units
    READ_LENGTH: 0.65,         // viewport heights over which the page settles into the split layout
    GHOST: 0.3,                // how much of the receded drawing stays behind the content (landscape)
    VEIL: 0.36,                // paper wash over the content half (landscape; portrait uses 1)
    PANEL: 0.22,               // portrait: width of the margin the surviving figure watches from
    MAX_DPR: 2,
    MOBILE_MAX_DPR: 1.75,
    PARTICLE_DENSITY: 0.9,     // particles per art unit of letter stroke (desktop)
    MOBILE_PARTICLE_FACTOR: 0.5,
  };

  // Review switches:  ?lean=bio|os (fix the path)  ?gl=off|force  ?progress=-1…1 (freeze)  ?read=0…1
  const params = new URLSearchParams(location.search);
  const FORCED_DIR = params.get('lean') === 'os' ? 1 : params.get('lean') === 'bio' ? -1 : 0;
  const GL_MODE = params.get('gl');
  const FROZEN = params.has('progress') ? clamp(parseFloat(params.get('progress')) || 0, -1, 1) : null;
  const FROZEN_READ = params.has('read') ? clamp(parseFloat(params.get('read')) || 0, 0, 1) : 0;

  /* ═══════════════════ ARTWORK GEOMETRY (measured from the painting) ═══════════════════ */
  const ART_W = 1672, ART_H = 941, SPLIT = 842;
  const OX = 836.7, OY = 244.6;             // the O's centre — the logo's anchor
  const R = 56.8, STROKE = 2.1;             // O radius (centre-line) and hairline weight
  const AXIS = 836.7;                        // the plumb line
  const ORB_X = 836.7, ORB_Y = 441.2;        // the point of light between the fingertips
  const THREAD_END = 553;
  const FACE_H = [478, 262], FACE_M = [1268, 300];   // each figure's profile (nose tip): portrait margin focus
  // letter boxes in logo-local art units (B+I and S; the Os are drawn analytically)
  // IEEE and IET word geometry
  // IEEE and IET word geometry (Mid-plane background)
const BOX_BIO = [610, 188, 836.7, 305];
const BOX_OS  = [836.7, 187, 1045, 305];
// CICADA foreground word geometry (Closer to camera in 3D POV)
const BOX_CICADA_BIO = [735, 314, 836.7, 356];
const BOX_CICADA_OS  = [836.7, 314, 925, 356];
  // dissolve direction: the side that faces its world goes first
  const EXT_BIO = [610 - OX, 890 - OX];
  const EXT_OS = [780 - OX, 1045 - OX];
  const WORD_CENTRE_BIO = 702 - OX, WORD_CENTRE_OS = 960 - OX;
  // Particle targets sampled from the painting (x, y, r, g, b): flowers, leaves, hair, butterfly ↔ nodes, traces, moths.
  const TARGETS = {
    human: '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',
    machine: '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',
  };

  /* ═══════════════════════════════ UTILITIES ═══════════════════════════════ */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

  const INK = hex('#16120f'), SEPIA = hex('#1a3f6e'), INDIGO = hex('#7c2d22');
  const RING_BIO = hex('#1f6fd1'), RING_OS = hex('#c24d2c');
  const HAND_GOLD = hex('#2e8be6'), HAND_STEEL = hex('#d97736');
  const EDGE_BIO = hex('#2485e8'), EDGE_OS = hex('#d14f2c');

  // Deterministic PRNG so the dissolve pattern is identical on every visit.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── Shared noise: one 128² table used by BOTH the GPU (as a texture) and the CPU,
        so a particle detaches exactly where its pixel of ink dissolves. ── */
  const NOISE_N = 128;
  const NOISE = (() => {
    const rnd = mulberry32(1977), a = new Uint8Array(NOISE_N * NOISE_N);
    for (let i = 0; i < a.length; i++) a[i] = (rnd() * 256) | 0;
    return a;
  })();
  function nLin(x, y) {                     // == texture2D(noise, p/128) with LINEAR + REPEAT
    const fx = x - 0.5, fy = y - 0.5, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const x0 = ix & 127, x1 = (ix + 1) & 127, y0 = (iy & 127) * NOISE_N, y1 = ((iy + 1) & 127) * NOISE_N;
    const a = NOISE[y0 + x0], b = NOISE[y0 + x1], c = NOISE[y1 + x0], d = NOISE[y1 + x1];
    return ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) / 255;
  }
  function nNear(x, y) { return NOISE[(Math.floor(y) & 127) * NOISE_N + (Math.floor(x) & 127)] / 255; }
  // organic (watercolour) field for BIO, blocky (tiled) field for OS — logo-local coordinates
  function fbmBio(x, y) { return 0.5 * nLin(x * 0.11 + 3.1, y * 0.11 + 7.7) + 0.3 * nLin(x * 0.29 + 19.4, y * 0.29 + 2.3) + 0.2 * nLin(x * 0.83 + 41.9, y * 0.83 + 33.1); }
  function blockOs(x, y) { return 0.72 * nNear(x / 5.2 + 11, y / 5.2 + 5) + 0.28 * nNear(x / 15.6 + 71, y / 15.6 + 29); }
  function detachAt(x, y, style) {
    if (style === 0) return 0.6 * fbmBio(x, y) + 0.4 * clamp((x - EXT_BIO[0]) / (EXT_BIO[1] - EXT_BIO[0]), 0, 1);
    const qx = (Math.floor(x / 5.2) + 0.5) * 5.2;   // tiles lift whole: the sweep is quantised to the tile grid
    return 0.6 * blockOs(x, y) + 0.4 * clamp((EXT_OS[1] - qx) / (EXT_OS[1] - EXT_OS[0]), 0, 1);
  }

  /* ═══════════════════════════════ DOM ═══════════════════════════════ */
  const root = document.documentElement;
  const hero = $('.hero');
  const stage = $('.hero__stage');
  if (!hero || !stage) return;
  const frame = $('.art-frame', stage);
  const els = {
    cam: $('.art-cam', stage),
    human: $('.art-layer--human', stage),
    machine: $('.art-layer--machine', stage),
    humanImg: $('.art-layer--human img', stage),
    machineImg: $('.art-layer--machine img', stage),
    canvas: $('.hero__gl', stage),
    glint: $('.hero__glint', stage),
    capBio: $('.caption--bio', stage),
    capOs: $('.caption--os', stage),
    copy: $('.hero__copy', stage),
    cue: $('.hero__cue', stage),
    papers: $$('.paper'),
    veil: $('.paper--veil'),
    first: document.getElementById('concept'),   // the section that emerges as the page settles
    // svg (fallback renderer)
    logo: $('.logo', stage),
    wordBio: $('.word--bio', stage),
    wordOs: $('.word--os', stage),
    cicadaBio: $('.cicada-parallax--bio', stage),
    cicadaOs: $('.cicada-parallax--os', stage),
    glyphsBio: $$('.word--bio > .glyph', stage),
    glyphsOs: $$('.word--os > .glyph', stage),
    oBio: $('.o--bio', stage),
    oOs: $('.o--os', stage),
    thread: $('.thread', stage),
    beads: $('.apparatus__beads', stage),
    ring: $('.field-ring', stage),
  };
  const oParts = (o) => ({
    rot: o ? $('.o__rot', o) : null,
    xArm: o ? $('.o__x', o) : null,
    ring: o ? $('.o__ring', o) : null,
    hand: o ? $('.o__hand', o) : null,
    dot: o ? $('.o__dot', o) : null,
    gold: o ? $('.o__fill--gold', o) : null,
    fills: o ? $$('.o__fill', o) : [],
  });
  const oBioEl = oParts(els.oBio), oOsEl = oParts(els.oOs);
  const lensBio = $('.o-lens[data-o="bio"]'), lensOs = $('.o-lens[data-o="os"]');

  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqPortrait = window.matchMedia('(max-aspect-ratio: 11/10)');   // the same test the stylesheet uses
  const mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ═══════════════════════════════ STATE ═══════════════════════════════ */
  const S = {
    target: 0, progress: 0,         // the master value (signed): path × hero progress
    readTarget: 0, read: 0,         // settling into the split layout once the content arrives
    ptrTarget: 0, ptr: 0,           // pointer: -1 (left half) … +1 (right half)
    dir: CONFIG.DIRECTION,          // the path of the current journey (-1 BIO, +1 OS)
    pendingDir: CONFIG.DIRECTION,   // the path the pointer would choose right now
    lastPointerX: null,             // wheel events on some trackpads report clientX=0
    tHero: 0,
    running: false, last: 0, first: true,
    static: false,                  // reduced motion
    leaving: false,                 // leaving for /tracks: the page holds still while it is captured
    arriving: false,                // back from /tracks: the DOM draws the painting while the drawings land on it
  };
  const Lay = {                      // layout, measured on resize only
    W: 1, H: 1, fx: 0, fy: 0, k: 1, dpr: 1, portrait: false, mobile: false,
    ax: OX, ay: OY, ls: 1,           // logo placement: anchor (art units) + scale
    sepMax: 140, heroTop: 0, track: 1, pathBuffer: 0,
    camBio: { s: 1, tx: 0, ty: 0 }, camOs: { s: 1, tx: 0, ty: 0 },
  };
  // derived visual state — one preallocated object, rewritten every frame
  const V = {
    p: 0, s: 0, side: -1, read: 0,
    split: 0, drift: 0, dBio: 0, dOs: 0, thread: 1, apart: 0, lean: 0, atm: 0,
    angBio: 0, angOs: 0, phase: 0, goldBio: 0, deepOs: 0,
    bioX: 0, bioY: 0, osX: 0, osY: 0, wordScale: 1,
    offH: 0, offM: 0, sketchH: 0, sketchM: 0, alphaH: 1, alphaM: 1,
    camS: 1, camTX: 0, camTY: 0,
    ringR: 44.2, threadBottom: THREAD_END,
    copy: 1, cue: 1, capBio: 0, capOs: 0, oBioAlpha: 1, veil: 0,
    inkBio: new Float32Array(3), inkOs: new Float32Array(3),
    ringBio: new Float32Array(3), ringOs: new Float32Array(3), handOs: new Float32Array(3),
  };
  const pt = new Float32Array(2);    // scratch for art→stage conversion (no per-frame allocation)

  function mix3(out, a, b, t) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; }

  /* ════════════════════ derive(): the single source of every visual ════════════════════ */
  function derive(p, read, ptr) {
    const s = Math.abs(p);
    const side = p < 0 ? -1 : p > 0 ? 1 : S.dir;
    V.p = p; V.s = s; V.side = side; V.read = read;

    // 1 · CICADA divides into BIO + OS (the O splits like a cell — or a forked process)
    V.split = smooth(0.02, 0.4, s);
    // 2 · the words travel into their worlds and dissolve (ink → pigment / geometry)
    V.drift = smooth(0.06, 0.80, s);
    V.dBio = smooth(0.08, 0.75, s);
    V.dOs = smooth(0.10, 0.78, s);
    // 3 · the plumb line is reeled back up into the O; the point of light dims
    V.thread = 1 - smooth(0.012, 0.3, s);
    V.threadBottom = lerp(Lay.ay + R * Lay.ls, THREAD_END, V.thread * V.thread * (3 - 2 * V.thread));
    V.ringR = 44.2 * (1 + 0.45 * (1 - V.thread));
    // 4 · the two worlds drift apart
    V.apart = smooth(0.06, 0.8, s);
    // 5 · one world becomes dominant (sign of progress); the other returns to its underdrawing
    const dom = smooth(0.7, 1.0, s);
    V.lean = side * dom;
    // before the journey starts, the pointer previews the path it would choose (paper only, faint)
    const preview = (1 - smooth(0, 0.12, s)) * (1 - read);
    V.atm = clamp(V.lean + ptr * CONFIG.POINTER_PREVIEW * preview, -1, 1);

    // the O: rotating hand (a clock / an orbit), phase fills, colour moves blue → neutral → gold
    const turn = s * 0.16 * Math.PI;
    V.angBio = -turn; V.angOs = turn;
    V.phase = smooth(0.08, 0.55, s);
    V.goldBio = smooth(0.05, 0.5, s);
    V.deepOs = smooth(0.05, 0.5, s);
    V.oBioAlpha = 1.0;

    // word motion (logo-local units)
    const sep = Lay.sepMax * (0.55 * V.split + 0.45 * V.drift);
    V.bioX = -sep; V.osX = sep;
    V.bioY = V.drift * 16; V.osY = V.drift * 12;
    // on narrow screens the words also contract as they part, so BIO and OS read as two words
    V.wordScale = 1 - (Lay.portrait ? 0.3 : 0.04) * V.split - 0.08 * V.drift;
    mix3(V.inkBio, INK, SEPIA, V.drift);
    mix3(V.inkOs, INK, INDIGO, V.drift);
    mix3(V.ringBio, INK, RING_BIO, V.goldBio);
    mix3(V.ringOs, INK, RING_OS, V.deepOs);
    mix3(V.handOs, HAND_GOLD, HAND_STEEL, V.deepOs * 0.7);

    // worlds (art units): apart, plus the world the pointer would keep leans in a little
    V.offH = -26 * V.apart + Math.max(0, -ptr) * CONFIG.POINTER_LEAN * preview;
    V.offM = 26 * V.apart - Math.max(0, ptr) * CONFIG.POINTER_LEAN * preview;
    // the receding world returns to its underdrawing — cyanotype for the machine, red chalk for the human —
    // then, as the content opens over it, thins to a ghost
    const ghost = lerp(1, Lay.portrait ? 0.1 : CONFIG.GHOST, read);
    V.sketchH = side > 0 ? dom : 0;
    V.sketchM = side < 0 ? dom : 0;
    V.alphaH = side > 0 ? ghost : 1;
    V.alphaM = side < 0 ? ghost : 1;
    V.veil = read * (Lay.portrait ? 1 : CONFIG.VEIL);

    // camera: the surviving world keeps its half (landscape) or its margin (portrait); never an edge in view.
    // Landscape settles with dominance, so the half is filled by the end of the hero; portrait moves the
    // figure into its margin only as the content arrives.
    const cam = side < 0 ? Lay.camBio : Lay.camOs;
    const b = smooth(0, 1, Lay.portrait ? 0.35 * dom + 0.65 * read : dom);
    V.camS = 1 + (cam.s - 1) * b;
    V.camTX = cam.tx * b;
    V.camTY = cam.ty * b;

    // copy + captions
    V.copy = 1 - smooth(0.015, 0.14, s);
    V.cue = 1 - smooth(0.005, 0.06, s);
    const cap = smooth(0.2, 0.34, s) * (1 - smooth(0.56, 0.7, s));
    V.capBio = cap; V.capOs = cap;
  }

  /* art units → stage px (includes the camera) */
  function toStage(ax, ay) {
    pt[0] = (Lay.fx + ax * Lay.k) * V.camS + V.camTX;
    pt[1] = (Lay.fy + ay * Lay.k) * V.camS + V.camTY;
    return pt;
  }
  /* logo-local (relative to the O) → art units, for a word group */
  const wpt = new Float32Array(2);
  function wordToArt(lx, ly, gx, gy) {
    wpt[0] = Lay.ax + (lx * V.wordScale + gx) * Lay.ls;
    wpt[1] = Lay.ay + (ly * V.wordScale + gy) * Lay.ls;
    return wpt;
  }

  /* ═══════════════════════════════ LAYOUT ═══════════════════════════════ */
  function camTarget(side) {
    const x0 = Lay.fx, x1 = Lay.fx + ART_W * Lay.k, y0 = Lay.fy, y1 = Lay.fy + ART_H * Lay.k;
    if (!Lay.portrait) {
      // keep the fingertip meeting point where it is and let the surviving world grow outward until it
      // fills its half — so the hand still reaches toward the content, and no edge of the painting shows
      const px = Lay.fx + ORB_X * Lay.k, py = Lay.fy + ORB_Y * Lay.k;
      let s = 1.04;
      if (side < 0 && x0 > 0) s = Math.max(s, px / Math.max(1, px - x0));
      if (side > 0 && x1 < Lay.W) s = Math.max(s, (Lay.W - px) / Math.max(1, x1 - px));
      if (y0 > 0) s = Math.max(s, py / Math.max(1, py - y0));
      if (y1 < Lay.H) s = Math.max(s, (Lay.H - py) / Math.max(1, y1 - py));
      return { s, tx: px * (1 - s), ty: py * (1 - s) };
    }
    // portrait: the surviving figure watches the content from a narrow margin on its own side
    const panel = Lay.W * CONFIG.PANEL, face = side < 0 ? FACE_H : FACE_M;
    const kT = Math.max((Lay.H / ART_H) * 1.02, panel / 140);
    const s = kT / Lay.k;
    // the profile faces the content: its nose sits where the paper wash begins
    const gx = side < 0 ? panel * 0.79 : Lay.W - panel * 0.79, gy = Lay.H * 0.32;
    const fxs = Lay.fx + face[0] * Lay.k, fys = Lay.fy + face[1] * Lay.k;
    const tx = gx - fxs * s;
    let ty = gy - fys * s;
    const top = y0 * s + ty, bot = y1 * s + ty;
    if (top > 0) ty -= top; else if (bot < Lay.H) ty += Lay.H - bot;
    return { s, tx, ty };
  }

  function measure() {
    const sr = stage.getBoundingClientRect();
    const fr = frame.getBoundingClientRect();
    Lay.W = sr.width; Lay.H = sr.height;
    Lay.fx = fr.left - sr.left; Lay.fy = fr.top - sr.top;
    Lay.k = fr.width / ART_W;
    Lay.portrait = mqPortrait.matches;
    Lay.mobile = Math.min(Lay.W, Lay.H) < 700;
    Lay.dpr = Math.min(window.devicePixelRatio || 1, Lay.mobile ? CONFIG.MOBILE_MAX_DPR : CONFIG.MAX_DPR);
    if (Lay.portrait) {
      // logo floats in the paper above the painting; the plumb line drops to the fingertips
      const targetW = Math.min(Lay.W * 0.64, 380);
      Lay.ls = targetW / (312 * Lay.k);
      // On phones the actions now use the empty space below the header. Keep
      // the wordmark beneath that block so neither element obscures the other.
      const yStage = Lay.mobile ? Math.max(Lay.H * 0.31, 232) : Math.max(Lay.fy * 0.5, 84);
      Lay.ax = OX; Lay.ay = (yStage - Lay.fy) / Lay.k;
      Lay.sepMax = (Lay.W * 0.17) / (Lay.k * Lay.ls);
    } else {
      Lay.ls = 1; Lay.ax = OX; Lay.ay = OY;
      Lay.sepMax = Math.min(140, (Lay.W * 0.12) / Lay.k);
    }
    frame.classList.toggle('is-inset-x', Lay.fx > 2);
    Lay.camBio = camTarget(-1);
    Lay.camOs = camTarget(1);
    const rect = hero.getBoundingClientRect();
    Lay.heroTop = rect.top + window.scrollY;
    Lay.track = Math.max(1, hero.offsetHeight - Lay.H);
    Lay.pathBuffer = Math.min(240, Lay.H * CONFIG.PATH_SWITCH_BUFFER, Lay.track * 0.3);
  }

  /* ═══════════════════════ PATH CHOICE (pointer / finger side) ═══════════════════════ */
  function pathIsOpen() {
    return window.scrollY <= Lay.heroTop + Lay.pathBuffer;
  }
  function applyPath() {
    root.classList.toggle('path-bio', S.dir < 0);
    root.classList.toggle('path-os', S.dir > 0);
    try { sessionStorage.setItem('ieeexiet-path', S.dir < 0 ? 'bio' : 'os'); } catch (e) { /* private mode */ }
  }
  function setDir(d) {
    if (FORCED_DIR || d === S.dir) return;
    S.dir = d;
    applyPath();
  }
  function choosePath(clientX) {
    if (!CONFIG.PATH_FROM_POINTER || FORCED_DIR || !Number.isFinite(clientX)) return;
    // the world you point at survives; the content opens on the other side
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    S.pendingDir = clientX >= viewportWidth / 2 ? 1 : -1;
    if (pathIsOpen()) {
      setDir(S.pendingDir);
      S.target = S.dir * S.tHero;
      kick();
    }
  }

  /* ═══════════════════════════ SCROLL + POINTER ═══════════════════════════ */
  function readScroll() {
    const y = window.scrollY;
    const activeTrack = Math.max(1, Lay.track - Lay.pathBuffer);
    S.tHero = clamp((y - Lay.heroTop - Lay.pathBuffer) / activeTrack, 0, 1);
    if (FROZEN !== null) { S.target = FROZEN; S.readTarget = FROZEN_READ; return; }
    if (S.static) {
      // reduced motion: no scrubbing — one instant change of state as the content arrives
      const on = y > Lay.heroTop + Lay.H * 0.3 ? 1 : 0;
      if (!on && Math.abs(S.progress) < 0.5) setDir(S.pendingDir);
      S.target = S.dir * on; S.readTarget = on;
      return;
    }
    if (pathIsOpen()) setDir(S.pendingDir);   // inside the top buffer, the path is open again
    S.target = S.dir * S.tHero;
    S.readTarget = clamp((y - (Lay.heroTop + Lay.track)) / (Lay.H * CONFIG.READ_LENGTH), 0, 1);
  }
  function onScroll() {
    if (S.leaving) return;
    const t0 = S.target, r0 = S.readTarget;
    readScroll();
    // while reading, scrolling the content costs nothing: only re-render if the state actually moves
    if (S.target !== t0 || S.readTarget !== r0 || S.running) kick();
  }
  function onPointer(e) {
    if (S.leaving || e.pointerType === 'touch') return;
    S.lastPointerX = e.clientX;
    choosePath(e.clientX);
    if (S.static || !mqFine.matches || S.read > 0.99) return;
    S.ptrTarget = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
    kick();
  }
  function onWheel(e) {
    if (S.leaving) return;
    // Prefer the last real pointer position. Some laptop trackpads emit wheel
    // events with clientX=0 regardless of where the cursor actually is.
    const eventX = Number.isFinite(e.clientX) && e.clientX > 0 ? e.clientX : null;
    const x = eventX === null ? S.lastPointerX : eventX;
    if (x !== null) choosePath(x);
  }
  function onTouch(e) { if (!S.leaving && e.touches && e.touches[0]) choosePath(e.touches[0].clientX); }
  function onPointerLeave() {
    if (S.leaving) return;
    S.lastPointerX = null;
    S.ptrTarget = 0;
    kick();
  }

  /* ═══════════════════════════════ LOOP ═══════════════════════════════ */
  function kick() {
    if (S.running || S.leaving) return;
    S.running = true;
    S.last = performance.now();
    requestAnimationFrame(loop);
  }
  function loop(now) {
    if (S.leaving) { S.running = false; return; }   // leaving for /tracks: the page holds still while it is captured
    const dt = Math.min(0.05, Math.max(0.001, (now - S.last) / 1000));
    S.last = now;
    if (S.first || S.static || FROZEN !== null) {
      S.progress = S.target; S.read = S.readTarget; S.ptr = S.ptrTarget; S.first = false;
    } else {
      const a = 1 - Math.exp(-CONFIG.SMOOTHING * dt);
      S.progress += (S.target - S.progress) * a;
      S.read += (S.readTarget - S.read) * a;
      S.ptr += (S.ptrTarget - S.ptr) * (1 - Math.exp(-CONFIG.POINTER_SMOOTHING * dt));
      if (Math.abs(S.target - S.progress) < 0.0003) S.progress = S.target;
      if (Math.abs(S.readTarget - S.read) < 0.0005) S.read = S.readTarget;
      if (Math.abs(S.ptrTarget - S.ptr) < 0.0008) S.ptr = S.ptrTarget;
    }
    derive(S.progress, S.read, S.ptr);
    render();
    if (S.progress !== S.target || S.read !== S.readTarget || S.ptr !== S.ptrTarget) requestAnimationFrame(loop);
    else S.running = false;       // idle: no work at all until the next scroll / pointer event
  }

  /* ════════════════════════ page-level outputs (both renderers) ════════════════════════ */
  const last = { lean: NaN, warm: NaN, cool: NaN, band: NaN, veil: NaN, read: NaN, copy: NaN, cue: NaN, reading: null, glintOn: null };
  // the paper as it looks under the current tint (for the nav band), measured from the rendered page
  const PAPER_RGB = [5, 5, 8], WARM_RGB = [40, 4, 12], COOL_RGB = [4, 18, 36];
  function setIf(key, val, eps, fn) { if (Number.isNaN(last[key]) || Math.abs(last[key] - val) > eps) { last[key] = val; fn(val); } }

  function renderPage() {
    // the website's atmosphere follows the same value (paper only — never the painting)
    const warm = Math.max(0, -V.atm) * 0.3, cool = Math.max(0, V.atm) * 0.62;
    setIf('warm', warm, 0.002, (v) => { for (const p of els.papers) p.style.setProperty('--tint-warm', v.toFixed(3)); });
    setIf('cool', cool, 0.002, (v) => { for (const p of els.papers) p.style.setProperty('--tint-cool', v.toFixed(3)); });
    setIf('band', warm - cool, 0.01, () => {
      const c = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        const w = PAPER_RGB[i] * (1 - warm + warm * WARM_RGB[i] / 255);
        c[i] = Math.round(w + (COOL_RGB[i] - w) * (cool / 0.62) * 0.66);
      }
      root.style.setProperty('--band', `rgb(${c[0]} ${c[1]} ${c[2]} / .95)`);
    });
    setIf('lean', V.lean, 0.004, (v) => {
      root.style.setProperty('--lean', v.toFixed(3));
      root.style.setProperty('--bio', Math.max(0, -v).toFixed(3));
      root.style.setProperty('--os', Math.max(0, v).toFixed(3));
    });
    // the paper wash that lets the content open over the receded world
    setIf('veil', V.veil, 0.003, (v) => { els.veil.style.opacity = v.toFixed(3); });
    if (els.first) setIf('read', V.read, 0.002, (v) => { els.first.style.setProperty('--read', v.toFixed(3)); });
    const reading = V.read > 0.3;
    if (reading !== last.reading) { last.reading = reading; root.classList.toggle('is-reading', reading); }

    setIf('copy', V.copy, 0.003, (v) => { els.copy.style.opacity = v.toFixed(3); els.copy.style.visibility = v < 0.01 ? 'hidden' : ''; });
    setIf('cue', V.cue, 0.003, (v) => { els.cue.style.opacity = v.toFixed(3); });

    // the point of light (a compositor-only breathing glow, positioned here)
    const gv = V.thread * V.thread;
    const glintOn = gv > 0.01;
    if (glintOn !== last.glintOn) { last.glintOn = glintOn; els.glint.classList.toggle('is-paused', !glintOn); }
    if (glintOn || last.glintOn === null) {
      const g = toStage(ORB_X, ORB_Y);
      const gs = Lay.k * V.camS * 1.05;
      els.glint.style.transform = `translate3d(${g[0].toFixed(1)}px, ${g[1].toFixed(1)}px, 0) scale(${gs.toFixed(3)})`;
    }
    els.glint.style.opacity = gv.toFixed(3);

    // captions under each word
    placeCaption(els.capBio, V.capBio, WORD_CENTRE_BIO, V.bioX, V.bioY);
    placeCaption(els.capOs, V.capOs, WORD_CENTRE_OS, V.osX, V.osY);
  }
  function placeCaption(el, a, cx, gx, gy) {
    if (a < 0.005) { if (el.style.opacity !== '0') el.style.opacity = '0'; return; }
    const w = wordToArt(cx, 92, gx, gy);
    const p = toStage(w[0], w[1]);
    el.style.opacity = a.toFixed(3);
    el.style.transform = `translate3d(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px, 0) translateX(-50%)`;
  }

  /* ═══════════════════════ FALLBACK RENDERER (SVG + CSS) ═══════════════════════ */
  const domRenderer = {
    render() {
      const k = Lay.k;
      // camera, in frame-local px: stage' = stage·s + T  ⇒  frame-local translate = F(s − 1) + T
      const tx = Lay.fx * (V.camS - 1) + V.camTX;
      const ty = Lay.fy * (V.camS - 1) + V.camTY;
      els.cam.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${V.camS.toFixed(4)})`;
      els.human.style.transform = `translate3d(${(V.offH * k).toFixed(2)}px, 0, 0)`;
      els.machine.style.transform = `translate3d(${(V.offM * k).toFixed(2)}px, 0, 0)`;
      els.human.style.opacity = ((1 - V.sketchH * 0.7) * V.alphaH).toFixed(3);
      els.machine.style.opacity = ((1 - V.sketchM * 0.7) * V.alphaM).toFixed(3);

      // logo placement + the two words
      els.logo.setAttribute('transform', `translate(${Lay.ax.toFixed(2)} ${Lay.ay.toFixed(2)}) scale(${Lay.ls.toFixed(4)}) translate(${-OX} ${-OY})`);
      const ws = V.wordScale;
      const wt = (gx, gy) => `translate(${(gx + OX * (1 - ws)).toFixed(2)} ${(gy + OY * (1 - ws)).toFixed(2)}) scale(${ws.toFixed(4)})`;
      els.wordBio.setAttribute('transform', wt(V.bioX, V.bioY));
      els.wordOs.setAttribute('transform', wt(V.osX, V.osY));

      // Foreground POV Parallax for CICADA (Closer to Camera in 3D POV):
      if (els.cicadaBio && els.cicadaOs) {
        const pScale = V.wordScale * (1.35 + 0.35 * V.split);
        const pX_bio = V.bioX * 2.1;
        const pX_os = V.osX * 2.1;
        const pY_bio = V.bioY * 1.5 - 6 * V.split;
        const pY_os = V.osY * 1.5 - 6 * V.split;
        // Transform around (OX, OY) so it maintains exact perspective center
        const trBio = `matrix(${pScale} 0 0 ${pScale} ${(pX_bio * Lay.ls + (1 - pScale) * OX).toFixed(2)} ${(pY_bio * Lay.ls + (1 - pScale) * OY).toFixed(2)})`;
        const trOs  = `matrix(${pScale} 0 0 ${pScale} ${(pX_os * Lay.ls + (1 - pScale) * OX).toFixed(2)} ${(pY_os * Lay.ls + (1 - pScale) * OY).toFixed(2)})`;
        els.cicadaBio.setAttribute('transform', trBio);
        els.cicadaOs.setAttribute('transform', trOs);

        const aBio = 1 - smooth(0.06, 0.92, V.dBio);
        const aOs = 1 - smooth(0.06, 0.92, V.dOs);
        els.cicadaBio.style.opacity = aBio.toFixed(3);
        els.cicadaOs.style.opacity = aOs.toFixed(3);
      }

      const cicadaEl = $('.hero__cicada-brand');
      if (cicadaEl) {
        const spread = (0.35 + V.drift * 0.55).toFixed(3);
        cicadaEl.style.letterSpacing = `${spread}em`;
        cicadaEl.style.opacity = (1 - smooth(0.25, 0.85, Math.abs(S.progress))).toFixed(3);
        cicadaEl.style.transform = `translate3d(0, ${(V.drift * 18).toFixed(1)}px, 0) scale(${(1.0 + V.drift * 0.15).toFixed(3)})`;
      }
      const aBio = 1 - smooth(0.05, 0.95, V.dBio), aOs = 1 - smooth(0.05, 0.95, V.dOs);
      for (const g of els.glyphsBio) { g.style.opacity = aBio.toFixed(3); g.style.stroke = rgb(V.inkBio); }
      for (const g of els.glyphsOs) { g.style.opacity = aOs.toFixed(3); g.style.stroke = rgb(V.inkOs); }

      // the Os / X nexus
      applyO(oBioEl, lensBio, V.angBio, V.phase, 1.0, V.ringBio, null, 1 - smooth(0.35, 1, V.dBio));
      if (oBioEl && oBioEl.gold) oBioEl.gold.style.opacity = V.goldBio.toFixed(3);
      applyO(oOsEl, lensOs, V.angOs, V.phase, 1, V.ringOs, V.handOs, 1 - smooth(0.35, 1, V.dOs));
      if (oOsEl && oOsEl.fills) {
        for (const f of oOsEl.fills) {
          if (f && f.style) f.style.filter = V.deepOs > 0.01 ? `saturate(${(1 + 0.4 * V.deepOs).toFixed(2)}) brightness(${(1 - 0.12 * V.deepOs).toFixed(2)})` : '';
        }
      }

      // apparatus
      const top = Lay.ay - (R + 22) * Lay.ls, oTop = Lay.ay - R * Lay.ls, oBot = Lay.ay + R * Lay.ls;
      const bottom = V.threadBottom;
      const upper = V.thread > 0.02 ? `M${AXIS} ${top.toFixed(1)}V${oTop.toFixed(1)}` : '';
      const lower = bottom > oBot + 0.5 ? `M${AXIS} ${oBot.toFixed(1)}V${bottom.toFixed(1)}` : '';
      els.thread.setAttribute('d', (upper + lower) || 'M0 0');
      els.thread.style.opacity = Math.min(1, V.thread * 1.4).toFixed(3);
      els.beads.style.opacity = (V.thread * V.thread).toFixed(3);
      els.ring.setAttribute('r', V.ringR.toFixed(2));
      els.ring.style.opacity = (V.thread * V.thread).toFixed(3);
    },
  };
  function applyO(o, lens, ang, phase, alpha, ring, hand, vis) {
    if (!o) return;
    if (o.rot) o.rot.setAttribute('transform', `rotate(${(ang * 180 / Math.PI).toFixed(2)} ${OX} ${OY})`);
    if (lens) lens.setAttribute('rx', (55.7 * phase).toFixed(2));
    if (o.xArm && o.xArm.style) { o.xArm.style.opacity = alpha.toFixed(3); o.xArm.style.stroke = rgb(ring); }
    if (o.ring && o.ring.style) { o.ring.style.opacity = alpha.toFixed(3); o.ring.style.stroke = rgb(ring); }
    if (o.hand && o.hand.style && hand) { o.hand.style.opacity = alpha.toFixed(3); o.hand.style.stroke = rgb(hand); }
    if (o.dot && o.dot.style) o.dot.style.opacity = alpha.toFixed(3);
    if (o.rot && o.rot.parentNode && o.rot.parentNode.style) o.rot.parentNode.style.opacity = vis.toFixed(3);
  }
  function rgb(c) { return `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`; }

  /* ═══════════════════════════ WEBGL RENDERER ═══════════════════════════ */
  const GLSL_HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
  const GLSL_VIEW = `
uniform vec2 u_view;      // stage size (css px)
uniform vec3 u_frame;     // fx, fy, k            : art units -> stage px
uniform vec4 u_cam;       // scale, translate x, translate y  : the camera
vec2 toStage(vec2 a) { return (u_frame.xy + a * u_frame.z) * u_cam.x + u_cam.yz; }
vec4 toClip(vec2 s) { vec2 c = s / u_view * 2.0 - 1.0; return vec4(c.x, -c.y, 0.0, 1.0); }
`;
  const GLSL_NOISE = `
uniform sampler2D u_noise;
float nLin(vec2 p) { return texture2D(u_noise, p / 128.0).r; }
float nNear(vec2 p) { return texture2D(u_noise, (floor(p) + 0.5) / 128.0).r; }
float fbmBio(vec2 p) { return 0.5 * nLin(p * 0.11 + vec2(3.1, 7.7)) + 0.3 * nLin(p * 0.29 + vec2(19.4, 2.3)) + 0.2 * nLin(p * 0.83 + vec2(41.9, 33.1)); }
float blockOs(vec2 p) { return 0.72 * nNear(p / 5.2 + vec2(11.0, 5.0)) + 0.28 * nNear(p / 15.6 + vec2(71.0, 29.0)); }
float detachAt(vec2 l, float style, vec2 ext) {
  if (style < 0.5) return 0.6 * fbmBio(l) + 0.4 * clamp((l.x - ext.x) / (ext.y - ext.x), 0.0, 1.0);
  float qx = (floor(l.x / 5.2) + 0.5) * 5.2;
  return 0.6 * blockOs(l) + 0.4 * clamp((ext.y - qx) / (ext.y - ext.x), 0.0, 1.0);
}
float keepInk(float n, float d, float style) {   // 1 = ink still on paper
  float w = style < 0.5 ? 0.07 : 0.025, T = d * (1.0 + 2.0 * w) - w;
  return smoothstep(T - w, T + w, n);
}
`;

  // ---- 1 · the painting layers (the receding world returns to its underdrawing, then thins to a ghost)
  const VS_ART = GLSL_VIEW + `
attribute vec2 a_pos;
uniform vec4 u_rect;   // art rect of the layer
uniform float u_off;   // horizontal offset (art units)
varying vec2 v_uv; varying vec2 v_art; varying float v_sy;
void main() {
  vec2 a = u_rect.xy + a_pos * u_rect.zw;
  v_uv = a_pos; v_art = a;
  vec2 st = toStage(a + vec2(u_off, 0.0));
  v_sy = st.y;
  gl_Position = toClip(st);
}`;
  const FS_ART = GLSL_HEAD + GLSL_NOISE + `
uniform sampler2D u_tex;
uniform float u_sketch;     // 0 = painting … 1 = only its underdrawing remains
uniform vec3 u_sketchCol;   // sanguine (human) or cyanotype (machine)
uniform vec2 u_texel;
uniform vec4 u_fade;        // soft edges (art units) wherever an edge of the painting is inside the viewport
uniform float u_alpha;      // the receded world thins to a ghost behind the content
varying vec2 v_uv; varying vec2 v_art; varying float v_sy;
const vec3 PAPER = vec3(0.02, 0.02, 0.03);
float lum(vec2 uv) { vec4 t = texture2D(u_tex, uv); return dot(t.rgb + (1.0 - t.a) * PAPER, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  if (u_sketch > 0.001) {
    // a fresco receding to its sinopia: pigment washes out unevenly, the drawing stays
    float gx = lum(v_uv + vec2(u_texel.x, 0.0)) - lum(v_uv - vec2(u_texel.x, 0.0));
    float gy = lum(v_uv + vec2(0.0, u_texel.y)) - lum(v_uv - vec2(0.0, u_texel.y));
    float line = smoothstep(0.05, 0.2, length(vec2(gx, gy)));
    float n = 0.6 * nLin(v_art * 0.022 + vec2(5.0, 9.0)) + 0.4 * nLin(v_art * 0.07 + vec2(13.0, 1.0));
    float k = smoothstep(n - 0.18, n + 0.18, u_sketch * 1.25 - 0.1);
    vec4 drawing = vec4(u_sketchCol, 1.0) * line * 0.62 * c.a;
    vec4 wash = c * 0.12;
    vec4 rec = drawing + wash * (1.0 - drawing.a);
    c = mix(c, rec, k);
  }
  float f = smoothstep(0.0, u_fade.x, v_art.x + 0.5) * smoothstep(0.0, u_fade.y, 1672.5 - v_art.x)
          * smoothstep(0.0, u_fade.z, v_art.y + 0.5) * smoothstep(0.0, u_fade.w, 941.5 - v_art.y);
  gl_FragColor = c * (f * u_alpha);
}`;

  // ---- 2 · the plumb line, field ring and point of light (drawn beneath the painting)
  const VS_APP = GLSL_VIEW + `
attribute vec2 a_pos;
uniform vec4 u_box;   // art-space box x0 y0 x1 y1
varying vec2 v_a;
void main() { v_a = mix(u_box.xy, u_box.zw, a_pos); gl_Position = toClip(toStage(v_a)); }`;
  const FS_APP = GLSL_HEAD + `
uniform vec4 u_line;   // axis x, top, bottom (current), oTop
uniform vec4 u_o;      // oBottom, ringR, thread vis, point-of-light vis
uniform float u_px;    // one device pixel in art units
varying vec2 v_a;
vec4 over(vec4 dst, vec3 c, float a) { return vec4(c * a, a) + dst * (1.0 - a); }
float lineA(float d, float hw) { hw = max(hw, 0.5 * u_px); return (1.0 - smoothstep(hw - 0.5 * u_px, hw + 0.5 * u_px, d)) * min(1.0, hw * 2.0 / u_px); }
void main() {
  vec2 a = v_a; float x = a.x - u_line.x;
  vec4 col = vec4(0.0);
  float vis = u_o.z;
  // thread: whisper above the O, stronger toward the fingertips
  float inUpper = step(u_line.y, a.y) * step(a.y, u_line.w);
  float inLower = step(u_o.x, a.y) * step(a.y, u_line.z);
  float grad = mix(0.3, 0.72, smoothstep(300.0, 430.0, a.y)) * (1.0 - 0.35 * smoothstep(470.0, 553.0, a.y));
  float endFade = 1.0 - smoothstep(u_line.z - 4.0, u_line.z, a.y);
  float th = lineA(abs(x), 0.95) * (inUpper * 0.32 + inLower * grad * endFade) * vis;
  col = over(col, vec3(1.0, 0.05, 0.24), th);
  float below = step(a.y, u_line.z);   // ornaments exist only where the thread still hangs
  // tick at the ring top
  float tk = lineA(abs(a.y - 397.4), 0.62) * step(abs(x), 6.5) * below;
  col = over(col, vec3(1.0, 0.1, 0.3), tk * 0.8 * vis);
  // beads
  float b1 = 1.0 - smoothstep(1.8 - u_px, 1.8 + u_px, length(a - vec2(u_line.x, 368.2)));
  float b2 = 1.0 - smoothstep(2.0 - u_px, 2.0 + u_px, length(a - vec2(u_line.x, 537.4)));
  col = over(col, vec3(1.0, 0.0, 0.24), max(b1, b2) * below * vis);
  // diamond
  vec2 dd = abs(a - vec2(u_line.x, 511.4));
  float dm = 1.0 - smoothstep(1.0 - u_px / 6.5, 1.0 + u_px / 6.5, dd.x / 6.6 + dd.y / 6.4);
  col = over(col, vec3(1.0, 0.15, 0.3), dm * below * vis);
  // field ring (behind the fingers)
  float rr = length(a - vec2(u_line.x, 441.6));
  float ring = lineA(abs(rr - u_o.y), 0.62) * 0.5 * vis * vis;
  col = over(col, vec3(1.0, 0.0, 0.24), ring);
  // point of light: orb + four tapering rays
  vec2 o = a - vec2(u_line.x, 441.2);
  float lv = u_o.w;
  float rayH = (1.0 - smoothstep(0.0, 1.0, abs(o.x) / 16.0)) * (1.0 - smoothstep(1.3 * (1.0 - abs(o.x) / 16.0) - u_px * 0.5, 1.3 * (1.0 - abs(o.x) / 16.0) + u_px * 0.5, abs(o.y)));
  float rayV = (1.0 - smoothstep(0.0, 1.0, abs(o.y) / 15.0)) * (1.0 - smoothstep(1.3 * (1.0 - abs(o.y) / 15.0) - u_px * 0.5, 1.3 * (1.0 - abs(o.y) / 15.0) + u_px * 0.5, abs(o.x)));
  col = over(col, vec3(1.0, 0.2, 0.35), max(rayH, rayV) * lv);
  float od = length(o);
  float orb = 1.0 - smoothstep(7.4 - u_px * 0.6, 7.4 + u_px * 0.6, od);
  vec3 oc = mix(vec3(0.97, 0.89, 0.75), vec3(0.86, 0.61, 0.23), smoothstep(0.0, 4.0, length(o - vec2(-1.6, -2.2))));
  oc = mix(oc, vec3(0.65, 0.40, 0.06), smoothstep(4.5, 7.4, od));
  col = over(col, oc, orb * lv);
  gl_FragColor = col;
}`;

  // ---- 3 · letters (B I · S) with the procedural dissolve
  const VS_TXT = GLSL_VIEW + `
attribute vec2 a_pos;
uniform vec4 u_box;     // logo-local box (absolute art units, pre-placement)
uniform vec4 u_uv;      // atlas rect
uniform vec4 u_xf;      // world x, world y of the O anchor (incl. word offset), scale
varying vec2 v_uv; varying vec2 v_local;
void main() {
  vec2 local = mix(u_box.xy, u_box.zw, a_pos) - vec2(${OX.toFixed(1)}, ${OY.toFixed(1)});
  v_local = local;
  v_uv = mix(u_uv.xy, u_uv.zw, a_pos);
  gl_Position = toClip(toStage(u_xf.xy + local * u_xf.z));
}`;
  const FS_TXT = GLSL_HEAD + GLSL_NOISE + `
uniform sampler2D u_atlas;
uniform float u_d, u_style;
uniform vec2 u_ext, u_texel;
uniform vec3 u_ink, u_edge;
varying vec2 v_uv; varying vec2 v_local;
void main() {
  float cov = texture2D(u_atlas, v_uv).a;
  float keep = keepInk(detachAt(v_local, u_style, u_ext), u_d, u_style);
  float front = 1.0 - abs(keep * 2.0 - 1.0);
  float a = cov;
  if (u_style < 0.5 && u_d > 0.0) {
    // watercolour: at the dissolving edge the pigment blooms a little into the paper
    vec2 t = u_texel * 2.2;
    float bl = 0.25 * (texture2D(u_atlas, v_uv + vec2(t.x, 0.0)).a + texture2D(u_atlas, v_uv - vec2(t.x, 0.0)).a
                     + texture2D(u_atlas, v_uv + vec2(0.0, t.y)).a + texture2D(u_atlas, v_uv - vec2(0.0, t.y)).a);
    a = max(cov, bl * front * 0.9);
  }
  a *= keep;
  vec3 c = mix(u_ink, u_edge, front * (u_style < 0.5 ? 0.85 : 0.6));
  gl_FragColor = vec4(c * a, a);
}`;

  // ---- 4 · the Os: ring, rotating hand, phase fill (blue ↔ gold), centre dot
  const VS_O = GLSL_VIEW + `
attribute vec2 a_pos;
uniform vec3 u_o;    // world centre x, y, radius (art units)
varying vec2 v_p;
void main() { v_p = (a_pos * 2.0 - 1.0) * 1.12; gl_Position = toClip(toStage(u_o.xy + v_p * u_o.z)); }`;
  const FS_O = GLSL_HEAD + GLSL_NOISE + `
uniform sampler2D u_fill;
uniform float u_ang, u_phase, u_gold, u_deep, u_px, u_d, u_style;
uniform vec2 u_ext;
uniform vec3 u_ring, u_hand;
uniform vec4 u_alpha;
varying vec2 v_p;

float distSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 p = v_p;
  float aa = u_px * 0.75;
  float cs = cos(u_ang), sn = sin(u_ang);
  vec2 q = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y);

  // Exact typographic diagonal endpoints: half-width 30.0px, half-height 42.0px (normalized by 56.8)
  vec2 p1 = vec2(-0.528, -0.739);
  vec2 p2 = vec2( 0.528,  0.739);
  float d_arm = u_style < 0.5 ? distSeg(q, p1, p2) : distSeg(q, vec2(p2.x, p1.y), vec2(p1.x, p2.y));

  // Stroke width matches IEEE and IET letter stems exactly (2.6px / (2 * 56.8) = 0.0228)
  float stroke_radius = 0.0228;
  float arm_mask = 1.0 - smoothstep(stroke_radius - aa, stroke_radius + aa, d_arm);

  // Both arms start at noble dark ink (#16120f) and transition into their respective world tints upon scroll
  vec3 col_arm = u_style < 0.5 ? u_ring : u_hand;
  vec4 col = vec4(col_arm, 1.0) * arm_mask * u_alpha.x;

  // Dissolve effect
  float n = detachAt(p * 56.8, u_style, u_ext);
  float keep = keepInk(n, u_d, u_style);
  if (u_style < 0.5) {
    float front = 1.0 - abs(keep * 2.0 - 1.0);
    col.rgb = mix(col.rgb, vec3(0.0, 0.94, 1.0), front * 0.85);
  } else if (u_d > 0.0) {
    float front = 1.0 - abs(keep * 2.0 - 1.0);
    col.rgb = mix(col.rgb, vec3(1.0, 0.0, 0.24), front * 0.85);
  }
  gl_FragColor = col * keep;
}`;

  // ---- 5 · particles — stateless: position is a pure function of the dissolve value
  const VS_PT = GLSL_VIEW + `
attribute vec2 a_local;   // source on the letter (logo-local)
attribute vec4 a_info;    // group, detach threshold, travel, size
attribute vec2 a_dst;     // target in the painting (art units)
attribute vec4 a_col;     // target colour, rnd
attribute vec4 a_src;     // source colour, rnd
uniform vec4 u_xfBio, u_xfOs;
uniform vec2 u_d, u_layer;
uniform float u_ptScale, u_dpr;
varying vec4 v_col; varying float v_style;
void main() {
  float g = a_info.x;
  vec4 xf = g < 0.5 ? u_xfBio : u_xfOs;
  float d = g < 0.5 ? u_d.x : u_d.y;
  float w = g < 0.5 ? 0.07 : 0.025, T = d * (1.0 + 2.0 * w) - w;
  float u = clamp((T - a_info.y) / a_info.z, 0.0, 1.0);
  vec2 src = xf.xy + a_local * xf.z;
  vec2 dst = a_dst + vec2(g < 0.5 ? u_layer.x : u_layer.y, 0.0);
  float e = u * u * (3.0 - 2.0 * u);
  vec2 pos;
  if (g < 0.5) {
    // pigment: drifts on a soft curve, fluttering like pollen, settling into petals and leaves
    vec2 dv = dst - src; float len = length(dv);
    vec2 nr = vec2(-dv.y, dv.x) / max(len, 1.0);
    vec2 c = mix(src, dst, 0.45) + nr * (a_col.w - 0.5) * len * 0.75 - vec2(0.0, len * 0.16);
    pos = mix(mix(src, c, e), mix(c, dst, e), e);
    pos += nr * sin(e * 9.0 + a_src.w * 6.2832) * 3.2 * e * (1.0 - e);
  } else {
    // signal: routed like a circuit trace — horizontal, vertical, horizontal
    float mx = mix(src.x, dst.x, 0.2 + 0.6 * a_col.w);
    float l1 = abs(mx - src.x), l2 = abs(dst.y - src.y), l3 = abs(dst.x - mx);
    float t = e * (l1 + l2 + l3);
    if (t < l1) pos = vec2(mix(src.x, mx, t / max(l1, 0.001)), src.y);
    else if (t < l1 + l2) pos = vec2(mx, mix(src.y, dst.y, (t - l1) / max(l2, 0.001)));
    else pos = vec2(mix(mx, dst.x, (t - l1 - l2) / max(l3, 0.001)), dst.y);
  }
  float a = step(0.0001, u) * smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.7, 1.0, u));
  vec3 col = mix(a_src.rgb, a_col.rgb, smoothstep(0.05, 0.55, u));
  v_col = vec4(col * a, a) * (g < 0.5 ? 0.92 : 1.0);
  v_style = g;
  float size = a_info.w * (g < 0.5 ? (0.8 + 0.8 * sin(e * 3.1416)) : 1.0);
  gl_PointSize = max(size * u_ptScale, 1.0);
  vec2 sp = toStage(pos);
  if (g > 0.5) sp = floor(sp * u_dpr + 0.5) / u_dpr;
  gl_Position = a > 0.0 ? toClip(sp) : vec4(2.0, 2.0, 2.0, 1.0);
}`;
  const FS_PT = GLSL_HEAD + `
varying vec4 v_col; varying float v_style;
void main() {
  float m = 1.0;
  if (v_style < 0.5) { float r = length(gl_PointCoord - 0.5); m = 1.0 - smoothstep(0.22, 0.5, r); }
  gl_FragColor = v_col * m;
}`;

  function createGLRenderer() {
    if (GL_MODE === 'off') return null;
    const canvas = els.canvas;
    const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'default', failIfMajorPerformanceCaveat: GL_MODE !== 'force' };
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) return null;

    function shader(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
      return sh;
    }
    function program(vs, fs) {
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, vs.startsWith('#') ? vs : GLSL_HEAD + vs));
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
      const a = {}, na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
      for (let i = 0; i < na; i++) { const info = gl.getActiveAttrib(p, i); a[info.name] = gl.getAttribLocation(p, info.name); }
      return { p, u, a };
    }
    function texture(src, opts2 = {}) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, opts2.premultiply !== false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (opts2.data) gl.texImage2D(gl.TEXTURE_2D, 0, opts2.format, opts2.w, opts2.h, 0, opts2.format, gl.UNSIGNED_BYTE, opts2.data);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      const wrap = opts2.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    }

    const P = {
      art: program(VS_ART, FS_ART),
      app: program(VS_APP, FS_APP),
      txt: program(VS_TXT, FS_TXT),
      o: program(VS_O, FS_O),
      pt: program(VS_PT, FS_PT),
    };
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    function uploadTex(tex, img) {
      if (!img || !img.naturalWidth || !img.naturalHeight) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    const T = {
      human: texture(els.humanImg),
      machine: texture(els.machineImg),
      noise: texture(null, { data: NOISE, format: gl.LUMINANCE, w: NOISE_N, h: NOISE_N, repeat: true, premultiply: false }),
      fill: null,
      atlas: gl.createTexture(),
    };
    uploadTex(T.human, els.humanImg);
    uploadTex(T.machine, els.machineImg);
    if (els.humanImg) {
      els.humanImg.addEventListener('load', () => { uploadTex(T.human, els.humanImg); kickRender(); });
    }
    if (els.machineImg) {
      els.machineImg.addEventListener('load', () => { uploadTex(T.machine, els.machineImg); kickRender(); });
    }

    // ---- letter atlas (re-rasterised to the exact on-screen size on resize)
    const atlasCanvas = document.createElement('canvas');
    const actx = atlasCanvas.getContext('2d');
    const getD = (id) => { const el = document.getElementById(id); return el ? el.getAttribute('d') : ''; };
    const paths = {
      I1: new Path2D(getD('g-I1')),
      E1: new Path2D(getD('g-E1')),
      E2: new Path2D(getD('g-E2')),
      E3: new Path2D(getD('g-E3')),
      I2: new Path2D(getD('g-I2')),
      E4: new Path2D(getD('g-E4')),
      T1: new Path2D(getD('g-T1')),
      C1: new Path2D(getD('g-C1')),
      Isub: new Path2D(getD('g-I-sub')),
      C2: new Path2D(getD('g-C2')),
      A_left: new Path2D(getD('g-A-left')),
      A_right: new Path2D(getD('g-A-right')),
      D1: new Path2D(getD('g-D1')),
      A2: new Path2D(getD('g-A2')),
    };
    const atlas = { uvBio: new Float32Array(4), uvOs: new Float32Array(4), uvCicadaBio: new Float32Array(4), uvCicadaOs: new Float32Array(4), texel: new Float32Array(2), scale: 0 };
    function buildAtlas() {
      const sc = Lay.k * Lay.ls * Lay.dpr * 1.08;
      if (Math.abs(sc - atlas.scale) < 0.01) return;
      atlas.scale = sc;
      const pad = 4;
      const wB = (BOX_BIO[2] - BOX_BIO[0]) * sc, hB = (BOX_BIO[3] - BOX_BIO[1]) * sc;
      const wS = (BOX_OS[2] - BOX_OS[0]) * sc, hS = (BOX_OS[3] - BOX_OS[1]) * sc;
      const wCB = (BOX_CICADA_BIO[2] - BOX_CICADA_BIO[0]) * sc, hCB = (BOX_CICADA_BIO[3] - BOX_CICADA_BIO[1]) * sc;
      const wCS = (BOX_CICADA_OS[2] - BOX_CICADA_OS[0]) * sc, hCS = (BOX_CICADA_OS[3] - BOX_CICADA_OS[1]) * sc;

      const W = Math.ceil(Math.max(wB + wS + pad * 3, wCB + wCS + pad * 3));
      const H = Math.ceil(Math.max(hB, hS) + Math.max(hCB, hCS) + pad * 4);
      atlasCanvas.width = W; atlasCanvas.height = H;
      actx.setTransform(1, 0, 0, 1, 0, 0);
      actx.clearRect(0, 0, W, H);
      actx.strokeStyle = '#000'; actx.lineJoin = 'miter'; actx.miterLimit = 8; actx.lineCap = 'butt';

      // 1. IEEE (Mid-plane background layer, top left)
      actx.setTransform(sc, 0, 0, sc, pad - BOX_BIO[0] * sc, pad - BOX_BIO[1] * sc);
      actx.lineWidth = STROKE;
      actx.stroke(paths.I1); actx.stroke(paths.E1); actx.stroke(paths.E2); actx.stroke(paths.E3);

      // 2. IET (Mid-plane background layer, top right)
      const oxS = pad * 2 + wB;
      actx.setTransform(sc, 0, 0, sc, oxS - BOX_OS[0] * sc, pad - BOX_OS[1] * sc);
      actx.lineWidth = STROKE;
      actx.stroke(paths.I2); actx.stroke(paths.E4); actx.stroke(paths.T1);

      // 3. Foreground CICADA Left (C I C A_left, bottom left) - Crisp foreground stroke
      const yRow2 = pad * 2 + Math.max(hB, hS);
      actx.setTransform(sc, 0, 0, sc, pad - BOX_CICADA_BIO[0] * sc, yRow2 - BOX_CICADA_BIO[1] * sc);
      actx.lineWidth = 2.4;
      actx.stroke(paths.C1); actx.stroke(paths.Isub); actx.stroke(paths.C2); actx.stroke(paths.A_left);

      // 4. Foreground CICADA Right (A_right D A, bottom right) - Crisp foreground stroke
      const oxCS = pad * 2 + wCB;
      actx.setTransform(sc, 0, 0, sc, oxCS - BOX_CICADA_OS[0] * sc, yRow2 - BOX_CICADA_OS[1] * sc);
      actx.lineWidth = 2.4;
      actx.stroke(paths.A_right); actx.stroke(paths.D1); actx.stroke(paths.A2);

      atlas.uvBio.set([pad / W, pad / H, (pad + wB) / W, (pad + hB) / H]);
      atlas.uvOs.set([oxS / W, pad / H, (oxS + wS) / W, (pad + hS) / H]);
      atlas.uvCicadaBio.set([pad / W, yRow2 / H, (pad + wCB) / W, (yRow2 + hCB) / H]);
      atlas.uvCicadaOs.set([oxCS / W, yRow2 / H, (oxCS + wCS) / W, (yRow2 + hCS) / H]);
      atlas.texel.set([1 / W, 1 / H]);
      gl.bindTexture(gl.TEXTURE_2D, T.atlas);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    // ---- particles: sampled once from the letter shapes, targets from the painting
    const PT_STRIDE = 16;
    let ptBuffer = gl.createBuffer(), ptCount = 0;
    function decodeTargets(b64) {
      const bin = atob(b64), n = bin.length / 7, out = new Float32Array(n * 5);
      for (let i = 0; i < n; i++) {
        const o = i * 7;
        out[i * 5] = bin.charCodeAt(o) | (bin.charCodeAt(o + 1) << 8);
        out[i * 5 + 1] = bin.charCodeAt(o + 2) | (bin.charCodeAt(o + 3) << 8);
        out[i * 5 + 2] = bin.charCodeAt(o + 4) / 255;
        out[i * 5 + 3] = bin.charCodeAt(o + 5) / 255;
        out[i * 5 + 4] = bin.charCodeAt(o + 6) / 255;
      }
      return out;
    }
    function buildParticles() {
      const rnd = mulberry32(2026);
      const dens = CONFIG.PARTICLE_DENSITY * (Lay.mobile ? CONFIG.MOBILE_PARTICLE_FACTOR : 1.3);
      const tH = decodeTargets(TARGETS.human), tM = decodeTargets(TARGETS.machine);
      const list = [];
      const inkBioEnd = [0.12, 0.45, 0.95], inkOsEnd = [0.85, 0.28, 0.15];
      const goldC = [0.95, 0.78, 0.35], cyanC = [0.30, 0.82, 1.0];
      const amberC = [1.0, 0.65, 0.20], copperC = [0.92, 0.45, 0.20];

      function add(lx, ly, group, srcCol) {
        const style = group;
        const t0 = detachAt(lx, ly, style);
        const tg = group === 0 ? tH : tM;
        const j = ((rnd() * (tg.length / 5)) | 0) * 5;
        list.push(lx, ly,
          group, t0, 0.18 + 0.22 * rnd(), group === 0 ? 1.8 + 1.6 * rnd() : 2.4 + 1.4 * rnd(),
          tg[j] + (rnd() - 0.5) * 3, tg[j + 1] + (rnd() - 0.5) * 3,
          tg[j + 2], tg[j + 3], tg[j + 4], rnd(),
          srcCol[0], srcCol[1], srcCol[2], rnd());
      }

      function sampleSegment(x1, y1, x2, y2, group, col, count) {
        for (let i = 0; i < count; i++) {
          const t = (i + rnd()) / count;
          const x = x1 + (x2 - x1) * t + (rnd() - 0.5) * 1.8;
          const y = y1 + (y2 - y1) * t + (rnd() - 0.5) * 1.8;
          add(x - OX, y - OY, group, col);
        }
      }

      // 1. IEEE Letter Strokes:
      sampleSegment(617, 194.3, 617, 294.3, 0, inkBioEnd, 90);
      sampleSegment(647, 194.3, 647, 294.3, 0, inkBioEnd, 90);
      sampleSegment(647, 194.3, 683, 194.3, 0, cyanC, 40);
      sampleSegment(647, 244.3, 677, 244.3, 0, cyanC, 35);
      sampleSegment(647, 294.3, 683, 294.3, 0, cyanC, 40);
      sampleSegment(699, 194.3, 699, 294.3, 0, inkBioEnd, 90);
      sampleSegment(699, 194.3, 735, 194.3, 0, cyanC, 40);
      sampleSegment(699, 244.3, 729, 244.3, 0, cyanC, 35);
      sampleSegment(699, 294.3, 735, 294.3, 0, cyanC, 40);
      sampleSegment(751, 194.3, 751, 294.3, 0, inkBioEnd, 90);
      sampleSegment(751, 194.3, 787, 194.3, 0, cyanC, 40);
      sampleSegment(751, 244.3, 781, 244.3, 0, cyanC, 35);
      sampleSegment(751, 294.3, 787, 294.3, 0, cyanC, 40);

      // 2. THE CENTER X (Diagonal Arms):
      sampleSegment(806.7, 202.6, 866.7, 286.6, 0, goldC, 140);
      sampleSegment(866.7, 202.6, 806.7, 286.6, 1, amberC, 140);

      // Burst nexus explosion from the center of X:
      for (let i = 0; i < 220; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 36.0;
        add(Math.cos(a) * r, Math.sin(a) * r, 0, cyanC);
        add(Math.cos(a) * r, Math.sin(a) * r, 1, goldC);
      }

      // 2b. CICADA Sub-word strokes (bursting on scroll with split-A nexus):
      // C1
      sampleSegment(764.7, 325.5, 751.2, 320.0, 0, cyanC, 25);
      sampleSegment(751.2, 320.0, 751.2, 350.0, 0, cyanC, 30);
      sampleSegment(751.2, 350.0, 764.7, 344.5, 0, cyanC, 25);
      // I-sub
      sampleSegment(778.7, 320.0, 778.7, 350.0, 0, inkBioEnd, 35);
      // C2
      sampleSegment(812.7, 325.5, 799.2, 320.0, 0, cyanC, 25);
      sampleSegment(799.2, 320.0, 799.2, 350.0, 0, cyanC, 30);
      sampleSegment(799.2, 350.0, 812.7, 344.5, 0, cyanC, 25);
      // Left leg & crossbar of Center A:
      sampleSegment(836.7, 320.0, 826.7, 350.0, 0, goldC, 45);
      sampleSegment(831.3, 339.5, 836.7, 339.5, 0, goldC, 20);

      // Right leg & crossbar of Center A:
      sampleSegment(836.7, 320.0, 846.7, 350.0, 1, amberC, 45);
      sampleSegment(836.7, 339.5, 842.1, 339.5, 1, amberC, 20);
      // D1
      sampleSegment(860.7, 320.0, 860.7, 350.0, 1, inkOsEnd, 35);
      sampleSegment(860.7, 320.0, 880.7, 335.0, 1, amberC, 30);
      sampleSegment(880.7, 335.0, 860.7, 350.0, 1, amberC, 30);
      // A2
      sampleSegment(894.7, 350.0, 904.7, 320.0, 1, amberC, 35);
      sampleSegment(904.7, 320.0, 914.7, 350.0, 1, amberC, 35);
      sampleSegment(899.3, 339.5, 910.1, 339.5, 1, amberC, 20);

      // 3. IET Letter Strokes:
      sampleSegment(886, 194.3, 886, 294.3, 1, inkOsEnd, 90);
      sampleSegment(916, 194.3, 916, 294.3, 1, inkOsEnd, 90);
      sampleSegment(916, 194.3, 952, 194.3, 1, amberC, 40);
      sampleSegment(916, 244.3, 946, 244.3, 1, amberC, 35);
      sampleSegment(916, 294.3, 952, 294.3, 1, amberC, 40);
      sampleSegment(972, 194.3, 1038, 194.3, 1, amberC, 75);
      sampleSegment(1005, 194.3, 1005, 294.3, 1, inkOsEnd, 95);

      // 4. Volumetric Burst Halo:
      for (let i = 0; i < 240; i++) {
        const lx = -210 + rnd() * 180, ly = -50 + rnd() * 100;
        add(lx, ly, 0, cyanC);
      }
      for (let i = 0; i < 240; i++) {
        const lx = 40 + rnd() * 180, ly = -50 + rnd() * 100;
        add(lx, ly, 1, amberC);
      }

      ptCount = list.length / PT_STRIDE;
      gl.bindBuffer(gl.ARRAY_BUFFER, ptBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(list), gl.STATIC_DRAW);
    }

    // ---- per-frame uniform helpers (no allocation)
    function setView(prog) {
      const u = prog.u;
      gl.uniform2f(u.u_view, Lay.W, Lay.H);
      gl.uniform3f(u.u_frame, Lay.fx, Lay.fy, Lay.k);
      gl.uniform4f(u.u_cam, V.camS, V.camTX, V.camTY, 0);
    }
    function bindQuad(prog) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(prog.a.a_pos);
      gl.vertexAttribPointer(prog.a.a_pos, 2, gl.FLOAT, false, 0, 0);
    }
    function bindNoise(prog, unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, T.noise);
      gl.uniform1i(prog.u.u_noise, unit);
    }
    let fillReady = false;
    const fillImg = new Image();
    fillImg.decoding = 'async';
    fillImg.onload = () => { T.fill = texture(fillImg); fillReady = true; kickRender(); };
    fillImg.src = stage.dataset.oFill || '/static/theme/art/o-fill.webp';

    function resize() {
      const w = Math.max(1, Math.round(Lay.W * Lay.dpr)), h = Math.max(1, Math.round(Lay.H * Lay.dpr));
      if (els.canvas.width !== w || els.canvas.height !== h) { els.canvas.width = w; els.canvas.height = h; }
      gl.viewport(0, 0, w, h);
      buildAtlas();
    }

    function render() {
      if (gl.isContextLost()) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const pxArt = 1 / (Lay.k * V.camS * Lay.dpr);

      // 1 · plumb line, field ring, point of light (beneath the painting)
      let pr = P.app; gl.useProgram(pr.p); bindQuad(pr); setView(pr);
      const top = Lay.ay - (R + 22) * Lay.ls;
      gl.uniform4f(pr.u.u_box, AXIS - 60, top - 6, AXIS + 60, THREAD_END + 6);
      gl.uniform4f(pr.u.u_line, AXIS, top, V.threadBottom, Lay.ay - R * Lay.ls);
      gl.uniform4f(pr.u.u_o, Lay.ay + R * Lay.ls, V.ringR, V.thread, V.thread * V.thread);
      gl.uniform1f(pr.u.u_px, pxArt);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 2 · the painting: human world, machine world
      pr = P.art; gl.useProgram(pr.p); bindQuad(pr); setView(pr); bindNoise(pr, 1);
      // fade any edge of the painting that has come inside the viewport (ultrawide, camera lean)
      const e0 = toStage(0, 0), ex0 = e0[0], ey0 = e0[1];
      const e1 = toStage(ART_W, ART_H), ex1 = e1[0], ey1 = e1[1];
      const ku = Lay.k * V.camS, fw = (gap) => 3 + clamp(gap / ku, 0, 80);
      gl.uniform4f(pr.u.u_fade, fw(ex0), fw(Lay.W - ex1), fw(ey0), fw(Lay.H - ey1));
      gl.activeTexture(gl.TEXTURE0); gl.uniform1i(pr.u.u_tex, 0);
      gl.bindTexture(gl.TEXTURE_2D, T.human);
      gl.uniform4f(pr.u.u_rect, 0, 0, SPLIT, ART_H);
      gl.uniform1f(pr.u.u_off, V.offH);
      gl.uniform1f(pr.u.u_alpha, V.alphaH);
      gl.uniform1f(pr.u.u_sketch, V.sketchH); gl.uniform3f(pr.u.u_sketchCol, 0.0, 0.94, 1.0);
      gl.uniform2f(pr.u.u_texel, 1 / SPLIT, 1 / ART_H);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindTexture(gl.TEXTURE_2D, T.machine);
      gl.uniform4f(pr.u.u_rect, SPLIT, 0, ART_W - SPLIT, ART_H);
      gl.uniform1f(pr.u.u_off, V.offM);
      gl.uniform1f(pr.u.u_alpha, V.alphaM);
      gl.uniform1f(pr.u.u_sketch, V.sketchM); gl.uniform3f(pr.u.u_sketchCol, 1.0, 0.0, 0.24);
      gl.uniform2f(pr.u.u_texel, 1 / (ART_W - SPLIT), 1 / ART_H);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 3 · the Os (BIO's first, so at rest OS's O — the original — sits on top)
      if (fillReady) {
        pr = P.o; gl.useProgram(pr.p); bindQuad(pr); setView(pr); bindNoise(pr, 1);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.fill); gl.uniform1i(pr.u.u_fill, 0);
        const rW = R * Lay.ls * V.wordScale;
        gl.uniform1f(pr.u.u_px, 1 / (rW * Lay.k * V.camS * Lay.dpr));
        gl.uniform1f(pr.u.u_phase, V.phase);
        // BIO's O
        gl.uniform3f(pr.u.u_o, Lay.ax + V.bioX * Lay.ls, Lay.ay + V.bioY * Lay.ls, rW);
        gl.uniform1f(pr.u.u_ang, V.angBio); gl.uniform1f(pr.u.u_gold, V.goldBio); gl.uniform1f(pr.u.u_deep, 0);
        gl.uniform3fv(pr.u.u_ring, V.ringBio); gl.uniform3f(pr.u.u_hand, HAND_GOLD[0], HAND_GOLD[1], HAND_GOLD[2]);
        gl.uniform4f(pr.u.u_alpha, 1.0, 1.0, 1.0, 1.0);
        gl.uniform1f(pr.u.u_d, V.dBio); gl.uniform1f(pr.u.u_style, 0); gl.uniform2f(pr.u.u_ext, EXT_BIO[0], EXT_BIO[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // OS's O
        gl.uniform3f(pr.u.u_o, Lay.ax + V.osX * Lay.ls, Lay.ay + V.osY * Lay.ls, rW);
        gl.uniform1f(pr.u.u_ang, V.angOs); gl.uniform1f(pr.u.u_gold, 0); gl.uniform1f(pr.u.u_deep, V.deepOs);
        gl.uniform3fv(pr.u.u_ring, V.ringOs); gl.uniform3fv(pr.u.u_hand, V.ringOs);
        gl.uniform4f(pr.u.u_alpha, 1, 1, 1, 1);
        gl.uniform1f(pr.u.u_d, V.dOs); gl.uniform1f(pr.u.u_style, 1); gl.uniform2f(pr.u.u_ext, EXT_OS[0], EXT_OS[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // 4 · letters
      pr = P.txt; gl.useProgram(pr.p); bindQuad(pr); setView(pr); bindNoise(pr, 1);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.atlas); gl.uniform1i(pr.u.u_atlas, 0);
      gl.uniform2f(pr.u.u_texel, atlas.texel[0], atlas.texel[1]);
      const sc = Lay.ls * V.wordScale;
      gl.uniform4f(pr.u.u_box, BOX_BIO[0], BOX_BIO[1], BOX_BIO[2], BOX_BIO[3]);
      gl.uniform4fv(pr.u.u_uv, atlas.uvBio);
      gl.uniform4f(pr.u.u_xf, Lay.ax + V.bioX * Lay.ls, Lay.ay + V.bioY * Lay.ls, sc, 0);
      gl.uniform1f(pr.u.u_d, V.dBio); gl.uniform1f(pr.u.u_style, 0); gl.uniform2f(pr.u.u_ext, EXT_BIO[0], EXT_BIO[1]);
      gl.uniform3fv(pr.u.u_ink, V.inkBio); gl.uniform3f(pr.u.u_edge, EDGE_BIO[0], EDGE_BIO[1], EDGE_BIO[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.uniform4f(pr.u.u_box, BOX_OS[0], BOX_OS[1], BOX_OS[2], BOX_OS[3]);
      gl.uniform4fv(pr.u.u_uv, atlas.uvOs);
      gl.uniform4f(pr.u.u_xf, Lay.ax + V.osX * Lay.ls, Lay.ay + V.osY * Lay.ls, sc, 0);
      gl.uniform1f(pr.u.u_d, V.dOs); gl.uniform1f(pr.u.u_style, 1); gl.uniform2f(pr.u.u_ext, EXT_OS[0], EXT_OS[1]);
      gl.uniform3fv(pr.u.u_ink, V.inkOs); gl.uniform3f(pr.u.u_edge, EDGE_OS[0], EDGE_OS[1], EDGE_OS[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 5 · FOREGROUND LAYER: CICADA (Noticeably Closer to Camera in 3D POV, True Parallax)
      // Base scale 1.40x (closer to camera) + zooms forward toward lens on scroll (0.35)
      const pScale = sc * (1.40 + 0.35 * V.split);
      // High foreground velocity (2.2x) because it is physically closer to the viewer
      const pX_bio = V.bioX * 2.2;
      const pX_os = V.osX * 2.2;
      const pY_bio = V.bioY * 1.5 - 6 * V.split;
      const pY_os = V.osY * 1.5 - 6 * V.split;
      const inkForeBio = [V.inkBio[0] * 0.7, V.inkBio[1] * 0.7, V.inkBio[2] * 0.7];
      const inkForeOs = [V.inkOs[0] * 0.7, V.inkOs[1] * 0.7, V.inkOs[2] * 0.7];

      // Ambient drop shadow for CICADA onto background plane
      const shOffX = 1.8 * Lay.k * V.camS, shOffY = 2.8 * Lay.k * V.camS;
      const shCol = [0.42, 0.36, 0.30];
      // Shadow Left
      gl.uniform4f(pr.u.u_box, BOX_CICADA_BIO[0], BOX_CICADA_BIO[1], BOX_CICADA_BIO[2], BOX_CICADA_BIO[3]);
      gl.uniform4fv(pr.u.u_uv, atlas.uvCicadaBio);
      gl.uniform4f(pr.u.u_xf, Lay.ax + pX_bio * Lay.ls + shOffX, Lay.ay + pY_bio * Lay.ls + shOffY, pScale, 0);
      gl.uniform1f(pr.u.u_d, V.dBio); gl.uniform1f(pr.u.u_style, 0); gl.uniform2f(pr.u.u_ext, EXT_BIO[0], EXT_BIO[1]);
      gl.uniform3fv(pr.u.u_ink, shCol); gl.uniform3fv(pr.u.u_edge, shCol);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Shadow Right
      gl.uniform4f(pr.u.u_box, BOX_CICADA_OS[0], BOX_CICADA_OS[1], BOX_CICADA_OS[2], BOX_CICADA_OS[3]);
      gl.uniform4fv(pr.u.u_uv, atlas.uvCicadaOs);
      gl.uniform4f(pr.u.u_xf, Lay.ax + pX_os * Lay.ls + shOffX, Lay.ay + pY_os * Lay.ls + shOffY, pScale, 0);
      gl.uniform1f(pr.u.u_d, V.dOs); gl.uniform1f(pr.u.u_style, 1); gl.uniform2f(pr.u.u_ext, EXT_OS[0], EXT_OS[1]);
      gl.uniform3fv(pr.u.u_ink, shCol); gl.uniform3fv(pr.u.u_edge, shCol);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Foreground CICADA Left (C I C A_left)
      gl.uniform4f(pr.u.u_box, BOX_CICADA_BIO[0], BOX_CICADA_BIO[1], BOX_CICADA_BIO[2], BOX_CICADA_BIO[3]);
      gl.uniform4fv(pr.u.u_uv, atlas.uvCicadaBio);
      gl.uniform4f(pr.u.u_xf, Lay.ax + pX_bio * Lay.ls, Lay.ay + pY_bio * Lay.ls, pScale, 0);
      gl.uniform1f(pr.u.u_d, V.dBio); gl.uniform1f(pr.u.u_style, 0); gl.uniform2f(pr.u.u_ext, EXT_BIO[0], EXT_BIO[1]);
      gl.uniform3fv(pr.u.u_ink, inkForeBio); gl.uniform3f(pr.u.u_edge, EDGE_BIO[0], EDGE_BIO[1], EDGE_BIO[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Foreground CICADA Right (A_right D A)
      gl.uniform4f(pr.u.u_box, BOX_CICADA_OS[0], BOX_CICADA_OS[1], BOX_CICADA_OS[2], BOX_CICADA_OS[3]);
      gl.uniform4fv(pr.u.u_uv, atlas.uvCicadaOs);
      gl.uniform4f(pr.u.u_xf, Lay.ax + pX_os * Lay.ls, Lay.ay + pY_os * Lay.ls, pScale, 0);
      gl.uniform1f(pr.u.u_d, V.dOs); gl.uniform1f(pr.u.u_style, 1); gl.uniform2f(pr.u.u_ext, EXT_OS[0], EXT_OS[1]);
      gl.uniform3fv(pr.u.u_ink, inkForeOs); gl.uniform3f(pr.u.u_edge, EDGE_OS[0], EDGE_OS[1], EDGE_OS[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 5 · particles (only while something is dissolving)
      if (ptCount && (V.dBio > 0 || V.dOs > 0) && (V.dBio < 1 || V.dOs < 1)) {
        pr = P.pt; gl.useProgram(pr.p); setView(pr);
        gl.bindBuffer(gl.ARRAY_BUFFER, ptBuffer);
        const st = PT_STRIDE * 4, a = pr.a;
        gl.enableVertexAttribArray(a.a_local); gl.vertexAttribPointer(a.a_local, 2, gl.FLOAT, false, st, 0);
        gl.enableVertexAttribArray(a.a_info); gl.vertexAttribPointer(a.a_info, 4, gl.FLOAT, false, st, 8);
        gl.enableVertexAttribArray(a.a_dst); gl.vertexAttribPointer(a.a_dst, 2, gl.FLOAT, false, st, 24);
        gl.enableVertexAttribArray(a.a_col); gl.vertexAttribPointer(a.a_col, 4, gl.FLOAT, false, st, 32);
        gl.enableVertexAttribArray(a.a_src); gl.vertexAttribPointer(a.a_src, 4, gl.FLOAT, false, st, 48);
        gl.uniform4f(pr.u.u_xfBio, Lay.ax + V.bioX * Lay.ls, Lay.ay + V.bioY * Lay.ls, sc, 0);
        gl.uniform4f(pr.u.u_xfOs, Lay.ax + V.osX * Lay.ls, Lay.ay + V.osY * Lay.ls, sc, 0);
        gl.uniform2f(pr.u.u_d, V.dBio, V.dOs);
        gl.uniform2f(pr.u.u_layer, V.offH, V.offM);
        gl.uniform1f(pr.u.u_ptScale, Lay.k * V.camS * Lay.dpr);
        gl.uniform1f(pr.u.u_dpr, Lay.dpr);
        gl.drawArrays(gl.POINTS, 0, ptCount);
        for (const name of ['a_local', 'a_info', 'a_dst', 'a_col', 'a_src']) gl.disableVertexAttribArray(a[name]);
      }
    }

    buildParticles();
    return { render, resize, gl };
  }

  /* ═══════════════════════════════ BOOT ═══════════════════════════════ */
  let glR = null;
  function render() {
    if (glR && !S.arriving) glR.render(); else domRenderer.render();
    renderPage();
  }
  function kickRender() { if (!S.running && !S.leaving) { derive(S.progress, S.read, S.ptr); render(); } }

  function onResize() {
    measure();
    if (glR) glR.resize();
    readScroll();
    kickRender();
  }

  function setMotionMode() {
    S.static = mqReduce.matches;
    root.classList.toggle('js-static', S.static);
    root.classList.toggle('js-motion', !S.static);
  }

  async function startGL() {
    try {
      const waitImg = (img) => {
        if (!img) return Promise.resolve();
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          let resolved = false;
          const finish = () => { if (!resolved) { resolved = true; resolve(); } };
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', finish, { once: true });
          if (typeof img.decode === 'function') {
            img.decode().then(finish).catch(finish);
          }
          setTimeout(finish, 1200);
        });
      };
      await Promise.all([waitImg(els.humanImg), waitImg(els.machineImg)]);
      glR = createGLRenderer();
      if (!glR) {
        console.warn('[WebGL] createGLRenderer returned null, falling back to SVG renderer.');
        return;
      }
      glR.resize();
      derive(S.progress, S.read, S.ptr);
      glR.render();
      if (!S.arriving) root.classList.add('gl-on');
      els.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        glR = null;
        root.classList.remove('gl-on');
        kickRender();
      }, false);
      console.log('[WebGL] WebGL renderer active with particle burst!');
    } catch (err) {
      glR = null;
      root.classList.remove('gl-on');
      if (window.console) console.warn('[CICADA] WebGL unavailable, using the SVG renderer.', err && err.message ? err.message : err);
    }
  }

  function boot() {
    root.classList.add('js-split');
    setMotionMode();
    if (FORCED_DIR) S.dir = FORCED_DIR;
    else if (FROZEN) S.dir = FROZEN < 0 ? -1 : 1;
    else {
      let stored = null;
      try { stored = sessionStorage.getItem('ieeexiet-path') || sessionStorage.getItem('cicada-path'); } catch (e) { /* private mode */ }
      if (stored && window.scrollY > 4) S.dir = stored === 'os' ? 1 : -1;
    }
    S.pendingDir = S.dir;
    applyPath();
    measure();
    readScroll();
    derive(S.target, S.readTarget, 0);
    S.progress = S.target; S.read = S.readTarget;

    // Attach interaction listeners FIRST so scrolling and pointer events always work
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouch, { passive: true });
    root.addEventListener('mouseleave', onPointerLeave, { passive: true });
    let rz = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(onResize); });
    ro.observe(stage);
    ro.observe(document.body);
    const onMq = () => { setMotionMode(); requestAnimationFrame(onResize); };
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', onMq);

    try {
      render();
    } catch (e) {
      console.error('[Engine] Initial render error:', e);
    }

    if (window.__cicadaArrival) arrive(window.__cicadaArrival);
    if (!S.static || FROZEN !== null || GL_MODE === 'force') startGL();
  }

  /* ── leaving for the Tracks page: the two figures travel to their blueprints there ──
     A cross-document view transition (home.css and tracks.css opt in). As the page leaves, the DOM painting
     takes the canvas's place, posed exactly as the canvas last drew it, its two figures are named so the browser
     can carry each one to the drawing of the same name on /tracks, and the page holds still (S.leaving) while it
     is captured. Any other destination skips the transition. */
  let handedOver = false;
  let handBack = 0;
  const handOver = (on) => {
    window.clearTimeout(handBack);
    handedOver = on;
    S.leaving = on;
    if (on) { arriving = null; S.arriving = false; window.__cicadaArrival = null; }   // leaving ends any landing
    if (on || !S.arriving) {   // (the drawings from /tracks may be landing on these very names)
      els.human.style.viewTransitionName = on ? 'cicada-human' : '';
      els.machine.style.viewTransitionName = on ? 'cicada-machine' : '';
    }
    if (on) {
      domRenderer.render();
      root.classList.remove('gl-on');
      // should no navigation follow (a cancelled click, a slow network giving up), return to the canvas
      handBack = window.setTimeout(() => handOver(false), 4000);
    } else if (glR && !S.arriving) {
      root.classList.add('gl-on');
      kickRender();
    }
  };
  window.addEventListener('pageswap', (e) => {
    const vt = e.viewTransition;
    if (!vt) { if (handedOver) handOver(false); return; }
    const url = e.activation && e.activation.entry && e.activation.entry.url;
    let path = null;
    try { path = url ? new URL(url).pathname : null; } catch (err) { path = null; }
    if (path !== null && path !== '/tracks') { vt.skipTransition(); if (handedOver) handOver(false); return; }
    if (!handedOver) handOver(true);
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted && handedOver) handOver(false); });

  /* ── back from the Tracks page: the two drawings travel back into the painting ──
     The inline script in index.html names the two figures on the page's first frame (this file may not have run yet),
     so the drawings of the same names on /tracks land on them; home.css runs the animation. While they land, the
     painting is drawn by the DOM renderer, whose figures the transition shows live (the canvas is not one of the named
     elements, so it could not receive them). Once the transition has finished, the canvas takes over again, posed as
     the DOM was. Back from the browser's page cache, the page is revealed again the same way. */
  let arriving = null;
  const arrive = (vt) => {
    if (!vt || arriving === vt) return;
    arriving = vt;
    S.arriving = true;
    root.classList.remove('gl-on');
    kickRender();
    const landed = () => {
      if (arriving !== vt) return;
      arriving = null;
      S.arriving = false;
      if (glR) {
        derive(S.progress, S.read, S.ptr);
        glR.render();
        root.classList.add('gl-on');
      }
    };
    vt.finished.then(landed, landed);
  };
  window.addEventListener('pagereveal', (e) => {
    if (e.viewTransition && e.viewTransition === window.__cicadaArrival) arrive(e.viewTransition);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
