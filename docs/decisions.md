# Decision records

Short records of the choices that shape this prototype: context, decision, and what it costs.

---

### 1. Code decides urgency; the model extracts facts and writes

**Context.** The most dangerous failure is under-triaging a cardiac emergency. LLMs are good at
understanding messy input and at phrasing, but their judgment is not auditable or repeatable.

**Decision.** The model reports facts through `assess_urgency` using closed enums; a pure rules engine
returns the next step, the urgency and what is still missing. The model's answer must match it, and an
emergency can never be downgraded.

**Trade-off.** The rules are coarse and not clinically validated; a real product needs clinician-owned
rules. In exchange, safety behavior is explicit, testable, and can't be talked out of by a prompt.

### 2. Structured answers through a tool, entities by ID

**Context.** "Tell the model not to invent doctors" is not a guarantee.

**Decision.** The only answer channel is the `submit_response` tool with a strict schema; entities are
referenced by prefixed IDs; a grounding validator checks every ID against what tools returned before the
answer, checks doctor names in the text, and the UI renders cards from database records.

**Trade-off.** More moving parts than a free-text chatbot, and one extra model round-trip when a
correction is needed. Worth it: fabricated data cannot reach the patient even if the model misbehaves.

### 3. A hand-written agent loop instead of an SDK tool runner

**Context.** SDK tool runners are simpler, but the value here is in what happens _between_ iterations.

**Decision.** A small explicit loop: evidence snapshots, grounding review, one correction round,
bounded iterations and wall-clock budget, deterministic fallbacks.

**Trade-off.** More code to own and test (covered by scripted-model scenario tests).

### 4. Provider abstraction with a scripted provider

**Context.** Vendor lock-in, testability, and the need to demo without an API key.

**Decision.** One `LlmProvider` interface (`complete()`), adapters for Anthropic (default) and OpenAI,
and a scripted provider used by tests and by the offline "demo brain". Provider-native content is
carried opaquely so it can be replayed verbatim (required for Claude's thinking blocks).

**Trade-off.** The abstraction covers only what this app needs (no streaming yet). Vendor-specific
features (refusal fallback, caching, effort) live inside the adapter.

### 5. Short, prefixed catalog IDs

**Decision.** `doc_014`, `hosp_03`, `spec_cardiology` instead of UUIDs for catalog entities;
UUIDs for conversations.

**Why.** Models copy short tokens more reliably, and the prefix lets the schema reject a hospital ID in
a doctor slot. Conversation IDs must be unguessable, so they stay UUIDs.

### 6. Shared zod contract between API and web

**Decision.** `packages/shared` defines request/response schemas and types once. The API validates with
them, the web client is typed by them, and agent tools reuse the same filter schemas.

**Trade-off.** A build step for the shared package. In exchange, the API contract can't drift silently.

### 7. Persistence owned by the chat layer, not the agent

**Decision.** `AgentService` returns a result (reply + trace); `ChatService` stores the turn in one
transaction and loads cards from the catalog.

**Why.** The agent stays a pure orchestrator that is easy to test; a failed turn stores nothing, so a
retry doesn't duplicate messages.

### 8. NestJS + Prisma 7 + PostgreSQL

**Decision.** NestJS for explicit modules and dependency injection (clear architecture for a reviewer);
Prisma 7 with the `pg` driver adapter; PostgreSQL (Neon in the cloud, Prisma's local dev server with no
Docker on a laptop, PostgreSQL 17 in CI).

**Trade-off.** Heavier than a minimal Express app; justified by the structure it gives the codebase.

### 9. Prototype-sized infrastructure

**Decision.** In-memory per-conversation lock and rate limiting, no authentication, anonymous
UUID-addressed conversations, no streaming.

**Trade-off.** Correct only on a single instance. The documented upgrade path is Redis (lock + rate
limits), accounts with consent, and streamed responses.

### 10. i18n with locale routes and logical CSS

**Decision.** Next.js `app/[lang]` with `/en` and `/ar` pre-rendered; `<html lang dir>` set on the
server; Tailwind logical properties (`ms-`, `pe-`, `text-start`) so the layout mirrors without
Arabic-specific code; dictionaries typed so a missing translation is a compile error.

**Trade-off.** Only two locales, hard-coded; a larger product would use a translation workflow.

### 11. Evals with deterministic checks

**Decision.** Agent quality is measured with labelled scenarios whose checks run against the database
(no LLM judge): next step, language, grounding, injection resistance.

**Trade-off.** Deterministic checks can't grade tone or helpfulness. They do make every pass verifiable
and cheap to run on each change.
