import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

// Module-level offscreen canvas for deterministic text-width measurement.
// Lazily instantiated to avoid SSR issues. Shared across all FitText instances.
// undefined = not yet tried; null = tried and unavailable (GPU failure / SSR).
let _ctx2d: CanvasRenderingContext2D | null | undefined = undefined;
function canvasCtx(): CanvasRenderingContext2D | null {
  if (_ctx2d !== undefined) return _ctx2d;
  if (typeof document === 'undefined') return (_ctx2d = null);
  _ctx2d = document.createElement('canvas').getContext('2d');
  return _ctx2d;
}

/**
 * Single-line text that auto-shrinks its font size to fit the container width.
 * Maximum is `maxFontSize` px (default 13.33 ≈ 10pt); minimum is 6px.
 *
 * Uses CanvasRenderingContext2D.measureText() rather than DOM scrollWidth so
 * that multiple instances showing identical text always compute the same font
 * size. scrollWidth on overflow:hidden elements is unreliable across browsers
 * and can diverge when layout effects from sibling cards mutate the DOM mid-
 * batch.
 *
 * When the element is inside a CSS-scaled container (e.g. scale-50) the
 * layout-space width is unaffected by the transform, so measurement is correct.
 * Pass a proportionally larger `maxFontSize` to compensate for the visual
 * downscale — e.g. maxFontSize={27} gives ≈13.33px visual at scale-50.
 */
export function FitText({ children, className, id, maxFontSize = 13.33 }: { children: string; className?: string; id?: string; maxFontSize?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = canvasCtx();
    // Use offsetWidth (layout-space, transform-unaware) so the measurement is in
    // the same coordinate system as canvas measureText(). getBoundingClientRect()
    // returns visual (post-transform) dimensions, which diverge when this element
    // is inside a CSS-scaled container.
    const totalW = el.offsetWidth;
    if (totalW <= 0) return;
    const cs = window.getComputedStyle(el);
    const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const maxW = totalW - padH;
    // Step down from max until the canvas-measured text width fits.
    let fontSize = maxFontSize;
    if (ctx) {
      while (fontSize > 6) {
        ctx.font = `${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
        if (ctx.measureText(children).width <= maxW) break;
        fontSize -= 0.5;
      }
    }
    el.style.fontSize = `${fontSize.toFixed(2)}px`;
  }, [children, maxFontSize]);
  return (
    <span
      ref={ref}
      id={id}
      className={className}
      style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden' }}
    >
      {children}
    </span>
  );
}

/**
 * Multi-line text that auto-shrinks its font size to fit the container height.
 * Maximum is `maxFontSize` px (default 11); minimum is `minFontSize` px (default 4).
 * The wrapping div takes flex-1 so it fills whatever height flex layout allocates.
 *
 * Measurement uses offsetHeight vs scrollHeight — both always in layout (CSS pixel)
 * space, so the comparison is correct in all contexts including CSS-scaled ancestors
 * (e.g. scale-50 on hand cards). overflow:hidden is set temporarily so scrollHeight
 * reliably reflects content height rather than the allocated box height. A
 * ResizeObserver re-runs the check whenever the container transitions from 0 to a
 * real height (portals, deferred layout, scaled subtrees).
 */
export function FitTextBlock({ children, className, maxFontSize = 11, minFontSize = 4 }: { children: string; className?: string; maxFontSize?: number; minFontSize?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  // offsetHeight and scrollHeight are both in layout (CSS pixel) space —
  // coordinate-system-safe even inside a CSS transform (scale-50) ancestor.
  // getBoundingClientRect() is NOT used here because within a ResizeObserver
  // callback Chrome does not guarantee that geometry reads reflect style writes
  // made in the same callback, causing stale comparisons.
  const measure = useCallback(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;
    const availableHeight = container.offsetHeight;
    if (availableHeight <= 0) return;
    // overflow:hidden makes scrollHeight reliably report full content height
    // even when the flex container would otherwise clip silently.
    container.style.overflow = 'hidden';
    text.style.fontSize = `${maxFontSize}px`;
    while (container.scrollHeight > availableHeight && parseFloat(text.style.fontSize) > minFontSize) {
      text.style.fontSize = `${(parseFloat(text.style.fontSize) - 0.5).toFixed(2)}px`;
    }
    container.style.overflow = '';
  }, [maxFontSize, minFontSize]);

  // Run on every content/prop change (measure is stable between those changes).
  useLayoutEffect(measure, [measure, children]);

  // Re-run whenever the container is resized (handles portals, scaled parents,
  // deferred layout — any case where the initial layoutEffect sees height=0).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={containerRef} className="flex-1 min-h-0 w-full">
      <span ref={textRef} className={className} style={{ display: 'block' }}>
        {children}
      </span>
    </div>
  );
}
