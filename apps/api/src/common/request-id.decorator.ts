import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** The correlation ID assigned by requestIdMiddleware (also sent back in `x-request-id`). */
export const RequestId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const id = ctx.switchToHttp().getRequest<{ id?: unknown }>().id;
  return typeof id === 'string' ? id : null;
});
