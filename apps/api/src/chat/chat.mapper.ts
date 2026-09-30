import {
  AssistantReplySchema,
  LocaleSchema,
  type AgentOutcome,
  type AssistantMessageDto,
  type AssistantReply,
  type ChatMessageDto,
  type ConversationDto,
  type DoctorDto,
  type HospitalDto,
  type UserMessageDto,
} from '@healtrip/shared';
import type { ConversationRow, MessageRow } from './conversation.repository.js';

export interface Cards {
  doctors: Map<string, DoctorDto>;
  hospitals: Map<string, HospitalDto>;
}

const UNAVAILABLE_REPLY: AssistantReply = {
  message: 'This message is no longer available.',
  language: 'en',
  nextStep: 'NEED_MORE_INFO',
  urgency: 'unknown',
  emergency: false,
  clarifyingQuestions: [],
  quickReplies: [],
  recommendedDoctorIds: [],
  recommendedHospitalIds: [],
};

/** Reads a stored assistant message defensively (old or corrupted rows never break the API). */
export function readAssistantContent(content: unknown): {
  reply: AssistantReply;
  meta: Record<string, unknown>;
} {
  const record = (content ?? {}) as { reply?: unknown; meta?: Record<string, unknown> };
  const parsed = AssistantReplySchema.safeParse(record.reply);
  return { reply: parsed.success ? parsed.data : UNAVAILABLE_REPLY, meta: record.meta ?? {} };
}

export function readUserText(content: unknown): string {
  const text = (content as { text?: unknown } | null)?.text;
  return typeof text === 'string' ? text : '';
}

export function toUserMessageDto(row: MessageRow): UserMessageDto {
  return {
    id: row.id,
    role: 'user',
    text: readUserText(row.content),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAssistantMessageDto(row: MessageRow, cards: Cards): AssistantMessageDto {
  const { reply, meta } = readAssistantContent(row.content);
  const pick = <T>(ids: string[], map: Map<string, T>) =>
    ids.flatMap((id) => (map.has(id) ? [map.get(id)!] : [])); // keep order, skip removed entries
  return {
    id: row.id,
    role: 'assistant',
    reply,
    doctors: pick(reply.recommendedDoctorIds, cards.doctors),
    hospitals: pick(reply.recommendedHospitalIds, cards.hospitals),
    trace: row.toolCalls.map((t) => ({
      tool: t.tool,
      ok: t.status === 'OK',
      latencyMs: t.latencyMs,
      summary: (t.outputSummary ?? {}) as Record<string, unknown>,
    })),
    meta: {
      outcome: (meta.outcome as AgentOutcome) ?? 'completed',
      fallbackReason: (meta.fallbackReason as string | undefined) ?? null,
      model: (meta.model as string | null | undefined) ?? null,
    },
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMessageDto(row: MessageRow, cards: Cards): ChatMessageDto {
  return row.role === 'USER' ? toUserMessageDto(row) : toAssistantMessageDto(row, cards);
}

export function toConversationDto(
  conversation: ConversationRow,
  messages: ChatMessageDto[],
): ConversationDto {
  return {
    id: conversation.id,
    locale: LocaleSchema.catch('en').parse(conversation.locale),
    createdAt: conversation.createdAt.toISOString(),
    messages,
  };
}
