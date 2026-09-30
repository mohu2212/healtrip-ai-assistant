import type { Locale } from '@healtrip/shared';

const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', ar: 'ar-EG' };

/** Replaces {name} placeholders in a dictionary string. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatUsd(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);
}

/** "ar" → "Arabic" / "العربية" using the browser's own language names. */
export function languageNames(codes: string[], locale: Locale): string {
  const names = new Intl.DisplayNames([INTL_LOCALE[locale]], { type: 'language' });
  const list = codes.map((code) => names.of(code) ?? code);
  return new Intl.ListFormat(INTL_LOCALE[locale], { type: 'conjunction' }).format(list);
}
