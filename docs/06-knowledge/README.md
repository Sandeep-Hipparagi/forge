# 06 · Knowledge Base

This directory stores verified learnings that improve the next build or session. It is not a second specification and it must not become a dumping ground.

## Capture rule

Add a learning only when an observation changes implementation, testing, operations, or a decision. Record the date, context, evidence, consequence, and the action taken. Link the relevant requirement, ADR, test, or issue.

```markdown
## YYYY-MM-DD · Short title

- **Observation:** what happened, with the command or artifact that proves it.
- **Impact:** which behavior, requirement, or risk it affects.
- **Action:** the change made or the experiment required.
- **Owner:** person or agent responsible for closing it.
- **Status:** open | verified | superseded
```

## What belongs here

- Reproducible environment or browser findings.
- Failure signatures and effective mitigations.
- Evaluation results that falsify or strengthen an assumption.
- Operational lessons from rehearsals and target switches.

## What does not belong here

Do not copy requirements, architecture, ADRs, task lists, credentials, generated artifacts, or unverified opinions. Promote a recurring learning to the relevant specification or a new ADR; mark the knowledge entry as superseded rather than silently deleting it.
