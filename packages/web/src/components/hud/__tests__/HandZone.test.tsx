import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActionCard } from '@load/game-core';
import { ActionEffectType, CardType } from '@load/game-core';
import { HandZone } from '../HandZone.js';

function makeCard(overrides: Partial<ActionCard> = {}): ActionCard {
  return {
    id: 'test-card-1',
    type: CardType.Action,
    name: 'Test Card',
    cost: 10_000,
    effectType: ActionEffectType.ClearTicket,
    effectValue: 1,
    description: 'A test card.',
    ...overrides,
  };
}

describe('HandZone', () => {
  it('shows an empty-hand message when hand is empty', () => {
    render(<HandZone hand={[]} onPlayCard={vi.fn()} />);
    expect(screen.getByText('No cards in hand')).toBeInTheDocument();
  });

  it('does not show the empty-hand message when cards are present', () => {
    render(<HandZone hand={[makeCard()]} onPlayCard={vi.fn()} />);
    expect(screen.queryByText('No cards in hand')).not.toBeInTheDocument();
  });

  it('renders a button for each card in hand', () => {
    const hand = [
      makeCard({ id: 'a', name: 'Alpha' }),
      makeCard({ id: 'b', name: 'Beta' }),
    ];
    render(<HandZone hand={hand} onPlayCard={vi.fn()} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('displays the card cost formatted with a dollar sign', () => {
    render(<HandZone hand={[makeCard({ cost: 25_000 })]} onPlayCard={vi.fn()} />);
    expect(screen.getByText('$25,000')).toBeInTheDocument();
  });

  it('calls onPlayCard with the correct card when clicked', async () => {
    const user = userEvent.setup();
    const card = makeCard({ name: 'Click Me' });
    const onPlayCard = vi.fn();
    render(<HandZone hand={[card]} onPlayCard={onPlayCard} />);
    await user.click(screen.getByText('Click Me'));
    expect(onPlayCard).toHaveBeenCalledOnce();
    expect(onPlayCard).toHaveBeenCalledWith(card);
  });

  it('disables all card buttons when disabled prop is true', () => {
    const hand = [makeCard({ id: 'a', name: 'A' }), makeCard({ id: 'b', name: 'B' })];
    render(<HandZone hand={hand} onPlayCard={vi.fn()} disabled />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('does not disable buttons when disabled prop is false', () => {
    render(<HandZone hand={[makeCard()]} onPlayCard={vi.fn()} disabled={false} />);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('does not call onPlayCard when a disabled button is clicked', async () => {
    const user = userEvent.setup();
    const onPlayCard = vi.fn();
    render(<HandZone hand={[makeCard({ name: 'Nope' })]} onPlayCard={onPlayCard} disabled />);
    await user.click(screen.getByText('Nope'));
    expect(onPlayCard).not.toHaveBeenCalled();
  });
});
