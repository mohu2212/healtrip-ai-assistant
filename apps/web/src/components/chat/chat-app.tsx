'use client';

import type { Locale } from '@healtrip/shared';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { Dictionary } from '@/i18n/dictionaries';
import { fill } from '@/i18n/format';
import type { ApiClient } from '@/lib/api';
import { AssistantMessage } from './assistant-message';
import { Composer } from './composer';
import { useChat } from './use-chat';

interface Props {
  locale: Locale;
  dict: Dictionary;
  api?: ApiClient;
}

export function ChatApp({ locale, dict, api }: Props) {
  const { messages, sending, error, send, retry, reset, dismissError } = useChat(locale, api);
  const bottom = useRef<HTMLDivElement>(null);
  const otherLocale: Locale = locale === 'ar' ? 'en' : 'ar';
  const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant');

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sending, error]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div
          className="flex size-9 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white"
          aria-hidden
        >
          H
        </div>
        <div className="me-auto">
          <p className="font-semibold leading-tight text-slate-900 dark:text-slate-100">
            {dict.header.brand}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{dict.header.tagline}</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={reset}
            disabled={sending}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {dict.header.newConversation}
          </button>
        )}
        <Link
          href={`/${otherLocale}`}
          hrefLang={otherLocale}
          lang={otherLocale}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {dict.header.switchLanguage}
        </Link>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-4 py-6" aria-live="polite" aria-busy={sending}>
        {messages.length === 0 && !sending && (
          <section className="mt-6 flex flex-col gap-4">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {dict.welcome.title}
            </h1>
            <p className="text-slate-600 dark:text-slate-400">{dict.welcome.body}</p>
            <h2 className="mt-2 text-sm font-semibold text-slate-500">
              {dict.welcome.examplesTitle}
            </h2>
            <div className="flex flex-col gap-2">
              {dict.welcome.examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => send(example)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-start text-sm text-slate-700 hover:border-teal-600 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {example}
                </button>
              ))}
            </div>
          </section>
        )}

        {messages.map((message, index) =>
          message.role === 'user' ? (
            <div key={message.id} className="flex flex-col items-end gap-1">
              <p
                dir="auto"
                className={`max-w-[85%] whitespace-pre-line rounded-2xl rounded-se-sm bg-teal-600 px-4 py-2.5 text-white ${
                  'status' in message && message.status === 'failed' ? 'opacity-60' : ''
                }`}
              >
                {message.text}
              </p>
              {'status' in message && message.status === 'failed' && (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  {dict.errors.notSent}
                </span>
              )}
            </div>
          ) : (
            <AssistantMessage
              key={message.id}
              message={message}
              locale={locale}
              dict={dict}
              isLatest={index === lastAssistantIndex && index === messages.length - 1}
              disabled={sending}
              onQuickReply={send}
            />
          ),
        )}

        {sending && (
          <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
            <span className="inline-flex gap-1" aria-hidden>
              <span className="size-1.5 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-teal-600" />
            </span>
            {dict.thinking}
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          >
            <p className="me-auto">
              {dict.errors[error.code] ?? dict.errors.default}
              {error.requestId && (
                <span className="block text-xs opacity-70" dir="ltr">
                  {fill(dict.errors.reference, { id: error.requestId })}
                </span>
              )}
            </p>
            {error.retryText && (
              <button
                type="button"
                onClick={retry}
                className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
              >
                {dict.errors.retry}
              </button>
            )}
            <button
              type="button"
              onClick={dismissError}
              aria-label="×"
              className="px-2 text-lg leading-none"
            >
              ×
            </button>
          </div>
        )}
        <div ref={bottom} />
      </main>

      <footer className="sticky bottom-0 border-t border-slate-200 bg-slate-50/95 px-4 pb-3 pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <Composer dict={dict} disabled={sending} onSend={send} />
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          {dict.footer.disclaimer} {dict.footer.demoData}
        </p>
      </footer>
    </div>
  );
}
