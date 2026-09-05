# ADR-015 · Local-first, with one-command containers for judges

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 4 Sep 2026 |
| **Deciders** | All |
| **Requirements** | `NFR-2`, `NFR-7`, `NFR-9`; submission items S1, S2 |
| **Governs** | [15 · Repo & Conventions](../04-build/15-repo-and-conventions.md) · [22 · Demo Runbook](../05-delivery/22-demo-runbook.md) |

---

## 1. Context

The brief lists *"production deployment or hosting at scale"* as out of scope, and simultaneously requires a **working prototype running live** plus a **repository with clear setup instructions**. Those are compatible, but only if we are precise about what "running" means.

There is also a physical fact about hackathon venues: the wifi is bad, and it is bad exactly when everyone opens their laptop at the same time — which is the demo slot.

---

## 2. The two options

### Option A — Deploy publicly (dashboard on Vercel, orchestrator on Fly.io)

**Its real advantages:** a link in the submission that a judge can open at their own pace, days later. The demo video can show a real URL. It reads as "finished".

### Option B — Local-first, plus `docker compose up` *(chosen)*

Everything runs on a laptop. A single compose file brings up the API, the dashboard and the bundled demo target for anyone who clones the repo.

### Comparison

| Criterion | A · deployed | **B · local + compose** |
|---|---|---|
| Works when venue wifi dies | No | **Yes** — only the model call needs network |
| Browser automation in the runtime | Chromium in a container: cold starts, memory ceilings, headless-only | Native Playwright, headed, fast |
| A judge can run it themselves | No — they see our instance | **Yes** — one command |
| Demo-day failure modes added | Cold start, region, egress limits, secret drift, quota | None |
| Setup instructions are *verifiable* | Nobody checks them | **CI runs the compose file** |
| Build cost | 45–90 min, at the wrong end of the day | ~20 min |
| Brief's own scope | Explicitly out of scope | Aligned |
| Reads as "finished" to a judge | Slightly better | Equal, if the video is good |

---

## 3. Decision

**Local-first.** Three modes, in order of how often each is used:

| Mode | Command | For |
|---|---|---|
| Dev | `pnpm dev` | Building. Hot reload, headed browser, verbose events. |
| Demo | `pnpm forge demo` | The stage. Pre-warmed browser, reset state, headed, seeded. |
| Clone-and-run | `docker compose up` | A judge, a teammate, a stranger. API + dashboard + demo target on three ports. |

Two constraints make the third mode real rather than decorative:

1. **CI runs `docker compose up` and asserts a full session completes against the bundled target.** Setup instructions that CI does not execute are fiction. This is the whole reason the compose file exists, and the reason it is worth twenty minutes.
2. **Playwright's browser lives in the image, pinned to the revision `pnpm forge doctor` checks.** No download on first run, no version drift between the judge's machine and ours.

### 3.1 On the demo video doing the deployment's job

The submission wants a 2–5 minute video. A well-cut video of a local run is *better* evidence than a link, because it shows the terminal, the dashboard and the generated files together — and because a link to a cold Fly instance that takes eleven seconds to wake is a worse first impression than any video.

The repository, the compose file and the video together discharge S1 and S2 completely. A public URL would add reach, not evidence, and the brief did not ask for reach.

---

## 4. Consequences

### Accepted costs

1. **No shareable live link.** Mitigated by the video and by clone-and-run actually working.
2. **Judges evaluate our machine.** Mitigated by rehearsal `R-1` on a clean OS user account, which catches every "works only on the author's laptop" defect.

### Risks taken on

| Risk | Mitigation |
|---|---|
| Docker is not installed on the demo machine | Compose is for *judges*, not for the demo. The demo runs natively. |
| The model API is unreachable at the venue | `NFR-2`: the pipeline completes in degraded mode with the deterministic classifier and structural critic. Rehearsed as `R-2`. |
| Ports collide at the venue | All three ports are env-configurable; `pnpm forge doctor` reports collisions before the demo, not during it. |

### Hidden assumptions

- **A1.** That the target application is reachable from the venue network. If the organiser's URL is behind a corporate VPN, the demo falls back to the bundled target — rehearsal `R-3`.
- **A2.** That `better-sqlite3` builds natively on every machine that clones the repo. It is a native module. The compose image sidesteps this for judges; for the team, it is a pre-flight check on hour zero, not hour six.

---

## 5. Flip triggers

Deploy publicly if: the organiser requires a hosted URL as a submission condition, **or** the build finishes with more than 90 minutes of slack. In that case deploy the **dashboard in read-only replay mode** — serving a recorded session from stored artefacts — rather than the live orchestrator. It is a static export, it cannot fail on stage, and it gives a judge the browsing experience without any of the runtime risk.

That fallback is the interesting one: it delivers most of Option A's benefit for a fraction of its cost, and it only became available because the event log and evidence store were designed to be replayable from disk ([ADR-005](ADR-005-persistence.md)).
