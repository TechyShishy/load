/**
 * Shared flyout positioning utility.
 *
 * `computeFlyoutPosition` is a pure function when `viewport` and `safeArea`
 * are passed — both reading from real DOM globals and injecting synthetic
 * values in tests. All callers (ExpandedCardFlyout, BoardCardFlyout, future
 * flyouts) should go through this so viewport-clamping and direction logic
 * are fixed in one place.
 */

const MARGIN = 16;
export { MARGIN };
const GAP = 8;
export { GAP };

export interface FlyoutViewport {
  width: number;
  height: number;
  /** Left offset of the visual viewport relative to the layout viewport (e.g. in split-screen). */
  offsetLeft?: number;
  /** Top offset of the visual viewport relative to the layout viewport. */
  offsetTop?: number;
}

export interface FlyoutSafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FlyoutPosition {
  left: number;
  top: number;
  /**
   * Which side of the source the flyout opens toward.
   * Forward-compatible field: callers can use this as a `transformOrigin` hint
   * for entrance animations without recomputing direction themselves.
   */
  openDirection: 'up' | 'down';
}

/**
 * Read the safe-area insets from the CSS custom properties set in global.css.
 * Falls back to zero for environments where the properties are absent (SSR,
 * tests that don't inject styles).
 */
function readSafeArea(): FlyoutSafeArea {
  const style = getComputedStyle(document.documentElement);
  const parse = (v: string) => parseFloat(v) || 0;
  return {
    top: parse(style.getPropertyValue('--safe-area-inset-top')),
    right: parse(style.getPropertyValue('--safe-area-inset-right')),
    bottom: parse(style.getPropertyValue('--safe-area-inset-bottom')),
    left: parse(style.getPropertyValue('--safe-area-inset-left')),
  };
}

/**
 * Read the usable viewport rectangle.
 * `window.visualViewport` gives the correct width/height in Android WebView
 * multi-window and split-screen contexts (e.g. Pixel Tablet), where
 * `window.innerWidth/innerHeight` may reflect the full display rather than the
 * app's allocated portion. Only `width` and `height` are used for positioning —
 * `offsetLeft`/`offsetTop` (non-zero only during pinch-zoom) are not, because
 * both `getBoundingClientRect()` and `position: fixed` share the same
 * visual-viewport coordinate space inside a WebView.
 */
function readViewport(): FlyoutViewport {
  const vv = window.visualViewport;
  if (vv) {
    return {
      width: vv.width,
      height: vv.height,
      offsetLeft: vv.offsetLeft,
      offsetTop: vv.offsetTop,
    };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Compute a clamped, viewport-safe position for a flyout anchored to a source
 * element.
 *
 * @param sourceRect    Bounding rect of the element that triggered the flyout
 *                      (viewport coordinates, as returned by getBoundingClientRect).
 * @param flyoutWidth   CSS width that will be applied to the flyout element.
 * @param flyoutHeight  Expected rendered height of the flyout. For fixed-height
 *                      flyouts pass the constant; for content-sized flyouts
 *                      measure with offsetHeight on the first layout pass.
 * @param viewport      Override the viewport dimensions (inject in tests).
 * @param safeArea      Override the safe-area insets (inject in tests).
 *
 * @returns `{ left, top, openDirection }` — apply `left` and `top` as `fixed`
 *          CSS coordinates. Never use `bottom`; the utility always returns an
 *          absolute `top` so clamping works symmetrically.
 */
export function computeFlyoutPosition(
  sourceRect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width' | 'height'>,
  flyoutWidth: number,
  flyoutHeight: number,
  viewport?: FlyoutViewport,
  safeArea?: FlyoutSafeArea,
): FlyoutPosition {
  const vp = viewport ?? readViewport();
  const sa = safeArea ?? readSafeArea();

  // ── Horizontal ──────────────────────────────────────────────────────────────
  const centerX = sourceRect.left + sourceRect.width / 2;
  const minLeft = MARGIN + sa.left;
  const maxLeft = vp.width - flyoutWidth - MARGIN - sa.right;
  const left = Math.max(minLeft, Math.min(centerX - flyoutWidth / 2, maxLeft));

  // ── Vertical ────────────────────────────────────────────────────────────────
  // Open downward when the source element is in the top half of the viewport
  // so the flyout is most likely to land in open screen space.
  const midY = vp.height / 2;
  const openDirection: 'up' | 'down' = sourceRect.top < midY ? 'down' : 'up';

  const minTop = MARGIN + sa.top;
  const maxTop = vp.height - flyoutHeight - MARGIN - sa.bottom;

  let top: number;
  if (openDirection === 'down') {
    // Anchor to source bottom; clamp so flyout bottom stays within margin.
    top = Math.min(sourceRect.bottom + GAP, maxTop);
  } else {
    // Anchor to source top; clamp so flyout top stays within margin.
    top = Math.max(sourceRect.top - flyoutHeight - GAP, minTop);
  }

  return { left, top, openDirection };
}
