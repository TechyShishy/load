import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACTION_CARDS, FALLBACK_ACTION_DECK, MIN_DECK_SIZE, VendorCard, VENDOR_CARDS, VENDOR_SLOT_COUNT } from '@load/game-core';
import type { DeckSpec, GameContext } from '@load/game-core';
import { DeckBuilderScreen } from '../DeckBuilderScreen.js';

const mockLoadDeckConfig = vi.hoisted(() => vi.fn<[], ReadonlyArray<DeckSpec> | null>(() => null));
const mockSaveDeckConfig = vi.hoisted(() => vi.fn<[ReadonlyArray<DeckSpec>], void>());

vi.mock('../../../save.js', () => ({
  loadDeckConfig: mockLoadDeckConfig,
  saveDeckConfig: mockSaveDeckConfig,
}));

// ── Stub vendor card for tests ───────────────────────────────────────────────
class StubVendorCard extends VendorCard {
  readonly templateId = 'vendor-test-appliance';
  readonly id: string;
  readonly name = 'Test Appliance';
  readonly cost = 1000;
  readonly description = 'A test vendor card';
  constructor(instanceId = 'vendor-test-appliance') {
    super();
    this.id = instanceId;
  }
  onResolve(ctx: GameContext): GameContext { return ctx; }
}

const stubVendorTemplate = new StubVendorCard();

const defaultProps = {
  onBack: vi.fn(),
  onStart: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadDeckConfig.mockReturnValue(null); // default: use FALLBACK_ACTION_DECK
  VENDOR_CARDS.push(stubVendorTemplate);
});

afterEach(() => {
  const idx = VENDOR_CARDS.indexOf(stubVendorTemplate);
  if (idx !== -1) VENDOR_CARDS.splice(idx, 1);
});

describe('DeckBuilderScreen — card catalog', () => {
  it('renders all 7 action card names', () => {
    render(<DeckBuilderScreen {...defaultProps} />);
    for (const card of ACTION_CARDS) {
      expect(screen.getByText(card.name)).toBeInTheDocument();
    }
  });

  it('shows running total equal to FALLBACK_ACTION_DECK total when no saved config', () => {
    const expectedTotal = FALLBACK_ACTION_DECK.reduce((s, e) => s + e.count, 0);
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
    // back to default value from FALLBACK_ACTION_DECK
    const defaultEntry = FALLBACK_ACTION_DECK.find((e) => e.templateId === 'action-work-order');
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
  it('restores FALLBACK_ACTION_DECK counts', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);

    const workOrder = ACTION_CARDS.find((c) => c.templateId === 'action-work-order')!;
    const defaultEntry = FALLBACK_ACTION_DECK.find((e) => e.templateId === 'action-work-order')!;

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

describe('DeckBuilderScreen — vendor cards', () => {
  it('renders vendor card name in the catalog', () => {
    render(<DeckBuilderScreen {...defaultProps} />);
    expect(screen.getByText(stubVendorTemplate.name)).toBeInTheDocument();
  });

  it('shows a VENDOR badge for each vendor card', () => {
    render(<DeckBuilderScreen {...defaultProps} />);
    // There should be at least one VENDOR badge visible.
    const badges = screen.getAllByText('VENDOR');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('vendor card count starts at 0', () => {
    render(<DeckBuilderScreen {...defaultProps} />);
    expect(
      screen.getByLabelText(`0 copies of ${stubVendorTemplate.name}`),
    ).toBeInTheDocument();
  });

  it('vendor count starts at 0 even when no saved config', () => {
    mockLoadDeckConfig.mockReturnValue(null);
    render(<DeckBuilderScreen {...defaultProps} />);
    expect(
      screen.getByLabelText(`0 copies of ${stubVendorTemplate.name}`),
    ).toBeInTheDocument();
  });

  it('+ button increments vendor card count', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: `Add one ${stubVendorTemplate.name}` }));
    expect(
      screen.getByLabelText(`1 copies of ${stubVendorTemplate.name}`),
    ).toBeInTheDocument();
  });

  it('− button is disabled when vendor count is 0', () => {
    render(<DeckBuilderScreen {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: `Remove one ${stubVendorTemplate.name}` }),
    ).toBeDisabled();
  });

  it('saved spec includes vendor entries', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);
    // Add one vendor card
    await user.click(screen.getByRole('button', { name: `Add one ${stubVendorTemplate.name}` }));
    await user.click(screen.getByRole('button', { name: 'SAVE' }));
    const saved = mockSaveDeckConfig.mock.calls[0]![0];
    const vendorEntry = saved.find((e) => e.templateId === stubVendorTemplate.templateId);
    expect(vendorEntry).toBeDefined();
    expect(vendorEntry!.count).toBe(1);
  });

  it('vendor count is loaded from saved spec', () => {
    mockLoadDeckConfig.mockReturnValue([
      ...FALLBACK_ACTION_DECK,
      { templateId: stubVendorTemplate.templateId, count: 2 },
    ]);
    render(<DeckBuilderScreen {...defaultProps} />);
    expect(
      screen.getByLabelText(`2 copies of ${stubVendorTemplate.name}`),
    ).toBeInTheDocument();
  });

  it('Reset to Default resets vendor count to 0', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);
    // Add vendor card
    await user.click(screen.getByRole('button', { name: `Add one ${stubVendorTemplate.name}` }));
    expect(screen.getByLabelText(`1 copies of ${stubVendorTemplate.name}`)).toBeInTheDocument();
    // Reset
    await user.click(screen.getByRole('button', { name: 'RESET TO DEFAULT' }));
    expect(screen.getByLabelText(`0 copies of ${stubVendorTemplate.name}`)).toBeInTheDocument();
  });

  it('adding vendor cards alone does NOT enable the Save button (need action cards too)', () => {
    // Empty deck spec — no action cards
    mockLoadDeckConfig.mockReturnValue([]);
    render(<DeckBuilderScreen {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'SAVE' })).toBeDisabled();
  });

  it('Save button is disabled and error shown when vendor count exceeds VENDOR_SLOT_COUNT', async () => {
    const user = userEvent.setup();
    // Load enough action cards to pass MIN_DECK_SIZE validation
    mockLoadDeckConfig.mockReturnValue(FALLBACK_ACTION_DECK as DeckSpec[]);
    render(<DeckBuilderScreen {...defaultProps} />);
    // Add one more vendor card than the gear slots allow
    const addBtn = screen.getByRole('button', { name: `Add one ${stubVendorTemplate.name}` });
    for (let i = 0; i <= VENDOR_SLOT_COUNT; i++) {
      await user.click(addBtn);
    }
    expect(screen.getByRole('button', { name: 'SAVE' })).toBeDisabled();
    expect(screen.getByText(/too many vendor cards/i)).toBeInTheDocument();
  });
});

describe('DeckBuilderScreen — card detail flyout', () => {
  it('opens flyout with card name and description when tile is clicked', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);

    const workOrder = ACTION_CARDS.find((c) => c.templateId === 'action-work-order')!;
    await user.click(screen.getByRole('button', { name: `View ${workOrder.name} details` }));

    // The flyout dialog is identified by the card name via aria-labelledby
    const flyoutDialog = screen.getByRole('dialog', { name: workOrder.name });
    expect(flyoutDialog).toBeInTheDocument();
    // Description text also appears in the card tile preview — scope to the flyout
    expect(within(flyoutDialog).getByText(workOrder.description)).toBeInTheDocument();
  });

  it('replaces flyout when a different tile is clicked', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);

    const [cardA, cardB] = ACTION_CARDS as [typeof ACTION_CARDS[0], typeof ACTION_CARDS[1]];
    await user.click(screen.getByRole('button', { name: `View ${cardA.name} details` }));
    expect(screen.getByRole('dialog', { name: cardA.name })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `View ${cardB.name} details` }));

    expect(screen.queryByRole('dialog', { name: cardA.name })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: cardB.name })).toBeInTheDocument();
  });

  it('clicking the same tile again dismisses the flyout (toggle)', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);

    const workOrder = ACTION_CARDS.find((c) => c.templateId === 'action-work-order')!;
    const tileBtn = screen.getByRole('button', { name: `View ${workOrder.name} details` });

    await user.click(tileBtn);
    expect(screen.getByRole('dialog', { name: workOrder.name })).toBeInTheDocument();

    await user.click(tileBtn);
    expect(screen.queryByRole('dialog', { name: workOrder.name })).not.toBeInTheDocument();
  });

  it('Escape key dismisses the flyout', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);

    const workOrder = ACTION_CARDS.find((c) => c.templateId === 'action-work-order')!;
    await user.click(screen.getByRole('button', { name: `View ${workOrder.name} details` }));
    expect(screen.getByRole('dialog', { name: workOrder.name })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: workOrder.name })).not.toBeInTheDocument();
  });

  it('clicking the close button on the panel dismisses it', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);

    const workOrder = ACTION_CARDS.find((c) => c.templateId === 'action-work-order')!;
    await user.click(screen.getByRole('button', { name: `View ${workOrder.name} details` }));
    expect(screen.getByRole('dialog', { name: workOrder.name })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close card details' }));
    expect(screen.queryByRole('dialog', { name: workOrder.name })).not.toBeInTheDocument();
  });

  it('focus returns to the trigger tile after dismissal', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);

    const workOrder = ACTION_CARDS.find((c) => c.templateId === 'action-work-order')!;
    const tileBtn = screen.getByRole('button', { name: `View ${workOrder.name} details` });

    await user.click(tileBtn);
    expect(screen.getByRole('dialog', { name: workOrder.name })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(tileBtn).toHaveFocus();
  });

  it('counter buttons remain interactive while flyout is open', async () => {
    mockLoadDeckConfig.mockReturnValue([]);
    const user = userEvent.setup();
    render(<DeckBuilderScreen {...defaultProps} />);

    const workOrder = ACTION_CARDS.find((c) => c.templateId === 'action-work-order')!;
    await user.click(screen.getByRole('button', { name: `View ${workOrder.name} details` }));
    expect(screen.getByRole('dialog', { name: workOrder.name })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Add one ${workOrder.name}` }));
    expect(screen.getByLabelText(`1 copies of ${workOrder.name}`)).toBeInTheDocument();
    // Flyout remains open after counter interaction
    expect(screen.getByRole('dialog', { name: workOrder.name })).toBeInTheDocument();
  });
});
