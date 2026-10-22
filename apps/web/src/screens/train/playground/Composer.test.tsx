// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Composer } from './Conversation';

afterEach(() => {
  cleanup();
});

function type(text: string): HTMLTextAreaElement {
  const field = screen.getByLabelText('Message du fan');
  if (!(field instanceof HTMLTextAreaElement)) throw new Error('not a textarea');
  fireEvent.change(field, { target: { value: text } });
  return field;
}

describe('Composer', () => {
  it('keeps the message when the send fails, ready to go again', async () => {
    const onSend = vi.fn(() => Promise.resolve(false));
    render(<Composer disabled={false} placeholder="" onSend={onSend} />);
    const field = type('Coucou, tu fais quoi ?');
    fireEvent.submit(field.closest('form') ?? document.body);
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('Coucou, tu fais quoi ?', []);
    });
    expect(field.value).toBe('Coucou, tu fais quoi ?');
  });

  it('clears the message once it is sent', async () => {
    render(<Composer disabled={false} placeholder="" onSend={() => Promise.resolve(true)} />);
    const field = type('Coucou');
    fireEvent.submit(field.closest('form') ?? document.body);
    await waitFor(() => {
      expect(field.value).toBe('');
    });
  });
});
