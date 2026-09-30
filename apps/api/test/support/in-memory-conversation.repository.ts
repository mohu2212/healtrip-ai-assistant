import { randomUUID } from 'node:crypto';
import type {
  ConversationRow,
  MessageRow,
  SaveTurnInput,
} from '../../src/chat/conversation.repository.js';

/** Test double with the same contract as ConversationRepository, backed by arrays. */
export class InMemoryConversationRepository {
  readonly conversations: ConversationRow[] = [];
  readonly messages: MessageRow[] = [];

  async create(locale: string): Promise<ConversationRow> {
    const now = new Date();
    const row = { id: randomUUID(), locale, createdAt: now, updatedAt: now };
    this.conversations.push(row);
    return row;
  }

  async findById(id: string) {
    return this.conversations.find((c) => c.id === id) ?? null;
  }

  async findMessages(conversationId: string, options: { last?: number } = {}) {
    const all = this.messages.filter((m) => m.conversationId === conversationId);
    return options.last === undefined ? all : all.slice(-options.last);
  }

  async countUserMessages(conversationId: string) {
    return this.messages.filter((m) => m.conversationId === conversationId && m.role === 'USER')
      .length;
  }

  async saveTurn(input: SaveTurnInput) {
    const user: MessageRow = {
      id: randomUUID(),
      conversationId: input.conversationId,
      role: 'USER',
      content: { text: input.userText },
      requestId: input.requestId,
      createdAt: input.receivedAt,
      toolCalls: [],
    };
    const assistantId = randomUUID();
    const assistant: MessageRow = {
      id: assistantId,
      conversationId: input.conversationId,
      role: 'ASSISTANT',
      content: input.assistant as unknown as MessageRow['content'],
      requestId: input.requestId,
      createdAt: input.answeredAt,
      toolCalls: input.trace.map((t) => ({
        id: randomUUID(),
        messageId: assistantId,
        tool: t.name,
        input: t.input as MessageRow['content'],
        outputSummary: t.summary as MessageRow['content'],
        status: t.ok ? 'OK' : 'ERROR',
        latencyMs: t.latencyMs,
        createdAt: input.answeredAt,
      })),
    };
    this.messages.push(user, assistant);
    return { user, assistant };
  }
}
