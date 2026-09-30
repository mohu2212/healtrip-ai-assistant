import Anthropic from '@anthropic-ai/sdk';
import { Global, Module } from '@nestjs/common';
import OpenAI from 'openai';
import { AppConfig } from '../config/env.schema.js';
import { LlmProvider } from './llm.types.js';
import { AnthropicLlmProvider } from './providers/anthropic.provider.js';
import { OpenAiLlmProvider } from './providers/openai.provider.js';
import { ScriptedLlmProvider, scripted } from './providers/scripted.provider.js';

/** Picks the provider from configuration. API keys never leave this factory. */
export function createLlmProvider(config: AppConfig): LlmProvider {
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
      // Placeholder until the agent's offline demo script is wired in.
      return new ScriptedLlmProvider(() =>
        scripted.text('Demo mode: no LLM provider is configured.'),
      );
  }
}

@Global()
@Module({
  providers: [{ provide: LlmProvider, inject: [AppConfig], useFactory: createLlmProvider }],
  exports: [LlmProvider],
})
export class LlmModule {}
