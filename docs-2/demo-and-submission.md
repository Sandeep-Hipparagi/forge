# Demo and Submission

## Four-minute demo script

| Time | Show | Claim |
|---:|---|---|
| 0:00–0:25 | Enter Aperture URL and credentials; start run | No scripts or prompts required. |
| 0:25–1:05 | Explorer map and risk-ranked checkout capability | The agent decides what matters. |
| 1:05–1:35 | Weak plan rejected; named gaps drive re-plan | Coverage is evaluated before code. |
| 1:35–2:05 | Generated Playwright test and live run | Output is executable, not a text plan. |
| 2:05–2:50 | Rename/move action button; triage and verified patch | Healer persists a safe locator repair. |
| 2:50–3:25 | Change checkout total; veto blocks healing | AIVAR Sentinel QA does not hide a product defect. |
| 3:25–4:00 | Quality Report and Robustness Score | Evidence, residual risk, and defects are explicit. |

## Submission assets

| Deliverable | Owner | Ready when |
|---|---|---|
| Project title | Team | **AIVAR Sentinel QA — Evidence-Backed Autonomous Test Orchestration** is used consistently. |
| Overview | Team | 250 words or fewer and mirrors the product promise. |
| Repository | Engineering | README, architecture diagram, setup, and clean reproducible commands are present. |
| Demo video | Presenter | 2–5 minutes, contains both heal and refusal moments. |
| Deck | Presenter | Problem, architecture, Critic, safe healing, impact, trade-offs, live proof. |
| Deployment | Engineering | Public dashboard URL or a one-command local Docker fallback is tested. |

## Presentation rules

- Lead with the problem: test automation fails at decisions, not clicks.
- Spend more time on Critic and refusal-to-heal than on model prompts.
- Show evidence beside every consequential decision.
- Never claim complete coverage; point to the ranked unknowns.
- State the trade-off plainly: deterministic safety and replayability over unconstrained autonomy.

## Final preflight

1. Reset the target and clear runtime artefacts.
2. Run the full quality command set.
3. Run the demo twice, including one cold start.
4. Verify the public/reproducible setup instructions from a clean machine.
5. Freeze the demo target version, credentials, and mutation toggles.
