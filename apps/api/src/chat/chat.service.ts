import { HttpStatus, Injectable } from '@nestjs/common';
import {
  LocaleSchema,
  MAX_SEARCH_LIMIT,
  type AssistantReply,
  type ConversationDto,
  type Locale,
  type SendMessageResult,
} from '@healtrip/shared';
import { AgentService, type ConversationTurn } from '../agent/agent.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors/app-error.js';
import { AppConfig } from '../config/env.schema.js';
import {
  readAssistantContent,
  readUserText,
  toAssistantMessageDto,
  toConversationDto,
  toMessageDto,
  toUserMessageDto,
  type Cards,
} from './chat.mapper.js';
import { ConversationRepository, type MessageRow } from './conversation.repository.js';

/**
 * Conversation lifecycle around the agent: loads context, runs one agent turn, persists it with
 * its audit trail, and returns the reply with recommendation cards loaded from the database.
 */
@Injectable()
export class ChatService {
  /**
   * Conversations currently generating a reply. Prevents two concurrent turns from racing on the
   * same history. In-memory = single instance; a multi-instance deployment would use a DB/Redis lock.
   */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly conversations: ConversationRepository,
    private readonly agent: AgentService,
    private readonly catalog: CatalogService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async createConversation(locale: Locale): Promise<ConversationDto> {
    const conversation = await this.conversations.create(locale);
    return toConversationDto(conversation, []);
  }

  async getConversation(id: string): Promise<ConversationDto> {
    const conversation = await this.requireConversation(id);
    const rows = await this.conversations.findMessages(id);
    const cards = await this.loadCards(rows.flatMap(assistantReply));
    return toConversationDto(
      conversation,
      rows.map((row) => toMessageDto(row, cards)),
    );
  }

  async sendMessage(
    id: string,
    text: string,
    requestId: string | null,
  ): Promise<SendMessageResult> {
    const conversation = await this.requireConversation(id);

    if ((await this.conversations.countUserMessages(id)) >= this.config.chat.maxTurns) {
      throw new AppError(
        'CONFLICT',
        'This conversation has reached its message limit. Please start a new conversation.',
        HttpStatus.CONFLICT,
      );
    }
    if (this.inFlight.has(id)) {
      throw new AppError(
        'CONFLICT',
        'A reply to your previous message is still being prepared. Please wait a moment.',
        HttpStatus.CONFLICT,
      );
    }

    this.inFlight.add(id);
    try {
      const receivedAt = this.clock.now();
      const recent = await this.conversations.findMessages(id, {
        last: this.config.chat.historyTurns * 2,
      });

      // If the agent throws (e.g. LLM outage) nothing is stored — the client can simply retry.
      const result = await this.agent.runTurn({
        history: toHistory(recent),
        userText: text,
        locale: LocaleSchema.catch('en').parse(conversation.locale),
        requestId: requestId ?? undefined,
      });

      const saved = await this.conversations.saveTurn({
        conversationId: id,
        requestId,
        userText: text,
        receivedAt,
        answeredAt: this.clock.now(),
        assistant: {
          v: 1,
          reply: result.reply,
          meta: {
            outcome: result.outcome,
            fallbackReason: result.fallbackReason ?? null,
            model: result.model,
            iterations: result.iterations,
            grounding: result.grounding,
            emergencyGuard: result.emergencyGuard.matches,
            usage: result.usage,
          },
        },
        trace: result.trace,
      });

      const cards = await this.loadCards([result.reply]);
      return {
        userMessage: toUserMessageDto(saved.user),
        assistantMessage: toAssistantMessageDto(saved.assistant, cards),
      };
    } finally {
      this.inFlight.delete(id);
    }
  }

  private async requireConversation(id: string) {
    const conversation = await this.conversations.findById(id);
    if (!conversation) throw AppError.notFound('Conversation');
    return conversation;
  }

  /**
   * Loads every recommended doctor/hospital with batched ID lookups (≤20 IDs per query).
   * Cards are always built from current database records, never from model output.
   */
  private async loadCards(replies: AssistantReply[]): Promise<Cards> {
    const doctorIds = [...new Set(replies.flatMap((r) => r.recommendedDoctorIds))];
    const hospitalIds = [...new Set(replies.flatMap((r) => r.recommendedHospitalIds))];
    const [doctors, hospitals] = await Promise.all([
      Promise.all(
        chunk(doctorIds, MAX_SEARCH_LIMIT).map((ids) =>
          this.catalog.searchDoctors({ ids, limit: MAX_SEARCH_LIMIT }),
        ),
      ),
      Promise.all(
        chunk(hospitalIds, MAX_SEARCH_LIMIT).map((ids) =>
          this.catalog.searchHospitals({ ids, limit: MAX_SEARCH_LIMIT }),
        ),
      ),
    ]);
    return {
      doctors: new Map(doctors.flat().map((d) => [d.id, d])),
      hospitals: new Map(hospitals.flat().map((h) => [h.id, h])),
    };
  }
}

/** Earlier turns as plain text for the model: patient text and the assistant's final message. */
function toHistory(rows: MessageRow[]): ConversationTurn[] {
  const turns = rows.map((row): ConversationTurn =>
    row.role === 'USER'
      ? { role: 'user', text: readUserText(row.content) }
      : { role: 'assistant', text: readAssistantContent(row.content).reply.message },
  );
  // A history window must start with a patient message.
  while (turns[0]?.role === 'assistant') turns.shift();
  return turns;
}

function assistantReply(row: MessageRow): AssistantReply[] {
  return row.role === 'ASSISTANT' ? [readAssistantContent(row.content).reply] : [];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
