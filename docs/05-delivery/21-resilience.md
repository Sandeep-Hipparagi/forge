# 21 · Resilience

> **Purpose:** define what the prototype does when the model, browser, target, or process is unreliable.
> **Safety rule:** degraded execution may continue with a deterministic result; it may never silently turn uncertainty into a heal.

## 1. Failure policy

| Failure | Retry | Fallback | Terminal result |
|---|---|---|---|
| Structured model output is invalid | One schema-repair request | Deterministic fixture or rule path | Continue with `source: deterministic` |
| Model rate limit or transient connection | Bounded exponential backoff, maximum three attempts | Cached plan or deterministic diagnosis | Continue or escalate |
| Model timeout | One retry within the call-site budget | Cached plan or deterministic diagnosis | Continue or escalate |
| Browser action timeout | One retry after fresh perception | Record `TOOL_TIMEOUT` | Triage the failure |
| Target unreachable | No blind healing | Persist evidence and escalate | `ESCALATED` |
| Store write failure | Retry once, then stop emitting events | None | `ERROR` |
| Process interruption | Resume from the last persisted transition | None | Session can restart safely |

Every retry is counted, bounded, and included in run telemetry. No catch-all retry loop is permitted.

## 2. Model call sites

The call-site budgets and structured-output rules live in [02-architecture/07-llm-integration.md](../02-architecture/07-llm-integration.md). The implementation must distinguish schema repair, rate limiting, connection failure, timeout, refusal, and budget exhaustion. A refusal is not a transport error and must not be retried as one.

When the key is missing or the budget is exhausted, the orchestrator emits `DETERMINISTIC MODE`, uses the deterministic planner/critic/triage path, and records the reason. The verdict remains auditable and the safety vetoes remain active.

## 3. Browser and target isolation

Each capability lap owns its browser context, evidence directory, attempt counters, and failure budget. A failed lap records its evidence and moves to escalation or the next eligible capability; it cannot corrupt another lap. The control API is loopback-only and target mutations are applied through the target contract, never by editing source during a run.

## 4. Healing rollback

A candidate patch is written only through the safe-write allowlist. Before writing, persist the original canonical plan and generated test. After writing, regenerate and run the complete flow. Roll back immediately when generation, locator resolution, assertions, or any full-flow step fails. A patch is `VERIFIED` only after the post-heal fingerprint and complete-flow checks pass, as required by `TG-10` and [ADR-010](../decisions/ADR-010-post-heal-verification.md).

Per-step healing is capped at two attempts and a run at three attempts. A cap produces an escalation card, never another implicit attempt.

## 5. Degraded-mode contract

The UI and API expose `source`, `haltReason`, retry count, and the last persisted event. They do not present a degraded result as a normal model-backed result. SSE clients refetch after a sequence gap and fall back to polling after disconnect, as specified in [04-build/17-api-spec.md](../04-build/17-api-spec.md).

## 6. Scope-cut ladder

1. Remove optional UI routes and visual detail checks.
2. Remove trace and network-summary artifacts while retaining DOM, screenshot, and fingerprint evidence.
3. Run only Aperture and the two mandatory scenario families.
4. Use cached plans and deterministic diagnosis for the demo path.
5. Preserve the end-to-end loop, arithmetic Critic floor, vetoes, rollback, and refusal case at every level.

## 7. Verification

The resilience behavior is proven by `EC-01` through `EC-07`, especially `EC-05`, `EC-06`, `EC-07`, plus rehearsals `R-1` (cold start), `R-2` (offline), `R-3` (target switch), and `R-4` (short demo). See [04-build/16-agent-test-suite.md](../04-build/16-agent-test-suite.md).
