/**
 * JalSanchay Interactive Water Engine (Optimized for Mac 120Hz ProMotion & Trackpad Scroll)
 * - High-level moving waves when at top of page (hero)
 * - Drains/lowers to bottom of viewport on scroll and stays docked as a persistent reservoir
 * - Continuous fluid harmonic waves
 * - Click near the surface: realistic water splash with airborne spray droplets & wave recoil
 * - Click under water: NO airborne splash; flow is interrupted with depth-dependent vortex,
 *   subsurface pressure shockwave, depth-damped surface ripple, and buoyant rising air bubbles
 * - Click in air above water: raindrop drops into water creating secondary ripples
 * - Mac/Retina performance optimizations:
 *   * Zero layout thrashing (cached geometry, passive scroll listener)
 *   * Capped DPR & 10px column spacing for silky 120fps rendering
 *   * Bypasses clip-path math when text is above or below the water surface
 *   * Hardware CALayer acceleration with zero SVG CPU re-rasterization
 */

(function () {
  'use strict';

  // Constants & Physics Parameters
  const TENSION = 0.024;        // Spring stiffness of water surface
  const DAMPENING = 0.038;      // Viscous damping of wave oscillation
  const SPREAD = 0.25;          // Wave dispersion rate to neighbor columns
  const GRID_SPACING = 10;      // 10px spacing for 120fps fluid performance on Mac
  const NUM_PASSES = 2;         // 2 passes of surface wave dispersion
  const BOTTOM_WATER_HEIGHT = 80; // Height of water reservoir at bottom (px)

  let canvas, ctx;
  let width = 0;
  let height = 0;
  let dpr = 1;

  // Water column array
  let columns = [];
  let leftDeltas = [];
  let rightDeltas = [];

  // Water level state
  let currentBaseWaterY = 120;
  let targetBaseWaterY = 120;

  // Scroll tracking (passive, zero DOM query overhead)
  let currentScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  window.addEventListener('scroll', () => {
    currentScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  }, { passive: true });

  // Dynamic entities
  const splashParticles = [];
  const disturbances = [];
  const bubbles = [];
  const fallingDrops = [];

  // Spring column class
  class WaterColumn {
    constructor(x, targetHeight) {
      this.x = x;
      this.targetHeight = targetHeight;
      this.height = targetHeight;
      this.speed = 0;
    }

    update() {
      const diff = this.targetHeight - this.height;
      this.speed += TENSION * diff - this.speed * DAMPENING;
      this.height += this.speed;
    }
  }

  // Airborne splash droplet particle (ONLY on top surface click)
  class SplashParticle {
    constructor(x, y, vx, vy, radius, color) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.radius = radius;
      this.color = color;
      this.alpha = 1;
      this.gravity = 0.36;
      this.dead = false;
    }

    update(surfaceY) {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += this.gravity;
      this.vx *= 0.985;

      // When falling droplet hits the water surface
      if (this.vy > 0 && this.y >= surfaceY) {
        this.dead = true;
        return true; // triggers a tiny micro-ripple
      }

      if (this.y > height + 60 || this.x < -40 || this.x > width + 40) {
        this.dead = true;
      }
      return false;
    }

    draw(c) {
      c.save();
      c.globalAlpha = Math.max(0, this.alpha);
      c.fillStyle = this.color;
      c.beginPath();
      c.arc(this.x, this.y, Math.max(0.6, this.radius), 0, Math.PI * 2);
      c.fill();

      // Specular highlight
      if (this.radius > 2) {
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.32, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
  }

  // Raindrop falling from air into water when user clicks above the water line
  class FallingDrop {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vy = 2;
      this.gravity = 0.45;
      this.dead = false;
    }

    update(surfaceY) {
      this.y += this.vy;
      this.vy += this.gravity;
      if (this.y >= surfaceY) {
        this.dead = true;
        return true; // triggers water impact
      }
      return false;
    }

    draw(c) {
      c.save();
      c.strokeStyle = 'rgba(210, 248, 255, 0.85)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(this.x, this.y - 7);
      c.lineTo(this.x, this.y);
      c.stroke();
      c.restore();
    }
  }

  // Underwater Flow Disturbance (Shockwave + Vortex swirl, NO airborne splash)
  class UnderwaterDisturbance {
    constructor(x, y, depth, depthFraction) {
      this.x = x;
      this.y = y;
      this.depth = depth;
      this.depthFraction = depthFraction; // 0 (near surface) to 1 (near bottom)
      this.radius = 4;
      this.maxRadius = 35 + depthFraction * 40;
      this.alpha = 0.85;
      this.rotation = Math.random() * Math.PI * 2;
      this.swirlSpeed = (Math.random() > 0.5 ? 1 : -1) * (1.8 + depthFraction * 1.5);
      this.dead = false;
    }

    update() {
      this.radius += 1.6;
      this.rotation += 0.04 * this.swirlSpeed;
      this.alpha = Math.max(0, 1 - (this.radius / this.maxRadius));
      if (this.radius >= this.maxRadius) {
        this.dead = true;
      }
    }

    draw(c) {
      c.save();
      // Expanding pressure ring
      c.beginPath();
      c.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      c.strokeStyle = `rgba(186, 230, 253, ${this.alpha * 0.8})`;
      c.lineWidth = Math.max(0.8, 2.5 * (1 - this.radius / this.maxRadius));
      c.stroke();

      // Secondary echo wave ring
      if (this.radius > 12) {
        c.beginPath();
        c.arc(this.x, this.y, this.radius * 0.65, 0, Math.PI * 2);
        c.strokeStyle = `rgba(147, 197, 253, ${this.alpha * 0.45})`;
        c.lineWidth = 1.4;
        c.stroke();
      }

      // Swirl vortex filaments showing interrupted water current
      const arms = 4;
      for (let a = 0; a < arms; a++) {
        const ang = this.rotation + (a * Math.PI * 2) / arms;
        const r1 = this.radius * 0.2;
        const r2 = this.radius * 0.9;
        c.beginPath();
        c.moveTo(this.x + Math.cos(ang) * r1, this.y + Math.sin(ang) * r1);
        c.quadraticCurveTo(
          this.x + Math.cos(ang + 0.45) * (r1 + r2) * 0.55,
          this.y + Math.sin(ang + 0.45) * (r1 + r2) * 0.55,
          this.x + Math.cos(ang + 0.9) * r2,
          this.y + Math.sin(ang + 0.9) * r2
        );
        c.strokeStyle = `rgba(125, 211, 252, ${this.alpha * 0.6})`;
        c.lineWidth = 1.6;
        c.stroke();
      }
      c.restore();
    }
  }

  // Buoyant rising air bubble
  class Bubble {
    constructor(x, y) {
      this.x = x + (Math.random() - 0.5) * 22;
      this.y = y + (Math.random() - 0.5) * 10;
      this.radius = Math.random() * 3.8 + 2.2;
      this.vy = -Math.random() * 2.2 - 1.2;
      this.wobblePhase = Math.random() * Math.PI * 2;
      this.wobbleSpeed = Math.random() * 3.5 + 2.5;
      this.wobbleAmp = Math.random() * 1.2 + 0.5;
      this.alpha = 0.85;
      this.dead = false;
    }

    update(surfaceY) {
      this.y += this.vy;
      this.x += Math.sin(this.y * 0.05 + this.wobblePhase) * this.wobbleAmp;
      if (this.y <= surfaceY) {
        this.dead = true;
        return true; // popped at surface
      }
      return false;
    }

    draw(c) {
      c.save();
      c.strokeStyle = `rgba(224, 242, 254, ${this.alpha * 0.9})`;
      c.lineWidth = 1.2;
      c.fillStyle = `rgba(186, 230, 253, ${this.alpha * 0.3})`;
      c.beginPath();
      c.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      c.fill();
      c.stroke();

      // Specular gleam
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(this.x - this.radius * 0.35, this.y - this.radius * 0.35, this.radius * 0.3, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }

  // Initialize or resize water columns
  function initColumns() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const numCols = Math.ceil(width / GRID_SPACING) + 2;
    columns = new Array(numCols);
    leftDeltas = new Array(numCols).fill(0);
    rightDeltas = new Array(numCols).fill(0);

    const initialY = computeTargetWaterLevel();
    currentBaseWaterY = initialY;
    targetBaseWaterY = initialY;

    for (let i = 0; i < numCols; i++) {
      columns[i] = new WaterColumn(i * GRID_SPACING, initialY);
    }
  }

  let cachedTextRect = null;
  function updateCachedTextRect() {
    const container = document.getElementById('waterTextContainer');
    if (!container) return;
    const r = container.getBoundingClientRect();
    const scrollY = currentScrollY;
    cachedTextRect = {
      left: r.left,
      topDoc: r.top + scrollY,
      width: r.width,
      height: r.height,
    };
  }

  // Calculate target water level based on scroll position (zero layout thrashing)
  function computeTargetWaterLevel() {
    const scrollY = currentScrollY;
    const vh = window.innerHeight;

    // At top of page: align water line through line 3 ("Harvesting")
    let topWaterY = Math.max(160, vh * 0.48);
    if (!cachedTextRect) {
      updateCachedTextRect();
    }
    if (cachedTextRect) {
      topWaterY = cachedTextRect.topDoc + cachedTextRect.height * 0.78;
    }

    // Bottom water reservoir dock position in document coordinates
    const bottomWaterY = scrollY + vh - BOTTOM_WATER_HEIGHT;

    // Transition distance: smoothly lowers over first 450px of scroll
    const transitionRange = Math.min(vh * 0.75, 450);
    const progress = Math.min(1, Math.max(0, scrollY / transitionRange));

    // Smoothstep easing (3x^2 - 2x^3)
    const eased = progress * progress * (3 - 2 * progress);
    const docTargetY = topWaterY + (bottomWaterY - topWaterY) * eased;
    return docTargetY - scrollY;
  }

  // Find column index closest to an X coordinate
  function getColumnIndex(x) {
    const idx = Math.round(x / GRID_SPACING);
    return Math.max(0, Math.min(columns.length - 1, idx));
  }

  // Get current water surface Y elevation at coordinate X
  function getSurfaceY(x) {
    if (!columns || columns.length === 0) return currentBaseWaterY;
    const idx = getColumnIndex(x);
    return columns[idx].height;
  }

  // Trigger surface splash (ONLY on top surface click)
  function triggerSurfaceSplash(clickX, clickY, surfaceY) {
    const centerIdx = getColumnIndex(clickX);

    // 1. Physical wave displacement along the surface
    const radius = 8;
    for (let j = -radius; j <= radius; j++) {
      const idx = centerIdx + j;
      if (idx >= 0 && idx < columns.length) {
        const falloff = Math.cos((j / radius) * (Math.PI * 0.5));
        columns[idx].speed += 22 * falloff;
      }
    }

    // 2. High-energy airborne water spray particles (bursting upward)
    const particleCount = 32 + Math.floor(Math.random() * 12);
    const dropletPalette = ['#ffffff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0284c7'];

    for (let p = 0; p < particleCount; p++) {
      const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.5;
      const speed = Math.random() * 9.5 + 3.5;
      const vx = Math.cos(angle) * speed + (Math.random() - 0.5) * 2;
      const vy = Math.sin(angle) * speed;
      const pr = Math.random() * 3.5 + 1.2;
      const col = dropletPalette[Math.floor(Math.random() * dropletPalette.length)];

      splashParticles.push(new SplashParticle(
        clickX + (Math.random() - 0.5) * 16,
        surfaceY - Math.random() * 4,
        vx,
        vy,
        pr,
        col
      ));
    }

    // 3. Central upward water jet / splash crown
    for (let c = 0; c < 3; c++) {
      splashParticles.push(new SplashParticle(
        clickX + (Math.random() - 0.5) * 6,
        surfaceY - 2,
        (Math.random() - 0.5) * 1.8,
        -Math.random() * 5.5 - 9.0, // High vertical shoot
        Math.random() * 2.5 + 2.5,
        '#ffffff'
      ));
    }
  }

  // Trigger underwater disturbance (Clicking UNDER the water)
  // No airborne splash; flow interrupted depending on depth
  function triggerUnderwaterDisturbance(clickX, clickY, surfaceY) {
    const depth = clickY - surfaceY;
    const waterColumnHeight = Math.max(10, height - surfaceY);
    const depthFraction = Math.min(1, Math.max(0.05, depth / waterColumnHeight));

    // 1. Surface disturbance: exponentially dampened by depth
    const dampFactor = Math.max(0.04, Math.exp(-depth / 65));
    const surfaceImpulse = 18 * dampFactor;
    const centerIdx = getColumnIndex(clickX);
    const radius = Math.round(6 + depthFraction * 5);

    for (let j = -radius; j <= radius; j++) {
      const idx = centerIdx + j;
      if (idx >= 0 && idx < columns.length) {
        const falloff = Math.cos((j / radius) * (Math.PI * 0.5));
        columns[idx].speed += surfaceImpulse * falloff;
      }
    }

    // 2. Underwater flow disruption (Shockwave vortex at click point)
    disturbances.push(new UnderwaterDisturbance(clickX, clickY, depth, depthFraction));

    // 3. Rising air bubbles streaming up from click location
    const bubbleCount = Math.floor(6 + depthFraction * 8);
    for (let b = 0; b < bubbleCount; b++) {
      bubbles.push(new Bubble(clickX, clickY));
    }
  }

  // Handle pointer / click interaction
  function handlePointer(clientX, clientY) {
    if (!columns || columns.length === 0) return;

    const surfaceY = getSurfaceY(clientX);
    const depth = clientY - surfaceY;

    // Check interaction zone:
    // Case 1: Clicking way above water line (in the air)
    if (depth < -35) {
      fallingDrops.push(new FallingDrop(clientX, clientY));
      return;
    }

    // Case 2: Clicking ON THE TOP OF THE WATER (surface zone: within 30px of surface)
    if (depth >= -35 && depth <= 30) {
      triggerSurfaceSplash(clientX, clientY, surfaceY);
      return;
    }

    // Case 3: Clicking UNDER THE WATER (depth > 30px)
    if (depth > 30) {
      triggerUnderwaterDisturbance(clientX, clientY, surfaceY);
    }
  }

  // Synchronize text clipping polygons with physical water waves
  let lastClipUpdateTime = 0;
  let textIsSubmerged = false;
  let textIsAboveWater = false;

  function updateTextWaterClipping(now) {
    if (!cachedTextRect) updateCachedTextRect();
    if (!cachedTextRect || cachedTextRect.height <= 0 || cachedTextRect.width <= 0) return;

    const titleAbove = document.getElementById('titleAbove');
    const titleUnder = document.getElementById('titleUnder');
    if (!titleAbove || !titleUnder) return;

    const rectTopView = cachedTextRect.topDoc - currentScrollY;
    const rectBottomView = rectTopView + cachedTextRect.height;

    // Fast Path 1: Water is completely below the text (e.g. user scrolled down)
    // Title is entirely in the air — zero polygon math, zero style invalidation
    if (currentBaseWaterY > rectBottomView + 15) {
      if (!textIsAboveWater) {
        titleAbove.style.clipPath = 'none';
        titleAbove.style.display = 'block';
        titleUnder.style.display = 'none';
        textIsAboveWater = true;
        textIsSubmerged = false;
      }
      return;
    }

    // Fast Path 2: Water is completely above the text (submerged)
    if (currentBaseWaterY < rectTopView - 15) {
      if (!textIsSubmerged) {
        titleAbove.style.display = 'none';
        titleUnder.style.display = 'block';
        titleUnder.style.clipPath = 'none';
        textIsSubmerged = true;
        textIsAboveWater = false;
      }
      return;
    }

    // Transition state: Water is slicing through the headline
    textIsAboveWater = false;
    textIsSubmerged = false;
    titleAbove.style.display = 'block';
    titleUnder.style.display = 'block';

    // Throttle polygon updates to ~35fps to maintain 120fps scroll responsiveness
    if (now - lastClipUpdateTime < 28) return;
    lastClipUpdateTime = now;

    const rectHeight = cachedTextRect.height;
    const rectLeft = cachedTextRect.left;
    const rectWidth = cachedTextRect.width;

    const steps = 10;
    let underPoly = 'polygon(';
    const abovePoints = [];

    for (let s = 0; s <= steps; s++) {
      const pctX = (s / steps) * 100;
      const screenX = rectLeft + (rectWidth * s) / steps;
      const waveY = getSurfaceY(screenX);
      const pctY = ((waveY - rectTopView) / rectHeight) * 100;

      underPoly += `${pctX.toFixed(1)}% ${pctY.toFixed(1)}%, `;
      abovePoints.push({ x: pctX, y: pctY });
    }

    underPoly += '100% 120%, 0% 120%)';

    let abovePoly = 'polygon(0% -20%, 100% -20%, ';
    for (let i = abovePoints.length - 1; i >= 0; i--) {
      abovePoly += `${abovePoints[i].x.toFixed(1)}% ${abovePoints[i].y.toFixed(1)}%`;
      if (i > 0) abovePoly += ', ';
    }
    abovePoly += ')';

    titleUnder.style.clipPath = underPoly;
    titleAbove.style.clipPath = abovePoly;
  }

  // Scroll-driven centering & enlargement of "Get Started" button and the flow chart
  // Scroll-driven sequential choreography:
  // Phase 1 (0px - 150px): Get bigger in place first!
  // Phase 2 (130px - 360px): Then glide to the horizontal center of the page!
  // Phase 3 (> 360px): Stays centered and large as the page naturally moves next!
  let ctaGroupEl = null;
  let heroActionsEl = null;
  let lastCtaScrollY = -999;

  function updateHeroCtaScrollAnimation(scrollY) {
    if (!ctaGroupEl) ctaGroupEl = document.getElementById('heroCtaGroup');
    if (!heroActionsEl) heroActionsEl = document.getElementById('heroActions');
    if (!ctaGroupEl) return;

    if (scrollY === lastCtaScrollY && scrollY > 450) return;
    lastCtaScrollY = scrollY;

    // Phase 1: Grow bigger first (0px to 150px scroll)
    const growRange = 150;
    const growProgress = Math.min(1, Math.max(0, scrollY / growRange));
    const scaleEased = growProgress * growProgress * (3 - 2 * growProgress);

    // Phase 2: Slide to center next (130px to 360px scroll)
    const centerStart = 130;
    const centerEnd = 360;
    const centerProgress = Math.min(1, Math.max(0, (scrollY - centerStart) / (centerEnd - centerStart)));
    const centerEased = centerProgress * centerProgress * (3 - 2 * centerProgress);

    const vpWidth = window.innerWidth;
    const paddingLeft = vpWidth * 0.06; // matching hero padding 6vw
    const flowBaseWidth = Math.min(vpWidth * 0.88, 820);

    // Max scale up to 1.22x (capped on small screens so it never overflows)
    const maxScale = Math.min(1.22, Math.max(1.04, (vpWidth - 28) / flowBaseWidth));
    const currentScale = 1 + (maxScale - 1) * scaleEased;

    // Center calculation:
    // When scaled by currentScale from origin 0 0:
    // Scaled width = flowBaseWidth * currentScale
    // Target left margin on screen = (vpWidth - scaledWidth) * 0.5
    // Initial left margin on screen = paddingLeft
    // Therefore required horizontal translation = (vpWidth - scaledWidth) * 0.5 - paddingLeft
    const scaledWidth = flowBaseWidth * currentScale;
    const targetShiftX = ((vpWidth - scaledWidth) * 0.5) - paddingLeft;
    // Shift is driven exclusively by centerEased (Phase 2)
    const currentShiftX = targetShiftX * centerEased;

    // Also center the "Get Started" button over the flow chart in Phase 2
    // Flow chart center is flowBaseWidth / 2; dynamically measure button width
    const btnElem = heroActionsEl ? heroActionsEl.firstElementChild : null;
    const btnWidth = btnElem ? btnElem.offsetWidth : 215;
    const buttonTargetShiftX = Math.max(0, (flowBaseWidth - btnWidth) * 0.5);
    const currentButtonShiftX = buttonTargetShiftX * centerEased;

    ctaGroupEl.style.transform = `translate3d(${currentShiftX.toFixed(2)}px, 0, 0) scale(${currentScale.toFixed(3)})`;
    if (heroActionsEl) {
      heroActionsEl.style.transform = `translate3d(${currentButtonShiftX.toFixed(2)}px, 0, 0)`;
    }
  }

  // Main animation render loop
  function animate(now) {
    requestAnimationFrame(animate);

    if (document.hidden) return;
    if (!columns || columns.length === 0) return;

    // 1. Update target water level from scroll (smooth, direct translation with zero bounce)
    const prevBaseWaterY = currentBaseWaterY;
    targetBaseWaterY = computeTargetWaterLevel();
    currentBaseWaterY = targetBaseWaterY;

    const deltaY = currentBaseWaterY - prevBaseWaterY;
    if (Math.abs(deltaY) > 0.001) {
      for (let i = 0; i < columns.length; i++) {
        columns[i].height += deltaY;
        columns[i].speed *= 0.5; // Damp out vertical velocity from scroll
      }
    }

    // Scroll-driven centering & scaling on the CTA button & flow chart
    updateHeroCtaScrollAnimation(currentScrollY);

    // 2. Harmonic natural wave oscillation on column equilibrium targets
    const timeSec = now * 0.0016;
    for (let i = 0; i < columns.length; i++) {
      const cx = columns[i].x;
      const waveOffset = Math.sin(cx * 0.008 + timeSec * 2.2) * 5.2
                       + Math.cos(cx * 0.018 - timeSec * 1.5) * 3.2;
      columns[i].targetHeight = currentBaseWaterY + waveOffset;
      columns[i].update();
    }

    // 3. Propagate surface tension waves across neighbors
    for (let p = 0; p < NUM_PASSES; p++) {
      for (let i = 0; i < columns.length; i++) {
        if (i > 0) {
          leftDeltas[i] = SPREAD * (columns[i].height - columns[i - 1].height);
          columns[i - 1].speed += leftDeltas[i];
        }
        if (i < columns.length - 1) {
          rightDeltas[i] = SPREAD * (columns[i].height - columns[i + 1].height);
          columns[i + 1].speed += rightDeltas[i];
        }
      }
      for (let i = 0; i < columns.length; i++) {
        if (i > 0) columns[i - 1].height += leftDeltas[i];
        if (i < columns.length - 1) columns[i + 1].height += rightDeltas[i];
      }
    }

    // Synchronize text split and refraction with current wave curvature
    updateTextWaterClipping(now);

    // 4. Clear Canvas
    ctx.clearRect(0, 0, width, height);

    // 5. Draw Background Parallax Wave Layer (Darker oceanic blue, offset for 3D depth)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, height);
    const bgOffset = Math.sin(timeSec * 1.2) * 5;
    ctx.lineTo(0, columns[0].height - 6 + bgOffset);

    for (let i = 1; i < columns.length; i++) {
      const prev = columns[i - 1];
      const curr = columns[i];
      const midX = (prev.x + curr.x) * 0.5;
      const midY = (prev.height + curr.height) * 0.5 - 6 + bgOffset;
      ctx.quadraticCurveTo(prev.x, prev.height - 6 + bgOffset, midX, midY);
    }
    ctx.lineTo(width, columns[columns.length - 1].height - 6 + bgOffset);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(5, 75, 170, 0.40)';
    ctx.fill();
    ctx.restore();

    // 6. Draw Main Liquid Water Body
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, columns[0].height);

    for (let i = 1; i < columns.length; i++) {
      const prev = columns[i - 1];
      const curr = columns[i];
      const midX = (prev.x + curr.x) * 0.5;
      const midY = (prev.height + curr.height) * 0.5;
      ctx.quadraticCurveTo(prev.x, prev.height, midX, midY);
    }
    ctx.lineTo(width, columns[columns.length - 1].height);
    ctx.lineTo(width, height);
    ctx.closePath();

    // Luxurious oceanic blue gradient matching reference
    const grad = ctx.createLinearGradient(0, currentBaseWaterY - 35, 0, height);
    grad.addColorStop(0, 'rgba(20, 136, 240, 0.88)');   // Vibrant oceanic blue surface
    grad.addColorStop(0.25, 'rgba(12, 108, 212, 0.92)'); // Rich royal blue mid depth
    grad.addColorStop(0.65, 'rgba(4, 76, 170, 0.96)');   // Deep oceanic navy
    grad.addColorStop(1, 'rgba(2, 48, 125, 0.99)');      // Abyssal deep navy
    ctx.fillStyle = grad;
    ctx.fill();

    // Surface Glowing Crest Highlight (dual-pass GPU stroke, zero CPU blur)
    ctx.beginPath();
    ctx.moveTo(0, columns[0].height);
    for (let i = 1; i < columns.length; i++) {
      const prev = columns[i - 1];
      const curr = columns[i];
      const midX = (prev.x + curr.x) * 0.5;
      const midY = (prev.height + curr.height) * 0.5;
      ctx.quadraticCurveTo(prev.x, prev.height, midX, midY);
    }
    // Outer glow
    ctx.strokeStyle = 'rgba(140, 220, 255, 0.45)';
    ctx.lineWidth = 5.2;
    ctx.stroke();

    // Inner bright crest line
    ctx.strokeStyle = 'rgba(235, 252, 255, 0.95)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();

    // 7. Subsurface Light Caustics / Ribbons (smooth alpha, no GPU state toggles)
    const causticCount = 2;
    for (let c = 0; c < causticCount; c++) {
      const cy = currentBaseWaterY + 30 + c * 26 + Math.sin(timeSec + c) * 6;
      if (cy < height - 12) {
        ctx.beginPath();
        ctx.moveTo(0, cy);
        for (let x = 0; x <= width; x += 40) {
          const caY = cy + Math.sin(x * 0.02 + timeSec * 2.2 + c) * 5;
          ctx.lineTo(x, caY);
        }
        ctx.strokeStyle = `rgba(186, 230, 253, ${0.08 + c * 0.04})`;
        ctx.lineWidth = 14 + c * 4;
        ctx.stroke();
      }
    }

    // 8. Update & Draw Underwater Flow Disturbances
    for (let i = disturbances.length - 1; i >= 0; i--) {
      const d = disturbances[i];
      d.update();
      d.draw(ctx);
      if (d.dead) disturbances.splice(i, 1);
    }

    // 9. Update & Draw Rising Bubbles
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      const sY = getSurfaceY(b.x);
      const popped = b.update(sY);
      b.draw(ctx);

      if (popped) {
        // Small pop ripple on surface
        const colIdx = getColumnIndex(b.x);
        if (colIdx >= 0 && colIdx < columns.length) {
          columns[colIdx].speed -= 3.5;
        }
      }
      if (b.dead) bubbles.splice(i, 1);
    }

    // 10. Update & Draw Falling Drops (from clicks in air above water)
    for (let i = fallingDrops.length - 1; i >= 0; i--) {
      const drop = fallingDrops[i];
      const sY = getSurfaceY(drop.x);
      const hit = drop.update(sY);
      drop.draw(ctx);

      if (hit) {
        triggerSurfaceSplash(drop.x, sY, sY);
      }
      if (drop.dead) fallingDrops.splice(i, 1);
    }

    // 11. Update & Draw Splash Particles (Droplets in air)
    for (let i = splashParticles.length - 1; i >= 0; i--) {
      const p = splashParticles[i];
      const sY = getSurfaceY(p.x);
      const splashed = p.update(sY);
      p.draw(ctx);

      if (splashed) {
        // Secondary micro-ripple when drop re-enters water
        const colIdx = getColumnIndex(p.x);
        if (colIdx >= 0 && colIdx < columns.length) {
          columns[colIdx].speed += 2.5;
        }
      }
      if (p.dead) splashParticles.splice(i, 1);
    }
  }

  // Setup DOM & Listeners
  function init() {
    canvas = document.getElementById('waterCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'waterCanvas';
      canvas.className = 'water-canvas no-print';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.prepend(canvas);
    }

    ctx = canvas.getContext('2d');
    initColumns();

    updateCachedTextRect();

    // Smooth scrolling specifically for anchor clicks (preserves 120fps native trackpad scroll)
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', function (e) {
        const hash = this.getAttribute('href');
        if (hash === '#' || hash === '#planner') return;
        const target = document.querySelector(hash);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // Window Resize listener
    window.addEventListener('resize', () => {
      initColumns();
      updateCachedTextRect();
      lastCtaScrollY = -999;
      updateHeroCtaScrollAnimation(currentScrollY);
    });

    // Pointer Interaction Listener (Mouse, Touch, Pen)
    window.addEventListener('pointerdown', (e) => {
      handlePointer(e.clientX, e.clientY);
    }, { passive: true });

    // Subtle cursor ripple when hovering/moving over the water surface
    let lastMoveTime = 0;
    window.addEventListener('pointermove', (e) => {
      const now = performance.now();
      if (now - lastMoveTime < 45) return;
      lastMoveTime = now;

      if (!columns || columns.length === 0) return;
      const sY = getSurfaceY(e.clientX);
      if (Math.abs(e.clientY - sY) < 18) {
        const cIdx = getColumnIndex(e.clientX);
        if (cIdx >= 0 && cIdx < columns.length) {
          columns[cIdx].speed += (e.movementY || 1) * 1.5;
        }
      }
    }, { passive: true });

    // Start Animation Loop
    requestAnimationFrame(animate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
