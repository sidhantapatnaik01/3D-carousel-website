'use strict';

import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

// ── CONFIG ──────────────────────────────────────────────
const TOTAL_FRAMES   = 121;
const CARD_RADIUS    = 560;   // orbit radius in CSS3D px units
const PARTICLE_COUNT = 2200;
const LERP           = 0.14;  // scroll momentum — higher = snappier response, less lag
const CARD_VISIBLE_START = 0.18;
const CARD_VISIBLE_END   = 0.82;
const SCROLL_EPSILON = 0.15;  // px — skip per-frame scroll-driven work below this delta

// ── DOM REFS ─────────────────────────────────────────────
const loadOverlay  = document.getElementById('load-overlay');
const scrollDriver = document.getElementById('scroll-driver');
const heroText     = document.getElementById('hero-text');
const progressFill = document.getElementById('progress-fill');
const stageDots    = document.querySelectorAll('.stage-dot');
const annotations  = document.querySelectorAll('.annotation');
const mobilePills  = document.querySelectorAll('.m-pill');
const frameCanvas   = document.getElementById('frame-canvas');
const ctx           = frameCanvas.getContext('2d');

// ── DEVICE DETECTION ─────────────────────────────────────
const isMobile = window.matchMedia('(max-width: 700px)').matches;

// ── CANVAS RESIZE ─────────────────────────────────────────
function resizeFrameCanvas() {
  frameCanvas.width  = window.innerWidth;
  frameCanvas.height = window.innerHeight;
}
resizeFrameCanvas();
window.addEventListener('resize', resizeFrameCanvas);

// ── DOT LABELS ────────────────────────────────────────────
stageDots.forEach(dot => {
  const label = document.createElement('span');
  label.className  = 'dot-label';
  label.textContent = dot.dataset.label;
  dot.appendChild(label);
});

// ── FRAME PRELOAD (decode → ImageBitmap so drawFrame is a pure GPU blit) ──
const frames = new Array(TOTAL_FRAMES); // ImageBitmap | undefined
const fallbackImgs = new Array(TOTAL_FRAMES); // <img> kept as fallback if createImageBitmap fails
let loadedCount = 0;
let minTimePassed = false;
const BOOT_FRAMES = 30; // dismiss loader after first 30 frames ready

for (let i = 0; i < TOTAL_FRAMES; i++) {
  const img = new Image();
  img.src = `frames/${String(i + 1).padStart(5, '0')}.jpg`;
  fallbackImgs[i] = img;
  const onReady = () => {
    loadedCount++;
    if (loadedCount >= BOOT_FRAMES && minTimePassed) dismissLoader();
  };
  // Prefer createImageBitmap (fully decoded, blits instantly). Fall back to <img>.
  if (typeof createImageBitmap === 'function') {
    img.decode()
      .then(() => createImageBitmap(img))
      .then(bmp => { frames[i] = bmp; onReady(); })
      .catch(() => { onReady(); /* drawFrame will use fallbackImgs[i] */ });
  } else {
    img.onload = onReady;
  }
}

setTimeout(() => {
  minTimePassed = true;
  if (loadedCount >= BOOT_FRAMES) dismissLoader();
}, 1400);
setTimeout(dismissLoader, 8000); // hard fallback

function dismissLoader() {
  if (!loadOverlay || loadOverlay.classList.contains('dismissed')) return;
  loadOverlay.classList.add('dismissed');
}

// ── DRAW FRAME ────────────────────────────────────────────
function drawFrame(idx) {
  const i = Math.max(0, Math.min(idx, TOTAL_FRAMES - 1));
  const bmp = frames[i];
  const cw = frameCanvas.width, ch = frameCanvas.height;
  if (bmp) {
    const scale = Math.min(cw / bmp.width, ch / bmp.height);
    const w = bmp.width * scale, h = bmp.height * scale;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bmp, (cw - w) / 2, (ch - h) / 2, w, h);
    return;
  }
  // Fallback: <img> not yet promoted to bitmap (or createImageBitmap unsupported)
  const img = fallbackImgs[i];
  if (!img || !img.complete || !img.naturalWidth) return;
  const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
}

// ── ROUTE ─────────────────────────────────────────────────
if (isMobile) {
  initMobile();
} else {
  initDesktop();
}

// ── SHARED SCROLL-REVEAL (runs on BOTH mobile & desktop) ──
// Must be outside initDesktop() — mobile path never called it, so
// .svc-card and .gallery-card stayed opacity:0 forever on phones.
(function initScrollReveal() {
  const svcCards = document.querySelectorAll('.svc-card');
  if (svcCards.length) {
    const cardObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in-view'); cardObs.unobserve(e.target); }
      });
    }, { threshold: 0.01 }); // Very low threshold for mobile responsiveness
    svcCards.forEach(c => cardObs.observe(c));
  }

  const galleryCards = document.querySelectorAll('.gallery-card');
  if (galleryCards.length) {
    const galObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in-view'); galObs.unobserve(e.target); }
      });
    }, { threshold: 0.01 }); // Very low threshold for mobile responsiveness
    galleryCards.forEach(c => galObs.observe(c));
  }
})();

// ═══════════════════════════════════════════════════════════
// DESKTOP PATH
// ═══════════════════════════════════════════════════════════
function initDesktop() {
  const canvasWrapper = document.getElementById('canvas-wrapper');

  // ── THREE.JS SETUP ──────────────────────────────────────
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 6000);
  camera.position.set(0, 0, 900);

  // WebGL renderer — particles only, transparent bg
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.domElement.id = 'three-canvas';
  canvasWrapper.appendChild(renderer.domElement);

  // CSS3D renderer — glass cards
  const css3dRenderer = new CSS3DRenderer();
  css3dRenderer.setSize(innerWidth, innerHeight);
  css3dRenderer.domElement.id = 'css3d-root';
  canvasWrapper.appendChild(css3dRenderer.domElement);

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    css3dRenderer.setSize(innerWidth, innerHeight);
  });

  // ── PARTICLES ───────────────────────────────────────────
  const posArr = new Float32Array(PARTICLE_COUNT * 3);
  const colArr = new Float32Array(PARTICLE_COUNT * 3);
  const vel    = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 320 + Math.random() * 480;
    posArr[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    posArr[i*3+1] = r * Math.cos(phi) * 0.38; // flatten vertically
    posArr[i*3+2] = r * Math.sin(phi) * Math.sin(theta);

    // 65% white, 25% gold, 10% teal
    const roll = Math.random();
    if      (roll < 0.65) { colArr[i*3]=1;    colArr[i*3+1]=1;    colArr[i*3+2]=1;    }
    else if (roll < 0.90) { colArr[i*3]=1;    colArr[i*3+1]=0.84; colArr[i*3+2]=0.08; }
    else                  { colArr[i*3]=0.05; colArr[i*3+1]=0.9;  colArr[i*3+2]=0.8;  }

    vel[i*3]   = (Math.random() - 0.5) * 0.18;
    vel[i*3+1] = (Math.random() - 0.5) * 0.09;
    vel[i*3+2] = (Math.random() - 0.5) * 0.18;
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  pGeo.setAttribute('color',    new THREE.BufferAttribute(colArr, 3));

  const pMat = new THREE.PointsMaterial({
    size: 2.8,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
  });
  scene.add(new THREE.Points(pGeo, pMat));

  function driftParticles() {
    const pos = pGeo.attributes.position;
    const WRAP = 820;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos.array[i*3]   += vel[i*3];
      pos.array[i*3+1] += vel[i*3+1];
      pos.array[i*3+2] += vel[i*3+2];
      // wrap around sphere boundary
      if (Math.abs(pos.array[i*3])   > WRAP) vel[i*3]   *= -1;
      if (Math.abs(pos.array[i*3+1]) > WRAP * 0.4) vel[i*3+1] *= -1;
      if (Math.abs(pos.array[i*3+2]) > WRAP) vel[i*3+2] *= -1;
    }
    pos.needsUpdate = true;
  }

  // ── CSS3D SERVICE CARDS ─────────────────────────────────
  const SERVICES = [
    { code: 'SVC_001', name: 'Bumper<br>Repair',     desc: 'Front and rear assembly restoration. OEM-grade replacement with factory-fit alignment.' },
    { code: 'SVC_002', name: 'Dent<br>Removal',      desc: 'Precision panel reshaping. No filler — factory tolerance correction.' },
    { code: 'SVC_003', name: 'Scratch<br>Repair',    desc: 'Surface cut and polish or full respray. Every scratch treated at the correct depth.' },
    { code: 'SVC_004', name: 'Panel<br>Paint',       desc: 'Computer-mixed colour-matched finish blended invisibly into adjacent panels.' },
    { code: 'SVC_005', name: 'Body<br>Polishing',    desc: 'Machine compound and glaze. Removes oxidation, swirl marks, surface damage.' },
    { code: 'SVC_006', name: 'Accident<br>Repair',   desc: 'Multi-panel collision restoration. Structural assessment and full refinish.' },
    { code: 'SVC_007', name: 'Exterior<br>Restore',  desc: 'Comprehensive overhaul — all panels, trim, glass seals, and chrome refinished.' },
    { code: 'SVC_008', name: 'Detailing<br>& Polish', desc: 'Full decontamination wash, clay bar treatment, machine polish, wax seal.' },
  ];

  const N = SERVICES.length;
  const cardGroup = new THREE.Group();
  scene.add(cardGroup);

  const cardObjects = SERVICES.map((svc) => {
    const el   = document.createElement('div');
    el.className = 'svc-card-3d';

    const name = document.createElement('h3');
    name.className = 'card-name';
    const [line1, line2] = svc.name.split('<br>');
    name.appendChild(document.createTextNode(line1));
    if (line2) { name.appendChild(document.createElement('br')); name.appendChild(document.createTextNode(line2)); }

    el.append(name);

    const obj = new CSS3DObject(el);
    scene.add(obj);
    return { obj, el };
  });

  function scrollEnvelope(p) {
    if (p < CARD_VISIBLE_START) return 0;
    if (p > CARD_VISIBLE_END)   return 0;
    const fade = 0.10;
    if (p < CARD_VISIBLE_START + fade) return (p - CARD_VISIBLE_START) / fade;
    if (p > CARD_VISIBLE_END   - fade) return (CARD_VISIBLE_END - p)   / fade;
    return 1;
  }

  const cardActiveState = new Array(N).fill(false);

  function updateCarousel(progress) {
    const env = scrollEnvelope(progress);
    const groupAngle = -progress * (Math.PI * 2 * (N - 1) / N);
    const ORBIT_OFFSET_X = 180;
    const ORBIT_OFFSET_Y = -20;

    cardObjects.forEach(({ obj, el }, i) => {
      const angle = (i / N) * Math.PI * 2 + groupAngle;
      const x = ORBIT_OFFSET_X + CARD_RADIUS * Math.sin(angle);
      const z = CARD_RADIUS * Math.cos(angle);
      const y = ORBIT_OFFSET_Y + Math.sin(angle * 2) * 30;

      obj.position.set(x, y, z);
      obj.rotation.y = -angle;

      const depth = (z + CARD_RADIUS) / (CARD_RADIUS * 2); // 0=back, 1=front
      obj.scale.setScalar(0.36 + depth * 0.42);

      // Smooth crossfade — cards ease in/out instead of binary on/off
      const t = Math.max(0, Math.min(1, (depth - 0.55) / 0.40));
      const eased = t * t * (3 - 2 * t); // smoothstep
      el.style.opacity = String(eased * env);

      const active = depth > 0.82 && env > 0.5;
      if (cardActiveState[i] !== active) {
        el.classList.toggle('card-active', active);
        cardActiveState[i] = active;
      }
    });
  }

  // ── SERVICES SECTION FADE ───────────────────────────────
  const servicesSection = document.getElementById('services-section');
  if (servicesSection && canvasWrapper) {
    new IntersectionObserver(([entry]) => {
      const opacity = entry.isIntersecting ? '0' : '1';
      canvasWrapper.style.opacity    = opacity;
      canvasWrapper.style.transition = 'opacity 0.7s ease';
      renderer.domElement.style.opacity    = opacity;
      css3dRenderer.domElement.style.opacity = opacity;
    }, { threshold: 0.05 }).observe(servicesSection);
  }

  // NOTE: .svc-card and .gallery-card scroll-reveal observers live in
  // the shared initScrollReveal() IIFE above — they run on both mobile & desktop.

  // ── MOUSE PARALLAX ──────────────────────────────────────
  const mouse = { tx: 0, ty: 0 };
  window.addEventListener('mousemove', e => {
    mouse.tx = (e.clientX / innerWidth  - 0.5) * 90;
    mouse.ty = -(e.clientY / innerHeight - 0.5) * 55;
  });

  // ── SMOOTH SCROLL STATE ──────────────────────────────────
  let smoothY = 0;
  let lastDrawnFrame = -1;
  let lastSmoothY = -1;
  let frameCounter = 0;

  function getProgress() {
    const driverH = scrollDriver.offsetHeight - window.innerHeight;
    return driverH > 0 ? Math.min(Math.max(smoothY / driverH, 0), 1) : 0;
  }

  // ── ANNOTATION STATE ────────────────────────────────────
  const annotationState = new Map();
  annotations.forEach(el => annotationState.set(el, 'hidden'));

  // ── RAF LOOP ─────────────────────────────────────────────
  function tick() {
    smoothY += (window.scrollY - smoothY) * LERP;
    frameCounter++;

    // Idle gate: skip scroll-driven DOM/scene work when smoothY hasn't moved.
    // Camera + particles still tick — they're driven by mouse + time, not scroll.
    if (Math.abs(smoothY - lastSmoothY) > SCROLL_EPSILON) {
      const p = getProgress();
      const targetFrame = Math.round(p * (TOTAL_FRAMES - 1));
      if (targetFrame !== lastDrawnFrame) {
        drawFrame(targetFrame);
        lastDrawnFrame = targetFrame;
      }
      updateHero(p);
      updateAnnotations(p);
      updateProgress(p);
      updateCarousel(p);
      lastSmoothY = smoothY;
    }

    // Throttle particle buffer upload to every other frame — halves GPU upload cost
    if ((frameCounter & 1) === 0) driftParticles();

    camera.position.x += (mouse.tx - camera.position.x) * 0.04;
    camera.position.y += (mouse.ty - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    css3dRenderer.render(scene, camera);

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

// ── HERO FADE ─────────────────────────────────────────────
let lastHeroT = -1;
function updateHero(p) {
  const fadeStart = 0.06;
  const fadeEnd   = 0.16;
  let t;
  if (p <= fadeStart)      t = 0;
  else if (p >= fadeEnd)   t = 1;
  else                     t = (p - fadeStart) / (fadeEnd - fadeStart);
  if (Math.abs(t - lastHeroT) < 0.002) return; // no perceptible change → skip writes
  lastHeroT = t;
  heroText.style.opacity   = String(1 - t);
  heroText.style.transform = `translateX(${-30 * t}px)`;
}

// ── ANNOTATIONS ───────────────────────────────────────────
const annotationStateGlobal = new Map();
annotations.forEach(el => annotationStateGlobal.set(el, 'hidden'));

function updateAnnotations(p) {
  annotations.forEach(el => {
    const start   = parseFloat(el.dataset.start);
    const end     = parseFloat(el.dataset.end);
    const prev    = annotationStateGlobal.get(el);
    const inRange = p >= start && p <= end;

    if (inRange && prev === 'hidden') {
      annotationStateGlobal.set(el, 'visible');
      el.style.transform = getBaseTransform(el);
      el.classList.add('is-visible');
      el.classList.remove('flicker');
      void el.offsetWidth;
      el.classList.add('flicker');
    } else if (!inRange && prev === 'visible') {
      annotationStateGlobal.set(el, 'hidden');
      el.classList.remove('is-visible', 'flicker');
      el.style.transform = `${getBaseTransform(el)} translateY(${p < start ? 8 : -8}px)`;
    }
  });
}

function getBaseTransform(el) {
  if (el.classList.contains('ann-bottom-center')) return 'translateX(-50%)';
  if (el.classList.contains('ann-left-center'))   return 'translateY(-50%)';
  return '';
}

// ── PROGRESS TRACK ────────────────────────────────────────
let lastProgressP = -1;
const dotActiveState = new WeakMap();
function updateProgress(p) {
  if (Math.abs(p - lastProgressP) > 0.001) {
    progressFill.style.transform = `scaleY(${p})`;
    lastProgressP = p;
  }
  stageDots.forEach(dot => {
    const should = p >= parseFloat(dot.dataset.pct);
    if (dotActiveState.get(dot) !== should) {
      dot.classList.toggle('active', should);
      dotActiveState.set(dot, should);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// MOBILE PATH — auto-plays frames at ~15fps, no Three.js
// ═══════════════════════════════════════════════════════════
const MOBILE_STAGE_THRESHOLDS = [0.0, 0.22, 0.41, 0.60, 0.90];

function initMobile() {
  const canvasWrapper = document.getElementById('canvas-wrapper');
  let smoothY = 0;
  let lastDrawn = -1;
  let lastSmooth = -1;
  const M_LERP = 0.12;

  function getMobileProgress() {
    const driverH = scrollDriver.offsetHeight - window.innerHeight;
    return driverH > 0 ? Math.min(Math.max(smoothY / driverH, 0), 1) : 0;
  }

  function mobileTick() {
    smoothY += (window.scrollY - smoothY) * M_LERP;
    const p = getMobileProgress();
    const targetFrame = Math.round(p * (TOTAL_FRAMES - 1));

    if (targetFrame !== lastDrawn) {
      drawFrame(targetFrame);
      lastDrawn = targetFrame;
    }

    if (Math.abs(smoothY - lastSmooth) > 0.1) {
      updateHero(p);
      updateAnnotations(p);
      updateProgress(p);
      updateMobilePills(p);
      lastSmooth = smoothY;
    }
    requestAnimationFrame(mobileTick);
  }
  requestAnimationFrame(mobileTick);

  const servicesSection = document.getElementById('services-section');
  if (servicesSection && canvasWrapper) {
    new IntersectionObserver(([entry]) => {
      const opacity = entry.isIntersecting ? '0' : '1';
      canvasWrapper.style.opacity    = opacity;
      canvasWrapper.style.transition = 'opacity 0.6s ease';
    }, { threshold: 0.05 }).observe(servicesSection);
  }
}

function updateMobilePills(p) {
  let activeIdx = 0;
  MOBILE_STAGE_THRESHOLDS.forEach((t, i) => { if (p >= t) activeIdx = i; });
  mobilePills.forEach((pill, i) => pill.classList.toggle('active', i === activeIdx));
}

// ═══════════════════════════════════════════════════════════
// POST-SCROLL INTERACTIONS (keep unchanged)
// ═══════════════════════════════════════════════════════════

// ── BEFORE / AFTER SLIDER ─────────────────────────────────
const baSection = document.getElementById('before-after-section');
const baHandle  = document.getElementById('ba-handle');

if (baSection && baHandle) {
  let dragging = false;

  function setSliderPos(clientX) {
    const rect = baSection.getBoundingClientRect();
    const pct  = Math.min(Math.max((clientX - rect.left) / rect.width, 0.05), 0.95);
    baSection.style.setProperty('--ba-pos', `${pct * 100}%`);
  }

  baHandle.addEventListener('mousedown',  () => { dragging = true; });
  window.addEventListener('mouseup',      () => { dragging = false; });
  window.addEventListener('mousemove', e => { if (dragging) setSliderPos(e.clientX); });

  baHandle.addEventListener('touchstart', e => { dragging = true; e.preventDefault(); }, { passive: false });
  window.addEventListener('touchend',     () => { dragging = false; });
  window.addEventListener('touchmove', e => {
    if (dragging && e.touches.length) setSliderPos(e.touches[0].clientX);
  }, { passive: true });

  baSection.addEventListener('click', e => {
    if (e.target !== baHandle) setSliderPos(e.clientX);
  });
}

// ── WHATSAPP FORM ─────────────────────────────────────────
const WHATSAPP_NUMBER = '919437000000'; // Replace with real Nabarangpur number

const estimateForm = document.getElementById('estimate-form');
if (estimateForm) {
  estimateForm.addEventListener('submit', e => {
    e.preventDefault();
    const name    = (estimateForm.querySelector('#f-name').value    || '').trim();
    const phone   = (estimateForm.querySelector('#f-phone').value   || '').trim();
    const service = (estimateForm.querySelector('#f-service').value || '').trim();
    const msg     = (estimateForm.querySelector('#f-msg').value     || '').trim();

    if (!name || !phone) {
      const nameEl  = estimateForm.querySelector('#f-name');
      const phoneEl = estimateForm.querySelector('#f-phone');
      if (!name  && nameEl)  { nameEl.focus();  nameEl.reportValidity(); return; }
      if (!phone && phoneEl) { phoneEl.focus(); phoneEl.reportValidity(); return; }
      return;
    }

    const text = [
      `*New Repair Request — Maruti Care Nabarangpur*`,
      ``,
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Service: ${service || 'Not specified'}`,
      msg ? `Details: ${msg}` : '',
    ].filter(Boolean).join('\n');

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  });
}

// ── ANCHOR SMOOTH SCROLL ──────────────────────────────────
// scroll-behavior:auto is required for the frame-scrub hero, so anchor links
// get programmatic smooth scroll instead of the CSS property
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});
