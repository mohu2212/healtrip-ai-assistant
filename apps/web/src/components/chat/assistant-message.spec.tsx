import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dictionaries } from '@/i18n/dictionaries';
import { assistantMessage, hospital, reply } from '@/test/fixtures';
import { AssistantMessage } from './assistant-message';

const renderMessage = (props: Partial<Parameters<typeof AssistantMessage>[0]> = {}) =>
  render(
    <AssistantMessage
      message={assistantMessage()}
      locale="en"
      dict={dictionaries.en}
      isLatest
      disabled={false}
      onQuickReply={() => {}}
      {...props}
    />,
  );

describe('AssistantMessage', () => {
  it('shows the next step and the doctor card built from catalog data', () => {
    renderMessage();
    expect(screen.getByText('See a specialist')).toBeTruthy();
    const card = screen.getByRole('article');
    expect(within(card).getByText('Dr. Ahmed Mansour')).toBeTruthy();
    expect(within(card).getByText(/Nile Heart & Vascular Institute — Cairo/)).toBeTruthy();
    expect(within(card).getByText('Second opinion')).toBeTruthy();
  });

  it('shows the emergency banner with tap-to-call numbers for ER answers', () => {
    renderMessage({
      message: assistantMessage({
        reply: reply({
          nextStep: 'ER_NOW',
          urgency: 'emergency',
          emergency: true,
          recommendedDoctorIds: [],
        }),
        doctors: [],
        hospitals: [hospital],
      }),
    });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/This may be an emergency/)).toBeTruthy();
    const links = within(alert)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(links).toEqual(['tel:123', 'tel:998', 'tel:112']);
    expect(screen.getByText('24/7 emergency department')).toBeTruthy();
  });

  it('renders the model text as plain text, never as HTML', () => {
    const { container } = renderMessage({
      message: assistantMessage({
        reply: reply({ message: '<img src=x onerror="alert(1)"> hello' }),
      }),
    });
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror="alert(1)"> hello')).toBeTruthy();
  });

  it('offers quick replies only on the latest answer', async () => {
    const onQuickReply = vi.fn();
    const message = assistantMessage({
      reply: reply({
        nextStep: 'NEED_MORE_INFO',
        quickReplies: ['Started today', 'For weeks'],
        recommendedDoctorIds: [],
      }),
      doctors: [],
    });
    const { rerender } = renderMessage({ message, onQuickReply });
    await userEvent.click(screen.getByRole('button', { name: 'For weeks' }));
    expect(onQuickReply).toHaveBeenCalledWith('For weeks');

    rerender(
      <AssistantMessage
        message={message}
        locale="en"
        dict={dictionaries.en}
        isLatest={false}
        disabled={false}
        onQuickReply={onQuickReply}
      />,
    );
    expect(screen.queryByRole('button', { name: 'For weeks' })).toBeNull();
  });

  it('localizes cards in Arabic', () => {
    render(
      <AssistantMessage
        message={assistantMessage()}
        locale="ar"
        dict={dictionaries.ar}
        isLatest
        disabled={false}
        onQuickReply={() => {}}
      />,
    );
    expect(screen.getByText('د. أحمد منصور')).toBeTruthy();
    expect(screen.getByText('زيارة طبيب متخصص')).toBeTruthy();
  });

  it('explains in the trace panel which tools ran', () => {
    renderMessage();
    expect(screen.getByText('How this answer was produced')).toBeTruthy();
    expect(screen.getByText('Doctor search')).toBeTruthy();
    expect(screen.getByText('1 results')).toBeTruthy();
  });
});
