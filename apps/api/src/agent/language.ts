import type { Locale } from '@healtrip/shared';

const ARABIC_LETTER = /[؀-ۿ]/g;
const LATIN_LETTER = /[A-Za-z]/g;

/** Reply language: the script the patient actually wrote in, else the UI language. */
export function detectLanguage(text: string, fallback: Locale): Locale {
  const arabic = text.match(ARABIC_LETTER)?.length ?? 0;
  const latin = text.match(LATIN_LETTER)?.length ?? 0;
  if (arabic > latin) return 'ar';
  if (latin > arabic) return 'en';
  return fallback;
}

/** Folds common Arabic spelling variants so keyword matching is robust. */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ْـ]/g, '') // diacritics + tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}
