// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type JSX } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { TimeField } from './TimeField';

afterEach(cleanup);

function Harness(): JSX.Element {
  const [minute, setMinute] = useState(540);
  return (
    <>
      <TimeField value={minute} label="Début" onChange={setMinute} />
      <output>{minute}</output>
    </>
  );
}

describe('TimeField', () => {
  it('is a text field on 24 hours: what is typed stays until the field is left, then reads HH:MM', () => {
    render(<Harness />);
    const field = screen.getByLabelText('Début');
    expect(field).toHaveProperty('type', 'text');
    expect(field).toHaveProperty('value', '09:00');
    fireEvent.change(field, { target: { value: '21h' } });
    expect(field).toHaveProperty('value', '21h');
    expect(screen.getByRole('status').textContent).toBe('1260');
    fireEvent.blur(field);
    expect(field).toHaveProperty('value', '21:00');
  });

  it('marks what is not an hour and keeps the last full one', () => {
    render(<Harness />);
    const field = screen.getByLabelText('Début');
    fireEvent.change(field, { target: { value: '25:00' } });
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('540');
    fireEvent.blur(field);
    expect(field).toHaveProperty('value', '09:00');
    expect(field.getAttribute('aria-invalid')).toBeNull();
  });
});
