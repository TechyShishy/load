import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PhaseIndicator } from '../PhaseIndicator.js';

const ALL_PHASES = ['draw', 'scheduling', 'execution', 'crisis', 'resolution', 'end'];

describe('PhaseIndicator', () => {
  it('renders the round number', () => {
    const { getByText } = render(<PhaseIndicator currentPhase="draw" round={5} />);
    expect(getByText('R5')).toBeInTheDocument();
  });

  it('renders all six phase labels', () => {
    const { getByText } = render(<PhaseIndicator currentPhase="draw" round={1} />);
    expect(getByText('Draw')).toBeInTheDocument();
    expect(getByText('Schedule')).toBeInTheDocument();
    expect(getByText('Execute')).toBeInTheDocument();
    expect(getByText('Crisis')).toBeInTheDocument();
    expect(getByText('Resolve')).toBeInTheDocument();
    expect(getByText('End')).toBeInTheDocument();
  });

  it('highlights the active phase with cyan background', () => {
    const { getByText } = render(<PhaseIndicator currentPhase="crisis" round={3} />);
    expect(getByText('Crisis')).toHaveClass('bg-cyan-500');
  });

  it('applies gray background to inactive phases', () => {
    const { getByText } = render(<PhaseIndicator currentPhase="crisis" round={3} />);
    expect(getByText('Draw')).toHaveClass('bg-gray-800');
    expect(getByText('Schedule')).toHaveClass('bg-gray-800');
    expect(getByText('Execute')).toHaveClass('bg-gray-800');
    expect(getByText('Resolve')).toHaveClass('bg-gray-800');
    expect(getByText('End')).toHaveClass('bg-gray-800');
  });

  it.each(ALL_PHASES)('exactly one pill is active when phase is %s', (phase) => {
    const { container } = render(<PhaseIndicator currentPhase={phase} round={1} />);
    const activePills = container.querySelectorAll('.bg-cyan-500');
    expect(activePills).toHaveLength(1);
  });
});
