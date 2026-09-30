import type { Dictionary } from '@/i18n/dictionaries';

/** Shown whenever the API marks a reply as an emergency (a code-level decision, not model text). */
export function EmergencyBanner({ dict }: { dict: Dictionary }) {
  const t = dict.emergency;
  return (
    <div
      role="alert"
      className="rounded-xl border-2 border-red-600 bg-red-50 p-4 text-red-900 dark:bg-red-950 dark:text-red-100"
    >
      <p className="text-lg font-bold">⚠ {t.title}</p>
      <p className="mt-1 text-sm">{t.body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {t.numbers.map(({ country, number }) => (
          <a
            key={number}
            href={`tel:${number}`}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            {t.call} {number} · {country}
          </a>
        ))}
      </div>
    </div>
  );
}
