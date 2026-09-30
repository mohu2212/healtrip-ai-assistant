import { normalizeArabic } from './language.js';

/**
 * Pre-LLM safety net: spots high-specificity emergency phrases (English + Arabic) in the patient's
 * message. It does NOT decide the outcome — the triage rules do. When it fires, the agent:
 *   1. asks the model to screen warning signs first (per-turn note),
 *   2. refuses any answer that was not preceded by an `assess_urgency` call,
 *   3. turns every failure path (LLM outage, refusal, iteration cap) into emergency guidance.
 * Phrases are deliberately specific and simple negations are ignored ("no chest pressure").
 */

interface Pattern {
  label: string;
  regex: RegExp;
}

const EN: Pattern[] = [
  {
    label: 'breathing_difficulty',
    regex: /\b(can'?t|cannot|unable to|struggling to|hard to) breathe\b/,
  },
  { label: 'breathing_difficulty', regex: /\bshort(ness)? of breath\b/ },
  {
    label: 'crushing_chest_pain',
    regex:
      /\b(crushing|squeezing|heavy pressure)\b.{0,30}\bchest\b|\bchest\b.{0,30}\b(crushing|squeezing)\b/,
  },
  {
    label: 'radiating_pain',
    regex:
      /\b(spread\w*|radiat\w*|going|goes|moving|shoot\w*)\s+(to|into|down|up)\s+(my\s+)?(left\s+|right\s+)?(arm|jaw|neck|back|shoulder)/,
  },
  {
    label: 'fainting',
    regex: /\b(passed out|fainted|fainting|blacked out|lost consciousness|collapsed)\b/,
  },
  { label: 'cold_sweat', regex: /\b(cold sweat|sweating heavily|drenched in sweat)\b/ },
  {
    label: 'stroke_signs',
    regex: /\b(slurred speech|face (is )?drooping|one side of my (body|face))\b/,
  },
  { label: 'coughing_blood', regex: /\bcough\w* (up )?blood\b/ },
  { label: 'heart_attack', regex: /\b(heart attack|stroke)\b/ },
];

// Matched against normalized Arabic (see normalizeArabic): ة→ه, أ/إ/آ→ا, ى→ي.
const AR: Pattern[] = [
  {
    label: 'breathing_difficulty',
    regex:
      /(لا استطيع|مش قادر|مش عارف|مو قادر)\s*(ا|ان ا)?تنفس|ضيق (في |ف )?(التنفس|النفس)|صعوبه (في )?التنفس|نهجان/,
  },
  {
    label: 'radiating_pain',
    regex:
      /(ينتشر|يمتد|بيمتد|بينزل|ينزل|بيوصل|يوصل|منتشر)\s*(الي|ل|لل|في|على|علي)?\s*(ال)?(ذراع|دراع|يد|ايد|فك|رقبه|ظهر|كتف)/,
  },
  { label: 'fainting', regex: /(اغمي|اغماء|فقدت الوعي|فقدان الوعي|وقعت من طولي)/ },
  { label: 'cold_sweat', regex: /(عرق بارد|عرقان جدا|تعرق شديد)/ },
  { label: 'crushing_chest_pain', regex: /(ضغط|ثقل|عصر)\s*(شديد\s*)?(علي|على|في)\s*(ال)?صدر/ },
  { label: 'coughing_blood', regex: /(كحه|اكح|بكح|سعال)\s*(ب)?دم/ },
  { label: 'heart_attack', regex: /(جلطه|ازمه قلبيه|سكته)/ },
];

const NEGATION_EN = /\b(no|not|don'?t|doesn'?t|didn'?t|never|without|denies|haven'?t|hasn'?t)\b/;
const NEGATION_AR = /(^|\s)(لا|ليس|ليست|مش|ما|بدون|مفيش|مافي|مافيش|لم|لست)(\s|$)/;
const NEGATION_WINDOW = 25; // characters before the match

export interface EmergencyGuardResult {
  suspected: boolean;
  matches: string[];
}

export function detectEmergency(text: string): EmergencyGuardResult {
  const en = text.toLowerCase();
  const ar = normalizeArabic(text);
  const matches = new Set<string>();

  const scan = (source: string, patterns: Pattern[], negation: RegExp) => {
    for (const { label, regex } of patterns) {
      for (const m of source.matchAll(new RegExp(regex.source, 'g'))) {
        const before = source.slice(Math.max(0, (m.index ?? 0) - NEGATION_WINDOW), m.index);
        // "لا استطيع التنفس" contains its own negation inside the match — only look before it.
        if (!negation.test(before)) matches.add(label);
      }
    }
  };
  scan(en, EN, NEGATION_EN);
  scan(ar, AR, NEGATION_AR);

  return { suspected: matches.size > 0, matches: [...matches] };
}
