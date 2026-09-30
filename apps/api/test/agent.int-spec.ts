import type { NestExpressApplication } from '@nestjs/platform-express';
import { AgentService, type ConversationTurn } from '../src/agent/agent.service.js';
import { createTestApp } from './create-test-app.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Full agent pipeline (demo brain, real tools, seeded DB): the task's reference scenario. */
describe.skipIf(!TEST_DATABASE_URL)('Agent (integration, demo brain, seeded DB)', () => {
  let app: NestExpressApplication;
  let agent: AgentService;

  beforeAll(async () => {
    ({ app } = await createTestApp({
      realDatabase: true,
      env: { DATABASE_URL: TEST_DATABASE_URL! },
    }));
    agent = app.get(AgentService);
  });
  afterAll(() => app?.close());

  async function converse(messages: string[]) {
    const history: ConversationTurn[] = [];
    let last;
    for (const userText of messages) {
      last = await agent.runTurn({ history, userText, locale: 'en' });
      history.push(
        { role: 'user', text: userText },
        { role: 'assistant', text: last.reply.message },
      );
    }
    return last!;
  }

  it('chest pain → screening → second opinion with real Cairo cardiologists', async () => {
    const result = await converse([
      "I have chest pain and I'm not sure whether I should see a cardiologist, go to the ER, or seek a second opinion.",
      'None of these. It started weeks ago, about 4/10. I was diagnosed with angina and want a second opinion in Cairo.',
    ]);
    expect(result.reply).toMatchObject({
      nextStep: 'SECOND_OPINION',
      recommendedDoctorIds: ['doc_001', 'doc_002'],
    });
    expect(result.reply.message).toContain('Dr. Ahmed Mansour');
  });

  it('warning sign → ER with an emergency department in the patient’s city', async () => {
    const result = await converse(['chest pain spreading to my left arm, I am in Istanbul']);
    expect(result.reply).toMatchObject({
      nextStep: 'ER_NOW',
      emergency: true,
      recommendedHospitalIds: ['hosp_03'],
    });
  });
});
