'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessageDto, Locale } from '@healtrip/shared';
import { ApiError, api as defaultApi, type ApiClient } from '@/lib/api';

export type UiMessage = ChatMessageDto | PendingUserMessage;

/** A patient message shown immediately, before the server has stored it (or after it failed). */
export interface PendingUserMessage {
  id: string;
  role: 'user';
  text: string;
  createdAt: string;
  status: 'sending' | 'failed';
}

const isUnsent = (m: UiMessage) => 'status' in m;

export interface ChatError {
  code: string;
  requestId: string | null;
  /** The text to resend when the user presses "try again". */
  retryText: string | null;
}

const storageKey = (locale: Locale) => `healtrip.conversation.${locale}`;

/** localStorage can be unavailable (private mode, blocked storage) — never let that break the chat. */
const storage = {
  get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/**
 * Chat state: resumes the stored conversation, sends messages (one at a time — the API also
 * enforces this), shows the patient's message immediately, and keeps failed text for retry.
 */
export function useChat(locale: Locale, api: ApiClient = defaultApi) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const conversationId = useRef<string | null>(null);
  const sendingRef = useRef(false);

  // Resume the conversation stored for this language (if it still exists on the server).
  useEffect(() => {
    const stored = storage.get(storageKey(locale));
    if (!stored) return;
    let cancelled = false;
    api
      .getConversation(stored)
      .then((conversation) => {
        if (cancelled) return;
        conversationId.current = conversation.id;
        setMessages(conversation.messages);
      })
      .catch(() => {
        // Unknown or unreachable: start fresh on the next message.
        if (!cancelled) storage.remove(storageKey(locale));
      });
    return () => {
      cancelled = true;
    };
  }, [api, locale]);

  const startConversation = useCallback(async () => {
    const conversation = await api.createConversation(locale);
    conversationId.current = conversation.id;
    storage.set(storageKey(locale), conversation.id);
    return conversation.id;
  }, [api, locale]);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      setError(null);

      const pending: PendingUserMessage = {
        id: `pending-${Date.now()}`,
        role: 'user',
        text,
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      // A new attempt replaces any earlier unsent message.
      setMessages((current) => [...current.filter((m) => !isUnsent(m)), pending]);

      try {
        let id = conversationId.current ?? (await startConversation());
        let result;
        try {
          result = await api.sendMessage(id, text);
        } catch (e) {
          // The stored conversation no longer exists (e.g. data was reset): start a new one once.
          if (!(e instanceof ApiError && e.code === 'NOT_FOUND')) throw e;
          id = await startConversation();
          result = await api.sendMessage(id, text);
        }
        setMessages((current) => [
          ...current.filter((m) => m.id !== pending.id),
          result.userMessage,
          result.assistantMessage,
        ]);
      } catch (e) {
        // Keep the text on screen, marked as not sent, until the patient retries.
        setMessages((current) =>
          current.map((m) => (m.id === pending.id ? { ...pending, status: 'failed' as const } : m)),
        );
        setError({
          code: e instanceof ApiError ? e.code : 'default',
          requestId: e instanceof ApiError ? e.requestId : null,
          retryText: text,
        });
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [api, startConversation],
  );

  const retry = useCallback(() => {
    if (error?.retryText) void send(error.retryText);
  }, [error, send]);

  const reset = useCallback(() => {
    if (sendingRef.current) return;
    storage.remove(storageKey(locale));
    conversationId.current = null;
    setMessages([]);
    setError(null);
  }, [locale]);

  return { messages, sending, error, send, retry, reset, dismissError: () => setError(null) };
}
