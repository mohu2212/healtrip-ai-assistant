import {
  DoctorIdSchema,
  HospitalIdSchema,
  MAX_CLARIFYING_QUESTIONS,
  MAX_QUICK_REPLIES,
  MAX_RECOMMENDATIONS,
  NextStepSchema,
} from '@healtrip/shared';
import { z } from 'zod';
import type { ToolDefinition } from '../llm/llm.types.js';
import { stripUnsupportedStrictKeywords } from '../tools/tool-registry.js';

export const SUBMIT_RESPONSE = 'submit_response';

/**
 * The only way the model can answer the patient. Handled by the agent loop (not the ToolRegistry):
 * the submission is validated, grounded against the turn's evidence and safety-checked before the
 * patient sees it. Every field is required so the schema is strict-compatible.
 */
export const SubmitResponseSchema = z.strictObject({
  message: z
    .string()
    .trim()
    .min(1)
    .max(1500)
    .describe("Reply to the patient, in the patient's language. Plain text, short paragraphs."),
  nextStep: NextStepSchema.describe(
    'The recommended next step. Must equal the nextStep decided by assess_urgency when it was called; NEED_MORE_INFO while you are still asking questions.',
  ),
  clarifyingQuestions: z
    .array(z.string().trim().min(1).max(200))
    .max(MAX_CLARIFYING_QUESTIONS)
    .describe('Up to 3 short questions you need answered (empty if none).'),
  quickReplies: z
    .array(z.string().trim().min(1).max(60))
    .max(MAX_QUICK_REPLIES)
    .describe('Up to 4 short tap-to-send answers for the patient (empty if none).'),
  recommendedDoctorIds: z
    .array(DoctorIdSchema)
    .max(MAX_RECOMMENDATIONS)
    .describe('IDs of doctors returned by search_doctors in this conversation turn (max 5).'),
  recommendedHospitalIds: z
    .array(HospitalIdSchema)
    .max(MAX_RECOMMENDATIONS)
    .describe('IDs of hospitals returned by a search tool in this conversation turn (max 5).'),
});
export type Submission = z.infer<typeof SubmitResponseSchema>;

const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(SubmitResponseSchema, { io: 'input' });

export const SUBMIT_RESPONSE_DEFINITION: ToolDefinition = {
  name: SUBMIT_RESPONSE,
  description:
    'Deliver your answer to the patient. Always finish every turn by calling this tool exactly once — ' +
    'the patient only sees what you submit here. Recommend doctors/hospitals only by IDs that tools ' +
    'returned; the submission is checked against the database and rejected otherwise.',
  inputSchema: stripUnsupportedStrictKeywords(jsonSchema),
  strict: true,
};
