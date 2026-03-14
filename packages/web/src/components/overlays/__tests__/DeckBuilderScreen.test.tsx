import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACTION_CARDS, DEFAULT_ACTION_DECK, MIN_DECK_SIZE } from '@load/game-core';
import type { DeckSpec } from '@load/game-core';
import { DeckBuilderScreen } from '../DeckBuilderScreen.js';

const mockLoadDeckConfig = vi.hoisted(() => vi.fn<[], ReadonlyArray<DeckSpec> | null>(() => null));
const mockSaveDeckConfig = vi.hoisted(() => vi.fn<[ReadonlyArray<DeckSpec>], void>());

vi.mock('../../../save.js', () => ({
  loadDeckConfig: mockLoadDeckConfig,
  saveDeckConfig: mockSaveDeckConfig,
}));

const defaultProps = {
  onBack: vi.fn(),
  onStart: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadDeckConfig.mockReturnValue(null); // default: use DEFAULT_ACTION_DECK
});

describe('DeckBuilderScreen — card catalog', () => {
  it('renders all 7 action card names', () => {
    render(<DeckBuilderScreen {...defaultProps} />);
    for (const card of ACTION_CARDS) {
      expect(screen.getByText(card.name)).toBeInTheDocument();
    }
  });

  it('shows running total equal to DEFAULT_ACTION_DECK total when no saved config', () => {
    const expectedTotal = DEFAULT_ACTION_DECK.reduce((s, e) => s + e.count, 0);
    render(<DeckBuilderScreen {...defaultProps} />);
    expect(screen.getByText(new RegExp(`^${expectedTotal} CARDS`))).toBeInTheDocument();
  });
});

describe('DeckBuilderScreen — counter controls', () => {
  it('+ button increments the card count', async () => {
    // Start with an empty deck so counts are zero
    mockLoadDeckConfig.mockReturnValue([]);
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);

    const workOrder = ACTION_CARDS.find((c) => c.templateId === 'action-work-order')!;
    await user.click(screen.getByRole('button', { name: `Add one ${workOrder.name}` }));

    expect(screen.getByLabelText(`1 copies of ${workOrder.name}`)).toBeInTheDocument();
  });

  it('− button decrements the card count', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);

    const workOrder = ACTION_CARDS.find((c) => c.templateId === 'action-work-order')!;
    const addBtn = screen.getByRole('button', { name: `Add one ${workOrder.name}` });
    const removeBtn = screen.getByRole('button', { name: `Remove one ${workOrder.name}` });

    await user.click(addBtn); // count → 1 (above default)
    await user.click(removeBtn);
    // back to default value from DEFAULT_ACTION_DECK
    const defaultEntry = DEFAULT_ACTION_DECK.find((e) => e.templateId === 'action-work-order');
    expect(
      screen.getByLabelText(`${defaultEntry!.count} copies of ${workOrder.name}`),
    ).toBeInTheDocument();
  });

  it('− button is disabled when count is 0', () => {
    mockLoadDeckConfig.mockReturnValue([]);
    render(<DeckBuilderScreen {...defaultProps} />);

    const workOrder = ACTION_CARDS.find((c) => c.templateId === 'action-work-order')!;
    expect(
      screen.getByRole('button', { name: `Remove one ${workOrder.name}` }),
    ).toBeDisabled();
  });
});

describe('DeckBuilderScreen — save validation', () => {
  it('Save button is disabled when total is below MIN_DECK_SIZE', () => {
    // Empty spec → total 0
    mockLoadDeckConfig.mockReturnValue([]);
    render(<DeckBuilderScreen {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'SAVE' })).toBeDisabled();
  });

  it('Save button is enabled when total meets MIN_DECK_SIZE', () => {
    // Default spec → total 29 ≥ MIN_DECK_SIZE
    render(<DeckBuilderScreen {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'SAVE' })).toBeEnabled();
  });

  it('START button is disabled when deck is invalid', () => {
    mockLoadDeckConfig.mockReturnValue([]);
    render(<DeckBuilderScreen {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'START →' })).toBeDisabled();
  });

  it('shows the minimum card count requirement', () => {
    render(<DeckBuilderScreen {...defaultProps} />);
    expect(screen.getByText(new RegExp(`min ${MIN_DECK_SIZE}`))).toBeInTheDocument();
  });
});

describe('DeckBuilderScreen — Save action', () => {
  it('Save calls saveDeckConfig with the current spec', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: 'SAVE' }));
    expect(mockSaveDeckConfig).toHaveBeenCalledOnce();
    const savedSpec = mockSaveDeckConfig.mock.calls[0]![0];
    // Each entry in the spec has a non-negative count
    expect(savedSpec.every((e) => e.count >= 0)).toBe(true);
  });

  it('Save does not call saveDeckConfig when deck is invalid', () => {
    mockLoadDeckConfig.mockReturnValue([]);
    render(<DeckBuilderScreen {...defaultProps} />);
    // Save is disabled so clicking it should not fire saveDeckConfig
    const saveBtn = screen.getByRole('button', { name: 'SAVE' });
    expect(saveBtn).toBeDisabled();
    expect(mockSaveDeckConfig).not.toHaveBeenCalled();
  });
});

describe('DeckBuilderScreen — Reset to Default', () => {
  it('restores DEFAULT_ACTION_DECK counts', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);

    const workOrder = ACTION_CARDS.find((c) => c.templateId === 'action-work-order')!;
    const defaultEntry = DEFAULT_ACTION_DECK.find((e) => e.templateId === 'action-work-order')!;

    // Bump Work Order count
    await user.click(screen.getByRole('button', { name: `Add one ${workOrder.name}` }));
    expect(
      screen.getByLabelText(`${defaultEntry.count + 1} copies of ${workOrder.name}`),
    ).toBeInTheDocument();

    // Reset
    await user.click(screen.getByRole('button', { name: 'RESET TO DEFAULT' }));
    expect(
      screen.getByLabelText(`${defaultEntry.count} copies of ${workOrder.name}`),
    ).toBeInTheDocument();
  });
});

describe('DeckBuilderScreen — navigation', () => {
  it('clicking BACK calls onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<DeckBuilderScreen {...defaultProps} onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: '← BACK' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('clicking START saves and calls onStart when deck is valid', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<DeckBuilderScreen {...defaultProps} onStart={onStart} />);
    await user.click(screen.getByRole('button', { name: 'START →' }));
    expect(mockSaveDeckConfig).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledOnce();
  });
});
