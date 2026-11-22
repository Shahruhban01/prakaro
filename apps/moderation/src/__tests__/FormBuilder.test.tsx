import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FormBuilder } from '../components/FormBuilder';
import type { Question } from '../api';

describe('FormBuilder', () => {
  it('renders questions list and responds to additions', () => {
    const questions: Question[] = [
      { key: 'q_parking_type', label: 'Parking Type', type: 'SELECT', required: true, options: ['SURFACE', 'GARAGE'] },
    ];
    const onChange = vi.fn();
    render(<FormBuilder questions={questions} onChange={onChange} />);

    expect(screen.getByDisplayValue('Parking Type')).toBeDefined();

    const addBtn = screen.getByRole('button', { name: /Add Review Question/i });
    fireEvent.click(addBtn);

    expect(onChange).toHaveBeenCalled();
    const updated = onChange.mock.calls[0][0];
    expect(updated.length).toBe(2);
    expect(updated[1].type).toBe('BOOLEAN');
  });

  it('updates question label and required toggle', () => {
    const questions: Question[] = [
      { key: 'q1', label: 'Initial Prompt', type: 'BOOLEAN', required: true, options: [] },
    ];
    const onChange = vi.fn();
    render(<FormBuilder questions={questions} onChange={onChange} />);

    const labelInput = screen.getByDisplayValue('Initial Prompt');
    fireEvent.change(labelInput, { target: { value: 'Updated Question Prompt' } });

    expect(onChange).toHaveBeenCalledWith([
      { key: 'q1', label: 'Updated Question Prompt', type: 'BOOLEAN', required: true, options: [] },
    ]);
  });
});
