# FORGE · Curated QA Skills

English skills vendored from [naodeng/awesome-qa-skills](https://github.com/naodeng/awesome-qa-skills) for Cursor agent assistance while building and evaluating FORGE.

**License:** PolyForm Noncommercial 1.0.0 — see [`LICENSE-awesome-qa-skills.txt`](LICENSE-awesome-qa-skills.txt). Do not redistribute commercially without a separate license from the upstream author.

Upstream: https://github.com/naodeng/awesome-qa-skills (commit at install time; re-sync manually when needed).

## Mapping to FORGE’s product loop

| FORGE stage           | Skill(s)                                                                              | Use when                                             |
| --------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Route / unclear ask   | `discover-testing`                                                                    | Pick which skill to run first                        |
| Explore               | `manual-testing`, `quality-risk-analysis`                                             | Charters, heuristics, risk ranking                   |
| Prioritise            | `quality-risk-analysis`                                                               | Evidence-based risk ordering                         |
| Plan                  | `test-strategy`, `test-strategy-review`, `requirements-analysis`                      | Scope, methods, gates, requirement test points       |
| Critique              | `test-case-reviewer`, `qa-quality-perspective`, `ai-generated-test-review`            | Coverage floor, weak plans, fake/weak AI tests       |
| Generate              | `test-case-writing`, `functional-testing`, `automation-testing`, `ui-test-playwright` | Cases + Playwright suite design                      |
| Triage / Heal         | `flaky-test-analysis`, `root-cause-analysis`, `bug-reporting`, `ai-assisted-testing`  | Intermittents, RCA, defects, AI-assisted diagnosis   |
| Report                | `test-reporting`                                                                      | Metrics, risk, status report                         |
| Evaluate FORGE itself | `ai-agent-testing`, `agent-tool-testing`, `llm-evaluation-design`                     | Agent goals/tools, eval design for Ph1+ golden cases |

## How to invoke in Cursor

```text
@skill ui-test-playwright
Design a Playwright suite for the Aperture login + cart capability map.
```

```text
@skill ai-generated-test-review
Review this generated Playwright test for fake assertions and missing outcomes.
```

```text
@skill discover-testing
We need a coverage-critic pass on a weak plan — which skills?
```

## What was not installed

Performance, mobile, security, Postman/k6/etc., and most production-ops skills — low fit for FORGE’s Playwright-centric MVP. Install more from upstream with:

```bash
npx skills add https://github.com/naodeng/awesome-qa-skills/tree/main/skills/en/testing-types/<name> -g -a cursor -y
# or copy into this directory
```
