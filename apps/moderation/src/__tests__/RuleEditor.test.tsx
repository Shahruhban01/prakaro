import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { RuleEditor } from '../components/RuleEditor';
import type { Rule } from '../api';

describe('RuleEditor', () => {
  it('renders a leaf condition with field and value', () => {
    const rule: Rule = { field: 'category', value: 'AIRPORT' };
    const onChange = vi.fn();
    render(<RuleEditor rule={rule} change={onChange} />);

    const fieldSelect = screen.getByLabelText('Condition field') as HTMLSelectElement;
    const valueInput = screen.getByLabelText('Condition value') as HTMLInputElement;

    expect(fieldSelect.value).toBe('category');
    expect(valueInput.value).toBe('AIRPORT');
  });

  it('fires change callback when field changes', () => {
    const rule: Rule = { field: 'source', value: 'SEARCH' };
    const onChange = vi.fn();
    render(<RuleEditor rule={rule} change={onChange} />);

    const fieldSelect = screen.getByLabelText('Condition field');
    fireEvent.change(fieldSelect, { target: { value: 'status' } });

    expect(onChange).toHaveBeenCalledWith({ field: 'status', value: 'SEARCH' });
  });

  it('renders nested group and updates operator', () => {
    const groupRule: Rule = {
      op: 'AND',
      children: [
        { field: 'category', value: 'GENERAL' },
        { field: 'source', value: 'SEARCH' },
      ],
    };
    const onChange = vi.fn();
    render(<RuleEditor rule={groupRule} change={onChange} />);

    const opSelect = screen.getByLabelText('Group operator') as HTMLSelectElement;
    expect(opSelect.value).toBe('AND');

    fireEvent.change(opSelect, { target: { value: 'OR' } });
    expect(onChange).toHaveBeenCalledWith({
      op: 'OR',
      children: groupRule.children,
    });
  });
});
