import type { ConversationDto, ItemResponse, Locale, SendMessageResult } from '@healtrip/shared';

/** Error codes the UI knows how to explain; anything else falls back to a generic message. */
export type ApiErrorCode = string;

/** Normalized failure: the API's `{ error: { code, message, requestId } }`, or a transport problem. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number | null,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Longer than the agent's turn budget (90 s) so the server always answers first. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export function createApiClient({
  baseUrl,
  timeoutMs = 100_000,
  fetch: fetchFn = fetch,
}: ApiClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        // Only requests with a body send JSON (avoids a CORS preflight on plain GETs).
        headers: init.body ? { 'content-type': 'application/json' } : {},
      });
    } catch (error) {
      // fetch only rejects on transport problems (offline, DNS, CORS) or our timeout abort.
      const code = controller.signal.aborted ? 'TIMEOUT' : 'NETWORK';
      throw new ApiError(code, error instanceof Error ? error.message : code, null, null);
    } finally {
      clearTimeout(timer);
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = (
        body as { error?: { code?: string; message?: string; requestId?: string } } | null
      )?.error;
      throw new ApiError(
        error?.code ?? 'HTTP_ERROR',
        error?.message ?? `Request failed with status ${response.status}`,
        response.status,
        error?.requestId ?? response.headers.get('x-request-id'),
      );
    }
    return (body as ItemResponse<T>).data;
  }

  return {
    createConversation: (locale: Locale) =>
      request<ConversationDto>('/conversations', {
        method: 'POST',
        body: JSON.stringify({ locale }),
      }),
    getConversation: (id: string) =>
      request<ConversationDto>(`/conversations/${encodeURIComponent(id)}`),
    sendMessage: (id: string, text: string) =>
      request<SendMessageResult>(`/conversations/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api',
});
