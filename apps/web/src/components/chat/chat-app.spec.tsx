import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dictionaries } from '@/i18n/dictionaries';
import { ApiError, type ApiClient } from '@/lib/api';
import { emptyConversation, sendResult } from '@/test/fixtures';
import { ChatApp } from './chat-app';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    createConversation: vi.fn().mockResolvedValue(emptyConversation),
    getConversation: vi.fn().mockResolvedValue(emptyConversation),
    sendMessage: vi.fn().mockImplementation(async (_id: string, text: string) => sendResult(text)),
    ...overrides,
  };
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => localStorage.clear());

describe('ChatApp', () => {
  it('starts a conversation on the first message and shows the reply with cards', async () => {
    const api = fakeApi();
    render(<ChatApp locale="en" dict={dictionaries.en} api={api} />);

    await userEvent.type(screen.getByLabelText('Your message'), 'I have chest pain{Enter}');

    expect(await screen.findByText('Dr. Ahmed Mansour')).toBeTruthy();
    expect(api.createConversation).toHaveBeenCalledWith('en');
    expect(api.sendMessage).toHaveBeenCalledWith(emptyConversation.id, 'I have chest pain');
    expect(localStorage.getItem('healtrip.conversation.en')).toBe(emptyConversation.id);
  });

  it('sends an example prompt from the welcome screen', async () => {
    const api = fakeApi();
    render(<ChatApp locale="en" dict={dictionaries.en} api={api} />);
    await userEvent.click(
      screen.getByRole('button', { name: dictionaries.en.welcome.examples[0] }),
    );
    await waitFor(() =>
      expect(api.sendMessage).toHaveBeenCalledWith(
        emptyConversation.id,
        dictionaries.en.welcome.examples[0],
      ),
    );
  });

  it('keeps a failed message visible and resends it on "Try again"', async () => {
    const api = fakeApi({
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(new ApiError('LLM_UNAVAILABLE', 'down', 503, 'req-9'))
        .mockImplementation(async (_id: string, text: string) => sendResult(text)),
    });
    render(<ChatApp locale="en" dict={dictionaries.en} api={api} />);

    await userEvent.type(screen.getByLabelText('Your message'), 'hello{Enter}');
    expect(await screen.findByText(dictionaries.en.errors.LLM_UNAVAILABLE)).toBeTruthy();
    expect(screen.getByText('Not sent')).toBeTruthy();
    expect(screen.getByText('Reference: req-9')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Dr. Ahmed Mansour')).toBeTruthy();
    expect(screen.queryByText('Not sent')).toBeNull();
    expect(api.sendMessage).toHaveBeenLastCalledWith(emptyConversation.id, 'hello');
  });

  it('resumes the stored conversation', async () => {
    localStorage.setItem('healtrip.conversation.en', emptyConversation.id);
    const stored = {
      ...emptyConversation,
      messages: [sendResult('earlier').userMessage, sendResult('earlier').assistantMessage],
    };
    render(
      <ChatApp
        locale="en"
        dict={dictionaries.en}
        api={fakeApi({ getConversation: vi.fn().mockResolvedValue(stored) })}
      />,
    );
    expect(await screen.findByText('earlier')).toBeTruthy();
  });

  it('starts over when the stored conversation no longer exists', async () => {
    localStorage.setItem('healtrip.conversation.en', 'gone');
    const api = fakeApi({
      getConversation: vi.fn().mockRejectedValue(new ApiError('NOT_FOUND', 'x', 404, null)),
    });
    render(<ChatApp locale="en" dict={dictionaries.en} api={api} />);
    await waitFor(() => expect(localStorage.getItem('healtrip.conversation.en')).toBeNull());
  });
});
