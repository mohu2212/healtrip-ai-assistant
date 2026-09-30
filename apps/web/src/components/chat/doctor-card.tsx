import type { DoctorDto, Locale } from '@healtrip/shared';
import type { ReactNode } from 'react';
import type { Dictionary } from '@/i18n/dictionaries';
import { fill, formatDateTime, formatNumber, formatUsd, languageNames } from '@/i18n/format';

/** Rendered entirely from the catalog record returned by the API — never from model text. */
export function DoctorCard({
  doctor,
  locale,
  dict,
}: {
  doctor: DoctorDto;
  locale: Locale;
  dict: Dictionary;
}) {
  const t = dict.cards;
  const name = locale === 'ar' ? `د. ${doctor.name.ar}` : `Dr. ${doctor.name.en}`;
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header>
        <h4 className="font-semibold text-slate-900 dark:text-slate-100">{name}</h4>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {doctor.title[locale]}
          {doctor.subspecialty ? ` · ${doctor.subspecialty[locale]}` : ''}
        </p>
      </header>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {doctor.hospital.name[locale]} — {doctor.hospital.city[locale]}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <li>★ {fill(t.rating, { rating: formatNumber(doctor.rating, locale) })}</li>
        <li>{fill(t.experience, { years: formatNumber(doctor.yearsExperience, locale) })}</li>
        <li>{fill(t.fee, { fee: formatUsd(doctor.consultationFeeUsd, locale) })}</li>
      </ul>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {fill(t.languages, { languages: languageNames(doctor.languages, locale) })}
      </p>
      <div className="flex flex-wrap gap-2">
        {doctor.offersSecondOpinion && <Badge>{t.secondOpinion}</Badge>}
        {doctor.offersTeleconsult && <Badge>{t.teleconsult}</Badge>}
      </div>
      <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
        {doctor.nextAvailableSlot
          ? fill(t.nextSlot, { date: formatDateTime(doctor.nextAvailableSlot.startsAt, locale) })
          : t.noSlot}
      </p>
    </article>
  );
}

export function Badge({ children, tone = 'teal' }: { children: ReactNode; tone?: 'teal' | 'red' }) {
  const colors =
    tone === 'red'
      ? 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900'
      : 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:ring-teal-900';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${colors}`}>
      {children}
    </span>
  );
}
