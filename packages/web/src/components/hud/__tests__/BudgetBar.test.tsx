import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BudgetBar } from '../BudgetBar.js';

function getRoot(budget: number) {
  const { container } = render(<BudgetBar budget={budget} />);
  return container.firstChild as HTMLElement;
}

describe('BudgetBar', () => {
  it('renders the formatted budget value', () => {
    const { getByText } = render(<BudgetBar budget={500_000} />);
    expect(getByText('$500,000')).toBeInTheDocument();
  });

  it('applies green classes when budget is healthy', () => {
    const root = getRoot(500_000);
    expect(root).toHaveClass('text-green-400');
    expect(root).toHaveClass('border-green-500');
  });

  it('applies yellow classes when budget is a warning (< 250k but >= 100k)', () => {
    const root = getRoot(200_000);
    expect(root).toHaveClass('text-yellow-400');
    expect(root).toHaveClass('border-yellow-500');
  });

  it('applies orange classes when budget is in danger (< 100k but >= 0)', () => {
    const root = getRoot(50_000);
    expect(root).toHaveClass('text-orange-400');
    expect(root).toHaveClass('border-orange-500');
  });

  it('applies red classes when budget is negative', () => {
    const root = getRoot(-10_000);
    expect(root).toHaveClass('text-red-400');
    expect(root).toHaveClass('border-red-500');
  });

  it('renders negative budget with a minus sign', () => {
    const { getByText } = render(<BudgetBar budget={-5_000} />);
    expect(getByText('-$5,000')).toBeInTheDocument();
  });

  it('renders zero budget with orange classes', () => {
    // 0 < 100_000 → danger threshold
    const root = getRoot(0);
    expect(root).toHaveClass('text-orange-400');
  });
});
