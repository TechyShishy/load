import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusTrap from 'focus-trap-react';
import { ACTION_CARDS, CardType, FALLBACK_ACTION_DECK, MIN_DECK_SIZE, VENDOR_CARDS, VENDOR_SLOT_COUNT, validateDeckSpec } from '@load/game-core';
import type { ActionCard, DeckSpec, VendorCard } from '@load/game-core';
import { ActionCardPreview, ActionCardFace, VendorCardFace, VendorCardPreview, CARD_W, CARD_H } from '../hud/HandZone.js';
import { computeFlyoutPosition } from '../flyoutPosition.js';
import { loadDeckConfig, saveDeckConfig } from '../../save.js';

/**
 * On viewports at least this wide the flyout becomes a full-height, inset
 * sidebar column rather than a floating portal near the tile.
 */
const WIDE_FLYOUT_BREAKPOINT = 768;
const SIDEBAR_WIDTH = 240;

type FlyoutState = { card: ActionCard | VendorCard; rect: DOMRect; triggerEl: HTMLButtonElement };

// ── Wide sidebar ─────────────────────────────────────────────────────────────

/**
 * Rendered inline as the leftmost column of the content row on wide viewports.
 * Not a portal — it's part of the layout so the card grid shifts right.
 */
function DeckBuilderSidebar({
  card,
  onDismiss,
}: {
  card: ActionCard | VendorCard;
  onDismiss: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Capture phase — pre-empts App's bubble-phase DeckBuilderScreen close.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onDismiss]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={card.name}
      tabIndex={-1}
      style={{ width: SIDEBAR_WIDTH, flexShrink: 0 }}
      className="flex flex-col border-r border-cyan-900 bg-purple-950/60 overflow-y-auto"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-purple-700/40 flex-shrink-0">
        <span className="text-cyan-500 font-mono text-xs tracking-widest uppercase">Card Details</span>
        <button
          onClick={onDismiss}
          aria-label="Close card details"
          className="text-gray-500 hover:text-white leading-none cursor-pointer"
          style={{ fontSize: '14px' }}
        >
          ×
        </button>
      </div>

      {/* Card subpanel */}
      <div className="flex justify-center px-4 pt-4 pb-2 flex-shrink-0">
        <div className="rounded overflow-hidden border border-purple-500 shadow shadow-cyan-900/30">
          {card.type === CardType.Vendor
            ? <VendorCardFace card={card} className="bg-amber-950" />
            : <ActionCardFace card={card} className="bg-purple-950" />
          }
        </div>
      </div>
    </div>
  );
}

// ── Narrow floating flyout ────────────────────────────────────────────────────

/**
 * Portal-based floating flyout used on narrow viewports (< WIDE_FLYOUT_BREAKPOINT).
 */
function DeckBuilderCardFlyout({
  card,
  sourceRect,
  onDismiss,
}: {
  card: ActionCard | VendorCard;
  sourceRect: DOMRect;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Capture phase ensures this fires before App's bubble-phase handler, preventing
  // Escape from propagating up and closing the whole DeckBuilderScreen.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onDismiss]);

  // Outside-click: dismiss when a pointerdown lands outside the flyout panel AND
  // is not on a deck-builder interactive element (tile buttons, counter buttons)
  // that should remain functional while the flyout is open.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (dialogRef.current?.contains(e.target as Node)) return;
      if ((e.target as Element).closest?.('[data-flyout-interactive]')) return;
      onDismiss();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onDismiss]);

  const pos = computeFlyoutPosition(sourceRect, CARD_W, CARD_H);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-label={card.name}
      tabIndex={-1}
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}
      className="rounded overflow-hidden border border-cyan-400 shadow-2xl shadow-cyan-900/60"
    >
      {card.type === CardType.Vendor
        ? <VendorCardFace card={card} className="bg-amber-950" titleSlot={
            <button onClick={onDismiss} aria-label="Close card details" className="text-gray-400 hover:text-white leading-none ml-1 flex-shrink-0 cursor-pointer" style={{ fontSize: '14px' }}>×</button>
          } />
        : <ActionCardFace card={card} className="bg-purple-950" titleSlot={
            <button onClick={onDismiss} aria-label="Close card details" className="text-gray-400 hover:text-white leading-none ml-1 flex-shrink-0 cursor-pointer" style={{ fontSize: '14px' }}>×</button>
          } />
      }
    </div>,
    document.body,
  );
}

interface DeckBuilderScreenProps {
  onBack: () => void;
  /** Called after saving the current deck; App transitions to the contract screen. */
  onStart: () => void;
}

function initialCounts(): Record<string, number> {
  const saved = loadDeckConfig();
  const spec = saved ?? FALLBACK_ACTION_DECK;
  // Seed every known card at zero so unrepresented entries still appear in the UI.
  const counts: Record<string, number> = {};
  for (const card of ACTION_CARDS) {
    counts[card.templateId] = 0;
  }
  // Vendor cards always start at 0 unless the saved spec says otherwise.
  for (const card of VENDOR_CARDS) {
    counts[card.templateId] = 0;
  }
  for (const entry of spec) {
    if (Object.prototype.hasOwnProperty.call(counts, entry.templateId)) {
      counts[entry.templateId] = entry.count;
    }
  }
  return counts;
}

function defaultCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const card of ACTION_CARDS) {
    counts[card.templateId] = 0;
  }
  // Vendor cards default to 0 — players opt in by adding them.
  for (const card of VENDOR_CARDS) {
    counts[card.templateId] = 0;
  }
  for (const entry of FALLBACK_ACTION_DECK) {
    counts[entry.templateId] = entry.count;
  }
  return counts;
}

export function DeckBuilderScreen({ onBack, onStart }: DeckBuilderScreenProps) {
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);

  const vw = window.visualViewport?.width ?? window.innerWidth;
  const isWide = vw >= WIDE_FLYOUT_BREAKPOINT;

  const handleTileClick = useCallback((card: ActionCard | VendorCard, el: HTMLButtonElement) => {
    setFlyout((prev) => {
      // Clicking the same tile again toggles the flyout closed.
      if (prev?.card.templateId === card.templateId) return null;
      return { card, rect: el.getBoundingClientRect(), triggerEl: el };
    });
  }, []);

  const handleFlyoutDismiss = useCallback(() => {
    // Return focus to the tile that opened the flyout before unmounting.
    flyout?.triggerEl.focus();
    setFlyout(null);
  }, [flyout]);

  // Action-only spec for MIN_DECK_SIZE validation — vendor cards are optional
  // and do not count toward the minimum deck size.
  const actionSpec: DeckSpec[] = ACTION_CARDS.map((card) => ({
    templateId: card.templateId,
    count: counts[card.templateId] ?? 0,
  }));
  const vendorSpec: DeckSpec[] = VENDOR_CARDS.map((card) => ({
    templateId: card.templateId,
    count: counts[card.templateId] ?? 0,
  }));
  // Combined spec saved to disk — includes both action and vendor entries.
  const currentSpec: DeckSpec[] = [...actionSpec, ...vendorSpec];
  const { valid: isValid, total } = validateDeckSpec(actionSpec);
  // Vendor count cap: players cannot add more vendor cards than there are gear slots.
  // Excess vendor cards would be permanently unplayable (no slot to receive them).
  const totalVendorCount = vendorSpec.reduce((s, e) => s + e.count, 0);
  const isVendorCountValid = totalVendorCount <= VENDOR_SLOT_COUNT;
  const isSaveEnabled = isValid && isVendorCountValid;

  const adjust = (templateId: string, delta: number) => {
    setCounts((prev) => ({
      ...prev,
      [templateId]: Math.max(0, (prev[templateId] ?? 0) + delta),
    }));
  };

  const handleReset = () => {
    setCounts(defaultCounts());
  };

  const handleSave = () => {
    if (!isSaveEnabled) return;
    saveDeckConfig(currentSpec);
  };

  const handleStart = () => {
    if (!isSaveEnabled) return;
    saveDeckConfig(currentSpec);
    onStart();
  };

  return (
    <FocusTrap focusTrapOptions={{ initialFocus: '#deck-builder-back-btn', escapeDeactivates: false }} paused={flyout !== null}>
      <div
        className="absolute inset-0 flex flex-col bg-black/95 z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-builder-title"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-6 pb-4 border-b border-cyan-900">
          <button
            id="deck-builder-back-btn"
            onClick={onBack}
            className="text-gray-400 hover:text-cyan-400 font-mono text-sm tracking-widest transition-colors"
          >
            ← BACK
          </button>
          <h1
            id="deck-builder-title"
            className="text-cyan-400 text-xl font-bold font-mono tracking-widest"
          >
            DECK BUILDER
          </h1>
          <button
            onClick={handleReset}
            className="text-gray-500 hover:text-gray-300 font-mono text-xs tracking-widest transition-colors"
          >
            RESET TO DEFAULT
          </button>
        </div>

        {/* Content: sidebar + grid row */}
        <div className="flex-1 flex flex-row min-h-0">
          {isWide && flyout !== null && (
            <DeckBuilderSidebar
              card={flyout.card}
              onDismiss={handleFlyoutDismiss}
            />
          )}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex flex-wrap gap-5 justify-center max-w-4xl mx-auto">
              {ACTION_CARDS.map((card) => {
                const count = counts[card.templateId] ?? 0;
                return (
                  <div key={card.templateId} className="flex flex-col items-center gap-2">
                    <button
                      data-flyout-interactive
                      onClick={(e) => handleTileClick(card, e.currentTarget)}
                      aria-label={`View ${card.name} details`}
                      aria-expanded={flyout?.card.templateId === card.templateId}
                      aria-haspopup="dialog"
                      className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                    >
                      <ActionCardPreview card={card} />
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        data-flyout-interactive
                        onClick={() => adjust(card.templateId, -1)}
                        disabled={count === 0}
                        aria-label={`Remove one ${card.name}`}
                        className="w-7 h-7 flex items-center justify-center rounded border border-purple-700 text-purple-300 hover:bg-purple-800 disabled:opacity-30 disabled:cursor-not-allowed font-bold font-mono transition-colors"
                      >
                        −
                      </button>
                      <span
                        className="w-8 text-center font-mono text-white text-sm"
                        aria-label={`${count} copies of ${card.name}`}
                      >
                        {count}
                      </span>
                      <button
                        data-flyout-interactive
                        onClick={() => adjust(card.templateId, 1)}
                        aria-label={`Add one ${card.name}`}
                        // TODO-0016 (#22): cap this button by the player's owned count once card ownership is implemented
                        className="w-7 h-7 flex items-center justify-center rounded border border-purple-700 text-purple-300 hover:bg-purple-800 font-bold font-mono transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Vendor cards — always start at 0; players opt in */}
            {VENDOR_CARDS.length > 0 && (
              <>
                <div className="flex items-center gap-3 mt-8 mb-4 max-w-4xl mx-auto">
                  <span className="text-amber-500 font-mono text-xs tracking-widest uppercase border border-amber-500/40 rounded px-2 py-0.5">
                    VENDOR
                  </span>
                  <span className="text-gray-500 font-mono text-xs">
                    Vendor cards go to Gear slots — not the board. Start at 0 copies.
                  </span>
                </div>
                <div className="flex flex-wrap gap-5 justify-center max-w-4xl mx-auto">
                  {VENDOR_CARDS.map((card) => {
                    const count = counts[card.templateId] ?? 0;
                    return (
                      <div key={card.templateId} className="flex flex-col items-center gap-2">
                        <button
                          data-flyout-interactive
                          onClick={(e) => handleTileClick(card, e.currentTarget)}
                          aria-label={`View ${card.name} details`}
                          aria-expanded={flyout?.card.templateId === card.templateId}
                          aria-haspopup="dialog"
                          className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                        >
                          <VendorCardPreview card={card} />
                        </button>
                        <span className="text-amber-500 font-mono text-xs tracking-widest uppercase border border-amber-500/40 rounded px-1">
                          VENDOR
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            data-flyout-interactive
                            onClick={() => adjust(card.templateId, -1)}
                            disabled={count === 0}
                            aria-label={`Remove one ${card.name}`}
                            className="w-7 h-7 flex items-center justify-center rounded border border-amber-700 text-amber-300 hover:bg-amber-800 disabled:opacity-30 disabled:cursor-not-allowed font-bold font-mono transition-colors"
                          >
                            −
                          </button>
                          <span
                            className="w-8 text-center font-mono text-white text-sm"
                            aria-label={`${count} copies of ${card.name}`}
                          >
                            {count}
                          </span>
                          <button
                            data-flyout-interactive
                            onClick={() => adjust(card.templateId, 1)}
                            aria-label={`Add one ${card.name}`}
                            // TODO-0016 (#22): cap this button by the player's owned count once card ownership is implemented
                            className="w-7 h-7 flex items-center justify-center rounded border border-amber-700 text-amber-300 hover:bg-amber-800 font-bold font-mono transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {!isWide && flyout !== null && (
            <DeckBuilderCardFlyout
              card={flyout.card}
              sourceRect={flyout.rect}
              onDismiss={handleFlyoutDismiss}
            />
          )}
        </div>

        {/* Footer: total + actions */}
        <div className="flex-shrink-0 border-t border-cyan-900 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div
              className={`font-mono text-sm tracking-widest ${isValid ? 'text-green-400' : 'text-red-400'}`}
              aria-live="polite"
            >
              {total} CARDS
              {isValid
                ? <span className="ml-2 text-xs text-gray-500">(min {MIN_DECK_SIZE})</span>
                : <span className="ml-2 text-xs">(need {MIN_DECK_SIZE - total} more)</span>}
            </div>
            <div className="font-mono text-xs text-red-400" aria-live="polite" aria-atomic="true">
              {!isVendorCountValid
                ? `Too many vendor cards — max ${VENDOR_SLOT_COUNT} (you have ${totalVendorCount})`
                : ''}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={!isSaveEnabled}
              className="px-5 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded font-mono tracking-widest transition-colors text-sm"
            >
              SAVE
            </button>
            <button
              onClick={handleStart}
              disabled={!isSaveEnabled}
              className="px-5 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded font-mono tracking-widest transition-colors text-sm"
            >
              START →
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
