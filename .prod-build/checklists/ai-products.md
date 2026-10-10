# AI and agent products: architecture, evals, observability, security

Read this whenever the product calls an LLM or runs an agent. "The API returned 200" proves almost nothing about an AI feature.

## Contents
1. Architecture: pick a harness, constrain the model
2. Human-in-the-loop gates
3. Eval matrix (deterministic first)
4. Loop caps and budgets
5. Observability (OpenTelemetry GenAI)
6. AI security checklist
7. Model and provider facts to verify at build time

---

## 1. Architecture: pick a harness, constrain the model

**Pick a harness, don't write a loop.** The fastest well-reviewed agent builds hand orchestration to a harness and spend their time on domain tools, the approval gate and a narrow scenario. Harnesses include the Vercel AI SDK, Claude Agent SDK, OpenAI Agents SDK, LangGraph, Pydantic AI, and event-provided harnesses such as TrueForge. Run the tool check in `contract.md` on the one you pick.

| Pattern | When to use | Example shape |
|---|---|---|
| Manifest-driven (harness runs the loop) | Default for most agent features | JSON/YAML defines agent + tools + gated tools |
| Deterministic state machine | Branching or looping control flow you must guarantee | Explicit nodes/edges; the model fills steps, code routes |
| Linear pipeline | Sequential steps, one agent | Alert → diagnose → sandbox → gate → execute |
| Thin proxy (narrowest scope) | The agent connects a UI to one real API | 4 read tools + 2 gated write tools |
| Fan-out / merge | Independent sub-tasks | `Promise.all` / `asyncio.gather` over workers, then a merge step |
| Plain function call | No real autonomy needed | One structured-output call inside normal code |

Use multiple agents only when they need distinct tools, permissions or information. Otherwise one agent or a plain pipeline does the job.

**Rules decide, the model explains.** Keep critical logic (eligibility, money, permissions, ranges, matching) deterministic, and let the model extract, classify, draft and explain.
- Guarantee properties in code, never in the prompt.
- Validate every structured output with a schema (zod / pydantic). On failure, repair at most once, then return a typed error.
- Require quotes or IDs for grounded claims ("must quote the verbatim sentence"), and check them against the source.

**A kill switch and a deterministic fallback from day one.** With `AI_ENABLED=false` (or equivalent), the product still works: rules-only matching, cached or seeded results, and a clearly labelled degraded mode. This saves demos when quotas, keys or providers fail, which happens more often than code bugs.

**Bring-your-own-key and honesty.** If a sponsor's model can't be used (cost, quota), say plainly which provider is actually running. Never claim a provider or model you didn't use.

## 2. Human-in-the-loop gates

"Read tools free, write tools gated" generalizes to almost every agent touching a real system.

| Level | Mechanism | When |
|---|---|---|
| 1. Prompt-only ("ask before X") | Weakest: the model can ignore it | Never for real side effects |
| 2. Config allowlist | The harness blocks listed tools until approved; the model can't bypass it | Default for write tools (email, payments, repo writes, deletes) |
| 3. Signed single-use token | UI approval mints an HMAC token bound to the exact action; the tool boundary verifies it | When a compromised agent must not be able to forge approval |

- Show the approval inline in the flow (a confirmation card with the exact tool inputs), not as a modal.
- Log who approved what.
- Budget one adversarial pass that tries to bypass the gate: prompt injection, argument smuggling, tool-name confusion, replayed tokens.

## 3. Eval matrix (deterministic first)

- **CI runs on recorded fixtures:** cassettes (pytest-recording, `--record-mode=none`; nock/msw in JS) or mock models (AI SDK `MockLanguageModel*`, Inspect `mockllm/model`).
- **The same cases run live nightly** or before release.
- **Golden cases live in `evals/*.jsonl`:** `{"id", "input", "expected_tools", "expected_args", "must_contain", "must_not", "notes"}`.

| Case | How to make it deterministic | Pass criterion |
|---|---|---|
| Tool selection | Golden prompts → expected tool set | Exact set (from `execute_tool` spans or harness trace) |
| Tool arguments | Expected args + JSON schema | 100% schema-valid; key args equal |
| Malformed output | Fixtures: truncated JSON, wrong types, `length` finish reason | Rejected → ≤1 repair → typed error; no crash |
| Hallucination / grounding | Fixed documents; answerable and unanswerable questions | Cited IDs ⊆ retrieved IDs; numbers appear in tool results; "don't know" when unanswerable |
| Unhappy input | Empty, huge, off-topic, adversarial | Graceful reply; no tool call |
| Model failure | Fake 429 / 5xx / timeout / stream cut | Bounded backoff; degraded UI; error recorded once |
| Provider fallback | Primary fails, secondary succeeds | Secondary answers; no duplicate side effects |
| Retry idempotency | A tool commits and then times out | Side effect happens exactly once (idempotency key = tool call ID) |
| Runaway loop | Mock always re-calls a tool | Stops at the step cap; time and cost caps fire |
| Context failure | Oversized history or retrieval; missing context | Truncation strategy works; no silent drop of the instruction |
| Token / cost budget | Usage from cassettes | ≤ budget per run; a >20% regression fails CI |
| Latency | Simulated stream delays; live p95 | Timeouts fire; live p95 ≤ the contract's target |
| Prompt injection | Canary instructions inside tool results, documents, web pages | No unapproved side effect; the canary never leaves (URLs, args, images) |
| Permission boundary | The model asks for another user's or tenant's data | Tool code denies (authz in code, not prompt); logged |
| Telemetry contract | In-memory span exporter | Required spans present; no content captured when capture is off |

Use an LLM as judge only for fuzzy qualities (tone, helpfulness). Pin the judge model, calibrate it on a handful of human labels, and watch for position, verbosity and self-preference bias. Never use one for things a rule can check. Tools: plain Vitest/pytest, promptfoo (`promptfoo eval`, CI action), DeepEval, Inspect.

## 4. Loop caps and budgets

Framework defaults are often unbounded or very high (for example, Claude Agent SDK `max_turns`/`max_budget_usd` unset, LangGraph recursion 1000, OpenAI Agents 10 turns, AI SDK step caps). Set these explicitly:
- **Caps:** max steps per run; max tool calls per tool; a wall-clock timeout per run and per tool; max tokens per call.
- **Budgets:** tokens or dollars per run and per user per day.
- **Loop detection:** the identical tool call with identical args N times → stop and surface.
- **Idempotency:** tool calls with side effects carry an idempotency key (the tool call ID).
- **Surface caps in the UI:** "Stopped after 12 steps. Review what it did / continue."

## 5. Observability (OpenTelemetry GenAI)

**Status (as of September 2026, so re-check before relying on names):**
- The GenAI semantic conventions are Development-stability and moved to the `open-telemetry/semantic-conventions-genai` repository.
- Released instrumentation still emits some older names. For example, `gen_ai.client.token.usage` with `gen_ai.token.type` is being replaced by per-direction `gen_ai.client.inference.usage.*` metrics, and `cache_creation` is being renamed `cache_write`.
- Pin instrumentation versions, and read the changelog before upgrading dashboards.
- Only `error.type` and `server.*` are stable.

**Minimal set to instrument:**
- **Model call span** `chat {gen_ai.request.model}` (kind CLIENT):
  - at start: `gen_ai.operation.name`, `gen_ai.provider.name` (`anthropic`, `openai`, `aws.bedrock`, `gcp.gemini`, …), `gen_ai.request.model`, `server.address`;
  - after: `gen_ai.response.model`, `gen_ai.response.id`, `gen_ai.response.finish_reasons` (string array), `gen_ai.usage.input_tokens` (including cached tokens), `gen_ai.usage.output_tokens`;
  - streaming: time to first chunk.
  - One span covers the call including retries.
- **Tool span** `execute_tool {gen_ai.tool.name}` (INTERNAL): `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.type`. Instrument your own tools by hand.
- **Agent span** (product): `invoke_agent {gen_ai.agent.name}` around a run. Set `gen_ai.conversation.id` only from a real ID.
- **Errors:** span status ERROR plus a low-cardinality `error.type`. A retry that succeeded stays unset.
- **Metrics:** `gen_ai.client.operation.duration` (s), time-to-first-chunk for streaming, token usage under whichever name your pinned version emits, and tool calls per run.
- **Evals:** emit results as `gen_ai.evaluation.result` events (`gen_ai.evaluation.name`, `.score.value`, `.score.label`) when you track quality over time.
- **MCP:** span `{mcp.method.name} {target}`; propagate `traceparent` in `params._meta`.

**Content capture** (prompts and completions) is off by default in the OTel packages but on by default in some libraries (for example, OpenLLMetry `TRACELOOP_TRACE_CONTENT`, AI SDK telemetry, OpenInference). Turn it off in production, or send it only to an access-controlled store; use demo data when it's on. In Python it is `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=NO_CONTENT|SPAN_ONLY|EVENT_ONLY|SPAN_AND_EVENT`; JS uses the same variable with `true`/`false`. `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` only matters for legacy python-contrib packages.

**Sketch (TypeScript, official API)**, to wrap a model call and a tool call:
```ts
import { trace, SpanKind, SpanStatusCode, type Span, type Attributes } from '@opentelemetry/api';
const tracer = trace.getTracer('app.ai');
const genaiSpan = <T>(name: string, kind: SpanKind, attrs: Attributes, fn: (s: Span) => Promise<T>) =>
  tracer.startActiveSpan(name, { kind, attributes: attrs }, async (span): Promise<T> => {
    try { return await fn(span); } catch (e) {
      const err = e as Error; span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.setAttribute('error.type', err.constructor?.name ?? '_OTHER'); throw e;
    } finally { span.end(); }          // an un-ended span is never exported
  });
export const chat = (client: any, model: string, messages: unknown[]) =>
  genaiSpan(`chat ${model}`, SpanKind.CLIENT, { 'gen_ai.operation.name': 'chat', 'gen_ai.provider.name': 'openai', 'gen_ai.request.model': model },
    async (s) => { const r = await client.chat.completions.create({ model, messages });
      s.setAttributes({ 'gen_ai.response.id': r.id, 'gen_ai.response.model': r.model,
        'gen_ai.response.finish_reasons': r.choices.map((c: any) => c.finish_reason),
        'gen_ai.usage.input_tokens': r.usage?.prompt_tokens, 'gen_ai.usage.output_tokens': r.usage?.completion_tokens });
      return r; });
export const runTool = <T>(name: string, callId: string, fn: () => Promise<T>) =>
  genaiSpan(`execute_tool ${name}`, SpanKind.INTERNAL, { 'gen_ai.operation.name': 'execute_tool',
    'gen_ai.tool.name': name, 'gen_ai.tool.call.id': callId, 'gen_ai.tool.type': 'function' }, () => fn());
```

**Sketch (Python):**
```python
from contextlib import contextmanager
from opentelemetry.trace import SpanKind, get_tracer
tracer = get_tracer("app.ai")
@contextmanager
def genai_span(name, kind, attrs):
    with tracer.start_as_current_span(name, kind=kind, attributes=attrs) as span:  # SDK records exception + ERROR
        try: yield span
        except Exception as e: span.set_attribute("error.type", type(e).__qualname__); raise
def chat(client, model, messages):  # Anthropic
    with genai_span(f"chat {model}", SpanKind.CLIENT, {"gen_ai.operation.name": "chat",
                    "gen_ai.provider.name": "anthropic", "gen_ai.request.model": model}) as s:
        r = client.messages.create(model=model, max_tokens=1024, messages=messages); u = r.usage
        s.set_attributes({"gen_ai.response.id": r.id, "gen_ai.response.model": r.model,
            "gen_ai.response.finish_reasons": [r.stop_reason],
            "gen_ai.usage.input_tokens": u.input_tokens + (u.cache_read_input_tokens or 0) + (u.cache_creation_input_tokens or 0),
            "gen_ai.usage.output_tokens": u.output_tokens})
        return r
```

**Tooling by mode:**
- **Hackathon.**
  - Use what your SDK already emits: AI SDK telemetry via `@ai-sdk/otel` → local Arize Phoenix (`uvx arize-phoenix serve`) or Langfuse Cloud's free tier (OTLP HTTP `/api/public/otel`).
  - Python: Logfire (`logfire.instrument_openai()` / anthropic) or OpenInference → Phoenix.
  - Show the agent's steps in the UI too; judges can't see your traces.
  - A 10–20 case golden script beats a dashboard.
- **Product.**
  - OTel SDK plus GenAI instrumentation, sending OTLP to one backend (Langfuse, Phoenix/Arize, Logfire, LangSmith, or your existing APM).
  - Content off in production.
  - Alerts on p95 latency, error-type rate, tokens or cost per user per day, and tool calls per run.
  - Evals on fixtures in PRs and live nightly.

## 6. AI security checklist

Map to the OWASP Top 10 for LLM Applications (2025: LLM01 Prompt Injection … LLM10 Unbounded Consumption) and the OWASP Top 10 for Agentic Applications (Dec 2025: ASI01 Agent Goal Hijack, ASI02 Tool Misuse, ASI03 Identity & Privilege Abuse, ASI04 Agentic Supply Chain, ASI05 Unexpected Code Execution, ASI06 Memory & Context Poisoning, ASI07 Insecure Inter-Agent Communication, ASI08 Cascading Failures, ASI09 Human-Agent Trust Exploitation, ASI10 Rogue Agents).

1. **Rule of Two** per session or agent: at most two of (a) untrusted input, (b) sensitive data or systems, (c) state changes or external communication. Needing all three means a human approves. This is the "lethal trifecta" (private data + untrusted content + exfiltration channel).
2. **Pattern for untrusted content:**
   - plan-then-execute (the plan is fixed before reading untrusted data);
   - an action-selector;
   - a dual LLM, where the quarantined model reads untrusted text and has no tools;
   - CaMeL-style capability tracking for high stakes.
3. **Tool allowlists in code:**
   - separate read tools from write tools;
   - per-user credentials, never a shared admin token;
   - never pass MCP or user tokens through to third parties;
   - filters and "please don't" prompts are not controls.
4. **Approve side effects,** showing the exact tool inputs before execution. Validate tool inputs and outputs. Add timeouts, rate limits and audit logs.
5. **Never eval or exec model output.** Don't auto-render untrusted image or link URLs, which can exfiltrate data through query strings.
6. **Restrict egress** for tools that fetch: an allowlist of domains; block private ranges and 169.254.0.0/16 (SSRF).
7. **Caps** from §4 are set and tested.
8. **No secrets in prompts or context.** Content capture off in production; redact before export.
9. **Pin model snapshots and SDK versions.** Sandbox MCP servers; show the exact command before running a new one.
10. **Memory and RAG scoped per user or tenant.** No unreviewed writes from untrusted content into long-term memory.
11. **Red-team:** injection canaries in CI; for products, `promptfoo redteam` (or similar) before release.

## 7. Model and provider facts to verify at build time

- Run one real call with the real account on day 1 to find quota, region and approval problems. New cloud accounts often start at zero model quota.
- Use the exact model ID that worked: some providers need inference-profile or region-prefixed IDs, and older model versions retire. Record it in a decision record.
- Rate limits and free-tier terms for the account tier: record them in ARCHITECTURE.md's external services table.
- Check structured-output or tool-use support for the chosen model. Don't assume parity across providers.
- Data-use terms, if user data goes to the provider (product mode): note them in the privacy constraints.
