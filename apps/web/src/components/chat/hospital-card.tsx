import type { HospitalDto, Locale } from '@healtrip/shared';
import type { Dictionary } from '@/i18n/dictionaries';
import { fill, formatNumber } from '@/i18n/format';
import { Badge } from './doctor-card';

export function HospitalCard({
  hospital,
  locale,
  dict,
}: {
  hospital: HospitalDto;
  locale: Locale;
  dict: Dictionary;
}) {
  const t = dict.cards;
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header>
        <h4 className="font-semibold text-slate-900 dark:text-slate-100">
          {hospital.name[locale]}
        </h4>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {hospital.city[locale]} · ★ {formatNumber(hospital.rating, locale)}
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        {hospital.hasEmergency && <Badge tone="red">{t.emergencyDepartment}</Badge>}
        {hospital.accreditation && (
          <Badge>{fill(t.accreditation, { name: hospital.accreditation })}</Badge>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {hospital.specialties.map((s) => s.name[locale]).join(locale === 'ar' ? '، ' : ', ')}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
        {hospital.hasEmergency && hospital.emergencyPhone && (
          <>
            <dt className="text-slate-500">{t.emergencyLine}</dt>
            <dd>
              <a
                className="font-medium text-red-700 underline dark:text-red-400"
                href={`tel:${hospital.emergencyPhone.replace(/\s/g, '')}`}
                dir="ltr"
              >
                {hospital.emergencyPhone}
              </a>
            </dd>
          </>
        )}
        <dt className="text-slate-500">{t.phone}</dt>
        <dd>
          <a className="underline" href={`tel:${hospital.phone.replace(/\s/g, '')}`} dir="ltr">
            {hospital.phone}
          </a>
        </dd>
      </dl>
    </article>
  );
}
