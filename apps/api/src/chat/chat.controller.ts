import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ConversationIdSchema,
  CreateConversationSchema,
  SendMessageSchema,
  type ConversationDto,
  type CreateConversation,
  type ItemResponse,
  type SendMessage,
  type SendMessageResult,
} from '@healtrip/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { RequestId } from '../common/request-id.decorator.js';
import { ChatThrottle } from './chat-throttle.js';
import { ChatService } from './chat.service.js';

// An empty POST body is fine: all fields have defaults.
const CreateConversationBody = z.preprocess((v) => v ?? {}, CreateConversationSchema);

@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Starts an anonymous conversation. The UUID acts as an unguessable session key. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateConversationBody)) body: CreateConversation,
  ): Promise<ItemResponse<ConversationDto>> {
    return { data: await this.chat.createConversation(body.locale) };
  }

  @Get(':id')
  async get(
    @Param('id', new ZodValidationPipe(ConversationIdSchema)) id: string,
  ): Promise<ItemResponse<ConversationDto>> {
    return { data: await this.chat.getConversation(id) };
  }

  /** Sends a patient message and returns the assistant's validated, grounded reply. */
  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ChatThrottle()
  async send(
    @Param('id', new ZodValidationPipe(ConversationIdSchema)) id: string,
    @Body(new ZodValidationPipe(SendMessageSchema)) body: SendMessage,
    @RequestId() requestId: string | null,
  ): Promise<ItemResponse<SendMessageResult>> {
    return { data: await this.chat.sendMessage(id, body.text, requestId) };
  }
}
