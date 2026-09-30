import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service.js';
import { createTestApp } from './create-test-app.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Chat flow over HTTP against the seeded database: persistence, audit log and hydration. */
describe.skipIf(!TEST_DATABASE_URL)('Chat API (integration, seeded DB)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app } = await createTestApp({
      realDatabase: true,
      env: { DATABASE_URL: TEST_DATABASE_URL! },
    }));
    prisma = app.get(PrismaService);
  });
  afterAll(() => app?.close());

  it('persists each turn atomically with its tool-call audit trail', async () => {
    const http = () => request(app.getHttpServer());
    const id = (await http().post('/api/conversations').send({ locale: 'en' }).expect(201)).body
      .data.id;

    await http()
      .post(`/api/conversations/${id}/messages`)
      .set('x-request-id', 'int-test-turn-1')
      .send({ text: 'I have chest pain and I am not sure where to go' })
      .expect(201);
    const second = await http()
      .post(`/api/conversations/${id}/messages`)
      .set('x-request-id', 'int-test-turn-2')
      .send({
        text: 'None of these. Weeks ago, 4/10. Diagnosed with angina, second opinion in Cairo.',
      })
      .expect(201);

    expect(second.body.data.assistantMessage.doctors.map((d: { id: string }) => d.id)).toEqual([
      'doc_001',
      'doc_002',
    ]);

    const rows = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: [{ createdAt: 'asc' }, { role: 'asc' }],
      include: { toolCalls: { orderBy: { createdAt: 'asc' } } },
    });
    expect(rows.map((r) => [r.role, r.requestId])).toEqual([
      ['USER', 'int-test-turn-1'],
      ['ASSISTANT', 'int-test-turn-1'],
      ['USER', 'int-test-turn-2'],
      ['ASSISTANT', 'int-test-turn-2'],
    ]);
    expect(rows[3].toolCalls.map((t) => [t.tool, t.status])).toEqual([
      ['assess_urgency', 'OK'],
      ['search_doctors', 'OK'],
      ['submit_response', 'OK'],
    ]);
    // The audit log never stores the patient-facing text of the answer.
    expect(JSON.stringify(rows[3].toolCalls)).not.toContain('Dr. Ahmed');

    const history = await http().get(`/api/conversations/${id}`).expect(200);
    expect(history.body.data.messages[3].doctors[0]).toMatchObject({
      id: 'doc_001',
      name: { en: 'Ahmed Mansour' },
    });
  });
});
