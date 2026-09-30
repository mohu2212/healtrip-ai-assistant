import { z } from 'zod';

/** UI + agent reply language. */
export const LocaleSchema = z.enum(['en', 'ar']);
export type Locale = z.infer<typeof LocaleSchema>;

/**
 * The single recommended next step the assistant can return.
 * Kept as a closed enum so the UI can render each case deterministically
 * (e.g. ER_NOW always shows the emergency banner).
 */
export const NextStepSchema = z.enum([
  'ER_NOW', // go to the emergency room / call emergency services now
  'URGENT_CARE', // same-day in-person assessment
  'SPECIALIST', // book a specialist (e.g. cardiologist)
  'SECOND_OPINION', // review of an existing diagnosis / treatment plan
  'GP', // start with a general practitioner / internal medicine
  'NEED_MORE_INFO', // assistant is still asking clarifying questions
]);
export type NextStep = z.infer<typeof NextStepSchema>;

export const UrgencySchema = z.enum(['emergency', 'urgent', 'soon', 'routine', 'unknown']);
export type Urgency = z.infer<typeof UrgencySchema>;
