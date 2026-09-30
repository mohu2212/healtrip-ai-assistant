import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AssistantReply, Locale } from '@healtrip/shared';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors/app-error.js';
import { AppConfig } from '../config/env.schema.js';
import {
  LlmError,
  LlmProvider,
  type AssistantBlock,
  type LlmMessage,
  type LlmUsage,
  type ToolDefinition,
  type ToolResult,
} from '../llm/llm.types.js';
import { EvidenceRegistry } from '../tools/evidence.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolExecution } from '../tools/tool.types.js';
import { detectEmergency, type EmergencyGuardResult } from './emergency-guard.js';
import {
  emergencyMessage,
  fallbackReply,
  groundedIntro,
  type FallbackKind,
} from './fallback-replies.js';
import { validateSubmission, type GroundingProblem, type GroundingResult } from './grounding.js';
import { detectLanguage } from './language.js';
import {
  SUBMIT_RESPONSE,
  SUBMIT_RESPONSE_DEFINITION,
  SubmitResponseSchema,
  type Submission,
} from './submit-response.tool.js';
import { SUBMIT_NUDGE, SYSTEM_PROMPT } from './system-prompt.js';

/** How many times the model may fix a rejected answer before we sanitize it ourselves. */
const MAX_CORRECTIONS = 1;
const MAX_NUDGES = 1;

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AgentTurnInput {
  /** Earlier turns as plain text (user messages and the assistant's final messages). */
  history: ConversationTurn[];
  userText: string;
  /** UI language — used when the message itself doesn't reveal the language. */
  locale: Locale;
  requestId?: string;
}

export type AgentOutcome = 'completed' | 'corrected' | 'fallback';

export type FallbackReason =
  | 'llm_unavailable'
  | 'refusal'
  | 'no_submission'
  | 'invalid_submission'
  | 'output_truncated'
  | 'iteration_limit'
  | 'time_budget';

export interface AgentTurnResult {
  reply: AssistantReply;
  /** Every tool call of the turn (incl. submit_response attempts) — for the UI trace and audit log. */
  trace: ToolExecution[];
  outcome: AgentOutcome;
  fallbackReason?: FallbackReason;
  grounding: {
    corrections: number;
    problems: GroundingProblem['code'][];
    droppedDoctorIds: string[];
    droppedHospitalIds: string[];
  };
  emergencyGuard: EmergencyGuardResult;
  usage: Required<LlmUsage>;
  iterations: number;
  model: string | null;
}

/**
 * Orchestrates one patient turn: LLM ⇄ tools loop, then validation, grounding and safety overrides
 * before anything reaches the patient.
 *
 * Invariants
 * - The model can only answer through `submit_response`; its free text is never shown.
 * - Recommended doctors/hospitals must have been returned by a tool earlier in the turn.
 * - The triage decision (code) is binding: the model cannot change or downgrade it.
 * - The request history is append-only and system/tools never change (prompt caching; thinking
 *   blocks are bound to the exact conversation prefix).
 * - Failures degrade to deterministic replies — emergency guidance whenever an emergency is suspected.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  /** Frozen for the lifetime of the process: identical tool list on every request. */
  private readonly toolDefinitions: ToolDefinition[];

  constructor(
    private readonly llm: LlmProvider,
    private readonly tools: ToolRegistry,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {
    this.toolDefinitions = [...tools.definitions(), SUBMIT_RESPONSE_DEFINITION];
  }

  async runTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
    const turn = new TurnState(input, this.clock.now().getTime());
    const { maxIterations, turnBudgetMs } = this.config.agent;

    while (turn.iterations < maxIterations) {
      if (this.clock.now().getTime() - turn.startedAt > turnBudgetMs) {
        return this.finish(turn, turn.fallback('time_budget'));
      }

      turn.iterations++;
      let response;
      try {
        response = await this.llm.complete({
          system: SYSTEM_PROMPT,
          tools: this.toolDefinitions,
          messages: turn.messages,
        });
      } catch (error) {
        if (!(error instanceof LlmError)) throw error;
        this.logger.warn(
          { requestId: input.requestId, kind: error.kind, provider: error.provider },
          'LLM call failed',
        );
        // Safety first: a suspected emergency always gets emergency guidance, even during an outage.
        if (turn.guard.suspected) return this.finish(turn, turn.fallback('llm_unavailable'));
        throw new AppError(
          'LLM_UNAVAILABLE',
          'The assistant is temporarily unavailable. Please try again shortly.',
          HttpStatus.SERVICE_UNAVAILABLE,
          undefined,
          { cause: error },
        );
      }

      turn.addUsage(response.usage, response.model);
      if (response.stopReason === 'refusal') return this.finish(turn, turn.fallback('refusal'));

      // Append the assistant turn verbatim (native content carries provider-internal blocks).
      turn.messages.push({ role: 'assistant', blocks: response.blocks, native: response.native });

      const calls = response.blocks.filter(
        (b): b is Extract<AssistantBlock, { type: 'tool_call' }> => b.type === 'tool_call',
      );
      if (calls.length === 0) {
        if (response.stopReason === 'max_tokens') {
          return this.finish(turn, turn.fallback('output_truncated'));
        }
        if (turn.nudges++ < MAX_NUDGES) {
          turn.messages.push({ role: 'user', text: SUBMIT_NUDGE });
          continue;
        }
        return this.finish(turn, turn.fallback('no_submission'));
      }

      // What the model had seen when it wrote this message (parallel results don't count).
      const evidenceBefore = turn.evidence.snapshot();
      const [submitCall, ...extraSubmits] = calls.filter((c) => c.name === SUBMIT_RESPONSE);
      const toolCalls = calls.filter((c) => c.name !== SUBMIT_RESPONSE);

      const executed = await Promise.all(
        toolCalls.map((call) => this.tools.execute(call, { evidence: turn.evidence })),
      );
      turn.trace.push(...executed.map((e) => e.execution));
      const results: ToolResult[] = executed.map((e) => e.result);

      if (!submitCall) {
        turn.messages.push({ role: 'tool_results', results });
        continue;
      }

      const verdict = this.review(submitCall.input, evidenceBefore, turn);
      turn.trace.push({
        toolCallId: submitCall.id,
        name: SUBMIT_RESPONSE,
        input: summarizeSubmissionInput(submitCall.input),
        ok: verdict.problems.length === 0,
        latencyMs: 0,
        summary: {
          nextStep: verdict.submission?.nextStep ?? null,
          problems: verdict.problems.map((p) => p.code),
        },
      });

      if (verdict.problems.length === 0 || turn.corrections >= MAX_CORRECTIONS) {
        if (!verdict.submission || !verdict.grounding) {
          return this.finish(turn, turn.fallback('invalid_submission'));
        }
        return this.finish(
          turn,
          this.buildReply(turn, verdict.submission, verdict.grounding, evidenceBefore),
        );
      }

      // Ask the model to fix its answer once, telling it exactly what was wrong.
      turn.corrections++;
      turn.problemCodes.push(...verdict.problems.map((p) => p.code));
      results.push({
        toolCallId: submitCall.id,
        isError: true,
        content: JSON.stringify({
          error: 'ANSWER_REJECTED',
          problems: verdict.problems.map((p) => p.message),
          allowedDoctorIds: evidenceBefore.doctorIds(),
          allowedHospitalIds: evidenceBefore.hospitalIds(),
          instruction: 'Fix the problems and call submit_response again.',
        }),
      });
      for (const extra of extraSubmits) {
        results.push({
          toolCallId: extra.id,
          isError: true,
          content: JSON.stringify({ error: 'ONLY_ONE_SUBMISSION_PER_TURN' }),
        });
      }
      turn.messages.push({ role: 'tool_results', results });
    }

    return this.finish(turn, turn.fallback('iteration_limit'));
  }

  /** Schema + grounding + safety review of one submit_response call. */
  private review(rawInput: unknown, evidenceBefore: EvidenceRegistry, turn: TurnState): Verdict {
    const parsed = SubmitResponseSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        submission: null,
        grounding: null,
        problems: parsed.error.issues.map((i) => ({
          code: 'INVALID_SUBMISSION',
          message: `${i.path.join('.') || '(root)'}: ${i.message}`,
        })),
      };
    }
    const grounding = validateSubmission(parsed.data, evidenceBefore, {
      triageRequired: turn.guard.suspected,
    });
    return { submission: parsed.data, grounding, problems: grounding.problems };
  }

  /** Applies the code-level decisions on top of the (possibly still imperfect) submission. */
  private buildReply(
    turn: TurnState,
    submission: Submission,
    grounding: GroundingResult,
    evidenceBefore: EvidenceRegistry,
  ): TurnReply {
    const { nextStep, recommendedDoctorIds, recommendedHospitalIds } = grounding.sanitized;
    const unresolved = new Set(grounding.problems.map((p) => p.code));

    // A suspected emergency that was never triaged is treated as an emergency.
    if (turn.guard.suspected && unresolved.has('TRIAGE_REQUIRED')) {
      turn.problemCodes.push(...unresolved);
      return turn.fallback('invalid_submission'); // guard suspected → emergency reply
    }
    turn.problemCodes.push(...unresolved);
    turn.dropped.doctorIds.push(...grounding.dropped.doctorIds);
    turn.dropped.hospitalIds.push(...grounding.dropped.hospitalIds);

    // Replace text we can't trust: a contradicted emergency, or doctor names nobody returned.
    let message = submission.message;
    if (nextStep === 'ER_NOW' && submission.nextStep !== 'ER_NOW') {
      message = emergencyMessage(turn.language);
    } else if (unresolved.has('UNVERIFIED_DOCTOR_NAME')) {
      message = groundedIntro(
        turn.language,
        recommendedDoctorIds.length + recommendedHospitalIds.length > 0,
      );
    }

    const triageLevel = evidenceBefore.mostUrgentTriage()?.level ?? 'unknown';
    return {
      reply: {
        message,
        language: turn.language,
        nextStep,
        urgency: nextStep === 'ER_NOW' ? 'emergency' : triageLevel,
        emergency: nextStep === 'ER_NOW',
        clarifyingQuestions: nextStep === 'NEED_MORE_INFO' ? submission.clarifyingQuestions : [],
        quickReplies: submission.quickReplies,
        recommendedDoctorIds,
        recommendedHospitalIds,
      },
      outcome: turn.corrections > 0 || unresolved.size > 0 ? 'corrected' : 'completed',
    };
  }

  private finish(turn: TurnState, { reply, outcome, fallbackReason }: TurnReply): AgentTurnResult {
    const result: AgentTurnResult = {
      reply,
      trace: turn.trace,
      outcome,
      fallbackReason,
      grounding: {
        corrections: turn.corrections,
        problems: [...new Set(turn.problemCodes)],
        droppedDoctorIds: [...new Set(turn.dropped.doctorIds)],
        droppedHospitalIds: [...new Set(turn.dropped.hospitalIds)],
      },
      emergencyGuard: turn.guard,
      usage: turn.usage,
      iterations: turn.iterations,
      model: turn.model,
    };
    // Structured audit log — IDs, codes and counts only, never the patient's text.
    this.logger.log(
      {
        requestId: turn.requestId,
        outcome,
        fallbackReason,
        nextStep: reply.nextStep,
        iterations: turn.iterations,
        tools: turn.trace.map((t) => `${t.name}:${t.ok ? 'ok' : 'error'}`),
        grounding: result.grounding,
        emergencyGuard: turn.guard.matches,
        usage: turn.usage,
        model: turn.model,
      },
      'Agent turn finished',
    );
    return result;
  }
}

type Verdict =
  | { submission: Submission; grounding: GroundingResult; problems: GroundingProblem[] }
  | { submission: null; grounding: null; problems: GroundingProblem[] };

interface TurnReply {
  reply: AssistantReply;
  outcome: AgentOutcome;
  fallbackReason?: FallbackReason;
}

/** Mutable state of one turn. */
class TurnState {
  readonly language: Locale;
  readonly guard: EmergencyGuardResult;
  readonly requestId?: string;
  readonly evidence = new EvidenceRegistry();
  readonly messages: LlmMessage[];
  readonly trace: ToolExecution[] = [];
  readonly problemCodes: GroundingProblem['code'][] = [];
  readonly dropped = { doctorIds: [] as string[], hospitalIds: [] as string[] };
  readonly usage: Required<LlmUsage> = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  iterations = 0;
  corrections = 0;
  nudges = 0;
  model: string | null = null;

  constructor(
    input: AgentTurnInput,
    readonly startedAt: number,
  ) {
    this.requestId = input.requestId;
    this.language = detectLanguage(input.userText, input.locale);
    this.guard = detectEmergency(input.userText);
    this.messages = [
      // Earlier turns as plain text: no earlier provider-native/thinking content is replayed.
      ...input.history.map((t): LlmMessage =>
        t.role === 'user'
          ? { role: 'user', text: t.text }
          : { role: 'assistant', blocks: [{ type: 'text', text: t.text }] },
      ),
      { role: 'user', text: withTurnContext(input.userText, this.language, this.guard) },
    ];
  }

  addUsage(usage: LlmUsage, model: string): void {
    this.usage.inputTokens += usage.inputTokens;
    this.usage.outputTokens += usage.outputTokens;
    this.usage.cacheReadTokens += usage.cacheReadTokens ?? 0;
    this.model = model;
  }

  fallback(reason: FallbackReason): TurnReply {
    const kind: FallbackKind = this.guard.suspected
      ? 'emergency'
      : reason === 'llm_unavailable'
        ? 'unavailable'
        : reason === 'refusal'
          ? 'refused'
          : 'incomplete';
    return {
      reply: fallbackReply(kind, this.language),
      outcome: 'fallback',
      fallbackReason: reason,
    };
  }
}

/**
 * Per-turn context travels with the new user message (never in the system prompt, which must not
 * change). It only adds caution or sets the language; a patient forging it gains nothing.
 */
function withTurnContext(text: string, language: Locale, guard: EmergencyGuardResult): string {
  const lines = [`reply_language: ${language === 'ar' ? 'Arabic' : 'English'}`];
  if (guard.suspected) {
    lines.push(
      `safety_note: the message may describe emergency warning signs (${guard.matches.join(', ')}). ` +
        'Call assess_urgency before anything else and treat reported warning signs as red flags.',
    );
  }
  return `${text}\n\n<turn_context>\n${lines.join('\n')}\n</turn_context>`;
}

/** The audit log keeps the shape of a submission, not the patient-facing text. */
function summarizeSubmissionInput(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return { invalid: true };
  const { message: _message, ...rest } = input as Record<string, unknown>;
  return rest;
}
