# ADR-009 · Server-Sent Events for run progress, not WebSockets

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 26 Aug 2026 · D-10 |
| **Deciders** | P3 (UI owner) · P1 consulted |
| **Requirements** | FR-205, NFR-3, NFR-8 |
| **Governs** | [04 §7](../02-architecture/04-system-architecture.md) · [18 §7](../04-build/18-ui-spec.md) |
| **Related risks** | — |

---

## 1. Context

Mission Control has to render a run as it happens: `step.started`, `step.finished`, diagnosis, decision, patch, verification, terminal verdict. FR-205 budgets under 500 ms per event. The dashboard is *the argument* — a stalled or partially rendered timeline on a projector costs more than a slow one.

The data has a specific shape. It is **one-way**, **append-only**, and already **sequenced** (`seq` is monotonic per run, because the same events are persisted to `run_events`). The UI sends nothing back on this channel; user actions are ordinary HTTP requests.

---

## 2. The two options

### Option A — WebSocket

A bidirectional socket per run (raw `ws`, or socket.io for reconnection and fallbacks).

### Option B — Server-Sent Events over `EventSource` *(chosen)*

A `GET /api/runs/:id/stream` endpoint emitting `text/event-stream`, with documented degradation to polling.

*(Plain polling was the third option. Rejected as the default — a 1 s poll either misses the 500 ms budget or hammers the API — but retained deliberately as the fallback, which is why the degradation path is specified rather than improvised.)*

### Comparison

| Criterion | A · WebSocket | B · SSE |
|---|---|---|
| Fit to the data's shape | Bidirectional channel for one-way data | Exact |
| Reconnection | Hand-rolled, or a library | Native to `EventSource`, with `Last-Event-ID` |
| Dependencies | A server library + a client library | None on either side |
| Proxy survival on venue wifi | Usually fine; upgrade handshake can be blocked | Ordinary HTTP response |
| Degrade to polling | A rewrite of the client path | One line — the event shape is unchanged |
| Debuggable with `curl` | No | Yes |
| Binary payloads | Native | Not needed — evidence is fetched by id over HTTP |
| Backpressure control | Explicit | Limited |
| Custom auth headers | Yes | **No** — `EventSource` cannot set headers |
| HTTP/1.1 six-connection-per-origin limit | Not affected | Affected in principle; irrelevant at one stream, moot under HTTP/2 |

---

## 3. Decision

**Option B.** Run progress is a one-way, append-only event stream, which is exactly SSE's shape. WebSockets would buy bidirectionality we do not need, at the cost of a dependency on both sides and a reconnection path we would have to write and test ourselves.

Two details make this more robust than the transport choice alone:

1. **`seq` is monotonic per run**, so a client that detects a gap re-fetches `/api/runs/:id` rather than rendering a hole. Reconnection correctness therefore does not depend on the server implementing `Last-Event-ID` replay — the gap check is the real guarantee, and the transport's native reconnect is a convenience on top of it. This makes the seq check load-bearing rather than defensive (see A2).
2. **The two known SSE weaknesses do not bind us.** Custom auth headers are impossible on `EventSource` — and we have no auth ([18 §11](../04-build/18-ui-spec.md) rejects it explicitly). The six-connections-per-origin limit needs six streams; we open one.

---

## 4. Consequences

**What we accept**

- If we later need auth on the stream, it arrives as a query-string token — mildly unpleasant, and it lands in server logs unless handled.
- No backpressure control. A burst (8 steps × ~5 evidence rows) must be coalesced client-side or the projector shows a stutter.
- Adding true bidirectionality later means adding a second mechanism, not extending this one.

**What it buys**

- Zero dependencies for a demo-critical path.
- `curl -N http://localhost:4000/api/runs/r1048/stream` is a debugging tool that needs no client.
- A degraded-network story that is a visible indicator plus polling, not a broken screen ([18 §12](../04-build/18-ui-spec.md)).

---

## 5. Risks

| Risk | Exposure | Control |
|---|---|---|
| A proxy buffers the stream, so events arrive in a batch at the end | not registered | `X-Accel-Buffering: no` plus explicit flushing. If buffering persists, poll — see §7 |
| Event burst causes dropped frames on the projector | not registered | Client-side coalescing; the timeline is a list, not an animation. `prefers-reduced-motion` removes the stagger anyway |
| A `seq` gap renders a partial timeline | not registered | Gap → refetch, never a partial render. Listed in [18 §12](../04-build/18-ui-spec.md)'s acceptance criteria |

---

## 6. Hidden assumptions

| # | Assumption | If false | How we would find out |
|---|---|---|---|
| A1 | Run progress is genuinely one-way | The likely counterexample is interactive escalation: an `ESCALATED` run waiting on a human decision *inside* the run. **This does not actually require a socket** — the UI POSTs the decision and the FSM reads it from SQLite, because the orchestrator never holds run state in memory alone ([ADR-008](ADR-008-orchestration-topology.md)). Worth writing down, because "we need bidirectional" will be the instinctive reaction | The first design of an in-run approval flow. The answer is a POST plus a poll on the FSM side |
| A2 | Reconnection is safe because of `seq` gap detection | If the client trusts `EventSource`'s reconnect *without* the gap check, a reconnection silently loses events and the timeline is quietly wrong — which is worse than visibly broken | The gap check is the guarantee; native reconnect is a convenience. Test it by killing the API mid-run, not by reading the code |
| A3 | One viewer per run | Fine for a demo, and SSE fans out well anyway. The assumption that would bite is server-side per-connection state | Any need for shared cursors or presence — that is genuinely WebSocket territory |
| A4 | 500 ms per event (FR-205) is achievable without batching | Bursts violate it, and the fix is coalescing on the client, not a faster transport | Timestamps in the event envelope versus render time. Nothing currently measures this end to end |
| A5 | Fastify's SSE path stays simple | It does for a long-lived Node process. It would **not** on serverless or edge, where response duration is capped | Any proposal to host the API. That is a §7 trigger, and WebSockets are not the answer there either |

---

## 7. Flip triggers

| Trigger | Action |
|---|---|
| Genuinely bidirectional, low-latency interaction inside a run (shared cursors, collaborative triage, live presence) | WebSocket. Note that in-run *approval* is not this — see A1 |
| A corporate proxy buffers SSE despite `X-Accel-Buffering: no` | Fall back to polling with the visible indicator. **Do not jump to WebSockets** — an upgrade handshake through a hostile proxy is less likely to survive, not more |
| The API moves behind a serverless or edge runtime with response-time caps | Long-poll or poll. WebSockets fare no better under those constraints |
| Auth is added to the stream | Query-string token, and scrub it from access logs. If that is unacceptable, the stream endpoint moves behind a short-lived signed URL |
| Event volume grows past a few hundred per run | Batch server-side into windowed frames, keeping `seq` semantics intact. The transport is not the bottleneck; the render is |

---

## 8. Related

- [ADR-008 · Orchestration topology](ADR-008-orchestration-topology.md) — the FSM transitions this stream carries
- [ADR-005 · Persistence](ADR-005-persistence.md) — `run_events` is the durable record; SSE is only its delivery
- [18 §7](../04-build/18-ui-spec.md) — the client's live-update rules and degraded states
