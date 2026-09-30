import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';
/** Accept a caller-supplied request ID only if it is short and harmless (log-injection safe). */
const SAFE_REQUEST_ID = /^[\w-]{8,64}$/;

type RequestWithId = IncomingMessage & { id?: string };

/**
 * First middleware in the chain: every request gets an ID (reused from a trusted-format
 * `x-request-id` header or freshly generated) *before* body parsing, so even body-parser
 * failures return and log a request ID. The same ID is echoed in the response header.
 */
export function requestIdMiddleware(req: RequestWithId, res: ServerResponse, next: () => void) {
  const incoming = req.headers[REQUEST_ID_HEADER];
  req.id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, req.id);
  next();
}

export function getRequestId(req: IncomingMessage): string {
  return (req as RequestWithId).id ?? randomUUID();
}
