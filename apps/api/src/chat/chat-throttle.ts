import { SetMetadata, type ExecutionContext } from '@nestjs/common';

const CHAT_THROTTLE = 'healtrip:chat-throttle';

/**
 * Marks a route as an expensive chat call. The named "chat" throttler (configured in AppModule
 * with CHAT_RATE_LIMIT_PER_MINUTE) applies only to marked routes, on top of the global limit.
 */
export const ChatThrottle = () => SetMetadata(CHAT_THROTTLE, true);

export function isChatThrottled(context: ExecutionContext): boolean {
  return Reflect.getMetadata(CHAT_THROTTLE, context.getHandler()) === true;
}
