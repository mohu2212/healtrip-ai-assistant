import { detectEmergency } from '../agent/emergency-guard.js';
import { normalizeArabic } from '../agent/language.js';
import type { AssessUrgencyInput } from '../triage/triage.schema.js';

/**
 * Keyword-based fact extraction for the offline demo brain. Deliberately simple and predictable —
 * it stands in for the LLM's understanding so the real pipeline (tools, triage rules, grounding,
 * safety overrides) can be demonstrated without an API key.
 */

type RedFlag = AssessUrgencyInput['redFlags'][number];

const GUARD_TO_RED_FLAG: Record<string, RedFlag> = {
  breathing_difficulty: 'shortness_of_breath',
  radiating_pain: 'pain_radiating_arm_jaw_back',
  fainting: 'fainting_or_near_fainting',
  cold_sweat: 'cold_sweat',
  stroke_signs: 'one_sided_weakness_or_speech_difficulty',
  coughing_blood: 'coughing_blood',
};

const CITIES: [RegExp, string][] = [
  [/\bcairo\b|القاهره|مصر/, 'Cairo'],
  [/\bistanbul\b|اسطنبول|تركيا/, 'Istanbul'],
  [/\bdubai\b|دبي|الامارات/, 'Dubai'],
];

const has = (text: string, ...patterns: RegExp[]) => patterns.some((p) => p.test(text));

/** Arabic-Indic digits → ASCII so numbers can be parsed. */
const toAsciiDigits = (text: string) =>
  text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export interface DemoFacts {
  triage: AssessUrgencyInput;
  city: string | null;
}

/**
 * @param patientText everything the patient wrote in the conversation (all turns)
 * @param alreadyAsked whether the assistant has already asked follow-up questions
 */
export function extractFacts(patientText: string, alreadyAsked: boolean): DemoFacts {
  const raw = toAsciiDigits(patientText);
  const en = raw.toLowerCase();
  const ar = normalizeArabic(raw);
  const text = `${en}\n${ar}`;

  const chiefComplaint: AssessUrgencyInput['chiefComplaint'] = has(text, /chest|صدر/)
    ? 'chest_pain'
    : has(text, /palpitation|heart racing|خفقان|دقات القلب/)
      ? 'palpitations'
      : has(text, /angina|heart|cardiac|ذبحه|قلب/)
        ? 'chest_pain' // cardiac complaint without the word "chest"
        : has(text, /breath|تنفس|نفسي/)
          ? 'shortness_of_breath'
          : has(text, /headache|migraine|صداع/)
            ? 'headache'
            : has(text, /stomach|abdominal|belly|بطن|معده/)
              ? 'abdominal_pain'
              : 'other';

  const redFlags = new Set<RedFlag>(
    detectEmergency(raw)
      .matches.map((label) => GUARD_TO_RED_FLAG[label])
      .filter((flag): flag is RedFlag => Boolean(flag)),
  );
  if (
    has(text, /\b(nausea|nauseous|vomit\w*)\b|غثيان|ترجيع|استفراغ/) &&
    !has(text, /\bno nausea\b|بدون غثيان|مفيش غثيان/)
  ) {
    redFlags.add('nausea_vomiting');
  }
  if (has(text, /more than 20 min|at rest|while resting|اكثر من 20 دقيقه|وانا مرتاح|وقت الراحه/)) {
    redFlags.add('pain_at_rest_over_20_min');
  }
  if (has(text, /sudden(ly)? (and )?severe|فجاه وبشده|بشكل مفاجئ وشديد/)) {
    redFlags.add('sudden_severe_onset');
  }

  const onset: AssessUrgencyInput['onset'] = has(
    text,
    /\b(today|this morning|tonight|an hour|hours ago|right now|just now|started today)\b|اليوم|الصبح|من ساعه|من ساعات|دلوقتي|بدا اليوم/,
  )
    ? 'now_or_today'
    : has(text, /\b(yesterday|days?|few days)\b|امبارح|امس|ايام|يومين/)
      ? 'days'
      : has(text, /\b(weeks?|months?|years?)\b|اسبوع|اسابيع|شهر|شهور/)
        ? 'weeks_or_longer'
        : 'unknown';

  const severityMatch = /(\d{1,2})\s*(\/\s*10|out of 10|من 10|من عشره)/.exec(text);
  const severity = severityMatch
    ? Math.min(10, Number(severityMatch[1]))
    : has(text, /\b(severe|unbearable|worst)\b|شديد|لا يحتمل/)
      ? 8
      : has(text, /\bmoderate\b|متوسط/)
        ? 5
        : has(text, /\bmild|slight\b|خفيف|بسيط/)
          ? 3
          : null;

  const ageMatch =
    /(\d{2})\s*(years? old|yo\b|y\/o|سنه|عام)/.exec(text) ??
    /(?:i'?m|i am|age|عمري|سني)\s*(\d{2})\b/.exec(text);
  const age = ageMatch ? Number(ageMatch[1]) : null;

  const riskFactors: AssessUrgencyInput['riskFactors'] = [];
  if (has(text, /diabet|سكر/)) riskFactors.push('diabetes');
  if (has(text, /hypertension|high blood pressure|ضغط الدم|ضغط عالي/))
    riskFactors.push('hypertension');
  if (has(text, /\bsmok\w*|مدخن|بدخن|سجاير/)) riskFactors.push('smoker');
  if (has(text, /cholesterol|كوليسترول/)) riskFactors.push('high_cholesterol');
  if (has(text, /heart disease|heart condition|stent|مريض قلب|دعامه/))
    riskFactors.push('known_heart_disease');
  if (has(text, /family history|runs in (my|the) family|وراثي|في العيله|في العائله/))
    riskFactors.push('family_history');

  const hasExistingDiagnosis = has(
    text,
    /second opinion|diagnos|told me i have|recommended (surgery|a stent)|راي ثاني|رأي ثاني|تشخيص|شخصني|شخصوني/,
  );

  const city = CITIES.find(([pattern]) => pattern.test(text))?.[1] ?? null;

  // Warning signs count as screened once reported, explicitly denied, or asked about.
  const redFlagsScreened =
    redFlags.size > 0 ||
    alreadyAsked ||
    has(
      text,
      /\bnone of (these|those)\b|\bno (warning signs|red flags)\b|لا شيء من هذا|ولا حاجه|لا توجد علامات/,
    );

  return {
    triage: {
      chiefComplaint,
      redFlagsScreened,
      redFlags: [...redFlags],
      onset,
      severity,
      age,
      riskFactors,
      hasExistingDiagnosis,
    },
    city,
  };
}
