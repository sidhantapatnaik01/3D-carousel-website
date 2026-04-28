# Maruti Care Nabarangpur — How This Site Works

This is a single-page marketing site for a Maruti Suzuki body repair shop in Nabarangpur, Odisha. It's three files: `index.html`, `style.css`, `main.js`. No framework, no build step, no dependencies beyond three Google Fonts. You can open it directly in a browser.

The conceit of the site is that a car disassembly video plays as you scroll — the video becomes a scrubber. This sounds fancy but the implementation is about 10 lines of JavaScript once you understand the trick.

---

## The Core Trick: Scroll-Scrubbed Video

The entire hero is built around one insight: `video.currentTime` is a settable property. So instead of playing the video, you set its `currentTime` proportionally to how far the user has scrolled. That's it.

The tricky part is the scroll architecture. You need the video to stay fixed on screen while the user scrolls, but you also need scroll distance to accumulate. The solution is two nested elements:

```
#scroll-driver   → height: 600vh, position: relative (creates scroll space)
  #canvas-wrapper  → position: fixed, inset: 0 (stays glued to viewport)
    <video>          → position: absolute, fills canvas
```

The user scrolls through 600vh of empty space. `#canvas-wrapper` stays pinned. We read `window.scrollY` and divide by `scrollDriver.offsetHeight - window.innerHeight` to get a 0→1 progress value, then multiply by `video.duration` to set `currentTime`.

Why `scrollDriver.offsetHeight - window.innerHeight` instead of `document.body.scrollHeight - window.innerHeight`? Because after the 600vh scroll driver, there are more sections (services, gallery, etc). If you use the full body height as denominator, the video never completes its scrub — you'd be at position 0.7 when the scroll driver ends. Using the driver's own height means the video finishes exactly as the user exits the hero.

The scroll listener uses `requestAnimationFrame` throttling — `ticking` goes true on scroll event, the rAF runs and resets it to false. This prevents queuing up hundreds of calls during fast scrolls while still being responsive.

---

## Loading Screen

The boot overlay (`#load-overlay`) sits at `z-index: 200`, covering everything. It has three elements: a brand name, a 1px progress bar, and a status line that blinks.

The progress bar animates from 0% to 100% in 1.4s via a CSS keyframe. The JS dismissal logic is a two-gate system: the overlay doesn't disappear until both `videoReady` (the `canplaythrough` event fires) AND `minTimePassed` (1.4s setTimeout). If the video stalls entirely, there's a hard 7s fallback that dismisses it regardless. On dismissal, we add a `.dismissed` class that sets `opacity: 0; pointer-events: none` with a 0.8s fade.

---

## How the Sections Work

Once you scroll past the 600vh driver, the `#canvas-wrapper` is still fixed behind everything. All post-scroll sections have `position: relative; z-index: 50; background: var(--bg)` — they just paint over the video naturally. When `#services-section` enters the viewport, an `IntersectionObserver` fades `#canvas-wrapper` to `opacity: 0` so the fixed video doesn't bleed through any transparent areas.

**Services grid** — 8 cards in a 4-column CSS grid. Each card starts at `opacity: 0; transform: translateY(24px)`. An `IntersectionObserver` adds `.in-view` which sets those back to `opacity: 1; transform: none`. The stagger is pure CSS via `nth-child` transition delays (0s, 0.07s, 0.14s, ...). No JavaScript timing involved.

**Before/After slider** — This is CSS `clip-path` driven by a CSS custom property. The "after" panel sits on top of "before" and has `clip-path: inset(0 calc(100% - var(--ba-pos)) 0 0)`. When `--ba-pos` is 50%, the clip reveals the left 50% of the after panel. Drag the handle and JS updates `--ba-pos` on every `mousemove`. The `clip-path` has `transition: 0s` so there's no lag. Mouse and touch both work. Currently the panels are CSS gradients (teal-tinted vs red-tinted) — swap in real before/after photos as `background-image` on `#ba-before` and `#ba-after`.

**Models track** — Horizontal flex row with `overflow-x: auto; scroll-snap-type: x mandatory`. Each card is `flex: 0 0 180px` with `scroll-snap-align: start`. The scrollbar is hidden via `scrollbar-width: none`. Nothing clever happening here — CSS does all the work.

**Gallery grid** — 3-column grid, same IntersectionObserver + `.in-view` stagger as services. Each card has a `.gallery-before` and `.gallery-after` div split left/right, with a diagonal separator via `::after { transform: skewX(-3deg) }`. Currently placeholder gradients (dark red-tint vs dark teal-tint). Real photos go in as `background-image` on `.gallery-before` and `.gallery-after` per card.

**Trust pillars** — 4-column grid with `1px` vertical borders. Just content + hover lift. No observers here since they're short enough to land fully in view at once.

**Contact form** — The form submits to WhatsApp, no backend needed. On submit, we build a `wa.me/NUMBER?text=...` URL with the form values encoded as a WhatsApp message, then `window.open()` it. The phone number is currently `91XXXXXXXXXX` — replace that constant in `main.js` line 270.

---

## Design Language

Three fonts: Bebas Neue (display, for headings), Share Tech Mono (for codes, labels, UI chrome), Cormorant Garamond (body text, italic accents). Two accent colors: red (`#FF3D00`) for damage/action/CTA, teal (`#00E5CC`) for system/scan/info.

Every interactive card uses the same corner-bracket decoration trick: `::before` and `::after` pseudo-elements draw two L-shapes in the opposite corners, using `border-width` to only show one side of each. They're `opacity: 0` normally and `opacity: 1` on hover.

Section headings follow one pattern throughout: mono eyebrow in teal → Bebas Neue headline → italic Cormorant sub-text. That repetition is intentional — it makes the page feel coherent even though each section has a different layout.

---

## Mobile

On mobile (`max-width: 768px`), the scroll scrubbing is disabled entirely. The scroll driver collapses to `100vh` and the video just plays normally via `video.play()`. Instead of the progress track, a `#mobile-stage-bar` shows five pill tabs at the bottom of the screen that highlight as the video plays through time thresholds. The annotations are also simplified — only three show instead of six, and they're all centered at the top of the video rather than scattered around the edges.

---

## What's Placeholder

- **Before/After panels**: Currently CSS gradients. Add `background-image: url(...)` on `#ba-before` and `#ba-after` in CSS or inline style.
- **Gallery cards**: Currently gradient placeholders. Add `background-image: url(...)` on `.gallery-before` and `.gallery-after` inside each `.gallery-card`. You'll probably need to scope these with `:nth-child` selectors.
- **WhatsApp number**: `main.js` line 270, `const WHATSAPP_NUMBER = '91XXXXXXXXXX'`. Replace with the actual number like `'919876543210'`.
- **Phone number**: `index.html` has `+91 XXXXX XXXXX` and `href="tel:+91XXXXXXXXXX"` — update both.
- **WhatsApp CTA link**: `index.html` has `href="https://wa.me/91XXXXXXXXXX"` — update this too.

---

## File Map

```
index.html    ~457 lines   Structure. All 8 sections + footer. No logic.
style.css    ~1452 lines   All visual styling. Design tokens at top in :root.
main.js        ~294 lines   All behavior. Sections: setup, desktop init, hero,
                             annotations, progress, mobile, loaders, observers,
                             before/after slider, file input, form handler.
```

The video file (`kling_20260425_VIDEO_Create_a_p_4114_0.mp4`) is in the project root. The `VIDEO_SRC` constant at the top of `main.js` points to it by filename. Keep both files in the same directory.

*verified by vibecheck*
