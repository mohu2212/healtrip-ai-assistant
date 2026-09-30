import type { AssistantMessageDto, Locale, NextStep, ToolTraceItem } from '@healtrip/shared';
import type { Dictionary } from '@/i18n/dictionaries';
import { fill, formatNumber } from '@/i18n/format';

/** "How this answer was produced": the tools that ran and what the safety checks did. */
export function TracePanel({
  message,
  locale,
  dict,
}: {
  message: AssistantMessageDto;
  locale: Locale;
  dict: Dictionary;
}) {
  const t = dict.trace;
  if (message.trace.length === 0 && message.meta.outcome === 'completed') return null;
  return (
    <details className="group rounded-lg border border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900/60">
      <summary className="cursor-pointer select-none px-3 py-2 text-slate-600 dark:text-slate-400">
        {t.title}
      </summary>
      <div className="space-y-2 px-3 pb-3">
        {message.meta.outcome === 'corrected' && (
          <p className="text-amber-700 dark:text-amber-400">{t.corrected}</p>
        )}
        {message.meta.outcome === 'fallback' && (
          <p className="text-amber-700 dark:text-amber-400">{t.fallback}</p>
        )}
        <ol className="space-y-1">
          {message.trace.map((item, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2">
              <span
                className={
                  item.ok ? 'text-teal-700 dark:text-teal-400' : 'text-red-700 dark:text-red-400'
                }
              >
                {item.ok ? '✓' : '✗'}
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {t.tools[item.tool] ?? item.tool}
              </span>
              <span className="text-slate-500">{describe(item, locale, dict)}</span>
              <span className="ms-auto text-xs text-slate-400" dir="ltr">
                {item.latencyMs} ms
              </span>
            </li>
          ))}
        </ol>
        {message.meta.model && (
          <p className="text-xs text-slate-400">{fill(t.model, { model: message.meta.model })}</p>
        )}
      </div>
    </details>
  );
}

function describe(item: ToolTraceItem, locale: Locale, dict: Dictionary): string {
  const s = item.summary;
  const parts: string[] = [];
  if (typeof s.count === 'number')
    parts.push(fill(dict.trace.results, { count: formatNumber(s.count, locale) }));
  if (typeof s.nextStep === 'string') {
    parts.push(
      fill(dict.trace.decision, { step: dict.nextStep[s.nextStep as NextStep] ?? s.nextStep }),
    );
  }
  if (Array.isArray(s.problems) && s.problems.length) {
    parts.push(fill(dict.trace.problems, { problems: s.problems.join(', ') }));
  }
  if (typeof s.error === 'string') parts.push(s.error);
  if (!item.ok && parts.length === 0) parts.push(dict.trace.failed);
  return parts.join(' · ');
}
