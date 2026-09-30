/**
 * Runs conversations through the real AgentService (configured LLM provider + database) and prints
 * each turn's reply, tool trace and outcome. Works offline with LLM_PROVIDER=mock (demo brain).
 *
 *   pnpm --filter @healtrip/api agent:chat                       # built-in scenarios
 *   pnpm --filter @healtrip/api agent:chat -- "message" ["next message" …]
 */
import type { Locale } from '@healtrip/shared';
import type { ConversationTurn } from '../src/agent/agent.service.js';
import { createAgentForScripts } from './lib/create-agent.js';

const SCENARIOS: { title: string; locale: Locale; messages: string[] }[] = [
  {
    title: 'Chest pain, unsure where to go → no warning signs → second opinion in Cairo',
    locale: 'en',
    messages: [
      "I have chest pain and I'm not sure whether I should see a cardiologist, go to the ER, or seek a second opinion.",
      "None of these. It started weeks ago, about 4/10. I'm 38. My doctor diagnosed angina and I want a second opinion in Cairo.",
    ],
  },
  {
    title: 'Chest pain with a warning sign → emergency',
    locale: 'en',
    messages: ['Chest pain since this morning and it is spreading to my left arm'],
  },
  {
    title: 'Arabic: chest pain → questions → cardiologist in Dubai',
    locale: 'ar',
    messages: [
      'عندي ألم في صدري ومش عارف أروح لمين',
      'لا شيء من هذا، بدأ منذ أسابيع وشدته 3 من 10، وأنا في دبي',
    ],
  },
];

const custom = process.argv.slice(2).filter((a) => a !== '--');
const scenarios = custom.length
  ? [{ title: 'Custom', locale: 'en' as Locale, messages: custom }]
  : SCENARIOS;

const { agent, close } = createAgentForScripts();

for (const scenario of scenarios) {
  console.log(`\n══════ ${scenario.title}`);
  const history: ConversationTurn[] = [];
  for (const userText of scenario.messages) {
    const result = await agent.runTurn({ history, userText, locale: scenario.locale });
    console.log(`\n👤 ${userText}`);
    console.log(`🤖 ${result.reply.message}`);
    if (result.reply.clarifyingQuestions.length)
      console.log('   ❓', result.reply.clarifyingQuestions.join('\n   ❓ '));
    console.log(
      `   → nextStep=${result.reply.nextStep} urgency=${result.reply.urgency} doctors=${JSON.stringify(result.reply.recommendedDoctorIds)} hospitals=${JSON.stringify(result.reply.recommendedHospitalIds)}`,
    );
    console.log(
      `   trace: ${result.trace.map((t) => `${t.name}${t.ok ? '' : '✗'}`).join(' → ')} | outcome=${result.outcome}${result.fallbackReason ? `(${result.fallbackReason})` : ''} | model=${result.model}`,
    );
    history.push(
      { role: 'user', text: userText },
      { role: 'assistant', text: result.reply.message },
    );
  }
}
await close();
