# 001 — Consolidate motion tokens and preserve reduced-motion feedback

- **Status**: DONE
- **Commit**: 26aec1c
- **Severity**: HIGH
- **Category**: Accessibility / Cohesion & tokens
- **Estimated scope**: 2 files, small CSS refactor plus one regression test

## Problem

Motion values are repeated throughout `src/web/styles.css`, so related controls can drift. The reduced-motion rule also removes every transition, including color and opacity feedback that communicates state.

```css
/* src/web/styles.css:140 — current */
transition: opacity 160ms cubic-bezier(0.16, 1, 0.3, 1);

/* src/web/styles.css:676-678 — current */
@media (prefers-reduced-motion: reduce) {
  .vbg-report *, .vbg-report *::before, .vbg-report *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
```

## Target

Add one motion scale to `.vbg-report` and reuse it for existing transitions:

```css
--vbg-motion-fast: 140ms;
--vbg-motion-ui: 180ms;
--vbg-motion-panel: 220ms;
--vbg-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--vbg-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
```

Reduced motion must keep color and opacity feedback. Disable only continuous animation and position-changing transforms:

```css
@media (prefers-reduced-motion: reduce) {
  .vbg-report { scroll-behavior: auto; }
  .vbg-custom-spinner { animation: none; }
  .vbg-custom-thread-sort-switch__thumb,
  .vbg-custom-density-switch__thumb,
  .vbg-custom-turn-token-usage__disclosure,
  .vbg-custom-replay-disclosure { transition-duration: 0.01ms; }
}
```

## Repo conventions to follow

- Visual tokens are scoped on `.vbg-report` at `src/web/styles.css:1-45`.
- Existing motion already names properties explicitly; continue to avoid `transition: all`.
- ThreadScope is a dense developer tool, so all UI motion remains below 300ms.

## Steps

1. Add the five tokens to `.vbg-report` in `src/web/styles.css`.
2. Replace repeated `160ms cubic-bezier(0.16, 1, 0.3, 1)` declarations with `var(--vbg-motion-fast) var(--vbg-ease-out)`.
3. Replace the blanket reduced-motion reset with the targeted rule above.
4. Add `tests/frontend/motion-styles.test.ts` to guard the tokens, explicit transitions, and targeted reduced-motion behavior.

## Boundaries

- Do NOT change component markup.
- Do NOT animate list navigation, tab panel swaps, or keyboard-driven search.
- Do NOT add dependencies.
- Do NOT introduce `transition: all` or layout-property animation.

## Verification

- **Mechanical**: `npm test -- --run tests/frontend/motion-styles.test.ts`, `npm run typecheck`, and `npm run build` must pass.
- **Feel check**: toggle both switches and disclosures normally, then emulate reduced motion. Position changes should become immediate while background, border, and opacity feedback remain legible.
- **Done when**: one motion scale controls the existing CSS and reduced motion no longer disables all state feedback.
