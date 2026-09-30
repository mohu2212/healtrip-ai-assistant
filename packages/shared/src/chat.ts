import { z } from 'zod';
import { DoctorIdSchema, HospitalIdSchema, type DoctorDto, type HospitalDto } from './catalog.js';
import { LocaleSchema, NextStepSchema, UrgencySchema, type Locale } from './enums.js';

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

// ─────────────────────────────── Chat API ───────────────────────────────

export const MAX_MESSAGE_LENGTH = 2000;

export const CreateConversationSchema = z.strictObject({
  locale: LocaleSchema.default('en'),
});
export type CreateConversation = z.infer<typeof CreateConversationSchema>;

export const SendMessageSchema = z.strictObject({
  text: z.string().trim().min(1, 'Message is empty').max(MAX_MESSAGE_LENGTH),
});
export type SendMessage = z.infer<typeof SendMessageSchema>;

export const ConversationIdSchema = z.uuid('Invalid conversation ID');

/** One tool call of the assistant's turn, for the "how I got this answer" panel (no inputs). */
export interface ToolTraceItem {
  tool: string;
  ok: boolean;
  latencyMs: number;
  summary: Record<string, unknown>;
}

export type AgentOutcome = 'completed' | 'corrected' | 'fallback';

export interface UserMessageDto {
  id: string;
  role: 'user';
  text: string;
  createdAt: string;
}

export interface AssistantMessageDto {
  id: string;
  role: 'assistant';
  reply: AssistantReply;
  /** Recommended doctors/hospitals loaded from the database by ID, in recommendation order. */
  doctors: DoctorDto[];
  hospitals: HospitalDto[];
  trace: ToolTraceItem[];
  meta: { outcome: AgentOutcome; fallbackReason: string | null; model: string | null };
  createdAt: string;
}

export type ChatMessageDto = UserMessageDto | AssistantMessageDto;

export interface ConversationDto {
  id: string;
  locale: Locale;
  createdAt: string;
  messages: ChatMessageDto[];
}

export interface SendMessageResult {
  userMessage: UserMessageDto;
  assistantMessage: AssistantMessageDto;
}
