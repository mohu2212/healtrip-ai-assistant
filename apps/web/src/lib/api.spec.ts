import { ApiError, createApiClient } from './api';
import { emptyConversation } from '@/test/fixtures';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('api client', () => {
  it('unwraps { data } and sends JSON only when there is a body', async () => {
    const fetch = vi.fn().mockResolvedValue(json(201, { data: emptyConversation }));
    const api = createApiClient({ baseUrl: 'http://api.test/api', fetch });

    await expect(api.createConversation('ar')).resolves.toEqual(emptyConversation);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://api.test/api/conversations');
    expect(init).toMatchObject({
      method: 'POST',
      body: '{"locale":"ar"}',
      headers: { 'content-type': 'application/json' },
    });

    fetch.mockResolvedValue(json(200, { data: emptyConversation }));
    await api.getConversation(emptyConversation.id);
    expect(fetch.mock.calls[1][1].headers).toEqual({});
  });

  it('turns the API error contract into an ApiError with the request ID', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json(503, { error: { code: 'LLM_UNAVAILABLE', message: 'down', requestId: 'req-1' } }),
      );
    const error = await createApiClient({ baseUrl: '', fetch })
      .sendMessage('id', 'hi')
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'LLM_UNAVAILABLE', status: 503, requestId: 'req-1' });
  });

  it('falls back to the x-request-id header for non-JSON errors', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('Bad gateway', { status: 502, headers: { 'x-request-id': 'req-2' } }),
      );
    const error = await createApiClient({ baseUrl: '', fetch })
      .getConversation('id')
      .catch((e) => e);
    expect(error).toMatchObject({ code: 'HTTP_ERROR', status: 502, requestId: 'req-2' });
  });

  it('maps transport failures to NETWORK', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await createApiClient({ baseUrl: '', fetch })
      .getConversation('id')
      .catch((e) => e);
    expect(error).toMatchObject({ code: 'NETWORK', status: null });
  });

  it('aborts slow requests and reports TIMEOUT', async () => {
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    );
    const error = await createApiClient({
      baseUrl: '',
      fetch: fetch as typeof globalThis.fetch,
      timeoutMs: 10,
    })
      .getConversation('id')
      .catch((e) => e);
    expect(error).toMatchObject({ code: 'TIMEOUT' });
  });
});
