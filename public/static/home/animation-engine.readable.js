/**
 * ============================================================================
 * IEEE × IET / CICADA — REVERSE ENGINEERED ANIMATION ENGINE
 * ============================================================================
 *
 * An architectural decompilation and readable reconstruction of the custom
 * dual-path WebGL & SVG animation engine.
 *
 * SYSTEM ARCHITECTURE:
 * --------------------
 * The engine operates as a unidirectional reactive pipeline driven by user interaction:
 *
 *   [User Input] (Scroll / Wheel / Touch / Cursor Move)
 *        │
 *        ▼
 *   [Input & Path Arbiter] ──> Determines Active Journey (Left vs Right Path)
 *        │
 *        ▼
 *   [Physics Integrator] ──> Exponential Decay Damping (Smooth 60/120fps rAF Loop)
 *        │
 *        ▼
 *   [Master State: progress ∈ [-1, +1]]
 *        │
 *        ├─────────────────────────────┬─────────────────────────────┐
 *        ▼                             ▼                             ▼
 *   [State Deriver]            [Camera Projection]         [Paper Atmospheric Tint]
 *   Calculates 30+ visual      Dynamic scale & translate   CSS variables for warm/cool
 *   properties (rot, split,    focusing on active profile  paper washes
 *   dissolve, alpha)
 *        │
 *        ├─────────────────────────────┐
 *        ▼                             ▼
 *   [WebGL GPU Pipeline]       [DOM/SVG Fallback Renderer]
 *   - Fresco/Sketch Shader     - SVG Matrix Transforms
 *   - Vector Dissolve Shader   - Dynamic Vector Overlays
 *   - Procedural Noise FBM     - View Transition Handover
 *   - Particle Flight Physics    (pageswap / pagereveal)
 *
 * ============================================================================
 */

(() => {
  'use strict';

  /* ==========================================================================
   * 1. CONFIGURATION & TUNING CONSTANTS
   * ========================================================================== */

  const CONFIG = {
    /**
     * Determines whether cursor/touch position sets the path when starting a scroll:
     * - Left 50% of viewport  -> IEEE Path (-1.0)
     * - Right 50% of viewport -> IET Path  (+1.0)
     */
    PATH_FROM_POINTER: true,

    /**
     * Vertical dead-zone at the top of the hero (in viewport heights).
     * Inside this zone, the path remains open so users can change their mind
     * before scrolling deeply into a specific world.
     */
    PATH_SWITCH_BUFFER: 0.3,

    /** Default starting journey when input is neutral: -1 = Left, +1 = Right */
    DEFAULT_DIRECTION: -1,

    /** Damping factor for progress interpolation (1/seconds). Larger = snappier. */
    SCROLL_SMOOTHING: 5.5,

    /** Damping factor for pointer parallax/preview follow-through. */
    POINTER_SMOOTHING: 1.4,

    /** Faint atmospheric paper tint preview strength before scroll begins. */
    POINTER_PREVIEW_TINT: 0.14,

    /** Art units the surviving world leans inward toward the pointer. */
    POINTER_LEAN_OFFSET: 4.0,

    /** Viewport heights over which content settles into the split layout. */
    READ_SETTLE_LENGTH: 0.65,

    /** Opacity of the receding world background drawing behind content (0.0 - 1.0). */
    RECEDED_GHOST_OPACITY: 0.3,

    /** Opacity of the paper wash veil over the receding half. */
    PAPER_VEIL_OPACITY: 0.36,

    /** Narrow portrait margin width where the surviving figure watches from. */
    PORTRAIT_MARGIN_WIDTH: 0.22,

    /** Device pixel ratio clamp for desktop and mobile performance budgeting. */
    MAX_DESKTOP_DPR: 2.0,
    MAX_MOBILE_DPR: 1.75,

    /** Density of particles generated per unit of vector stroke. */
    PARTICLE_DENSITY: 0.9,
    MOBILE_PARTICLE_DENSITY_SCALE: 0.5,
  };

  /* ==========================================================================
   * 2. ARTWORK COORDINATE SYSTEM & GEOMETRIC CONSTANTS
   * ==========================================================================
   * All vector graphics, cameras, and WebGL primitives exist in a virtual
   * high-resolution canvas coordinate system: 1672 × 941 units.
   */

  const GEOMETRY = {
    CANVAS_WIDTH: 1672,
    CANVAS_HEIGHT: 941,
    SPLIT_AXIS: 842,

    /** Center anchor of the wordmark and central nexus lens */
    CENTER_X: 836.7,
    CENTER_Y: 244.6,

    /** Central reticle circle radius and stroke weight */
    NEXUS_RADIUS: 46.0,
    HAIRLINE_STROKE_WIDTH: 2.1,

    /** Central plumb line and light orb coordinates */
    PLUMB_LINE_X: 836.7,
    LIGHT_ORB_X: 836.7,
    LIGHT_ORB_Y: 441.2,
    PLUMB_LINE_MAX_Y: 553.0,

    /** Key profile positions (nose tip) for portrait camera alignment */
    PROFILE_LEFT: [478, 262],
    PROFILE_RIGHT: [1268, 300],

    /** Word bounding boxes [minX, minY, maxX, maxY] in art units */
    BOX_LEFT_WORD: [610, 188, 790, 300],   // IEEE
    BOX_RIGHT_WORD: [880, 187, 1045, 300], // IET

    /** Dissolve front spatial bounds (relative to center) */
    EXTENT_LEFT: [610 - 836.7, 890 - 836.7],
    EXTENT_RIGHT: [780 - 836.7, 1045 - 836.7],

    /** Center of mass for caption alignment */
    WORD_CENTER_LEFT: 702 - 836.7,
    WORD_CENTER_RIGHT: 960 - 836.7,
  };

  /* ==========================================================================
   * 3. MATHEMATICAL & PROCEDURAL NOISE UTILITIES
   * ========================================================================== */

  /** Clamps a value between lower and upper bounds */
  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  /** Linear interpolation: lerp(a, b, t) = a + (b - a) * t */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Hermite smoothstep interpolation (C1 continuous curve) */
  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  /** Converts a hex color string (#rrggbb) to a normalized float array [r, g, b] ∈ [0, 1] */
  function hexToRgbFloat(hexStr) {
    return [
      parseInt(hexStr.slice(1, 3), 16) / 255.0,
      parseInt(hexStr.slice(3, 5), 16) / 255.0,
      parseInt(hexStr.slice(5, 7), 16) / 255.0,
    ];
  }

  /**
   * Deterministic Mulberry32 32-bit PRNG.
   * Ensures identical procedural dissolve and particle paths across page loads.
   */
  function createMulberry32(seed) {
    let s = seed | 0;
    return function nextRandom() {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
    };
  }

  /**
   * Shared 128×128 Procedural Noise Table.
   * Used simultaneously by the CPU (particle liftoff timing) and the GPU
   * (as an uploaded LUMINANCE texture) so particles detach from the exact pixels
   * where ink dissolves.
   */
  const NOISE_SIZE = 128;
  const NOISE_TABLE = (() => {
    const rng = createMulberry32(1977);
    const table = new Uint8Array(NOISE_SIZE * NOISE_SIZE);
    for (let i = 0; i < table.length; i++) {
      table[i] = (rng() * 256.0) | 0;
    }
    return table;
  })();

  /** Bilinear sampled noise from the shared table with wrap-around */
  function sampleNoiseBilinear(x, y) {
    const fx = x - 0.5, fy = y - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const x0 = ix & 127, x1 = (ix + 1) & 127;
    const y0 = (iy & 127) * NOISE_SIZE, y1 = ((iy + 1) & 127) * NOISE_SIZE;

    const a = NOISE_TABLE[y0 + x0], b = NOISE_TABLE[y0 + x1];
    const c = NOISE_TABLE[y1 + x0], d = NOISE_TABLE[y1 + x1];
    const top = a + (b - a) * tx;
    const bottom = c + (d - c) * tx;
    return (top + (bottom - top) * ty) / 255.0;
  }

  /** Nearest-neighbor sampled noise for quantized/blocky mosaic patterns */
  function sampleNoiseNearest(x, y) {
    const nx = Math.floor(x) & 127;
    const ny = Math.floor(y) & 127;
    return NOISE_TABLE[ny * NOISE_SIZE + nx] / 255.0;
  }

  /**
   * Fractal Brownian Motion (FBM) for organic/watercolour pigment dissolution.
   * Sums 3 octaves with increasing frequencies and decreasing amplitudes.
   */
  function fbmOrganic(x, y) {
    return (
      0.50 * sampleNoiseBilinear(x * 0.11 + 3.1, y * 0.11 + 7.7) +
      0.30 * sampleNoiseBilinear(x * 0.29 + 19.4, y * 0.29 + 2.3) +
      0.20 * sampleNoiseBilinear(x * 0.83 + 41.9, y * 0.83 + 33.1)
    );
  }

  /**
   * Quantized block noise for industrial/mosaic circuit dissolution.
   */
  function noiseBlocky(x, y) {
    return (
      0.72 * sampleNoiseNearest(x / 5.2 + 11.0, y / 5.2 + 5.0) +
      0.28 * sampleNoiseNearest(x / 15.6 + 71.0, y / 15.6 + 29.0)
    );
  }

  /**
   * Calculates the exact dissolve threshold value at local coordinate (x, y).
   * @param {number} x - Local X in art units
   * @param {number} y - Local Y in art units
   * @param {number} style - 0 = Organic (left), 1 = Circuit/Mosaic (right)
   */
  function computeDetachThreshold(x, y, style) {
    if (style === 0) {
      const ext = GEOMETRY.EXTENT_LEFT;
      const progress = clamp((x - ext[0]) / (ext[1] - ext[0]), 0.0, 1.0);
      return 0.6 * fbmOrganic(x, y) + 0.4 * progress;
    } else {
      const ext = GEOMETRY.EXTENT_RIGHT;
      const quantizedX = (Math.floor(x / 5.2) + 0.5) * 5.2;
      const progress = clamp((ext[1] - quantizedX) / (ext[1] - ext[0]), 0.0, 1.0);
      return 0.6 * noiseBlocky(x, y) + 0.4 * progress;
    }
  }

  /* ==========================================================================
   * 4. STATE ENGINE & DERIVED VISUALS
   * ========================================================================== */

  /** Engine Runtime State */
  const EngineState = {
    // Master timeline position: -1.0 (Left/IEEE) ↔ 0.0 (Nexus) ↔ +1.0 (Right/IET)
    targetProgress: 0.0,
    currentProgress: 0.0,

    // Settling into reading mode as content opens
    targetRead: 0.0,
    currentRead: 0.0,

    // Pointer horizontal offset: -1.0 (Left edge) ↔ +1.0 (Right edge)
    targetPointer: 0.0,
    currentPointer: 0.0,

    // Active path direction (-1 = Left, +1 = Right)
    activeDirection: CONFIG.DEFAULT_DIRECTION,
    pendingDirection: CONFIG.DEFAULT_DIRECTION,

    lastPointerClientX: null,
    heroScrollNormalized: 0.0,

    isRunning: false,
    lastFrameTimestamp: 0,
    isFirstFrame: true,
    isLeavingForTracks: false,
    isArrivingFromTracks: false,
  };

  /** Measured Layout Properties */
  const LayoutState = {
    viewportWidth: 1,
    viewportHeight: 1,
    frameOffsetX: 0,
    frameOffsetY: 0,
    scaleK: 1,
    dpr: 1,
    isPortrait: false,
    isMobile: false,

    // Wordmark placement
    anchorX: GEOMETRY.CENTER_X,
    anchorY: GEOMETRY.CENTER_Y,
    logoScale: 1,
    maxWordSeparation: 140,
    heroTopScrollY: 0,
    scrollTrackLength: 1,
    pathDeadZoneHeight: 0,

    // Camera targets for each world
    camLeft: { s: 1, tx: 0, ty: 0 },
    camRight: { s: 1, tx: 0, ty: 0 },
  };

  /** Preallocated Derived Visual Frame (Rewritten every animation tick) */
  const VisualFrame = {
    progress: 0,
    absProgress: 0,
    activeSide: -1,
    read: 0,

    // Stage 1: Wordmark & Nexus separation
    splitFactor: 0,
    driftFactor: 0,
    dissolveLeft: 0,
    dissolveRight: 0,

    // Stage 2: Plumb line retracting into nexus
    plumbLineThread: 1,
    plumbLineBottomY: GEOMETRY.PLUMB_LINE_MAX_Y,
    fieldRingRadius: 44.2,

    // Stage 3: Camera & Artwork worlds parting
    worldsApart: 0,
    pointerLean: 0,
    atmosphereTint: 0,

    // Central Nexus rotation & phase lens
    angleLeft: 0,
    angleRight: 0,
    lensPhase: 0,

    // Wordmark group offsets
    wordLeftOffsetX: 0,
    wordLeftOffsetY: 0,
    wordRightOffsetX: 0,
    wordRightOffsetY: 0,
    wordScale: 1,

    // Art layer transforms & alphas
    humanLayerOffsetX: 0,
    machineLayerOffsetX: 0,
    humanSketchFactor: 0,
    machineSketchFactor: 0,
    humanAlpha: 1,
    machineAlpha: 1,
    paperVeilOpacity: 0,

    // Camera transformation
    camScale: 1,
    camTranslateX: 0,
    camTranslateY: 0,

    // UI & Captions
    copyOpacity: 1,
    scrollCueOpacity: 1,
    captionLeftOpacity: 0,
    captionRightOpacity: 0,
  };

  /**
   * Derive(): The Mathematical Heart of the Engine.
   * Evaluates all 30+ visual properties as pure continuous functions of
   * (progress, read, pointer).
   */
  function deriveVisualState(p, read, ptr) {
    const s = Math.abs(p);
    const side = p < 0 ? -1 : p > 0 ? 1 : EngineState.activeDirection;

    VisualFrame.progress = p;
    VisualFrame.absProgress = s;
    VisualFrame.activeSide = side;
    VisualFrame.read = read;

    // 1. Division: Wordmark splits at nexus
    VisualFrame.splitFactor = smoothstep(0.02, 0.40, s);

    // 2. Dissolve progression
    VisualFrame.driftFactor = smoothstep(0.30, 0.95, s);
    VisualFrame.dissolveLeft = smoothstep(0.42, 0.90, s);
    VisualFrame.dissolveRight = smoothstep(0.44, 0.92, s);

    // 3. Plumb line retraction: Plumb thread reels up toward the nexus orb
    VisualFrame.plumbLineThread = 1.0 - smoothstep(0.012, 0.30, s);
    VisualFrame.plumbLineBottomY = lerp(
      LayoutState.anchorY + GEOMETRY.NEXUS_RADIUS * LayoutState.logoScale,
      GEOMETRY.PLUMB_LINE_MAX_Y,
      VisualFrame.plumbLineThread * VisualFrame.plumbLineThread * (3.0 - 2.0 * VisualFrame.plumbLineThread)
    );
    VisualFrame.fieldRingRadius = 44.2 * (1.0 + 0.45 * (1.0 - VisualFrame.plumbLineThread));

    // 4. Dual worlds parting
    VisualFrame.worldsApart = smoothstep(0.06, 0.80, s);

    // 5. Dominant world progression
    const dominance = smoothstep(0.70, 1.00, s);
    VisualFrame.pointerLean = side * dominance;

    const preview = (1.0 - smoothstep(0.0, 0.12, s)) * (1.0 - read);
    VisualFrame.atmosphereTint = clamp(
      VisualFrame.pointerLean + ptr * CONFIG.POINTER_PREVIEW_TINT * preview,
      -1.0,
      1.0
    );

    // 6. Central Nexus counter-rotation & optical lens phase
    const angleRotation = s * 1.15 * Math.PI;
    VisualFrame.angleLeft = -angleRotation;
    VisualFrame.angleRight = angleRotation;
    VisualFrame.lensPhase = smoothstep(0.08, 0.55, s);

    // 7. Word group separation
    const sep = LayoutState.maxWordSeparation * (0.55 * VisualFrame.splitFactor + 0.45 * VisualFrame.driftFactor);
    VisualFrame.wordLeftOffsetX = -sep;
    VisualFrame.wordRightOffsetX = sep;
    VisualFrame.wordLeftOffsetY = VisualFrame.driftFactor * 16.0;
    VisualFrame.wordRightOffsetY = VisualFrame.driftFactor * 12.0;

    VisualFrame.wordScale = 1.0 - (LayoutState.isPortrait ? 0.30 : 0.04) * VisualFrame.splitFactor - 0.08 * VisualFrame.driftFactor;

    // 8. Art layers: Surviving world stays solid; receding world returns to sinopia sketch
    const ghost = lerp(1.0, LayoutState.isPortrait ? 0.10 : CONFIG.RECEDED_GHOST_OPACITY, read);
    VisualFrame.humanSketchFactor = side > 0 ? dominance : 0.0;
    VisualFrame.machineSketchFactor = side < 0 ? dominance : 0.0;
    VisualFrame.humanAlpha = side > 0 ? ghost : 1.0;
    VisualFrame.machineAlpha = side < 0 ? ghost : 1.0;
    VisualFrame.paperVeilOpacity = read * (LayoutState.isPortrait ? 1.0 : CONFIG.PAPER_VEIL_OPACITY);

    // 9. Camera Matrix Interpolation
    const targetCam = side < 0 ? LayoutState.camLeft : LayoutState.camRight;
    const blendFactor = smoothstep(0.0, 1.0, LayoutState.isPortrait ? 0.35 * dominance + 0.65 * read : dominance);
    VisualFrame.camScale = 1.0 + (targetCam.s - 1.0) * blendFactor;
    VisualFrame.camTranslateX = targetCam.tx * blendFactor;
    VisualFrame.camTranslateY = targetCam.ty * blendFactor;

    // 10. UI Opacity
    VisualFrame.copyOpacity = 1.0 - smoothstep(0.015, 0.14, s);
    VisualFrame.scrollCueOpacity = 1.0 - smoothstep(0.005, 0.06, s);
    const captionFade = smoothstep(0.20, 0.34, s) * (1.0 - smoothstep(0.56, 0.70, s));
    VisualFrame.captionLeftOpacity = captionFade;
    VisualFrame.captionRightOpacity = captionFade;
  }

  /* ==========================================================================
   * 5. CAMERA & PROJECTION TRANSFORMS
   * ========================================================================== */

  /** Computes the camera transformation matrix targeting one of the two worlds */
  function computeCameraTarget(side) {
    const fx = LayoutState.frameOffsetX;
    const fy = LayoutState.frameOffsetY;
    const k = LayoutState.scaleK;
    const w = LayoutState.viewportWidth;
    const h = LayoutState.viewportHeight;

    if (!LayoutState.isPortrait) {
      // Landscape: Anchor camera to the fingertip meeting point
      const pivotX = fx + GEOMETRY.LIGHT_ORB_X * k;
      const pivotY = fy + GEOMETRY.LIGHT_ORB_Y * k;
      let s = 1.04;

      if (side < 0 && fx > 0) s = Math.max(s, pivotX / Math.max(1.0, pivotX - fx));
      if (side > 0 && fx + GEOMETRY.CANVAS_WIDTH * k < w) s = Math.max(s, (w - pivotX) / Math.max(1.0, fx + GEOMETRY.CANVAS_WIDTH * k - pivotX));
      if (fy > 0) s = Math.max(s, pivotY / Math.max(1.0, pivotY - fy));
      if (fy + GEOMETRY.CANVAS_HEIGHT * k < h) s = Math.max(s, (h - pivotY) / Math.max(1.0, fy + GEOMETRY.CANVAS_HEIGHT * k - pivotY));

      return { s, tx: pivotX * (1.0 - s), ty: pivotY * (1.0 - s) };
    }

    // Portrait: Track profile face into margin
    const panel = w * CONFIG.PORTRAIT_MARGIN_WIDTH;
    const face = side < 0 ? GEOMETRY.PROFILE_LEFT : GEOMETRY.PROFILE_RIGHT;
    const scaleFactor = Math.max((h / GEOMETRY.CANVAS_HEIGHT) * 1.02, panel / 140.0) / k;
    const targetX = side < 0 ? panel * 0.79 : w - panel * 0.79;
    const targetY = h * 0.32;

    const faceStageX = fx + face[0] * k;
    const faceStageY = fy + face[1] * k;
    const tx = targetX - faceStageX * scaleFactor;
    let ty = targetY - faceStageY * scaleFactor;

    const topEdge = fy * scaleFactor + ty;
    const bottomEdge = (fy + GEOMETRY.CANVAS_HEIGHT * k) * scaleFactor + ty;
    if (topEdge > 0) ty -= topEdge;
    else if (bottomEdge < h) ty += h - bottomEdge;

    return { s: scaleFactor, tx, ty };
  }

  /** Converts an art-space coordinate [ax, ay] to screen stage pixels */
  function artToStageCoords(ax, ay) {
    const k = LayoutState.scaleK;
    const rawX = LayoutState.frameOffsetX + ax * k;
    const rawY = LayoutState.frameOffsetY + ay * k;
    return [
      rawX * VisualFrame.camScale + VisualFrame.camTranslateX,
      rawY * VisualFrame.camScale + VisualFrame.camTranslateY,
    ];
  }

  /* ==========================================================================
   * 6. PHYSICS LOOP & INTERACTION CONTROLLER
   * ========================================================================== */

  /**
   * Animation Frame Physics Tick.
   * Uses exponential decay integration: x += (target - x) * (1 - e^(-k * dt))
   * guaranteeing frame-rate-independent smoothing on 60Hz, 120Hz, and 144Hz monitors.
   */
  function updatePhysicsTick(timestamp) {
    if (EngineState.isLeavingForTracks) {
      EngineState.isRunning = false;
      return;
    }

    const dt = Math.min(0.05, Math.max(0.001, (timestamp - EngineState.lastFrameTimestamp) / 1000.0));
    EngineState.lastFrameTimestamp = timestamp;

    if (EngineState.isFirstFrame) {
      EngineState.currentProgress = EngineState.targetProgress;
      EngineState.currentRead = EngineState.targetRead;
      EngineState.currentPointer = EngineState.targetPointer;
      EngineState.isFirstFrame = false;
    } else {
      // Exponential decay smoothing
      const alphaScroll = 1.0 - Math.exp(-CONFIG.SCROLL_SMOOTHING * dt);
      const alphaPointer = 1.0 - Math.exp(-CONFIG.POINTER_SMOOTHING * dt);

      EngineState.currentProgress += (EngineState.targetProgress - EngineState.currentProgress) * alphaScroll;
      EngineState.currentRead += (EngineState.targetRead - EngineState.currentRead) * alphaScroll;
      EngineState.currentPointer += (EngineState.targetPointer - EngineState.currentPointer) * alphaPointer;

      // Snapping epsilon
      if (Math.abs(EngineState.targetProgress - EngineState.currentProgress) < 0.0003) {
        EngineState.currentProgress = EngineState.targetProgress;
      }
      if (Math.abs(EngineState.targetRead - EngineState.currentRead) < 0.0005) {
        EngineState.currentRead = EngineState.targetRead;
      }
      if (Math.abs(EngineState.targetPointer - EngineState.currentPointer) < 0.0008) {
        EngineState.currentPointer = EngineState.targetPointer;
      }
    }

    // Update visuals
    deriveVisualState(EngineState.currentProgress, EngineState.currentRead, EngineState.currentPointer);

    // Dispatch frame rendering
    renderActiveFrame();

    // Keep running until values settle
    if (
      EngineState.currentProgress !== EngineState.targetProgress ||
      EngineState.currentRead !== EngineState.targetRead ||
      EngineState.currentPointer !== EngineState.targetPointer
    ) {
      requestAnimationFrame(updatePhysicsTick);
    } else {
      EngineState.isRunning = false; // Idle: zero CPU/GPU overhead when static
    }
  }

  function startPhysicsLoop() {
    if (EngineState.isRunning || EngineState.isLeavingForTracks) return;
    EngineState.isRunning = true;
    EngineState.lastFrameTimestamp = performance.now();
    requestAnimationFrame(updatePhysicsTick);
  }

  function renderActiveFrame() {
    // Both renderers (WebGL canvas or SVG DOM fallback) consume the exact same VisualFrame
    if (window.__activeRenderer) {
      window.__activeRenderer.render(VisualFrame);
    }
  }

  // Export engine diagnostics
  window.__ANIMATION_ENGINE_READABLE = {
    CONFIG,
    GEOMETRY,
    EngineState,
    VisualFrame,
    deriveVisualState,
    computeDetachThreshold,
    artToStageCoords,
  };

  console.info("IEEE × IET Animation Engine (Readable Architecture) initialized.");
})();
