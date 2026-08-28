# 002 — Give contextual surfaces a restrained spatial entrance

- **Status**: DONE
- **Commit**: 26aec1c
- **Severity**: MEDIUM
- **Category**: Physicality / Missed opportunities
- **Estimated scope**: 2 files, CSS-only motion plus regression coverage

## Problem

Contextual surfaces currently mount at their final position with no transition. This makes connection details, token details, inspectors, tooltips, the image preview, and the error banner feel disconnected from their triggers.

```css
/* src/web/styles.css:112 — current */
.vbg-custom-topbar__connection > dl { position: absolute; ... }

/* src/web/styles.css:372 — current */
.vbg-custom-turn-token-usage dl { position: absolute; ... }

/* src/web/styles.css:442-443 — current */
.vbg-custom-image-lightbox { position: fixed; ... }
.vbg-custom-image-lightbox__content { position: relative; ... }

/* src/web/styles.css:1240 — current */
.vbg-custom-sequence__inspector { grid-area: 2 / 1; ... }
```

## Target

Use CSS transitions and `@starting-style`; animate only opacity and transform:

```css
.anchored-surface {
  opacity: 1;
  transform: translateY(0) scale(1);
  transform-origin: top right;
  transition: opacity var(--vbg-motion-ui) var(--vbg-ease-out), transform var(--vbg-motion-ui) var(--vbg-ease-out);
}

@starting-style {
  .anchored-surface { opacity: 0; transform: translateY(-4px) scale(0.97); }
}
```

- Anchored popovers: 180ms, `translateY(-4px) scale(0.97)`, origin nearest the trigger.
- Inspectors: 220ms, `translateY(6px)`, no scale.
- Tooltip: 140ms, opacity plus 2px travel while preserving its positioning transform.
- Image overlay: 180ms opacity; image content: 220ms `scale(0.97)`.
- Error banner: 180ms opacity plus `translate(-50%, -6px)`.

## Repo conventions to follow

- Motion tokens come from `animation-plans/001-motion-tokens-and-reduced-motion.md`.
- Surface z-index and geometry remain unchanged.
- `PreviewableImage.tsx:45-75` already portals the dialog; no new state or dependency is required for entrance motion.

## Steps

1. Add entrance transitions to connection details and token details in `src/web/styles.css`.
2. Add entrance transitions to replay and sequence inspectors without animating their grid height.
3. Add opacity/transform entrances to the sequence tooltip, image lightbox/content, and error banner.
4. Add reduced-motion overrides that remove translations/scales while retaining the opacity transition.
5. Extend `tests/frontend/motion-styles.test.ts` with selector and `@starting-style` assertions.

## Boundaries

- Do NOT animate the global-search command palette; it is keyboard-driven and high frequency.
- Do NOT animate tab content or thread/run list selection.
- Do NOT animate width, height, grid rows, top, left, padding, or margins.
- Do NOT add exit-state JavaScript; this plan is entrance-only and CSS-native.

## Verification

- **Mechanical**: targeted motion test, full tests, typecheck, and build must pass.
- **Feel check**: inspect at 5x slowdown. Popovers should appear from their trigger, inspectors should settle upward by only 6px, and image content should never scale from zero. Under reduced motion, only opacity may transition.
- **Done when**: contextual surfaces no longer teleport, yet dense navigation remains immediate.
