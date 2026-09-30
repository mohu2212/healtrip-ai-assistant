/**
 * Runs conversations through the real AgentService (configured LLM provider + database) and prints
 * each turn's reply, tool trace and outcome. Works offline with LLM_PROVIDER=mock (demo brain).
 *
 *   pnpm --filter @healtrip/api agent:chat                       # built-in scenarios
 *   pnpm --filter @healtrip/api agent:chat -- "message" ["next message" …]
 */
import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import type { Locale } from '@healtrip/shared';
import { AgentService, type ConversationTurn } from '../src/agent/agent.service.js';
import { CatalogRepository } from '../src/catalog/catalog.repository.js';
import { CatalogService } from '../src/catalog/catalog.service.js';
import { SystemClock } from '../src/common/clock.js';
import { loadEnv } from '../src/config/env.schema.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { createLlmProvider } from '../src/llm/llm.module.js';
import { createToolRegistry } from '../src/tools/tools.module.js';

if (existsSync('.env')) process.loadEnvFile('.env');
Logger.overrideLogger(['warn', 'error']);

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

// Explicit composition (tsx doesn't emit decorator metadata, so no Nest DI here) — same wiring as the app.
const config = loadEnv(process.env);
const clock = new SystemClock();
const prisma = new PrismaService(config);
const catalog = new CatalogService(new CatalogRepository(prisma), clock);
const agent = new AgentService(
  createLlmProvider(config),
  createToolRegistry(catalog),
  clock,
  config,
);

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
await prisma.$disconnect();
