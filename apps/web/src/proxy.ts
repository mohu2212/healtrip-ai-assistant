import { NextResponse, type NextRequest } from 'next/server';

/**
 * `/` → `/ar` or `/en`, based on the browser's language preferences (Accept-Language lists them in
 * order of preference). Only runs for the root path.
 */
export function proxy(request: NextRequest) {
  const preferences = (request.headers.get('accept-language') ?? '')
    .split(',')
    .map((part) => part.split(';')[0].trim().toLowerCase());
  const first = preferences.find((tag) => tag.startsWith('ar') || tag.startsWith('en'));
  const locale = first?.startsWith('ar') ? 'ar' : 'en';
  return NextResponse.redirect(new URL(`/${locale}`, request.url));
}

export const config = { matcher: '/' };
