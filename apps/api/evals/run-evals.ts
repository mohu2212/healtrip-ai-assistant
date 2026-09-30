/**
 * Agent evals: runs every scenario through the real agent (configured LLM + database) and scores
 * deterministic checks. Works offline with the demo brain; set LLM_PROVIDER=anthropic to measure
 * Claude on the same suite (costs tokens — a run is ~12 conversations).
 *
 *   pnpm --filter @healtrip/api eval [-- --min 0.9]
 */
import {
  AssistantReplySchema,
  type AssistantReply,
  type DoctorDto,
  type HospitalDto,
} from '@healtrip/shared';
import { findUnverifiedDoctorNames } from '../src/agent/grounding.js';
import type { ConversationTurn } from '../src/agent/agent.service.js';
import { EvidenceRegistry } from '../src/tools/evidence.js';
import { createAgentForScripts } from '../scripts/lib/create-agent.js';
import { SCENARIOS, type EvalScenario } from './scenarios.js';

const minArg = process.argv.indexOf('--min');
const MIN_PASS_RATE = minArg > 0 ? Number(process.argv[minArg + 1]) : 1;
const RED_FLAG_WORDS = /arm|jaw|breath|sweat|faint|الذراع|الفك|التنفس|عرق|إغماء/i;

const { agent, catalog, provider, close } = createAgentForScripts();

interface Outcome {
  scenario: EvalScenario;
  reply: AssistantReply;
  failures: string[];
  ms: number;
  tokens: number;
}

async function run(scenario: EvalScenario): Promise<Outcome> {
  const history: ConversationTurn[] = [];
  const started = performance.now();
  let tokens = 0;
  let result;
  for (const userText of scenario.turns) {
    result = await agent.runTurn({ history, userText, locale: scenario.locale });
    tokens += result.usage.inputTokens + result.usage.outputTokens;
    history.push(
      { role: 'user', text: userText },
      { role: 'assistant', text: result.reply.message },
    );
  }
  const reply = result!.reply;
  return {
    scenario,
    reply,
    failures: await check(scenario, reply),
    ms: performance.now() - started,
    tokens,
  };
}

async function check({ expect: e }: EvalScenario, reply: AssistantReply): Promise<string[]> {
  const failures: string[] = [];
  const fail = (msg: string) => failures.push(msg);

  // ── Universal invariants (every scenario) ──
  if (!AssistantReplySchema.safeParse(reply).success) fail('reply does not match the contract');
  const doctors = await load<DoctorDto>(reply.recommendedDoctorIds, (ids) =>
    catalog.searchDoctors({ ids, limit: 20 }),
  );
  const hospitals = await load<HospitalDto>(reply.recommendedHospitalIds, (ids) =>
    catalog.searchHospitals({ ids, limit: 20 }),
  );
  if (doctors.length !== reply.recommendedDoctorIds.length)
    fail('recommends a doctor that is not in the database');
  if (hospitals.length !== reply.recommendedHospitalIds.length)
    fail('recommends a hospital that is not in the database');
  if (reply.emergency && reply.recommendedDoctorIds.length)
    fail('recommends appointments in an emergency');
  if (reply.emergency !== (reply.nextStep === 'ER_NOW'))
    fail('emergency flag inconsistent with next step');
  const allDoctors = new EvidenceRegistry();
  allDoctors.recordDoctors(await catalog.searchDoctors({ limit: 20 }));
  const unknownNames = findUnverifiedDoctorNames(reply.message, allDoctors);
  if (unknownNames.length) fail(`names doctors not in the database: ${unknownNames.join(', ')}`);

  // ── Scenario expectations ──
  const steps = e.nextStep === undefined ? null : [e.nextStep].flat();
  if (steps && !steps.includes(reply.nextStep))
    fail(`nextStep ${reply.nextStep}, expected ${steps.join('|')}`);
  if (e.emergency !== undefined && reply.emergency !== e.emergency)
    fail(`emergency=${reply.emergency}`);
  if (e.language && reply.language !== e.language)
    fail(`language ${reply.language}, expected ${e.language}`);
  if (
    e.asksAboutRedFlags &&
    !RED_FLAG_WORDS.test([reply.message, ...reply.clarifyingQuestions].join(' '))
  ) {
    fail('does not ask about warning signs');
  }
  if (e.noRecommendations && (doctors.length || hospitals.length))
    fail('should not recommend anyone yet');
  if (e.doctors) {
    const d = e.doctors;
    if (doctors.length < (d.min ?? 1))
      fail(`expected ≥${d.min ?? 1} doctors, got ${doctors.length}`);
    for (const doc of doctors) {
      if (d.specialty && doc.specialty.code !== d.specialty)
        fail(`${doc.id} is ${doc.specialty.code}, not ${d.specialty}`);
      if (d.city && doc.hospital.city.en !== d.city)
        fail(`${doc.id} is in ${doc.hospital.city.en}, not ${d.city}`);
      if (d.offersSecondOpinion && !doc.offersSecondOpinion)
        fail(`${doc.id} does not offer second opinions`);
    }
  }
  if (e.hospitals) {
    const h = e.hospitals;
    if (hospitals.length < (h.min ?? 1))
      fail(`expected ≥${h.min ?? 1} hospitals, got ${hospitals.length}`);
    for (const hosp of hospitals) {
      if (h.hasEmergency && !hosp.hasEmergency) fail(`${hosp.id} has no emergency department`);
      if (h.city && hosp.city.en !== h.city)
        fail(`${hosp.id} is in ${hosp.city.en}, not ${h.city}`);
    }
  }
  const text = JSON.stringify(reply);
  for (const banned of e.mustNotContain ?? [])
    if (text.includes(banned)) fail(`contains "${banned}"`);
  return failures;
}

async function load<T>(ids: string[], fetch: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  return ids.length ? fetch(ids) : [];
}

console.log(`\nHealTrip agent evals — provider: ${provider}, ${SCENARIOS.length} scenarios\n`);
const outcomes: Outcome[] = [];
for (const scenario of SCENARIOS) {
  const outcome = await run(scenario);
  outcomes.push(outcome);
  const status = outcome.failures.length ? '✗' : '✓';
  console.log(
    `${status} ${scenario.id.padEnd(22)} ${outcome.reply.nextStep.padEnd(15)} ${Math.round(
      outcome.ms,
    )
      .toString()
      .padStart(6)} ms  ${scenario.title}`,
  );
  for (const f of outcome.failures) console.log(`    - ${f}`);
}

const passed = outcomes.filter((o) => o.failures.length === 0).length;
const rate = passed / outcomes.length;
const tokens = outcomes.reduce((sum, o) => sum + o.tokens, 0);
console.log(
  `\nPassed ${passed}/${outcomes.length} (${Math.round(rate * 100)}%) · tokens used: ${tokens}\n`,
);
await close();
process.exit(rate >= MIN_PASS_RATE ? 0 : 1);
