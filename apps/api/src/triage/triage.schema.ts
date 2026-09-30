import { z } from 'zod';
import type { NextStep, Urgency } from '@healtrip/shared';

/**
 * Structured facts the LLM extracts from the conversation. The LLM only *reports* what the
 * patient said, using closed enums; the urgency decision itself is made by `assessUrgency` in code.
 */

export const CHIEF_COMPLAINTS = [
  'chest_pain',
  'shortness_of_breath',
  'palpitations',
  'headache',
  'abdominal_pain',
  'other',
] as const;

export const RED_FLAGS = [
  'pain_at_rest_over_20_min',
  'pain_radiating_arm_jaw_back',
  'shortness_of_breath',
  'cold_sweat',
  'nausea_vomiting',
  'fainting_or_near_fainting',
  'sudden_severe_onset',
  'one_sided_weakness_or_speech_difficulty',
  'confusion',
  'coughing_blood',
] as const;

export const RISK_FACTORS = [
  'known_heart_disease',
  'diabetes',
  'hypertension',
  'smoker',
  'high_cholesterol',
  'family_history',
] as const;

export const ONSETS = ['now_or_today', 'days', 'weeks_or_longer', 'unknown'] as const;

export const AssessUrgencyInputSchema = z.strictObject({
  chiefComplaint: z.enum(CHIEF_COMPLAINTS).describe('Main symptom, mapped to the closest option'),
  redFlagsScreened: z
    .boolean()
    .describe(
      'true only if the patient has already answered questions about warning signs (e.g. pain spreading to arm/jaw, breathlessness, sweating, fainting)',
    ),
  redFlags: z
    .array(z.enum(RED_FLAGS))
    .describe('Warning signs the patient explicitly reported. Empty if none or not asked yet.'),
  onset: z.enum(ONSETS).describe('When the symptom started'),
  severity: z
    .number()
    .int()
    .min(0)
    .max(10)
    .nullable()
    .describe('Patient-reported severity 0–10, or null if unknown'),
  age: z.number().int().min(0).max(120).nullable().describe('Age in years, or null if unknown'),
  riskFactors: z.array(z.enum(RISK_FACTORS)).describe('Risk factors the patient reported'),
  hasExistingDiagnosis: z
    .boolean()
    .describe('true if the patient already has a diagnosis/treatment plan and wants it reviewed'),
});
export type AssessUrgencyInput = z.infer<typeof AssessUrgencyInputSchema>;

export type MissingInfo = 'red_flags' | 'onset' | 'severity';

export interface TriageReason {
  rule: string;
  explanation: string;
}

export interface TriageResult {
  level: Urgency;
  nextStep: NextStep;
  /** Specialty code to search for, or null when the next step is not a specialist search. */
  recommendedSpecialty: string | null;
  reasons: TriageReason[];
  /** Information the assistant must ask for before a decision can be made. */
  missingInfo: MissingInfo[];
}
