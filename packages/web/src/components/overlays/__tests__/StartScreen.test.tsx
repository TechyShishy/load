import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BUILT_IN_CONTRACTS, LOCAL_ISP_CONTRACT, STANDARD_CONTRACT } from '@load/game-core';
import { StartScreen } from '../StartScreen.js';
import type { StartScreenStep } from '../StartScreen.js';

const defaultProps = {
  hasSave: false,
  step: 'menu' as StartScreenStep,
  onStepChange: vi.fn(),
  onNewGame: vi.fn(),
  onContinue: vi.fn(),
  onDeckBuilder: vi.fn(),
  onSettings: vi.fn(),
  onQuit: vi.fn(),
};

/** Wraps StartScreen with real step state so navigation tests work. */
function ControlledStartScreen(props: Omit<typeof defaultProps, 'step' | 'onStepChange'>) {
  const [step, setStep] = useState<StartScreenStep>('menu');
  return <StartScreen {...props} step={step} onStepChange={setStep} />;
}

describe('StartScreen — menu step', () => {
  it('renders the LOAD heading', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText('LOAD')).toBeInTheDocument();
  });

  it('shows the NEW GAME button', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'NEW GAME' })).toBeInTheDocument();
  });

  it('hides CONTINUE when hasSave is false', () => {
    render(<StartScreen {...defaultProps} hasSave={false} />);
    expect(screen.queryByRole('button', { name: 'CONTINUE' })).not.toBeInTheDocument();
  });

  it('shows CONTINUE when hasSave is true', () => {
    render(<StartScreen {...defaultProps} hasSave={true} />);
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeInTheDocument();
  });

  it('clicking NEW GAME transitions to the contract selection panel', async () => {
    const user = userEvent.setup();
    render(<ControlledStartScreen {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: 'NEW GAME' }));
    expect(screen.getByText('Select Contract')).toBeInTheDocument();
  });
});

describe('StartScreen — contract step', () => {
  async function openContractStep() {
    const user = userEvent.setup();
    const onNewGame = vi.fn();
    const utils = render(<ControlledStartScreen {...defaultProps} onNewGame={onNewGame} />);
    await user.click(screen.getByRole('button', { name: 'NEW GAME' }));
    return { user, onNewGame, ...utils };
  }

  it('shows a button for each built-in contract', async () => {
    await openContractStep();
    for (const contract of BUILT_IN_CONTRACTS) {
      expect(screen.getByText(contract.name.toUpperCase())).toBeInTheDocument();
    }
  });

  it('shows SLA limit for each contract', async () => {
    await openContractStep();
    expect(screen.getByText(`${LOCAL_ISP_CONTRACT.slaLimit} SLA max`)).toBeInTheDocument();
    expect(screen.getByText(`${STANDARD_CONTRACT.slaLimit} SLA max`)).toBeInTheDocument();
  });

  it('shows the starting budget for each contract', async () => {
    await openContractStep();
    for (const contract of BUILT_IN_CONTRACTS) {
      const label = `$${(contract.startingBudget / 1_000).toFixed(0)}k starting`;
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('clicking a contract calls onNewGame with the correct ContractDef', async () => {
    const { user, onNewGame } = await openContractStep();
    await user.click(screen.getByText(LOCAL_ISP_CONTRACT.name.toUpperCase()));
    expect(onNewGame).toHaveBeenCalledOnce();
    expect(onNewGame).toHaveBeenCalledWith(LOCAL_ISP_CONTRACT);
  });

  it('clicking Standard contract calls onNewGame with STANDARD_CONTRACT', async () => {
    const { user, onNewGame } = await openContractStep();
    await user.click(screen.getByText(STANDARD_CONTRACT.name.toUpperCase()));
    expect(onNewGame).toHaveBeenCalledOnce();
    expect(onNewGame).toHaveBeenCalledWith(STANDARD_CONTRACT);
  });

  it('BACK button returns to the menu step', async () => {
    const { user } = await openContractStep();

    // When in contract step, the contract panel is not aria-hidden
    const contractPanel = screen.getByText('Select Contract').parentElement!;
    expect(contractPanel).not.toHaveAttribute('aria-hidden', 'true');

    await user.click(screen.getByRole('button', { name: '← BACK' }));

    // After going back, the contract panel becomes aria-hidden
    expect(contractPanel).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('StartScreen — Deck Builder button', () => {
  it('shows the DECK BUILDER button in the menu step', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'DECK BUILDER' })).toBeInTheDocument();
  });

  it('clicking DECK BUILDER calls onDeckBuilder', async () => {
    const user = userEvent.setup();
    const onDeckBuilder = vi.fn();
    render(<StartScreen {...defaultProps} onDeckBuilder={onDeckBuilder} />);
    await user.click(screen.getByRole('button', { name: 'DECK BUILDER' }));
    expect(onDeckBuilder).toHaveBeenCalledOnce();
  });
});
