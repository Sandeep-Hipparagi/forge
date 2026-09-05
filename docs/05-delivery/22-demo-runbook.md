# 22 · Demo Runbook

> **Goal:** demonstrate autonomous orchestration and safe refusal in four minutes.
> **Fallback:** the same story in two minutes and thirty seconds.

## 1. Pre-flight

Run `pnpm verify`, `pnpm doctor`, `pnpm forge reset`, and `pnpm forge eval`. Confirm the pinned browser, the local SUT, the dashboard, and the model or deterministic fallback. Start with a clean mutation state and a clean generated test.

## 2. Four-minute script

| Time | Action | Proof on screen |
|---:|---|---|
| 0:00 | Enter the Aperture URL and start a session | Target and session state |
| 0:30 | Let Explorer discover and prioritise a capability | Capability map and evidence |
| 1:00 | Show Planner output and Critic assessment | Plan, coverage score, and any gap |
| 1:35 | Show Generator and Runner | Generated test and live evidence |
| 2:10 | Enable the known test mutation and rerun | Failure microscope and diagnosis |
| 2:45 | Show a permitted heal | Candidate score, veto list empty, diff |
| 3:20 | Show full-flow verification | `VERIFIED`, evidence, changed plan |
| 3:40 | Run the product-regression mutation | Triage identifies product failure |
| 3:55 | Show refusal and report | Veto, escalation card, Robustness Score |

The terminal is not part of the presentation. The dashboard is the primary proof; logs and artifacts remain available for inspection.

## 3. Two-minute cut

Show a prepared session: failure, diagnosis, permitted heal, full-flow verification, then the product-regression refusal. Keep the Critic score visible and name the reason for refusal. Do not claim exploration happened live if it was pre-recorded.

## 4. Failure drills

- API interruption: restart the API and confirm the session resumes from its last persisted event.
- Offline mode: unset the model key and confirm `DETERMINISTIC MODE` with the same verdict.
- Target switch: reset, replace the URL with SauceDemo or Conduit, and confirm a new session is isolated.
- Failed heal: force an ambiguous candidate and confirm rollback plus escalation.

## 5. Questions to answer

**Why not heal every failure?** Because triage distinguishes test drift from product regression and vetoes unsafe or ambiguous patches.

**Where is the model?** It proposes plans and diagnoses from evidence. Deterministic arithmetic controls coverage blocking, healing eligibility, vetoes, persistence, and verification.

**What happens without a key?** The cached or deterministic path runs and labels the result; it does not fabricate model confidence.

## 6. Recovery rule

If the live path fails, reset and run the verified fixture or recorded transcript. State plainly which path is being shown. Never edit the generated test or target source during the presentation.
