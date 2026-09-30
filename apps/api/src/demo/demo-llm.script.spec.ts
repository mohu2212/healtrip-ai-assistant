import { Logger } from '@nestjs/common';
import { AgentService, type ConversationTurn } from '../agent/agent.service.js';
import { toDoctorDto, toHospitalDto } from '../catalog/catalog.mapper.js';
import type { CatalogService } from '../catalog/catalog.service.js';
import { doctorRow, hospitalRow } from '../catalog/testing/catalog.fixtures.js';
import { SystemClock } from '../common/clock.js';
import { loadEnv } from '../config/env.schema.js';
import { ScriptedLlmProvider } from '../llm/providers/scripted.provider.js';
import { createToolRegistry } from '../tools/tools.module.js';
import { demoLlmScript } from './demo-llm.script.js';

/** The offline demo brain driving the real agent pipeline (tools, triage, grounding). */
describe('demo brain through AgentService', () => {
  let catalog: Record<keyof CatalogService, ReturnType<typeof vi.fn>>;
  let agent: AgentService;

  beforeAll(() => vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {}));
  afterAll(() => vi.restoreAllMocks());

  beforeEach(() => {
    catalog = {
      listSpecialties: vi.fn(),
      searchDoctors: vi.fn().mockResolvedValue([toDoctorDto(doctorRow())]),
      searchHospitals: vi.fn().mockResolvedValue([toHospitalDto(hospitalRow())]),
      getDoctor: vi.fn(),
      getHospital: vi.fn(),
    };
    agent = new AgentService(
      new ScriptedLlmProvider(demoLlmScript),
      createToolRegistry(catalog as unknown as CatalogService),
      new SystemClock(),
      loadEnv({ DATABASE_URL: 'postgresql://u:p@h/db', LLM_PROVIDER: 'mock' }),
    );
  });

  async function converse(messages: string[], locale: 'en' | 'ar' = 'en') {
    const history: ConversationTurn[] = [];
    const results = [];
    for (const userText of messages) {
      const result = await agent.runTurn({ history, userText, locale });
      results.push(result);
      history.push(
        { role: 'user', text: userText },
        { role: 'assistant', text: result.reply.message },
      );
    }
    return results;
  }

  it('asks screening questions first, then recommends grounded doctors', async () => {
    const [first, second] = await converse([
      'I have chest pain and I am not sure where to go',
      'None of these. It started weeks ago, 3/10. I am in Cairo.',
    ]);

    expect(first.reply).toMatchObject({ nextStep: 'NEED_MORE_INFO', recommendedDoctorIds: [] });
    expect(first.reply.clarifyingQuestions).toHaveLength(3);
    expect(first.reply.quickReplies).toContain('None of these');

    expect(second.outcome).toBe('completed');
    expect(second.reply).toMatchObject({
      nextStep: 'SPECIALIST',
      recommendedDoctorIds: ['doc_001'],
    });
    expect(second.reply.message).toContain('Dr. Test Doctor');
    expect(catalog.searchDoctors).toHaveBeenCalledWith({
      specialty: 'cardiology',
      city: 'Cairo',
      limit: 3,
    });
  });

  it('sends a patient with a warning sign to the emergency department', async () => {
    const [result] = await converse(['chest pain and a cold sweat, I am in Cairo']);
    expect(result.reply).toMatchObject({
      nextStep: 'ER_NOW',
      emergency: true,
      recommendedDoctorIds: [],
      recommendedHospitalIds: ['hosp_01'],
    });
    expect(catalog.searchHospitals).toHaveBeenCalledWith({
      hasEmergency: true,
      city: 'Cairo',
      limit: 3,
    });
  });

  it('searches for second-opinion doctors when the patient already has a diagnosis', async () => {
    await converse([
      'I was diagnosed with angina weeks ago, no warning signs, pain 2/10. I want a second opinion.',
    ]);
    expect(catalog.searchDoctors).toHaveBeenCalledWith({
      specialty: 'cardiology',
      offersSecondOpinion: true,
      limit: 3,
    });
  });

  it('widens the search when the city has no match, and never invents doctors', async () => {
    catalog.searchDoctors.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const [result] = await converse([
      'chest pain for weeks, none of these warning signs, 2/10, in Dubai',
    ]);

    expect(catalog.searchDoctors).toHaveBeenCalledTimes(2);
    expect(catalog.searchDoctors.mock.calls[1][0]).not.toHaveProperty('city');
    expect(result.reply.recommendedDoctorIds).toEqual([]);
    expect(result.reply.message).toMatch(/could not find a matching doctor/);
  });

  it('works in Arabic', async () => {
    const [first, second] = await converse(
      ['عندي ألم في صدري', 'لا شيء من هذا، بدأ منذ أسابيع وشدته 3 من 10'],
      'ar',
    );
    expect(first.reply.language).toBe('ar');
    expect(first.reply.clarifyingQuestions[0]).toMatch(/الذراع/);
    expect(second.reply).toMatchObject({ language: 'ar', nextStep: 'SPECIALIST' });
    expect(second.reply.message).toContain('د. طبيب تجريبي');
  });
});
