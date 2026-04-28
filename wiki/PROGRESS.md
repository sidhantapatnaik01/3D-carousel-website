# Maruti Care Nabarangpur — How This Site Works

This is a single-page marketing site for a Maruti Suzuki body repair shop in Nabarangpur, Odisha. It's three files: `index.html`, `style.css`, `main.js`. No framework, no build step, no dependencies beyond three Google Fonts and Three.js (loaded from unpkg CDN). You can open it directly in a browser.

The conceit of the site is that a car disassembly frame sequence scrubs as you scroll — as the user scrolls down through 600vh of empty space, you step through 121 JPEG frames of the car being taken apart. This sounds fancy but the implementation is about 15 lines of JavaScript once you understand the trick.

---

## The Core Trick: Scroll-Scrubbed Frame Sequence

The entire hero is built around one insight: you can step through an image sequence by mapping scroll position to a frame index. No video element, no `currentTime` — just 121 pre-decoded `ImageBitmap` objects blitted to a `<canvas>` on every animation frame.

The scroll architecture uses two nested elements:

```
#scroll-driver   → height: 600vh, position: relative (creates scroll space)
  #canvas-wrapper  → position: fixed, inset: 0 (stays glued to viewport)
    <canvas id="frame-canvas">  → fills the wrapper, draws the current frame
```

The user scrolls through 600vh of empty space. `#canvas-wrapper` stays pinned. We read `window.scrollY` and divide by `scrollDriver.offsetHeight - window.innerHeight` to get a 0→1 progress value (`getProgress()`), then multiply by `TOTAL_FRAMES - 1` to get the target frame index.

Why `scrollDriver.offsetHeight - window.innerHeight` instead of `document.body.scrollHeight - window.innerHeight`? Because after the 600vh scroll driver, there are more sections below. Using the driver's own height as the denominator means the sequence completes exactly as the user exits the hero — not at some partial point mid-scroll.

### ImageBitmap Pre-decode

All 121 frames are decoded to `ImageBitmap` at load time via `img.decode().then(() => createImageBitmap(img))`. This eliminates the lazy-JPEG-decode hitches that caused jitter during fast scroll. `drawFrame()` blits the bitmap with `ctx.drawImage(bmp, x, y, w, h)` — microseconds per frame. If a bitmap isn't ready yet (first few frames during load), it falls back to the raw `<img>` element.

### Scroll Smoothing and Idle Gate

`smoothY` lerps toward `window.scrollY` every rAF tick at `LERP = 0.14` (was 0.072 — doubled for snappier feel). The desktop `tick()` loop only runs the expensive per-frame work (frame draw, hero fade, annotations, progress bar, carousel) when `Math.abs(smoothY - lastSmoothY) > SCROLL_EPSILON` (0.15px). When scroll is idle, only Three.js camera lerp and particle drift run — no DOM writes.

### The rAF vs CSS Transition Problem

A key performance fix: never put CSS `transition:` on properties that are written by `requestAnimationFrame` every frame. The original site had `transition: opacity 0.3s ease, transform 0.3s ease` on `#hero-text` and `transition: height 0.05s linear` on `#progress-fill`. These transitions try to interpolate toward each new value the rAF just set, causing rubber-banding and interference patterns. The fix: remove transitions from rAF-driven elements. CSS transitions are for user-interaction states (hover, focus) only.

The progress bar was also changed from `height: %` (causes reflow) to `transform: scaleY()` (GPU-composited, zero reflow cost).

---

## Loading Screen

The boot overlay (`#load-overlay`) sits at `z-index: 200`, covering everything. It has a brand name, a 1px progress bar, and a blinking cursor status line.

The progress bar animates from 0% to 100% in 1.4s via CSS keyframe. The JS dismissal logic is a two-gate system: the overlay doesn't disappear until both `loadedCount >= BOOT_FRAMES` (first 10 frames decoded) AND `minTimePassed` (1.4s setTimeout). A hard 7s fallback dismisses it regardless if frames stall. On dismissal, `.dismissed` sets `opacity: 0; pointer-events: none` with a 0.8s fade.

---

## How the Sections Work

Once you scroll past the 600vh driver, `#canvas-wrapper` is still fixed behind everything. All post-scroll sections have `position: relative; z-index: 50; background: var(--bg)` — they paint over the canvas naturally. When `#services-section` enters the viewport, an `IntersectionObserver` fades `#canvas-wrapper` to `opacity: 0`.

**Services grid** — 8 cards in a 4-column CSS grid. Each card starts at `opacity: 0; transform: translateY(24px)`. An `IntersectionObserver` adds `.in-view` which sets those back to `opacity: 1; transform: none`. The stagger is pure CSS via `nth-child` transition delays (0s, 0.07s, 0.14s, ...). No JavaScript timing involved.

**Before/After slider** — CSS `clip-path` driven by a CSS custom property. The "after" panel sits on top of "before" and has `clip-path: inset(0 calc(100% - var(--ba-pos)) 0 0)`. Drag the handle and JS updates `--ba-pos` on every `mousemove`. The clip-path has `transition: 0s` so there's no lag. Mouse and touch both work. Real before/after photos live in `assets/ba-before.png` and `assets/ba-after.png`.

**Models track** — Horizontal flex row with `overflow-x: auto; scroll-snap-type: x mandatory`. Each card is `flex: 0 0 180px` with `scroll-snap-align: start`. Clicking any model card scrolls smoothly to `#services-section` (the hover animation — lift, red border, corner brackets — implies interactivity). Cursor switches to pointer from JS alongside the click handler.

**Gallery grid** — 3-column grid, same IntersectionObserver + `.in-view` stagger as services. Each card has `.gallery-before` and `.gallery-after` split left/right with a diagonal separator via `::after { transform: skewX(-3deg) }`. Real photos in `assets/` — scope-targeted by `data-service` attribute on each `.gallery-card` (e.g. `[data-service="Dent Removal"]`).

**Trust pillars** — 4-column grid with `1px` vertical borders. Just content + hover lift. No observers.

**Contact form** — Submits to WhatsApp, no backend needed. On submit, builds a `wa.me/NUMBER?text=...` URL with form values encoded, then `window.open()`. Validates name + phone in that order before opening. The file input was removed — a note in the form tells users to share damage photos directly in the WhatsApp chat.

---

## Three.js Hero (CSS3D Carousel + WebGL Particles)

The hero hosts two Three.js renderers stacked:

1. **WebGLRenderer** — renders the particle cloud (2200 points on desktop, 800 on compact). Sits below the canvas in z-order.
2. **CSS3DRenderer** — renders the 8 service cards as HTML elements positioned via `matrix3d` in a 3D orbit. Sits above the canvas. Cards orbit on a radius of 560px (240px on compact), offset 180px right of center on desktop (centered on compact) so they don't obscure the car.

Both renderers share one `THREE.Scene` and one `THREE.PerspectiveCamera`. The camera lerps toward the mouse position on desktop (`isTouch` detection disables mouse parallax on touch devices).

Carousel opacity fade is driven by `getCardOpacity(p)` — cards are invisible before scroll progress 0.18 and after 0.82, with a 0.08-wide fade in/out at each boundary. The active card (closest face-on to camera) gets full opacity and a red border; others fade geometrically.

### Device Adaptation

All devices run the same `initDesktop()` path. The `isCompact` flag (≤700px viewport width) tunes constants:

| Constant | Desktop | Compact |
|---|---|---|
| `particleCount` | 2200 | 800 |
| `cardRadius` | 560px | 240px |
| `orbitOffsetX` | 180px | 0px |
| `cameraZ` | 900 | 700 |

The old separate `initMobile()` path has been deleted entirely. Everything runs Three.js.

---

## Mobile Stage Bar

On compact devices (≤700px), a `#mobile-stage-bar` shows five pill tabs at the bottom of the canvas ("Inspect", "Detach", "Reveal", "Repair", "Restore") that highlight as the frame sequence progresses through time thresholds. This is driven by `updateMobilePills(p)` called inside the idle-gated scroll block.

**Important breakpoint:** The CSS `@media (max-width: 700px)` shows `#mobile-stage-bar` and hides `#progress-track`. This matches the JS `isCompact` threshold exactly. Previously it was `768px`, which caused the pill bar to appear on tablets and small laptops that were running the full desktop carousel. The fix was moving those two rules to `700px`.

---

## Smooth Scroll for Anchor Links

`scroll-behavior: auto` is set on `<html>` because CSS smooth scroll fights the lerp-based frame scrubber. All anchor links (`<a href="#...">`) and the model card click handler use programmatic `element.scrollIntoView({ behavior: 'smooth' })` instead. This gives smooth navigation for user-triggered jumps without interfering with the scroll-scrub animation.

---

## Back to Top Button

A `#back-to-top` button sits fixed at bottom-left. It's invisible (`opacity: 0; pointer-events: none`) until the user scrolls past the hero (scrollY > hero height + 200px), then fades in with a `translateY` entrance. Clicking it calls `window.scrollTo({ top: 0, behavior: 'smooth' })`. Hover state turns the border and arrow red, matching the site's action color. On mobile it shrinks to 36×36px.

---

## Design Language

Three fonts: Bebas Neue (display, all-caps headings), Share Tech Mono (codes, labels, UI chrome), Cormorant Garamond (body text, italic accents). Two accent colors: red (`#FF3D00`) for damage/action/CTA/hover, teal (`#00E5CC`) for system/scan/diagnostic labels.

Every interactive card uses the same corner-bracket decoration: `::before` and `::after` pseudo-elements draw two L-shapes in opposite corners using `border-width` to show only one side each. They're `opacity: 0` normally and `opacity: 1` on hover.

Section headings follow one pattern throughout: mono eyebrow in teal → Bebas Neue headline → italic Cormorant sub-text.

---

## What Needs Replacing Before Real Launch

- **WhatsApp number**: `main.js` line 486, `const WHATSAPP_NUMBER = '919437000000'`. Replace with the actual shop number. The same number appears in `index.html` at the WhatsApp CTA button and the social dock link.
- **Phone number**: `index.html` line 344, `href="tel:+919437000000"` and the display text `+91 94370 00000`. Update both.
- **Instagram link**: `index.html` line 425, `href="https://instagram.com/"`. Replace with the shop's actual Instagram profile URL.

---

## File Map

```
index.html    ~437 lines   Structure. All 8 sections + footer + back-to-top button. No logic.
style.css    ~1683 lines   All visual styling. Design tokens at top in :root.
main.js        ~551 lines   All behavior. Sections: setup, device detection, frame decode,
                             Three.js init, tick loop, hero/annotations/progress/carousel,
                             mobile pills, before/after slider, form handler,
                             anchor smooth scroll, model card clicks, back-to-top.
```

Assets:
```
frames/          121 JPEG frames (00001.jpg → 00121.jpg) — the car disassembly sequence
assets/          Real photos: ba-before.png, ba-after.png, dent/bumper/paint/scratch before+after
```

Three.js is loaded from `https://unpkg.com/three@0.170.0/` via an import map in `index.html`. No local node_modules needed.

*verified by vibecheck*
