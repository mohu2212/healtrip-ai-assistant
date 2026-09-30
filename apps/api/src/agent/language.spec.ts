import { detectLanguage, normalizeArabic } from './language.js';

describe('detectLanguage', () => {
  it.each([
    ['I have chest pain', 'ar', 'en'],
    ['عندي ألم في صدري', 'en', 'ar'],
    ['عندي chest pain من امبارح', 'en', 'ar'], // mostly Arabic
    ['123 !!!', 'ar', 'ar'], // no letters → UI language
    ['', 'en', 'en'],
  ] as const)('"%s" with UI %s → %s', (text, fallback, expected) => {
    expect(detectLanguage(text, fallback)).toBe(expected);
  });
});

describe('normalizeArabic', () => {
  it('folds spelling variants so keyword matching is robust', () => {
    expect(normalizeArabic('أُغْمِيَ عليّ')).toBe('اغمي علي');
    expect(normalizeArabic('إسطنبول والقاهرة')).toBe('اسطنبول والقاهره');
    expect(normalizeArabic('مستشفى')).toBe('مستشفي');
    expect(normalizeArabic('ســـلام')).toBe('سلام'); // tatweel
  });
});
