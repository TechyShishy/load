import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoseReason } from '@load/game-core';
import type { GameContext } from '@load/game-core';
import { WinScreen, LoseScreen } from '../EndScreens.js';

function makeContext(overrides: Partial<GameContext> = {}): GameContext {
  return {
    budget: 500_000,
    round: 13,
    slaCount: 1,
    loseReason: null,
    hand: [],
    playedThisRound: [],
    timeSlots: [],
    tracks: [],
    vendorSlots: [],
    pendingEvents: [],
    mitigatedEventIds: [],
    activePhase: 'Draw' as GameContext['activePhase'],
    trafficEventDeck: [],
    trafficEventDiscard: [],
    actionDeck: [],
    actionDiscard: [],
    lastRoundSummary: null,
    seed: 'test-seed',
    ...overrides,
  } as GameContext;
}

describe('WinScreen', () => {
  it('renders the NETWORK STABLE heading', () => {
    render(<WinScreen context={makeContext()} onPlayAgain={vi.fn()} />);
    expect(screen.getByText('NETWORK STABLE')).toBeInTheDocument();
  });

  it('displays the formatted final budget', () => {
    render(<WinScreen context={makeContext({ budget: 250_000 })} onPlayAgain={vi.fn()} />);
    expect(screen.getByText('$250,000')).toBeInTheDocument();
  });

  it('displays the completed rounds as (round - 1) / 12', () => {
    // round=13 means 12 rounds completed
    render(<WinScreen context={makeContext({ round: 13 })} onPlayAgain={vi.fn()} />);
    expect(screen.getByText('12 / 12')).toBeInTheDocument();
  });

  it('displays the SLA failure count', () => {
    render(<WinScreen context={makeContext({ slaCount: 2 })} onPlayAgain={vi.fn()} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('calls onPlayAgain when PLAY AGAIN is clicked', async () => {
    const user = userEvent.setup();
    const onPlayAgain = vi.fn();
    render(<WinScreen context={makeContext()} onPlayAgain={onPlayAgain} />);
    await user.click(screen.getByText('PLAY AGAIN'));
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });
});

describe('LoseScreen', () => {
  it('renders the SYSTEM DOWN heading', () => {
    render(<LoseScreen context={makeContext({ loseReason: LoseReason.Bankrupt })} onPlayAgain={vi.fn()} />);
    expect(screen.getByText('SYSTEM DOWN')).toBeInTheDocument();
  });

  it('shows budget-exceeded message for Bankrupt lose reason', () => {
    render(
      <LoseScreen context={makeContext({ loseReason: LoseReason.Bankrupt })} onPlayAgain={vi.fn()} />,
    );
    expect(screen.getByText('Budget exceeded critical threshold')).toBeInTheDocument();
  });

  it('shows SLA-violations message for SLAExceeded lose reason', () => {
    render(
      <LoseScreen context={makeContext({ loseReason: LoseReason.SLAExceeded })} onPlayAgain={vi.fn()} />,
    );
    expect(screen.getByText('SLA violations reached maximum')).toBeInTheDocument();
  });

  it('displays the round reached', () => {
    render(
      <LoseScreen context={makeContext({ round: 7, loseReason: LoseReason.Bankrupt })} onPlayAgain={vi.fn()} />,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('calls onPlayAgain when TRY AGAIN is clicked', async () => {
    const user = userEvent.setup();
    const onPlayAgain = vi.fn();
    render(
      <LoseScreen context={makeContext({ loseReason: LoseReason.Bankrupt })} onPlayAgain={onPlayAgain} />,
    );
    await user.click(screen.getByText('TRY AGAIN'));
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });
});
