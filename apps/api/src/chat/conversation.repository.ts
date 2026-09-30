import { Injectable } from '@nestjs/common';
import type { AssistantReply } from '@healtrip/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ToolExecution } from '../tools/tool.types.js';

const messageInclude = {
  toolCalls: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.MessageInclude;

export type ConversationRow = Prisma.ConversationGetPayload<object>;
export type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

/** Stored in `messages.content` for assistant messages. Versioned for future migrations. */
export interface AssistantContent {
  v: 1;
  reply: AssistantReply;
  meta: Record<string, unknown>;
}

export interface SaveTurnInput {
  conversationId: string;
  requestId: string | null;
  userText: string;
  receivedAt: Date;
  answeredAt: Date;
  assistant: AssistantContent;
  trace: ToolExecution[];
}

/** The only place that reads/writes conversation data. */
@Injectable()
export class ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(locale: string): Promise<ConversationRow> {
    return this.prisma.conversation.create({ data: { locale } });
  }

  findById(id: string): Promise<ConversationRow | null> {
    return this.prisma.conversation.findUnique({ where: { id } });
  }

  /** Messages in chronological order; `last` limits to the most recent N. */
  async findMessages(
    conversationId: string,
    options: { last?: number } = {},
  ): Promise<MessageRow[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      include: messageInclude,
      orderBy: [{ createdAt: 'desc' }, { role: 'desc' }],
      ...(options.last !== undefined ? { take: options.last } : {}),
    });
    return rows.reverse();
  }

  countUserMessages(conversationId: string): Promise<number> {
    return this.prisma.message.count({ where: { conversationId, role: 'USER' } });
  }

  /**
   * Persists one turn atomically: patient message, assistant message, and the audit log of every
   * tool call behind the answer. Either all of it is stored or none of it.
   */
  saveTurn(input: SaveTurnInput): Promise<{ user: MessageRow; assistant: MessageRow }> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          role: 'USER',
          content: { text: input.userText },
          requestId: input.requestId,
          createdAt: input.receivedAt,
        },
        include: messageInclude,
      });
      const assistant = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          role: 'ASSISTANT',
          content: input.assistant as unknown as Prisma.InputJsonValue,
          requestId: input.requestId,
          createdAt: input.answeredAt,
          toolCalls: {
            create: input.trace.map((t, i) => ({
              tool: t.name,
              input: (t.input ?? null) as Prisma.InputJsonValue,
              outputSummary: t.summary as Prisma.InputJsonValue,
              status: t.ok ? ('OK' as const) : ('ERROR' as const),
              latencyMs: t.latencyMs,
              // Keeps the call order stable when read back (same-transaction timestamps collide).
              createdAt: new Date(input.answeredAt.getTime() + i),
            })),
          },
        },
        include: messageInclude,
      });
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: input.answeredAt },
      });
      return { user, assistant };
    });
  }
}
