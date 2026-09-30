'use client';

import { MAX_MESSAGE_LENGTH } from '@healtrip/shared';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Dictionary } from '@/i18n/dictionaries';
import { fill } from '@/i18n/format';

interface Props {
  dict: Dictionary;
  disabled: boolean;
  onSend: (text: string) => void;
}

export function Composer({ dict, disabled, onSend }: Props) {
  const t = dict.composer;
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the content, up to a limit.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }, [text]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (disabled || !text.trim()) return;
    onSend(text);
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a line; never send while an IME composition is active (Arabic input).
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-900">
        <label htmlFor="composer" className="sr-only">
          {t.label}
        </label>
        <textarea
          id="composer"
          ref={ref}
          dir="auto"
          rows={1}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={t.placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="max-h-48 flex-1 resize-none bg-transparent px-2 py-1.5 text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.send}
        </button>
      </div>
      <div className="flex justify-between px-2 text-xs text-slate-400">
        <span>{t.hint}</span>
        <span dir="ltr">{fill(t.counter, { count: text.length, max: MAX_MESSAGE_LENGTH })}</span>
      </div>
    </form>
  );
}
