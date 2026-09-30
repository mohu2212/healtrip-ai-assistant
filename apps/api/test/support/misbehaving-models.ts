import type { Submission } from '../../src/agent/submit-response.tool.js';
import { LlmError, type LlmResponse } from '../../src/llm/llm.types.js';
import { ScriptedLlmProvider, scripted } from '../../src/llm/providers/scripted.provider.js';
import type { AssessUrgencyInput } from '../../src/triage/triage.schema.js';

/**
 * Building blocks for scripted models that misbehave on purpose. Real models occasionally do
 * these things (invent IDs, ignore tool results, get prompt-injected); the safety suite proves the
 * system still never shows fabricated or unsafe answers.
 */

export const facts = (overrides: Partial<AssessUrgencyInput> = {}): AssessUrgencyInput => ({
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

export const answer = (overrides: Partial<Submission> = {}): Submission => ({
  message: 'A cardiologist is the right next step. This is guidance, not a diagnosis.',
  nextStep: 'SPECIALIST',
  clarifyingQuestions: [],
  quickReplies: [],
  recommendedDoctorIds: ['doc_001'],
  recommendedHospitalIds: [],
  ...overrides,
});

export const step = {
  triage: (f: Partial<AssessUrgencyInput> = {}) =>
    scripted.toolCall('assess_urgency', facts(f), 'call_triage'),
  searchDoctors: (input: unknown = { specialty: 'cardiology' }) =>
    scripted.toolCall('search_doctors', input, 'call_search'),
  searchHospitals: (input: unknown = { hasEmergency: true }) =>
    scripted.toolCall('search_hospitals', input, 'call_hospitals'),
  submit: (s: Partial<Submission> = {}, id = 'call_submit') =>
    scripted.toolCall('submit_response', answer(s), id),
  text: (t: string) => scripted.text(t),
  refusal: () => scripted.refusal(),
};

export const model = (responses: LlmResponse[]) => new ScriptedLlmProvider(responses);

export const failingModel = (kind: LlmError['kind'] = 'unavailable') =>
  new ScriptedLlmProvider(() => {
    throw new LlmError(kind, 'anthropic', {
      cause: new Error('upstream detail that must not leak'),
    });
  });
