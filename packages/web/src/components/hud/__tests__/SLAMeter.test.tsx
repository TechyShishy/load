import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MAX_SLA_FAILURES } from '@load/game-core';
import { SLAMeter } from '../SLAMeter.js';

describe('SLAMeter', () => {
  it('renders the correct fraction label', () => {
    const { getByText } = render(<SLAMeter slaCount={1} slaLimit={MAX_SLA_FAILURES} />);
    expect(getByText(`1/${MAX_SLA_FAILURES}`)).toBeInTheDocument();
  });

  it('renders MAX_SLA_FAILURES indicator dots', () => {
    const { container } = render(<SLAMeter slaCount={0} slaLimit={MAX_SLA_FAILURES} />);
    // The flex container wrapping the dots
    const dots = container.querySelectorAll('.w-4.h-4');
    expect(dots).toHaveLength(MAX_SLA_FAILURES);
  });

  it('marks the correct number of dots red when slaCount > 0', () => {
    const { container } = render(<SLAMeter slaCount={2} slaLimit={MAX_SLA_FAILURES} />);
    const redDots = container.querySelectorAll('.bg-red-500');
    const grayDots = container.querySelectorAll('.bg-gray-800');
    expect(redDots).toHaveLength(2);
    expect(grayDots).toHaveLength(MAX_SLA_FAILURES - 2);
  });

  it('marks all dots gray when slaCount is 0', () => {
    const { container } = render(<SLAMeter slaCount={0} slaLimit={MAX_SLA_FAILURES} />);
    const redDots = container.querySelectorAll('.bg-red-500');
    const grayDots = container.querySelectorAll('.bg-gray-800');
    expect(redDots).toHaveLength(0);
    expect(grayDots).toHaveLength(MAX_SLA_FAILURES);
  });

  it('marks all dots red when slaCount equals MAX_SLA_FAILURES', () => {
    const { container } = render(<SLAMeter slaCount={MAX_SLA_FAILURES} slaLimit={MAX_SLA_FAILURES} />);
    const redDots = container.querySelectorAll('.bg-red-500');
    expect(redDots).toHaveLength(MAX_SLA_FAILURES);
  });

  it('applies red text to the fraction when slaCount >= slaLimit - 1', () => {
    const { getByText } = render(<SLAMeter slaCount={2} slaLimit={MAX_SLA_FAILURES} />);
    const fraction = getByText(`2/${MAX_SLA_FAILURES}`);
    expect(fraction).toHaveClass('text-red-400');
  });

  it('applies gray text to the fraction when slaCount < slaLimit - 1', () => {
    const { getByText } = render(<SLAMeter slaCount={1} slaLimit={MAX_SLA_FAILURES} />);
    const fraction = getByText(`1/${MAX_SLA_FAILURES}`);
    expect(fraction).toHaveClass('text-gray-400');
  });
});
