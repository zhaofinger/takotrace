# 003 — Refine icon state feedback without moving primary content

- **Status**: DONE
- **Commit**: 26aec1c
- **Severity**: LOW
- **Category**: State indication
- **Estimated scope**: 2 files, CSS-only feedback plus regression coverage

## Problem

Copy success and theme changes replace their SVG instantly. The surrounding state changes correctly, but the swapped icon has no transition to confirm what changed.

```css
/* src/web/styles.css:133 — current */
.vbg-custom-theme-toggle svg { width: 16px; height: 16px; }

/* src/web/styles.css:289 — current */
.vbg-custom-id-copy svg { width: 14px; height: 14px; }
```

## Target

Animate only the newly mounted icon. Use 140ms strong ease-out with opacity and a small scale/rotation:

```css
.feedback-icon {
  opacity: 1;
  transform: scale(1) rotate(0);
  transition: opacity var(--vbg-motion-fast) var(--vbg-ease-out), transform var(--vbg-motion-fast) var(--vbg-ease-out);
}

@starting-style {
  .feedback-icon { opacity: 0; transform: scale(0.9) rotate(-12deg); }
}
```

Apply to the theme toggle, ID copy buttons, and Mermaid copy button. Keep text and layout stationary.

## Repo conventions to follow

- Use the motion tokens defined in plan 001.
- Existing icon geometry and sizes remain authoritative.
- Color continues to communicate success; motion is supplementary.

## Steps

1. Add shared icon transition selectors in `src/web/styles.css`.
2. Add an `@starting-style` block for the swapped SVGs.
3. In reduced motion, remove rotation/scale but retain the 140ms opacity transition.
4. Extend `tests/frontend/motion-styles.test.ts` with icon feedback assertions.

## Boundaries

- Do NOT animate labels, counters, run IDs, or graph content.
- Do NOT add JavaScript timers or animation state.
- Do NOT exceed 160ms.

## Verification

- **Mechanical**: targeted motion test, full tests, typecheck, and build must pass.
- **Feel check**: copy a session/run ID and toggle theme repeatedly. The icon should register without drawing attention or shifting surrounding text. Under reduced motion, it should only fade.
- **Done when**: swapped icons provide a clear but restrained state cue.
