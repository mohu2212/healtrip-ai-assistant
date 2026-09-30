import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ConversationRepository } from './conversation.repository.js';

@Module({
  imports: [AgentModule, CatalogModule],
  controllers: [ChatController],
  providers: [ConversationRepository, ChatService],
})
export class ChatModule {}
