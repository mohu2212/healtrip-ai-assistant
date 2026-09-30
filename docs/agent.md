# Agent design — deep dive

How one patient message becomes a validated, grounded, safety-checked answer.
Code: [`apps/api/src/agent`](../apps/api/src/agent), [`tools`](../apps/api/src/tools),
[`triage`](../apps/api/src/triage), [`llm`](../apps/api/src/llm).

## 1. Responsibilities

| Component      | Owns                                                                                          | Does not do                    |
| -------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| `ChatService`  | Conversations, history window, per-conversation lock, persistence + audit log, card hydration | Talk to the LLM                |
| `AgentService` | The tool loop, grounding, safety overrides, fallbacks                                         | Write to the database          |
| `ToolRegistry` | Tool definitions, argument validation, safe execution, audit summaries                        | Decide what to answer          |
| Triage rules   | Urgency and next step, what information is missing                                            | Anything probabilistic         |
| `LlmProvider`  | One vendor-neutral `complete()` call                                                          | Retries (the SDK does), policy |

The model is responsible for **understanding and wording**. Everything with safety or factual weight —
urgency, which entities exist, what is shown — is decided or checked by code.

## 2. The turn loop

```text
runTurn(history, userText, locale):
  language   = Arabic if the message is mostly Arabic script, else the UI locale
  guard      = emergency-phrase detector (EN/AR, negation-aware)
  messages   = history as plain text + userText + <turn_context> (language, safety note)
  evidence   = new EvidenceRegistry()

  repeat up to AGENT_MAX_ITERATIONS (6), within AGENT_TURN_BUDGET_MS (90 s):
    response = llm.complete(SYSTEM_PROMPT, TOOLS, messages)       # frozen prompt + tools
    refusal            → safe reply (emergency guidance if guard fired)
    append the assistant turn verbatim (provider-native content, incl. thinking blocks)
    no tool call       → nudge once ("answer with submit_response"), then safe reply
    seen = evidence.snapshot()                                    # what the model had seen
    run the other tool calls in parallel (validated, read-only) → evidence grows
    if submit_response:
      review = schema check + validateSubmission(submission, seen)
      ok, or already corrected once → apply code decisions, sanitize, finish
      else → return the problems + allowed IDs as an is_error result, loop again (1 correction)
  loop exhausted → safe reply

  LLM provider error → emergency guidance if guard fired, else LLM_UNAVAILABLE (503)
```

Returned: the reply, the full tool trace (including rejected `submit_response` attempts), the outcome
(`completed` / `corrected` / `fallback` + reason), grounding stats, token usage and the model that served it.

## 3. The answer channel: `submit_response`

The patient only ever sees what arrives through this tool; free text from the model is discarded.

| Field                    | Constraint (zod, enforced server-side)                                               |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `message`                | 1–1500 chars, plain text                                                             |
| `nextStep`               | `ER_NOW` · `URGENT_CARE` · `SPECIALIST` · `SECOND_OPINION` · `GP` · `NEED_MORE_INFO` |
| `clarifyingQuestions`    | ≤ 3                                                                                  |
| `quickReplies`           | ≤ 4, ≤ 60 chars each                                                                 |
| `recommendedDoctorIds`   | ≤ 5, `doc_…`                                                                         |
| `recommendedHospitalIds` | ≤ 5, `hosp_…`                                                                        |

It is declared with `strict: true`. Strict tool schemas don't support numeric/string/array bounds, so
the registry strips those keywords from what the model sees ([`stripUnsupportedStrictKeywords`](../apps/api/src/tools/tool-registry.ts))
and zod still enforces them when the call is reviewed.

## 4. Grounding rules

`validateSubmission(submission, evidenceBefore)` in [`grounding.ts`](../apps/api/src/agent/grounding.ts):

| Code                                        | Rule                                                                                                                 | If still violated after the correction                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `UNKNOWN_DOCTOR_ID` / `UNKNOWN_HOSPITAL_ID` | Every recommended ID was returned by a tool **before** this answer                                                   | ID dropped                                                                |
| `UNVERIFIED_DOCTOR_NAME`                    | "Dr./Doctor/د./دكتور/الدكتور + name" must match an evidenced doctor (EN or AR)                                       | Text replaced with a neutral grounded intro                               |
| `NEXT_STEP_MISMATCH`                        | `nextStep` equals the triage decision (`ER_NOW` if any triage said so this turn)                                     | Code's decision applied; for ER the text becomes fixed emergency guidance |
| `TRIAGE_REQUIRED`                           | Any answer other than `NEED_MORE_INFO` (or any answer when the emergency guard fired) needs an `assess_urgency` call | Recommendations withheld; suspected emergency → emergency guidance        |
| `INVALID_SUBMISSION`                        | Schema violations                                                                                                    | Safe reply                                                                |

Always applied: no doctor recommendations in an emergency (only hospitals with an emergency
department), and nothing recommended before a triage has run.

The correction round sends the model the problems **and the list of allowed IDs**, so a well-behaved
model fixes its answer (outcome `corrected`); a misbehaving one is sanitized.

## 5. Triage rules

Pure function [`assessUrgency`](../apps/api/src/triage/triage-rules.ts), first match wins, most dangerous first:

| Rule | Condition                                                                                                                                                                                                                  | Result                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| R1   | Any red flag reported (pain at rest > 20 min, radiating to arm/jaw/back, shortness of breath, cold sweat, nausea/vomiting, fainting, sudden severe onset, one-sided weakness/speech difficulty, confusion, coughing blood) | `emergency` · `ER_NOW`                                                                   |
| R2   | Cardiac complaint with severity ≥ 7                                                                                                                                                                                        | `emergency` · `ER_NOW`                                                                   |
| R3   | Cardiac complaint and warning signs not yet screened, or onset unknown                                                                                                                                                     | `unknown` · `NEED_MORE_INFO` + `missingInfo`                                             |
| R4   | Cardiac complaint that started today, age ≥ 40 or any risk factor                                                                                                                                                          | `urgent` · `URGENT_CARE` (cardiology)                                                    |
| R5   | Any complaint with severity ≥ 8                                                                                                                                                                                            | `urgent` · `URGENT_CARE`                                                                 |
| R6   | Existing diagnosis, no warning signs                                                                                                                                                                                       | `routine` · `SECOND_OPINION`                                                             |
| R7   | Otherwise                                                                                                                                                                                                                  | `SPECIALIST` by complaint (cardiology, pulmonology, neurology, gastroenterology) or `GP` |

The model fills `AssessUrgencyInput` with closed enums (it can't pass free text), and each result carries
the rule that fired and why — visible in the trace and stored in `tool_call_logs`.

## 6. Emergency-phrase guard

[`emergency-guard.ts`](../apps/api/src/agent/emergency-guard.ts) detects high-specificity phrases in English
and Arabic (with Arabic spelling normalization and a simple negation window: "no chest pressure", "مفيش إغماء").
It is a **net, not the decision-maker**. When it fires:

1. a safety note is appended to the current user turn asking the model to triage first;
2. an answer without an `assess_urgency` call is rejected;
3. every failure path returns emergency guidance instead of an error.

## 7. Failure matrix

| Situation                                                             | Patient sees                            | HTTP                  | Stored                   |
| --------------------------------------------------------------------- | --------------------------------------- | --------------------- | ------------------------ |
| Normal / corrected answer                                             | The answer                              | 201                   | Yes                      |
| Model never answers, invalid output, loop or time limit, `max_tokens` | Safe bilingual reply asking for details | 201                   | Yes (outcome `fallback`) |
| Provider refusal                                                      | "I can't help with that…"               | 201                   | Yes                      |
| Provider outage (after SDK retries)                                   | Error + request ID + Try again          | 503 `LLM_UNAVAILABLE` | No                       |
| …any of the above while an emergency is suspected                     | Emergency guidance                      | 201                   | Yes                      |

## 8. Claude-specific choices

- Default model **`claude-opus-5-5`**. Thinking is always on for this model; depth is set with
  `output_config.effort` (explicitly `medium`, configurable).
- **No forced `tool_choice`** (rejected by current models): `auto` + prompt steering + `strict` schemas,
  and the loop checks that `submit_response` was actually called.
- **Preserved thinking / prompt caching:** the system prompt and tool list never change during a
  conversation, per-turn context is appended to the new user message, the in-turn history is
  append-only, and assistant turns are replayed verbatim. Earlier turns are replayed as plain text
  only, so no thinking block is ever replayed out of context. Top-level `cache_control` caches the prefix.
- **Refusals:** server-side fallback (`fallbacks: "default"`) re-runs a declined request on a suitable
  model; a final `refusal` stop reason becomes a safe reply.
- **Retries/timeouts:** the SDK's own (`maxRetries`, `timeout`); typed SDK errors are mapped to a
  vendor-neutral `LlmError` without leaking details.

## 9. Demo brain and evals

- **Demo brain** ([`demo-llm.script.ts`](../apps/api/src/demo/demo-llm.script.ts)) — a deterministic
  `LlmScript` used with `LLM_PROVIDER=mock`. It plays the model's role with keyword understanding
  (EN/AR) and drives the **real** tools, triage, grounding and persistence. It exists so the product can be
  demonstrated and tested end to end without an API key.
- **Evals** ([`apps/api/evals`](../apps/api/evals)) — 12 labelled scenarios checked against the real
  database: next step, emergency flag, language, whether warning signs are asked about, that every
  recommended doctor/hospital exists and matches the city/specialty/second-opinion expectation, that
  no unknown doctor is named, and that injected IDs never appear. The same suite scores the demo brain
  (CI regression gate) and Claude (`LLM_PROVIDER=anthropic pnpm eval`). The evals already caught two
  demo-brain mistakes during development (treating "…or seek a second opinion?" as a diagnosis, and
  recommending a GP for an off-topic question).
