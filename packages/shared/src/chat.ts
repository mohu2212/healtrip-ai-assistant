import { z } from 'zod';
import { DoctorIdSchema, HospitalIdSchema } from './catalog.js';
import { LocaleSchema, NextStepSchema, UrgencySchema } from './enums.js';

export const MAX_CLARIFYING_QUESTIONS = 3;
export const MAX_QUICK_REPLIES = 4;
export const MAX_RECOMMENDATIONS = 5;

/**
 * The assistant's answer for one turn, after validation, grounding and safety overrides.
 * Doctors/hospitals are referenced by ID only; clients render them from catalog data.
 */
export const AssistantReplySchema = z.object({
  message: z.string(),
  language: LocaleSchema,
  nextStep: NextStepSchema,
  urgency: UrgencySchema,
  /** true ⇔ nextStep is ER_NOW — clients must show an emergency banner. */
  emergency: z.boolean(),
  clarifyingQuestions: z.array(z.string()).max(MAX_CLARIFYING_QUESTIONS),
  quickReplies: z.array(z.string()).max(MAX_QUICK_REPLIES),
  recommendedDoctorIds: z.array(DoctorIdSchema).max(MAX_RECOMMENDATIONS),
  recommendedHospitalIds: z.array(HospitalIdSchema).max(MAX_RECOMMENDATIONS),
});
export type AssistantReply = z.infer<typeof AssistantReplySchema>;
