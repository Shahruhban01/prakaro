import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { StatusBadge } from '../components/StatusBadge';

describe('StatusBadge', () => {
  it('renders status text replacing underscores', () => {
    render(<StatusBadge status="IN_REVIEW" />);
    expect(screen.getByText('IN REVIEW')).toBeDefined();
  });

  it('renders custom label if provided', () => {
    render(<StatusBadge status="APPROVED" label="Verified Active" />);
    expect(screen.getByText('Verified Active')).toBeDefined();
  });

  it('applies corresponding status style class', () => {
    const { container } = render(<StatusBadge status="ESCALATED" />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('text-rose-700');
  });
});
