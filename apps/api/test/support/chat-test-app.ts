import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { CatalogRepository, type DoctorRow } from '../../src/catalog/catalog.repository.js';
import {
  cardiologyRow,
  doctorRow,
  emergencyRow,
  hospitalRow,
} from '../../src/catalog/testing/catalog.fixtures.js';
import { ConversationRepository } from '../../src/chat/conversation.repository.js';
import { LlmProvider } from '../../src/llm/llm.types.js';
import { createTestApp } from '../create-test-app.js';
import { InMemoryConversationRepository } from './in-memory-conversation.repository.js';

export interface ChatTestAppOptions {
  env?: Record<string, string>;
  /** Replaces the LLM (default: the offline demo brain). */
  llm?: LlmProvider;
  /** Doctors returned by searches (default: one Cairo cardiologist, doc_001). */
  doctors?: DoctorRow[];
}

/**
 * The real API (middleware, agent, tools, triage, grounding, chat service) over HTTP, with an
 * in-memory conversation store and a small fixed catalog instead of a database.
 */
export async function createChatTestApp(options: ChatTestAppOptions = {}) {
  const conversations = new InMemoryConversationRepository();
  const doctors = options.doctors ?? [doctorRow()];
  const catalogRepository = {
    findSpecialties: async () => [cardiologyRow, emergencyRow],
    findDoctors: async (filters: { ids?: string[] }) =>
      filters.ids ? [doctorRow()].filter((d) => filters.ids!.includes(d.id)) : doctors,
    findDoctorById: async () => doctorRow(),
    findHospitals: async (filters: { ids?: string[] }) =>
      [hospitalRow()].filter((h) => !filters.ids || filters.ids.includes(h.id)),
    findHospitalById: async () => hospitalRow(),
  };

  const { app } = await createTestApp({
    env: options.env,
    overrides: [
      { provide: ConversationRepository, useValue: conversations },
      { provide: CatalogRepository, useValue: catalogRepository },
      ...(options.llm ? [{ provide: LlmProvider, useValue: options.llm }] : []),
    ],
  });

  const http = () => request((app as NestExpressApplication).getHttpServer());
  const newConversation = async (locale = 'en') =>
    (await http().post('/api/conversations').send({ locale }).expect(201)).body.data.id as string;
  const send = (id: string, text: string) =>
    http().post(`/api/conversations/${id}/messages`).send({ text });

  return { app, conversations, http, newConversation, send };
}
