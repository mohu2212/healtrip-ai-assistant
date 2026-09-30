import type { AssistantMessageDto, Locale, Urgency } from '@healtrip/shared';
import type { Dictionary } from '@/i18n/dictionaries';
import { DoctorCard } from './doctor-card';
import { EmergencyBanner } from './emergency-banner';
import { HospitalCard } from './hospital-card';
import { TracePanel } from './trace-panel';

const URGENCY_STYLE: Record<Urgency, string> = {
  emergency: 'bg-red-600 text-white',
  urgent: 'bg-amber-500 text-white',
  soon: 'bg-teal-600 text-white',
  routine: 'bg-teal-600 text-white',
  unknown: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

interface Props {
  message: AssistantMessageDto;
  locale: Locale;
  dict: Dictionary;
  /** Quick replies are only actionable on the latest answer. */
  isLatest: boolean;
  disabled: boolean;
  onQuickReply: (text: string) => void;
}

export function AssistantMessage({
  message,
  locale,
  dict,
  isLatest,
  disabled,
  onQuickReply,
}: Props) {
  const { reply, doctors, hospitals } = message;
  return (
    <div className="flex flex-col gap-3">
      {reply.emergency && <EmergencyBanner dict={dict} />}

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${URGENCY_STYLE[reply.urgency]}`}
        >
          {dict.nextStep[reply.nextStep]}
        </span>
        {reply.urgency !== 'unknown' && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {dict.urgency[reply.urgency]}
          </span>
        )}
      </div>

      {/* Plain text only: model output is never interpreted as HTML. */}
      <div
        dir="auto"
        className="whitespace-pre-line rounded-2xl rounded-ss-sm bg-white px-4 py-3 text-slate-800 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700"
      >
        {reply.message}
      </div>

      {reply.clarifyingQuestions.length > 0 && (
        <section className="rounded-xl bg-teal-50 p-3 dark:bg-teal-950/40">
          <h3 className="text-sm font-semibold text-teal-900 dark:text-teal-200">
            {dict.questions.title}
          </h3>
          <ol className="mt-1 list-decimal space-y-1 ps-5 text-sm text-teal-900 dark:text-teal-100">
            {reply.clarifyingQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </section>
      )}

      {isLatest && reply.quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={dict.quickReplies.label}>
          {reply.quickReplies.map((text) => (
            <button
              key={text}
              type="button"
              disabled={disabled}
              onClick={() => onQuickReply(text)}
              className="rounded-full border border-teal-600 px-3 py-1.5 text-sm text-teal-700 hover:bg-teal-50 disabled:opacity-50 dark:text-teal-300 dark:hover:bg-teal-950"
            >
              {text}
            </button>
          ))}
        </div>
      )}

      {hospitals.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {dict.cards.hospitalsTitle}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {hospitals.map((h) => (
              <HospitalCard key={h.id} hospital={h} locale={locale} dict={dict} />
            ))}
          </div>
        </section>
      )}

      {doctors.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {dict.cards.doctorsTitle}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {doctors.map((d) => (
              <DoctorCard key={d.id} doctor={d} locale={locale} dict={dict} />
            ))}
          </div>
        </section>
      )}

      <TracePanel message={message} locale={locale} dict={dict} />
    </div>
  );
}
