import Anthropic from '@anthropic-ai/sdk';
import { Global, Module } from '@nestjs/common';
import OpenAI from 'openai';
import { Clock } from '../common/clock.js';
import { AppConfig } from '../config/env.schema.js';
import { PrismaService } from '../database/prisma.service.js';
import { BudgetGuardedLlmProvider } from './budget/budget-guarded.provider.js';
import { LlmUsageRepository, type LlmUsageStore } from './budget/llm-usage.repository.js';
import { LlmProvider } from './llm.types.js';
import { AnthropicLlmProvider } from './providers/anthropic.provider.js';
import { OpenAiLlmProvider } from './providers/openai.provider.js';
import { demoLlmScript } from '../demo/demo-llm.script.js';
import { ScriptedLlmProvider } from './providers/scripted.provider.js';

/**
 * Picks the provider from configuration. API keys never leave this factory. With a daily token
 * budget and a usage store, the paid provider is wrapped so the demo brain takes over past the cap.
 */
export function createLlmProvider(
  config: AppConfig,
  budget?: { usage: LlmUsageStore; clock: Clock },
): LlmProvider {
  const provider = createBaseProvider(config);
  if (!budget || provider.name === 'mock' || config.llm.dailyTokenBudget <= 0) return provider;
  return new BudgetGuardedLlmProvider(
    provider,
    new ScriptedLlmProvider(demoLlmScript),
    budget.usage,
    budget.clock,
    config.llm.dailyTokenBudget,
  );
}

function createBaseProvider(config: AppConfig): LlmProvider {
  const { llm } = config;
  const sdkOptions = { timeout: llm.timeoutMs, maxRetries: llm.maxRetries };
  const modelOptions = { effort: llm.effort, maxTokens: llm.maxTokens };

  switch (llm.provider) {
    case 'anthropic':
      return new AnthropicLlmProvider(
        new Anthropic({ apiKey: llm.anthropic.apiKey, ...sdkOptions }),
        {
          model: llm.anthropic.model,
          ...modelOptions,
        },
      );
    case 'openai':
      return new OpenAiLlmProvider(new OpenAI({ apiKey: llm.openai.apiKey, ...sdkOptions }), {
        model: llm.openai.model,
        ...modelOptions,
      });
    case 'mock':
      // Offline demo brain: deterministic stand-in for the model; the rest of the pipeline is real.
      return new ScriptedLlmProvider(demoLlmScript);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: LlmProvider,
      inject: [AppConfig, PrismaService, Clock],
      useFactory: (config: AppConfig, prisma: PrismaService, clock: Clock) =>
        createLlmProvider(config, { usage: new LlmUsageRepository(prisma), clock }),
    },
  ],
  exports: [LlmProvider],
})
export class LlmModule {}
