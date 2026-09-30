import { Logger } from '@nestjs/common';
import { toDoctorDto, toHospitalDto } from '../catalog/catalog.mapper.js';
import type { CatalogService } from '../catalog/catalog.service.js';
import { doctorRow, hospitalRow } from '../catalog/testing/catalog.fixtures.js';
import type { Clock } from '../common/clock.js';
import { AppError } from '../common/errors/app-error.js';
import { loadEnv } from '../config/env.schema.js';
import { LlmError, type LlmMessage, type LlmResponse } from '../llm/llm.types.js';
import {
  ScriptedLlmProvider,
  scripted,
  type LlmScript,
} from '../llm/providers/scripted.provider.js';
import { createToolRegistry } from '../tools/tools.module.js';
import type { AssessUrgencyInput } from '../triage/triage.schema.js';
import { AgentService, type AgentTurnInput } from './agent.service.js';
import { emergencyMessage } from './fallback-replies.js';
import type { Submission } from './submit-response.tool.js';
import { SUBMIT_NUDGE, SYSTEM_PROMPT } from './system-prompt.js';

// ─── Scripted model building blocks ───────────────────────────────────────────────

const facts = (overrides: Partial<AssessUrgencyInput> = {}): AssessUrgencyInput => ({
  chiefComplaint: 'chest_pain',
  redFlagsScreened: true,
  redFlags: [],
  onset: 'weeks_or_longer',
  severity: 3,
  age: 35,
  riskFactors: [],
  hasExistingDiagnosis: false,
  ...overrides,
});

const answer = (overrides: Partial<Submission> = {}): Submission => ({
  message: 'A cardiologist is the right next step. This is guidance, not a diagnosis.',
  nextStep: 'SPECIALIST',
  clarifyingQuestions: [],
  quickReplies: [],
  recommendedDoctorIds: ['doc_001'],
  recommendedHospitalIds: [],
  ...overrides,
});

const triage = (f = facts()) => scripted.toolCall('assess_urgency', f, 'call_triage');
const searchDoctors = () =>
  scripted.toolCall('search_doctors', { specialty: 'cardiology' }, 'call_search');
const submit = (s: Partial<Submission> = {}, id = 'call_submit') =>
  scripted.toolCall('submit_response', answer(s), id);

// ─── Harness ───────────────────────────────────────────────────────────────────────

function setup(script: LlmScript | LlmResponse[], options: { clockStep?: number } = {}) {
  const catalog = {
    listSpecialties: vi
      .fn()
      .mockResolvedValue([{ code: 'cardiology', name: { en: 'Cardiology', ar: 'أمراض القلب' } }]),
    searchDoctors: vi.fn().mockResolvedValue([toDoctorDto(doctorRow())]),
    searchHospitals: vi.fn().mockResolvedValue([toHospitalDto(hospitalRow())]),
    getDoctor: vi.fn(),
    getHospital: vi.fn(),
  };
  let now = Date.parse('2026-10-01T10:00:00Z');
  const clock: Clock = { now: () => new Date((now += options.clockStep ?? 0)) };
  const llm = new ScriptedLlmProvider(script);
  const config = loadEnv({ DATABASE_URL: 'postgresql://u:p@h/db', LLM_PROVIDER: 'mock' });
  const agent = new AgentService(
    llm,
    createToolRegistry(catalog as unknown as CatalogService),
    clock,
    config,
  );
  const run = (overrides: Partial<AgentTurnInput> = {}) =>
    agent.runTurn({ history: [], userText: 'I have chest pain', locale: 'en', ...overrides });
  return { run, llm, catalog };
}

const lastMessage = (messages: LlmMessage[]) => messages[messages.length - 1];

beforeAll(() => {
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});
afterAll(() => vi.restoreAllMocks());

// ─── Scenarios ─────────────────────────────────────────────────────────────────────

describe('AgentService.runTurn', () => {
  it('happy path: triage → search → grounded answer', async () => {
    const { run } = setup([triage(), searchDoctors(), submit()]);
    const result = await run();

    expect(result.outcome).toBe('completed');
    expect(result.reply).toEqual({
      message: answer().message,
      language: 'en',
      nextStep: 'SPECIALIST',
      urgency: 'routine',
      emergency: false,
      clarifyingQuestions: [],
      quickReplies: [],
      recommendedDoctorIds: ['doc_001'],
      recommendedHospitalIds: [],
    });
    expect(result.trace.map((t) => `${t.name}:${t.ok}`)).toEqual([
      'assess_urgency:true',
      'search_doctors:true',
      'submit_response:true',
    ]);
    expect(result.iterations).toBe(3);
  });

  it('keeps the request history append-only with a frozen system prompt and tool list', async () => {
    const { run, llm } = setup([triage(), searchDoctors(), submit()]);
    await run({
      history: [
        { role: 'user', text: 'Hi' },
        { role: 'assistant', text: 'Hello, how can I help?' },
      ],
    });

    const [first, ...rest] = llm.requests;
    expect(first.system).toBe(SYSTEM_PROMPT);
    expect(first.tools.map((t) => t.name)).toEqual([
      'assess_urgency',
      'list_specialties',
      'search_doctors',
      'search_hospitals',
      'get_doctor_availability',
      'submit_response',
    ]);
    let previous = first;
    for (const request of rest) {
      expect(request.system).toBe(first.system);
      expect(request.tools).toEqual(first.tools);
      expect(request.messages.slice(0, previous.messages.length)).toEqual(previous.messages);
      previous = request;
    }
    // Earlier turns are replayed as plain text; the new message carries the per-turn context.
    expect(first.messages.slice(0, 2)).toEqual([
      { role: 'user', text: 'Hi' },
      { role: 'assistant', blocks: [{ type: 'text', text: 'Hello, how can I help?' }] },
    ]);
    expect(lastMessage(first.messages)).toMatchObject({
      role: 'user',
      text: expect.stringContaining('reply_language: English'),
    });
  });

  it('rejects a hallucinated doctor ID and accepts the corrected answer', async () => {
    const { run, llm } = setup([
      triage(),
      searchDoctors(),
      submit({ recommendedDoctorIds: ['doc_099'] }, 'call_bad'),
      submit(),
    ]);
    const result = await run();

    const feedback = lastMessage(llm.requests[3].messages);
    expect(feedback).toMatchObject({ role: 'tool_results' });
    const rejection = (feedback as Extract<LlmMessage, { role: 'tool_results' }>).results.find(
      (r) => r.toolCallId === 'call_bad',
    )!;
    expect(rejection.isError).toBe(true);
    expect(JSON.parse(rejection.content)).toMatchObject({
      error: 'ANSWER_REJECTED',
      problems: [expect.stringContaining('doc_099')],
      allowedDoctorIds: ['doc_001'],
    });

    expect(result.outcome).toBe('corrected');
    expect(result.grounding).toMatchObject({ corrections: 1, problems: ['UNKNOWN_DOCTOR_ID'] });
    expect(result.reply.recommendedDoctorIds).toEqual(['doc_001']);
  });

  it('drops IDs the model keeps inventing after its one correction', async () => {
    const bad = { recommendedDoctorIds: ['doc_001', 'doc_099'] };
    const { run } = setup([triage(), searchDoctors(), submit(bad), submit(bad)]);
    const result = await run();

    expect(result.outcome).toBe('corrected');
    expect(result.reply.recommendedDoctorIds).toEqual(['doc_001']);
    expect(result.grounding.droppedDoctorIds).toEqual(['doc_099']);
  });

  it('does not accept IDs from a search the model had not seen yet (parallel call)', async () => {
    const parallel: LlmResponse = {
      ...scripted.toolCall('search_doctors', { specialty: 'cardiology' }, 'call_search'),
      blocks: [
        { type: 'tool_call', id: 'call_search', name: 'search_doctors', input: {} },
        { type: 'tool_call', id: 'call_submit', name: 'submit_response', input: answer() },
      ],
    };
    const { run } = setup([triage(), parallel, submit()]);
    const result = await run();

    expect(result.grounding.corrections).toBe(1);
    expect(result.reply.recommendedDoctorIds).toEqual(['doc_001']); // accepted on the retry
  });

  it('replaces text naming doctors that no tool returned', async () => {
    const invented = { message: 'Book Dr. House, he is the best.', recommendedDoctorIds: [] };
    const { run } = setup([triage(), searchDoctors(), submit(invented), submit(invented)]);
    const result = await run();

    expect(result.reply.message).not.toContain('House');
    expect(result.grounding.problems).toContain('UNVERIFIED_DOCTOR_NAME');
  });

  it('never lets the model downgrade an emergency decided by triage', async () => {
    const redFlag = facts({ redFlags: ['pain_radiating_arm_jaw_back'] });
    const { run } = setup([
      triage(redFlag),
      searchDoctors(),
      submit({ nextStep: 'SPECIALIST' }),
      submit({ nextStep: 'SPECIALIST' }),
    ]);
    const result = await run();

    expect(result.reply).toMatchObject({
      nextStep: 'ER_NOW',
      urgency: 'emergency',
      emergency: true,
      message: emergencyMessage('en'),
      recommendedDoctorIds: [], // no appointments in an emergency
    });
  });

  it('keeps emergency departments in an ER answer', async () => {
    const redFlag = facts({ redFlags: ['cold_sweat'] });
    const { run } = setup([
      triage(redFlag),
      scripted.toolCall('search_hospitals', { hasEmergency: true }, 'call_er'),
      submit({
        message: 'Please go to the emergency department now.',
        nextStep: 'ER_NOW',
        recommendedDoctorIds: [],
        recommendedHospitalIds: ['hosp_01'],
      }),
    ]);
    const result = await run({ userText: 'chest pain and a cold sweat' });

    expect(result.outcome).toBe('completed');
    expect(result.reply).toMatchObject({ nextStep: 'ER_NOW', recommendedHospitalIds: ['hosp_01'] });
  });

  it('asks clarifying questions when triage needs more information', async () => {
    const { run } = setup([
      triage(facts({ redFlagsScreened: false, onset: 'unknown', severity: null })),
      submit({
        message: 'A few questions first.',
        nextStep: 'NEED_MORE_INFO',
        clarifyingQuestions: ['When did it start?', 'Does the pain spread to your arm or jaw?'],
        quickReplies: ['Today', 'A few days ago'],
        recommendedDoctorIds: [],
      }),
    ]);
    const result = await run();

    expect(result.reply).toMatchObject({
      nextStep: 'NEED_MORE_INFO',
      urgency: 'unknown',
      clarifyingQuestions: ['When did it start?', 'Does the pain spread to your arm or jaw?'],
      quickReplies: ['Today', 'A few days ago'],
    });
  });

  it('requires triage before a recommendation', async () => {
    const noDoctors = { recommendedDoctorIds: [] };
    const { run } = setup([submit(noDoctors), triage(), submit(noDoctors)]);
    const result = await run();

    expect(result.grounding.problems).toEqual(['TRIAGE_REQUIRED']);
    expect(result.outcome).toBe('corrected');
    expect(result.reply.nextStep).toBe('SPECIALIST');
  });

  it('nudges once when the model answers in plain text, then falls back', async () => {
    const nudged = setup([
      scripted.text('You should see a cardiologist.'),
      triage(),
      searchDoctors(),
      submit(),
    ]);
    const ok = await nudged.run();
    expect(lastMessage(nudged.llm.requests[1].messages)).toEqual({
      role: 'user',
      text: SUBMIT_NUDGE,
    });
    expect(ok.outcome).toBe('completed');

    const stubborn = setup([scripted.text('See a cardiologist.'), scripted.text('Really.')]);
    const fallback = await stubborn.run();
    expect(fallback).toMatchObject({ outcome: 'fallback', fallbackReason: 'no_submission' });
    expect(fallback.reply.nextStep).toBe('NEED_MORE_INFO');
  });

  it('falls back after an invalid submission that is not fixed', async () => {
    const invalid = scripted.toolCall('submit_response', { message: '', nextStep: 'MAYBE' });
    const { run } = setup([invalid, invalid]);
    const result = await run();
    expect(result).toMatchObject({ outcome: 'fallback', fallbackReason: 'invalid_submission' });
  });

  it('stops at the iteration limit', async () => {
    const { run } = setup(() => scripted.toolCall('list_specialties', {}));
    const result = await run();
    expect(result).toMatchObject({
      outcome: 'fallback',
      fallbackReason: 'iteration_limit',
      iterations: 6,
    });
  });

  it('stops when the time budget is exhausted', async () => {
    const { run } = setup(() => scripted.toolCall('list_specialties', {}), { clockStep: 60_000 });
    const result = await run();
    expect(result.fallbackReason).toBe('time_budget');
  });

  it('maps an LLM outage to LLM_UNAVAILABLE (503) without leaking provider details', async () => {
    const { run } = setup(() => {
      throw new LlmError('rate_limited', 'anthropic', { cause: new Error('secret detail') });
    });
    const error = await run().catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'LLM_UNAVAILABLE', status: 503 });
    expect(error.message).not.toContain('secret');
  });

  it('gives emergency guidance even during an outage when an emergency is suspected', async () => {
    const { run } = setup(() => {
      throw new LlmError('unavailable', 'anthropic');
    });
    const result = await run({ userText: "I have crushing chest pain and I can't breathe" });
    expect(result).toMatchObject({
      outcome: 'fallback',
      fallbackReason: 'llm_unavailable',
      reply: { nextStep: 'ER_NOW', emergency: true },
    });
  });

  it('treats a suspected emergency that the model never triaged as an emergency', async () => {
    const question = {
      message: 'Tell me more.',
      nextStep: 'NEED_MORE_INFO' as const,
      recommendedDoctorIds: [],
    };
    const { run } = setup([submit(question), submit(question)]);
    const result = await run({ userText: 'the pain is spreading to my left arm' });
    expect(result.reply.nextStep).toBe('ER_NOW');
  });

  it('handles a provider refusal with a safe reply', async () => {
    const { run } = setup([scripted.refusal()]);
    const result = await run();
    expect(result).toMatchObject({ outcome: 'fallback', fallbackReason: 'refusal' });
  });

  it('replies in Arabic when the patient writes in Arabic, whatever the UI language', async () => {
    const { run, llm } = setup([
      triage(),
      searchDoctors(),
      submit({ message: 'طبيب القلب هو الخطوة المناسبة.' }),
    ]);
    const result = await run({ userText: 'عندي ألم في صدري من أسبوعين', locale: 'en' });

    expect(result.reply.language).toBe('ar');
    expect(lastMessage(llm.requests[0].messages)).toMatchObject({
      text: expect.stringContaining('reply_language: Arabic'),
    });
  });

  it('adds a safety note to the turn when emergency phrases are detected', async () => {
    const { run, llm } = setup([
      triage(facts({ redFlags: ['fainting_or_near_fainting'] })),
      submit({ nextStep: 'ER_NOW', recommendedDoctorIds: [] }),
    ]);
    const result = await run({ userText: 'I fainted an hour ago' });

    expect(lastMessage(llm.requests[0].messages)).toMatchObject({
      text: expect.stringContaining('safety_note'),
    });
    expect(result.emergencyGuard).toEqual({ suspected: true, matches: ['fainting'] });
  });
});
