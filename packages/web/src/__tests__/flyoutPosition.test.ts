import { describe, it, expect } from 'vitest';
import { computeFlyoutPosition, MARGIN, GAP } from '../components/flyoutPosition.js';
import type { FlyoutSafeArea, FlyoutViewport } from '../components/flyoutPosition.js';

/** Helpers for injecting clean environment overrides. */
const ZERO_SAFE_AREA: FlyoutSafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): Pick<DOMRect, 'left' | 'top' | 'bottom' | 'width' | 'height'> {
  return { left, top, bottom: top + height, width, height };
}

const VP_400_600: FlyoutViewport = { width: 400, height: 600 };

// ── Horizontal clamping ───────────────────────────────────────────────────────

describe('computeFlyoutPosition — horizontal clamping', () => {
  it('clamps to left margin when source is near the left edge', () => {
    // centerX = 8 + 45 = 53; unclamped left = 53 - 90 = -37 → clamp to 16
    const pos = computeFlyoutPosition(rect(8, 300, 90, 120), 180, 200, VP_400_600, ZERO_SAFE_AREA);
    expect(pos.left).toBe(16);
  });

  it('clamps to right margin when source is near the right edge', () => {
    // centerX = 350 + 45 = 395; unclamped left = 305; maxLeft = 400 - 180 - 16 = 204
    const pos = computeFlyoutPosition(rect(350, 200, 90, 120), 180, 200, VP_400_600, ZERO_SAFE_AREA);
    expect(pos.left).toBe(204);
  });
});

// ── Vertical direction heuristic ─────────────────────────────────────────────

describe('computeFlyoutPosition — vertical direction', () => {
  it('opens downward when source is in the top half of the viewport', () => {
    // sourceRect.top = 150 < midY = 300 → 'down'; top = 270 + 8 = 278; unclamped (maxTop=384)
    const pos = computeFlyoutPosition(rect(100, 150, 90, 120), 180, 200, VP_400_600, ZERO_SAFE_AREA);
    expect(pos.openDirection).toBe('down');
    expect(pos.top).toBe(150 + 120 + GAP); // 278
  });

  it('opens upward when source is in the bottom half of the viewport', () => {
    // sourceRect.top = 420 > midY = 300 → 'up'; top = 420 - 200 - 8 = 212; unclamped (minTop=16)
    const pos = computeFlyoutPosition(rect(100, 420, 90, 120), 180, 200, VP_400_600, ZERO_SAFE_AREA);
    expect(pos.openDirection).toBe('up');
    expect(pos.top).toBe(420 - 200 - GAP); // 212
  });
});

// ── Vertical clamping ─────────────────────────────────────────────────────────

describe('computeFlyoutPosition — vertical clamping', () => {
  it('clamps an upward-opening flyout that would extend above the top margin', () => {
    // sourceRect.top = 350 > 300 → 'up'; unclamped top = 350 - 400 - 8 = -58 → clamp to 16
    const pos = computeFlyoutPosition(rect(100, 350, 90, 120), 180, 400, VP_400_600, ZERO_SAFE_AREA);
    expect(pos.openDirection).toBe('up');
    expect(pos.top).toBe(MARGIN);
  });

  it('clamps a downward-opening flyout that would extend below the bottom margin', () => {
    // sourceRect.top = 100 < 300 → 'down'; unclamped top = 220 + 8 = 228;
    // maxTop = 600 - 400 - 16 = 184 → clamp to 184
    const pos = computeFlyoutPosition(rect(100, 100, 90, 120), 180, 400, VP_400_600, ZERO_SAFE_AREA);
    expect(pos.openDirection).toBe('down');
    expect(pos.top).toBe(VP_400_600.height - 400 - MARGIN); // 184
  });
});

// ── visualViewport with scroll offset ────────────────────────────────────────

describe('computeFlyoutPosition — visualViewport', () => {
  it('uses visualViewport width/height for correct clamping; offsetLeft is not added to bounds', () => {
    // In Android WebView split-screen the visual viewport width is smaller than the physical display,
    // so vp.width correctly constrains clamping. offsetLeft/offsetTop are non-zero only during
    // pinch-zoom and are NOT added to bounds — both getBoundingClientRect() and position:fixed
    // share the same visual-viewport coordinate space inside a WebView.
    const vp: FlyoutViewport = { width: 400, height: 600, offsetLeft: 100, offsetTop: 50 };
    // Right-edge clamp: source right at x=390, centerX=345, unclamped=255; maxLeft=400-180-16=204 → clamp
    // If offsetLeft were incorrectly added: maxLeft=100+400-180-16=304, and 255<304 → no clamp (wrong)
    const pos = computeFlyoutPosition(rect(300, 100, 90, 120), 180, 200, vp, ZERO_SAFE_AREA);
    expect(pos.left).toBe(204); // clamped to vp.width-based bound
    expect(pos.openDirection).toBe('down'); // midY = 600/2 = 300; top=100 < 300 → down
  });
});

// ── Safe-area insets ─────────────────────────────────────────────────────────

describe('computeFlyoutPosition — safe-area insets', () => {
  it('shrinks usable area on all sides when insets are non-zero', () => {
    const sa: FlyoutSafeArea = { top: 44, right: 20, bottom: 34, left: 20 };
    const vp: FlyoutViewport = { width: 400, height: 700 };
    // Horizontal: centerX = 40 + 45 = 85; unclamped left = 85 - 90 = -5;
    // minLeft = 0 + 16 + 20 = 36 → left clamps to 36
    // Vertical: midY = 350; top=200 < 350 → 'down'; bottom=320; unclamped top = 328;
    // maxTop = 700 - 400 - 16 - 34 = 250 → clamp to 250; flyout bottom = 650 ≤ 700 - 16 - 34 = 650
    const pos = computeFlyoutPosition(rect(40, 200, 90, 120), 180, 400, vp, sa);
    expect(pos.left).toBe(36); // clamped by left safe area
    expect(pos.openDirection).toBe('down');
    expect(pos.top).toBe(250); // clamped by bottom safe area
    // Flyout bottom stays at or within safe bottom margin
    expect(pos.top + 400).toBeLessThanOrEqual(vp.height - MARGIN - sa.bottom);
  });
});

// ── Real-world regression: 1157×724, Viral Traffic Spike slots ───────────────

describe('computeFlyoutPosition — 1157×724 Pixel Tablet, Viral Traffic Spike', () => {
  /**
   * Board geometry for the Overnight period (index 3), slot-count 4, canvas width 1157px:
   *   computeSlotRect(3, 2, 1157, 4) → { x: 706.2, y: 302, w: 90, h: 120 }  (canvas coords)
   *   computeSlotRect(3, 3, 1157, 4) → { x: 706.2, y: 362, w: 90, h: 120 }  (canvas coords)
   *
   * The GamePlayArea header occupies ~44px at the top of the viewport, so:
   *   secondBottom (slot 2): viewport top = 44 + 302 = 346, bottom = 466
   *   bottommost   (slot 3): viewport top = 44 + 362 = 406, bottom = 526
   *
   * Viewport midY = 362. With these coords:
   *   slot 3 top (406) > midY (362) → opens UP   (no overflow — baseline correct behaviour)
   *   slot 2 top (346) < midY (362) → opens DOWN  (unclamped bottom = 714 > 708 → must be clamped)
   */
  const VP: FlyoutViewport = { width: 1157, height: 724 };
  const SA = ZERO_SAFE_AREA;
  const FLYOUT_W = 180;
  const FLYOUT_H = 240;

  // These represent getBoundingClientRect() of the board hit-zone elements.
  const bottommost = rect(706.2, 406, 90, 120);    // slot (3, 3) — opens up
  const secondBottom = rect(706.2, 346, 90, 120);  // slot (3, 2) — opens down, clamped

  it('bottommost Viral Traffic Spike slot opens upward and stays fully in bounds', () => {
    const pos = computeFlyoutPosition(bottommost, FLYOUT_W, FLYOUT_H, VP, SA);

    expect(pos.openDirection).toBe('up');

    // Fully within viewport margins on all four sides
    expect(pos.left).toBeGreaterThanOrEqual(MARGIN);
    expect(pos.left + FLYOUT_W).toBeLessThanOrEqual(VP.width - MARGIN);
    expect(pos.top).toBeGreaterThanOrEqual(MARGIN);
    expect(pos.top + FLYOUT_H).toBeLessThanOrEqual(VP.height - MARGIN);
  });

  it('second-bottommost Viral Traffic Spike slot opens downward and clamps at the bottom margin', () => {
    // maxTop = 724 - 240 - 16 = 468; unclamped = 466 + 8 = 474 → clamped to 468
    const expectedTop = VP.height - FLYOUT_H - MARGIN; // 468
    const pos = computeFlyoutPosition(secondBottom, FLYOUT_W, FLYOUT_H, VP, SA);

    expect(pos.openDirection).toBe('down');
    expect(pos.top).toBe(expectedTop); // exactly clamped — regression guard

    // Fully within viewport margins on all four sides
    expect(pos.left).toBeGreaterThanOrEqual(MARGIN);
    expect(pos.left + FLYOUT_W).toBeLessThanOrEqual(VP.width - MARGIN);
    expect(pos.top).toBeGreaterThanOrEqual(MARGIN);
    expect(pos.top + FLYOUT_H).toBeLessThanOrEqual(VP.height - MARGIN);
  });
});
