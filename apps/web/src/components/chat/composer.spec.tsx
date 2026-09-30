import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dictionaries } from '@/i18n/dictionaries';
import { Composer } from './composer';

describe('Composer', () => {
  const setup = (disabled = false) => {
    const onSend = vi.fn();
    render(<Composer dict={dictionaries.en} disabled={disabled} onSend={onSend} />);
    return { onSend, box: screen.getByLabelText('Your message') as HTMLTextAreaElement };
  };

  it('sends on Enter and clears the box', async () => {
    const { onSend, box } = setup();
    await userEvent.type(box, 'I have chest pain{Enter}');
    expect(onSend).toHaveBeenCalledWith('I have chest pain');
    expect(box.value).toBe('');
  });

  it('adds a new line on Shift+Enter instead of sending', async () => {
    const { onSend, box } = setup();
    await userEvent.type(box, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(onSend).not.toHaveBeenCalled();
    expect(box.value).toBe('line one\nline two');
  });

  it('does not send empty text or while a reply is pending', async () => {
    const empty = setup();
    await userEvent.type(empty.box, '   {Enter}');
    expect(empty.onSend).not.toHaveBeenCalled();
  });

  it('is disabled while pending', async () => {
    const { onSend, box } = setup(true);
    await userEvent.type(box, 'hello{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('limits the length to the API maximum', () => {
    const { box } = setup();
    expect(box.maxLength).toBe(2000);
  });
});
