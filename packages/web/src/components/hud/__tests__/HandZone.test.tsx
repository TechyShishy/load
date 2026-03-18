import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import type { ActionCard } from '@load/game-core';
import { CardType } from '@load/game-core';
import { HandZone } from '../HandZone.js';

function makeCard(overrides: Partial<Pick<ActionCard, 'id' | 'name' | 'cost' | 'description' | 'templateId'>> = {}): ActionCard {
  return {
    id: 'test-card-1',
    type: CardType.Action,
    templateId: 'test-card',
    name: 'Test Card',
    cost: 10_000,
    description: 'A test card.',
    ...overrides,
  } as unknown as ActionCard;
}

/** Wrap in DndContext so useDraggable has a context to register with. */
function renderWithDnd(ui: React.ReactElement) {
  return render(<DndContext>{ui}</DndContext>);
}

describe('HandZone', () => {
  it('shows an empty-hand message when hand is empty', () => {
    renderWithDnd(<HandZone hand={[]} />);
    expect(screen.getByText('No cards in hand')).toBeInTheDocument();
  });

  it('does not show the empty-hand message when cards are present', () => {
    renderWithDnd(<HandZone hand={[makeCard()]} />);
    expect(screen.queryByText('No cards in hand')).not.toBeInTheDocument();
  });

  it('renders a draggable item for each card in hand', () => {
    const hand = [
      makeCard({ id: 'a', name: 'Alpha' }),
      makeCard({ id: 'b', name: 'Beta' }),
    ];
    renderWithDnd(<HandZone hand={hand} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('displays the card cost formatted with a dollar sign', () => {
    renderWithDnd(<HandZone hand={[makeCard({ cost: 25_000 })]} />);
    expect(screen.getByText('Cost: $25,000')).toBeInTheDocument();
  });

  it('renders cards with draggable role when not disabled', () => {
    const card = makeCard({ name: 'Draggable Card' });
    renderWithDnd(<HandZone hand={[card]} />);
    // useDraggable spreads { role: 'button', tabIndex: 0 } onto the element
    const el = screen.getByRole('button', { name: /Draggable Card/ });
    expect(el).toBeInTheDocument();
    expect(el).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('marks cards as aria-disabled when disabled prop is true', () => {
    const hand = [makeCard({ id: 'a', name: 'A' }), makeCard({ id: 'b', name: 'B' })];
    renderWithDnd(<HandZone hand={hand} disabled />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toHaveAttribute('aria-disabled', 'true'));
  });

  it('does not mark cards aria-disabled when disabled prop is false', () => {
    renderWithDnd(<HandZone hand={[makeCard()]} disabled={false} />);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-disabled', 'true');
  });
});

describe('ExpandedCardFlyout', () => {
  it('shows a flyout when a card in hand is clicked', () => {
    renderWithDnd(<HandZone hand={[makeCard({ name: 'Zoom Card' })]} />);
    fireEvent.click(screen.getByRole('button', { name: /Zoom Card/ }));
    expect(screen.getByRole('dialog', { name: 'Zoom Card details' })).toBeInTheDocument();
  });

  it('clicking a card again collapses the flyout', () => {
    renderWithDnd(<HandZone hand={[makeCard({ name: 'Zoom Card' })]} />);
    const btn = screen.getByRole('button', { name: /Zoom Card/ });
    fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dismisses the flyout when the close button is clicked', () => {
    renderWithDnd(<HandZone hand={[makeCard({ name: 'Zoom Card' })]} />);
    fireEvent.click(screen.getByRole('button', { name: /Zoom Card/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close card details' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dismisses the flyout when the backdrop is clicked', () => {
    renderWithDnd(<HandZone hand={[makeCard({ name: 'Zoom Card' })]} />);
    fireEvent.click(screen.getByRole('button', { name: /Zoom Card/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('card-flyout-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dismisses the flyout when the flyout body itself is clicked', () => {
    renderWithDnd(<HandZone hand={[makeCard({ name: 'Zoom Card' })]} />);
    fireEvent.click(screen.getByRole('button', { name: /Zoom Card/ }));
    const dialog = screen.getByRole('dialog', { name: 'Zoom Card details' });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dismisses the flyout when Escape is pressed', () => {
    renderWithDnd(<HandZone hand={[makeCard({ name: 'Zoom Card' })]} />);
    fireEvent.click(screen.getByRole('button', { name: /Zoom Card/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('still opens the flyout when the card is disabled (e.g. crisisOnly during scheduling)', () => {
    renderWithDnd(<HandZone hand={[makeCard({ name: 'Disabled Card' })]} disabled />);
    fireEvent.click(screen.getByRole('button', { name: /Disabled Card/ }));
    expect(screen.getByRole('dialog', { name: 'Disabled Card details' })).toBeInTheDocument();
  });

  it('shows the flyout with the card description and cost', () => {
    renderWithDnd(
      <HandZone
        hand={[makeCard({ name: 'Rich Card', description: 'Does something useful.', cost: 50_000 })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Rich Card/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Does something useful.');
    expect(dialog).toHaveTextContent('$50,000');
  });
});
