# 004 — Increase motion perceptibility without slowing navigation

- **Status**: DONE
- **Commit**: 26aec1c
- **Severity**: HIGH
- **Category**: Purpose, easing, duration, missed opportunities
- **Estimated scope**: 2 files, small CSS-only tuning

## Problem

The implemented entrances are technically present but visually disappear at normal playback speed. In `src/web/styles.css`, contextual surfaces currently use `140ms / 180ms / 220ms`, while the starting geometry moves only `4px` or `6px` and scales from `0.97`:

```css
--vbg-motion-fast: 140ms;
--vbg-motion-ui: 180ms;
--vbg-motion-panel: 220ms;

transform: translateY(-4px) scale(0.97);
transform: translateY(6px);
```

There is also no physical press feedback on the bounded icon/popover controls, and the Sequence selection outline appears instantly because `box-shadow` is not transitioned.

## Target

- Use `160ms` for direct feedback, `220ms` for popovers, and `280ms` for inspectors/modals. All stay below the 300ms dashboard UI budget.
- Start anchored popovers at `translateY(-8px) scale(0.95)`.
- Start inspectors at `translateY(12px)`.
- Start the image modal at `scale(0.96)` and the error banner at `translateY(-12px)`.
- Give bounded controls press feedback with `transform: scale(0.97)` over `160ms`.
- Transition the Sequence selected `box-shadow` over `220ms`.
- Preserve the existing `cubic-bezier(0.23, 1, 0.32, 1)` curve and reduced-motion opacity-only path.

## Repo conventions to follow

- Motion tokens remain in `.vbg-report` in `src/web/styles.css`.
- Animate only `opacity`, `transform`, colors, and `box-shadow`; never use `transition: all`.
- Keep `@starting-style` for mount entrances and keep the existing targeted `prefers-reduced-motion` block.

## Steps

1. Update the three motion duration tokens and the existing `@starting-style` geometry in `src/web/styles.css`.
2. Use scoped CSS entry animations on native `<details>` popovers and newly mounted inspectors/modals because Chromium does not reliably re-apply `@starting-style` to already-present hidden content. Use an opacity-only animation in reduced-motion mode.
3. Add `160ms` press transitions to the theme, copy, connection, token, lightbox-close, inspector-close, and error-action controls.
4. Add `box-shadow` to the Sequence step transition and keep the selected geometry static.
5. Update `tests/frontend/motion-styles.test.ts` to lock the stronger values and reduced-motion behavior.

## Boundaries

- Do NOT animate search, session navigation, tab switching, or initial trace list rendering.
- Do NOT add dependencies or JavaScript animation state.
- Do NOT animate layout properties.

## Verification

- **Mechanical**: `zsh -lc 'npm test && npm run build'`; `git diff --check`.
- **Feel check**: open connection/token popovers and Sequence/Trace inspectors in light and dark themes. The origin and direction should be immediately legible without feeling delayed. Press bounded controls and confirm the scale is visible but not bouncy. Enable reduced motion and confirm displacement disappears while opacity feedback remains.
- **Done when**: the motion is recognizable at normal speed, remains under 300ms, and the browser console is clean.
