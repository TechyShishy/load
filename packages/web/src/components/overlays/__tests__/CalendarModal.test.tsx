import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RoundSummary } from '@load/game-core';
import { CalendarModal } from '../CalendarModal.js';

function makeSummary(round: number, overrides: Partial<RoundSummary> = {}): RoundSummary {
  return {
    round,
    budgetDelta: 0,
    newSlaCount: 0,
    resolvedCount: 0,
    failedCount: 0,
    forgivenCount: 0,
    spawnedTrafficCount: 0,
    expiredTicketCount: 0,
    ...overrides,
  };
}

describe('CalendarModal', () => {
  it('renders the "Round Calendar" heading', () => {
    render(<CalendarModal roundHistory={[]} currentRound={1} onClose={vi.fn()} />);
    expect(screen.getByText('Round Calendar')).toBeInTheDocument();
  });

  it('renders all 28 round cells', () => {
    render(<CalendarModal roundHistory={[]} currentRound={1} onClose={vi.fn()} />);
    // R1 through R28
    expect(screen.getByText('R1')).toBeInTheDocument();
    expect(screen.getByText('R28')).toBeInTheDocument();
  });

  it('shows "now" label for current round with no summary', () => {
    render(<CalendarModal roundHistory={[]} currentRound={5} onClose={vi.fn()} />);
    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('shows positive budget delta in green', () => {
    const history = [makeSummary(1, { budgetDelta: 5000 })];
    render(<CalendarModal roundHistory={history} currentRound={2} onClose={vi.fn()} />);
    const delta = screen.getByText('+$5k');
    expect(delta).toHaveClass('text-green-400');
  });

  it('shows negative budget delta in red', () => {
    const history = [makeSummary(1, { budgetDelta: -1200 })];
    render(<CalendarModal roundHistory={history} currentRound={2} onClose={vi.fn()} />);
    const delta = screen.getByText('-$1k');
    expect(delta).toHaveClass('text-red-400');
  });

  it('shows zero budget delta in gray', () => {
    const history = [makeSummary(1, { budgetDelta: 0 })];
    render(<CalendarModal roundHistory={history} currentRound={2} onClose={vi.fn()} />);
    const delta = screen.getByText('$0');
    expect(delta).toHaveClass('text-gray-400');
  });

  it('shows net SLA label when sla count increased', () => {
    // Only round 2 in history; prevSummary for round 2 is absent → 0 baseline
    // so net change = 1. Round 1 has no summary, so only one "1 SLA" cell rendered.
    const history = [makeSummary(2, { newSlaCount: 1 })];
    render(<CalendarModal roundHistory={history} currentRound={3} onClose={vi.fn()} />);
    expect(screen.getByText('1 SLA')).toBeInTheDocument();
  });

  it('does not show SLA label when no net breach', () => {
    // round 2 newSlaCount=0 → net = 0 - 0 = 0; no SLA badge rendered for any cell.
    const history = [makeSummary(2, { newSlaCount: 0 })];
    render(<CalendarModal roundHistory={history} currentRound={3} onClose={vi.fn()} />);
    expect(screen.queryByText(/^\d+ SLA$/)).toBeNull();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<CalendarModal roundHistory={[]} currentRound={1} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<CalendarModal roundHistory={[]} currentRound={1} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<CalendarModal roundHistory={[]} currentRound={1} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close calendar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('formats large positive delta with M suffix', () => {
    const history = [makeSummary(1, { budgetDelta: 2_500_000 })];
    render(<CalendarModal roundHistory={history} currentRound={2} onClose={vi.fn()} />);
    expect(screen.getByText('+$2.5M')).toBeInTheDocument();
  });
});
