import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContinueModal } from '../ContinueModal.js';

describe('ContinueModal', () => {
  it('renders the resume prompt text', () => {
    render(<ContinueModal onContinue={vi.fn()} onNewGame={vi.fn()} />);
    expect(screen.getByText('RESUME SESSION')).toBeInTheDocument();
    expect(screen.getByText('A saved game was found.')).toBeInTheDocument();
  });

  it('calls onContinue when CONTINUE is clicked', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<ContinueModal onContinue={onContinue} onNewGame={vi.fn()} />);
    await user.click(screen.getByText('CONTINUE'));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('calls onNewGame when NEW GAME is clicked', async () => {
    const user = userEvent.setup();
    const onNewGame = vi.fn();
    render(<ContinueModal onContinue={vi.fn()} onNewGame={onNewGame} />);
    await user.click(screen.getByText('NEW GAME'));
    expect(onNewGame).toHaveBeenCalledOnce();
  });

  it('does not call onContinue when NEW GAME is clicked and vice-versa', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const onNewGame = vi.fn();
    render(<ContinueModal onContinue={onContinue} onNewGame={onNewGame} />);
    await user.click(screen.getByText('NEW GAME'));
    expect(onContinue).not.toHaveBeenCalled();
    await user.click(screen.getByText('CONTINUE'));
    expect(onNewGame).toHaveBeenCalledOnce(); // only the earlier click
  });
});
