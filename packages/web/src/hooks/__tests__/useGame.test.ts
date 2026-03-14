import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { IAudioManager } from '../../audio/AudioManager.js';
import { AudioCtx } from '../../audio/AudioContext.js';

// ─── Hoisted mock helpers (must precede vi.mock calls) ────────────────────────
const mockSend = vi.hoisted(() => vi.fn());
const mockPlayCardDrop = vi.hoisted(() => vi.fn());
const mockPlayWin = vi.hoisted(() => vi.fn());
const mockPlayLose = vi.hoisted(() => vi.fn());
const mockPlayAdvance = vi.hoisted(() => vi.fn());
const mockPlaySLAFail = vi.hoisted(() => vi.fn());
const mockPlayOverload = vi.hoisted(() => vi.fn());
const mockSaveGame = vi.hoisted(() => vi.fn());
const mockClearSave = vi.hoisted(() => vi.fn());
const mockLoadGame = vi.hoisted(() => vi.fn().mockReturnValue(null));
const mockLoadDeckConfig = vi.hoisted(() => vi.fn().mockReturnValue(null));

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('@xstate/react', () => ({
  useMachine: vi.fn(() => [{ context: { budget: 0, hand: [] }, value: 'scheduling' }, mockSend, {} as never]),
}));

vi.mock('../../save.js', () => ({
  saveGame: mockSaveGame,
  clearSave: mockClearSave,
  loadGame: mockLoadGame,
  loadDeckConfig: mockLoadDeckConfig,
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────
import { useMachine } from '@xstate/react';
import { useGame } from '../useGame.js';
import { ACTION_CARDS, SlotType, Period } from '@load/game-core';
import type { ActionCard, TrafficSlotPosition } from '@load/game-core';

// ─── Audio stub ───────────────────────────────────────────────────────────────
const mockAudio: IAudioManager = {
  playCardDrop: mockPlayCardDrop,
  playSLAFail: mockPlaySLAFail,
  playOverload: mockPlayOverload,
  playWin: mockPlayWin,
  playLose: mockPlayLose,
  playAdvance: mockPlayAdvance,
  setMasterVolume: vi.fn(),
  setMusicVolume: vi.fn(),
  mute: vi.fn(),
  startMusic: vi.fn(),
  stopMusic: vi.fn(),
  unlock: vi.fn(),
  destroy: vi.fn(),
};

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(AudioCtx.Provider, { value: mockAudio }, children);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fakeCard: ActionCard = ACTION_CARDS.find((c) => c.id === 'action-work-order')!;

function mockPhase(phase: string) {
  vi.mocked(useMachine).mockReturnValue([
    { context: { budget: 0, hand: [] }, value: phase } as never,
    mockSend,
    {} as never,
  ]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('useGame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: scheduling phase, no saved game
    mockPhase('scheduling');
  });

  it('returns context and phase from the machine snapshot', () => {
    vi.mocked(useMachine).mockReturnValue([
      { context: { budget: 42_000, hand: [] }, value: 'draw' } as never,
      mockSend,
      {} as never,
    ]);
    const { result } = renderHook(() => useGame(), { wrapper });
    expect(result.current.context.budget).toBe(42_000);
    expect(result.current.phase).toBe('draw');
  });

  it('advance() sends ADVANCE', () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    act(() => { result.current.advance(); });
    expect(mockSend).toHaveBeenCalledWith({ type: 'ADVANCE' });
  });

  it('advance() calls playAdvance before sending', () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    act(() => { result.current.advance(); });
    expect(mockPlayAdvance).toHaveBeenCalledOnce();
  });

  it('drawComplete() sends DRAW_COMPLETE', () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    act(() => { result.current.drawComplete(); });
    expect(mockSend).toHaveBeenCalledWith({ type: 'DRAW_COMPLETE' });
  });

  it('reset() calls clearSave and sends RESET', () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    act(() => { result.current.reset(); });
    expect(mockClearSave).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith({ type: 'RESET' });
  });

  it('playAction() sends PLAY_ACTION and calls playCardDrop', () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    act(() => { result.current.playAction(fakeCard); });
    expect(mockSend).toHaveBeenCalledWith({ type: 'PLAY_ACTION', card: fakeCard });
    expect(mockPlayCardDrop).toHaveBeenCalledOnce();
  });

  it('playAction() includes targetEventId when provided', () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    act(() => { result.current.playAction(fakeCard, 'evt-42'); });
    expect(mockSend).toHaveBeenCalledWith({
      type: 'PLAY_ACTION',
      card: fakeCard,
      targetEventId: 'evt-42',
    });
  });

  it('isWon is true only when phase is gameWon', () => {
    mockPhase('gameWon');
    const { result } = renderHook(() => useGame(), { wrapper });
    expect(result.current.isWon).toBe(true);
    expect(result.current.isLost).toBe(false);
  });

  it('isLost is true only when phase is gameLost', () => {
    mockPhase('gameLost');
    const { result } = renderHook(() => useGame(), { wrapper });
    expect(result.current.isLost).toBe(true);
    expect(result.current.isWon).toBe(false);
  });

  it('hasSave is false when loadGame returns null', () => {
    const { result } = renderHook(() => useGame(), { wrapper });
    expect(result.current.hasSave).toBe(false);
  });

  it('hasSave is true when loadGame returns a saved context', () => {
    mockLoadGame.mockReturnValueOnce({ round: 3, budget: 50_000 } as never);
    const { result } = renderHook(() => useGame(), { wrapper });
    expect(result.current.hasSave).toBe(true);
  });

  it('calls saveGame when phase is scheduling', () => {
    mockPhase('scheduling');
    renderHook(() => useGame(), { wrapper });
    expect(mockSaveGame).toHaveBeenCalled();
  });

  it('calls saveGame when phase is crisis', () => {
    mockPhase('crisis');
    renderHook(() => useGame(), { wrapper });
    expect(mockSaveGame).toHaveBeenCalled();
  });

  it('does not call saveGame when phase is draw', () => {
    mockPhase('draw');
    renderHook(() => useGame(), { wrapper });
    expect(mockSaveGame).not.toHaveBeenCalled();
  });

  it('plays the win sound when phase is gameWon', () => {
    mockPhase('gameWon');
    renderHook(() => useGame(), { wrapper });
    expect(mockPlayWin).toHaveBeenCalledOnce();
    expect(mockPlayLose).not.toHaveBeenCalled();
  });

  it('plays the lose sound when phase is gameLost', () => {
    mockPhase('gameLost');
    renderHook(() => useGame(), { wrapper });
    expect(mockPlayLose).toHaveBeenCalledOnce();
    expect(mockPlayWin).not.toHaveBeenCalled();
  });

  it('playSLAFail does NOT fire on initial mount even when failedCount > 0 (saved-game guard)', () => {
    // Guard prevents the sound from firing when the hook mounts into a saved
    // game that already has failedCount > 0 — no game event is occurring.
    vi.mocked(useMachine).mockReturnValue([
      {
        context: {
          budget: 0,
          hand: [],
          lastRoundSummary: {
            round: 2, budgetDelta: -5000, newSlaCount: 1,
            resolvedCount: 3, failedCount: 1, forgivenCount: 0,
            spawnedTrafficCount: 0, expiredTicketCount: 0,
          },
        },
        value: 'scheduling',
      } as never,
      mockSend,
      {} as never,
    ]);
    renderHook(() => useGame(), { wrapper });
    expect(mockPlaySLAFail).not.toHaveBeenCalled();
  });

  it('playSLAFail fires when lastRoundSummary changes to failedCount > 0 after mount', () => {
    // Initial mount with no failures — mount guard is satisfied.
    vi.mocked(useMachine).mockReturnValue([
      {
        context: {
          budget: 0,
          hand: [],
          lastRoundSummary: {
            round: 1, budgetDelta: 5000, newSlaCount: 0,
            resolvedCount: 3, failedCount: 0, forgivenCount: 0,
            spawnedTrafficCount: 0, expiredTicketCount: 0,
          },
        },
        value: 'scheduling',
      } as never,
      mockSend,
      {} as never,
    ]);
    const { rerender } = renderHook(() => useGame(), { wrapper });
    expect(mockPlaySLAFail).not.toHaveBeenCalled();

    // State change: new round summary with a failure — the effect should fire.
    vi.mocked(useMachine).mockReturnValue([
      {
        context: {
          budget: 0,
          hand: [],
          lastRoundSummary: {
            round: 2, budgetDelta: -5000, newSlaCount: 1,
            resolvedCount: 3, failedCount: 1, forgivenCount: 0,
            spawnedTrafficCount: 0, expiredTicketCount: 0,
          },
        },
        value: 'scheduling',
      } as never,
      mockSend,
      {} as never,
    ]);
    rerender();
    expect(mockPlaySLAFail).toHaveBeenCalledOnce();
  });

  it('playSLAFail does not fire when failedCount is 0', () => {
    vi.mocked(useMachine).mockReturnValue([
      {
        context: {
          budget: 0,
          hand: [],
          lastRoundSummary: {
            round: 2, budgetDelta: 10000, newSlaCount: 0,
            resolvedCount: 5, failedCount: 0, forgivenCount: 0,
            spawnedTrafficCount: 0, expiredTicketCount: 0,
          },
        },
        value: 'scheduling',
      } as never,
      mockSend,
      {} as never,
    ]);
    renderHook(() => useGame(), { wrapper });
    expect(mockPlaySLAFail).not.toHaveBeenCalled();
  });

  it('playSLAFail does not fire when phase is gameLost (playLose takes over)', () => {
    vi.mocked(useMachine).mockReturnValue([
      {
        context: {
          budget: 0,
          hand: [],
          lastRoundSummary: {
            round: 3, budgetDelta: -5000, newSlaCount: 3,
            resolvedCount: 2, failedCount: 1, forgivenCount: 0,
            spawnedTrafficCount: 0, expiredTicketCount: 0,
          },
        },
        value: 'gameLost',
      } as never,
      mockSend,
      {} as never,
    ]);
    renderHook(() => useGame(), { wrapper });
    expect(mockPlaySLAFail).not.toHaveBeenCalled();
    expect(mockPlayLose).toHaveBeenCalledOnce();
  });

  it('playOverload fires when phase transitions to scheduling with overloaded slots', () => {
    // Initial render: crisis phase, no overloaded slots
    vi.mocked(useMachine).mockReturnValue([
      { context: { budget: 0, hand: [], trafficSlotPositions: {} }, value: 'crisis' } as never,
      mockSend,
      {} as never,
    ]);
    const { rerender } = renderHook(() => useGame(), { wrapper });

    // Transition to scheduling with an overloaded slot
    const overloadedPos: TrafficSlotPosition = {
      period: Period.Morning, slotIndex: 0, slotType: SlotType.Overloaded,
    };
    vi.mocked(useMachine).mockReturnValue([
      {
        context: { budget: 0, hand: [], trafficSlotPositions: { 'card-1': overloadedPos } },
        value: 'scheduling',
      } as never,
      mockSend,
      {} as never,
    ]);
    rerender();

    expect(mockPlayOverload).toHaveBeenCalledOnce();
  });

  it('playOverload does not fire on initial scheduling render (no transition)', () => {
    // Start directly in scheduling with an overloaded slot — no prior phase change
    const overloadedPos: TrafficSlotPosition = {
      period: Period.Morning, slotIndex: 0, slotType: SlotType.Overloaded,
    };
    vi.mocked(useMachine).mockReturnValue([
      {
        context: { budget: 0, hand: [], trafficSlotPositions: { 'card-1': overloadedPos } },
        value: 'scheduling',
      } as never,
      mockSend,
      {} as never,
    ]);
    renderHook(() => useGame(), { wrapper });
    expect(mockPlayOverload).not.toHaveBeenCalled();
  });
});
