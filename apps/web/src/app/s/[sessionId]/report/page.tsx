type ReportJson = {
  id: string;
  sessionId: string;
  generatedAt: string;
  scenariosCovered: Array<{
    scenarioId: string;
    capability: string;
    title: string;
    class: string;
    priority: string;
    status?: "passed" | "failed" | "healed" | "flaky" | "skipped";
    failureReason?: string;
  }>;
  outcomes: {
    passed: number;
    failed: number;
    healed: number;
    flaky: number;
    skipped: number;
  };
  healerActions: Array<{
    runId: string;
    stepId: string;
    decision: "HEALED" | "BLOCKED" | "ESCALATED";
    vetoId: string | null;
    before: string;
    after: string | null;
    confidence: number;
    verified: boolean;
  }>;
  residualGaps?: Array<{ title: string; why: string; severity: string }>;
  acceptedRisk?: Array<{ title: string; why: string; severity: string }>;
  coverageGapsRemaining: Array<{ title: string; why: string; severity: string }>;
  untestedFlowRisk: Array<{ name: string; riskScore: number; why: string }>;
  defects: Array<{
    capability: string;
    expected: string;
    actual: string;
    severity: string;
  }>;
  score: {
    current: number;
    projected: number;
    components: Record<string, number>;
    perCapability: Array<{
      capabilityId: string;
      name: string;
      points: number;
      lostBecause: string[];
    }>;
    findings: Array<{ title: string; pointsIfFixed: number }>;
  };
  hoursSaved: { estimate: number; assumptions: string[] } | null;
};

const API = process.env.FORGE_API_URL ?? "http://127.0.0.1:4000";
const DEMO_VIDEO_URL =
  process.env.NEXT_PUBLIC_FORGE_DEMO_VIDEO_URL ?? process.env.FORGE_DEMO_VIDEO_URL ?? "";

async function loadReport(sessionId: string): Promise<ReportJson | null> {
  try {
    const response = await fetch(`${API}/api/sessions/${sessionId}/report`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as ReportJson;
  } catch {
    return null;
  }
}

async function loadSessionMeta(sessionId: string): Promise<{ live: boolean; url: string } | null> {
  try {
    const response = await fetch(`${API}/api/sessions/${sessionId}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      input?: { live?: boolean; url?: string };
    };
    return {
      live: body.input?.live === true,
      url: body.input?.url ?? "",
    };
  } catch {
    return null;
  }
}

function pillClass(decision: string): string {
  if (decision === "HEALED") return "pill pill-healed";
  if (decision === "BLOCKED") return "pill pill-blocked";
  return "pill pill-escalated";
}

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const [report, meta] = await Promise.all([loadReport(sessionId), loadSessionMeta(sessionId)]);

  if (report === null) {
    return (
      <main className="shell">
        <nav className="nav">
          <a href="/">← Start</a>
        </nav>
        <h1 className="brand">Report unavailable</h1>
        <p className="lede">
          Could not reach the API at <code className="mono">{API}</code>. Start it with{" "}
          <code className="mono">pnpm --filter @forge/api dev</code>, then refresh.
        </p>
      </main>
    );
  }

  const residual = report.residualGaps ?? [];
  const accepted = report.acceptedRisk ?? [];
  const maxComponent = Math.max(...Object.values(report.score.components), 1);
  const failedScenarios = report.scenariosCovered.filter((s) => s.status === "failed");
  const isDemo = sessionId === "ses_demo";
  const isLive = meta?.live === true;

  const outcomeTotals = (() => {
    const { passed, failed, healed, flaky, skipped } = report.outcomes;
    const total = passed + failed + healed + flaky + skipped;
    if (total === 0) {
      return { total: 0, passed: 0, failed: 0, healed: 0, flaky: 0, skipped: 0 };
    }
    const pct = (n: number) => Math.round((n / total) * 100);
    return {
      total,
      passed: pct(passed),
      failed: pct(failed),
      healed: pct(healed),
      flaky: pct(flaky),
      skipped: pct(skipped),
    };
  })();

  const healerSummary = (() => {
    if (report.healerActions.length === 0) {
      return "No self-healing actions were taken in this session.";
    }
    let healed = 0;
    let blocked = 0;
    let escalated = 0;
    const vetoIds = new Set<string>();
    for (const action of report.healerActions) {
      if (action.decision === "HEALED") healed += 1;
      else if (action.decision === "BLOCKED") blocked += 1;
      else if (action.decision === "ESCALATED") escalated += 1;
      if (action.vetoId) vetoIds.add(action.vetoId);
    }
    const vetoList = Array.from(vetoIds).sort();
    const parts = [`${healed} healed`, `${blocked} blocked`, `${escalated} escalated`];
    if (vetoList.length > 0) {
      parts.push(`vetoes: ${vetoList.join(", ")}`);
    }
    return parts.join(" · ");
  })();

  return (
    <main className="shell">
      <nav className="nav">
        <a href="/">← Start</a>
        <span className="mono">{report.sessionId}</span>
        <span>{report.generatedAt}</span>
      </nav>

      <h1 className="brand">Quality report</h1>
      <p className="lede">
        Same document as <code className="mono">forge report</code> — five mandated sections,
        residual gaps kept separate from accepted risk.
      </p>

      {!isDemo && !isLive && (
        <p className="mode-banner" role="status" data-testid="stub-banner">
          Stub run{meta?.url ? ` for ${meta.url}` : ""}. No browser opened — this is not a live
          explore of the target. Go back to Start, keep <strong>Live explore</strong> checked, and
          run again.
        </p>
      )}
      {isLive && (
        <p className="mode-banner live" role="status" data-testid="live-banner">
          Live run{meta?.url ? ` against ${meta.url}` : ""}. Score and sections come from this
          session&apos;s explore → plan → run evidence.
        </p>
      )}

      {DEMO_VIDEO_URL && (
        <p className="lede-small">
          End-to-end demo video (recorded once and reused across reports):{" "}
          <a href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">
            Watch the agent run →
          </a>
        </p>
      )}

      <section className="panel" aria-labelledby="score-heading">
        <h2 id="score-heading">Robustness score</h2>
        <p className="score-display" data-testid="score-current">
          {report.score.current}
        </p>
        <p className="score-meta">
          → {report.score.projected} if open findings are fixed · every term recomputes from stored
          rows
        </p>
        {outcomeTotals.total > 0 && (
          <p className="score-meta" data-testid="outcome-percentages">
            Outcomes (out of 100): passed {outcomeTotals.passed}% · failed {outcomeTotals.failed}% ·
            healed {outcomeTotals.healed}% · flaky {outcomeTotals.flaky}% · skipped{" "}
            {outcomeTotals.skipped}% ({report.outcomes.passed} passed, {report.outcomes.failed}{" "}
            failed, {report.outcomes.healed} healed, {report.outcomes.flaky} flaky,{" "}
            {report.outcomes.skipped} skipped)
          </p>
        )}
        <div className="bars">
          {Object.entries(report.score.components).map(([name, pts]) => (
            <div className="bar-row" key={name}>
              <span>{name}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${Math.min(100, (pts / maxComponent) * 100)}%` }}
                />
              </div>
              <span className="bar-val">{pts.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="capabilities-heading">
        <h2 id="capabilities-heading">Capability robustness</h2>
        {report.score.perCapability.length === 0 ? (
          <p className="empty">No capability-level breakdown is available for this report.</p>
        ) : (
          <table data-testid="capability-breakdown">
            <thead>
              <tr>
                <th>Capability</th>
                <th>Points</th>
                <th>Lost because</th>
              </tr>
            </thead>
            <tbody>
              {report.score.perCapability.map((cap) => (
                <tr key={cap.capabilityId}>
                  <td>{cap.name}</td>
                  <td className="mono">{cap.points.toFixed(2)}</td>
                  <td>
                    {cap.lostBecause.length === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <ul className="gap-list">
                        {cap.lostBecause.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel" aria-labelledby="scenarios-heading">
        <h2 id="scenarios-heading">1. Test scenarios covered</h2>
        {report.scenariosCovered.length === 0 ? (
          <p className="empty">None.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Capability</th>
                <th>Title</th>
                <th>Class</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report.scenariosCovered.map((s) => (
                <tr key={s.scenarioId}>
                  <td className="mono">{s.scenarioId}</td>
                  <td>{s.capability}</td>
                  <td>{s.title}</td>
                  <td>{s.class}</td>
                  <td>{s.priority}</td>
                  <td>
                    <span
                      className={
                        s.status === "failed"
                          ? "pill pill-blocked"
                          : s.status === "passed" || s.status === "healed"
                            ? "pill pill-healed"
                            : "pill"
                      }
                    >
                      {s.status ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel" aria-labelledby="outcomes-heading">
        <h2 id="outcomes-heading">2. Pass / fail outcomes</h2>
        <table>
          <thead>
            <tr>
              <th>Outcome</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["passed", report.outcomes.passed],
                ["failed", report.outcomes.failed],
                ["healed", report.outcomes.healed],
                ["flaky", report.outcomes.flaky],
                ["skipped", report.outcomes.skipped],
              ] as const
            ).map(([label, count]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="mono">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {failedScenarios.length > 0 ? (
          <div className="failed-scenarios" data-testid="failed-scenarios">
            <h3>Failed scenarios</h3>
            <ul className="gap-list">
              {failedScenarios.map((s) => (
                <li key={`fail-${s.scenarioId}`}>
                  <strong className="mono">{s.scenarioId}</strong> · {s.title}{" "}
                  <span className="muted">({s.capability})</span>
                  <div className="failure-reason">
                    {s.failureReason?.trim() || "No failure detail recorded"}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : report.outcomes.failed > 0 || report.defects.length > 0 ? (
          <div className="failed-scenarios" data-testid="failed-scenarios">
            <h3>Failed scenarios</h3>
            {report.defects.length > 0 ? (
              <ul className="gap-list">
                {report.defects.map((d, index) => (
                  <li key={`defect-fail-${index}`}>
                    <strong>{d.capability}</strong> ({d.severity}): expected{" "}
                    <code className="mono">{d.expected}</code>
                    <div className="failure-reason">{d.actual}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">
                Outcome counts include failures, but no per-scenario failure detail was stored for
                this report.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="healer-heading">
        <h2 id="healer-heading">3. Self-healing actions taken</h2>
        <p className="healer-summary" data-testid="healer-summary">
          {healerSummary}
        </p>
        {report.healerActions.length === 0 ? (
          <p className="empty">None.</p>
        ) : (
          <table data-testid="healer-actions">
            <thead>
              <tr>
                <th>Step</th>
                <th>Decision</th>
                <th>Veto</th>
                <th>Before → after</th>
                <th>Conf.</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>
              {report.healerActions.map((a) => (
                <tr key={`${a.runId}-${a.stepId}`}>
                  <td className="mono">{a.stepId}</td>
                  <td>
                    <span className={pillClass(a.decision)}>{a.decision}</span>
                  </td>
                  <td className="mono">{a.vetoId ?? "—"}</td>
                  <td className="mono">
                    {a.before} → {a.after ?? "—"}
                  </td>
                  <td className="mono">{a.confidence.toFixed(3)}</td>
                  <td>{a.verified ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel" aria-labelledby="veto-heading">
        <h2 id="veto-heading">Decision guardrails · vetoes V1–V5</h2>
        <p className="lede-small">
          Every auto-heal passes through five hard vetoes. When a veto id appears in the table
          above, this is the rule that blocked it.
        </p>
        <ul className="gap-list">
          <li>
            <span className="severity">[V1]</span> Assertion-target veto — assertion step with{" "}
            <code className="mono">ASSERTION_FAILED</code> is always treated as a product bug;
            healing is forbidden.
          </li>
          <li>
            <span className="severity">[V2]</span> Destructive-verb veto — blocks a candidate whose
            accessible name changes a non-destructive control into a destructive one (for example,
            <code className="mono">Place order</code> → <code className="mono">Delete order</code>
            ).
          </li>
          <li>
            <span className="severity">[V3]</span> Numeric / currency drift veto — blocks when{" "}
            <code className="mono">expected</code> and <code className="mono">actual</code> differ
            only in numbers or currency, so pricing bugs cannot be healed away.
          </li>
          <li>
            <span className="severity">[V4]</span> Ambiguity veto — if the top two locator
            candidates are within 0.05 of each other, escalate instead of guessing.
          </li>
          <li>
            <span className="severity">[V5]</span> Runtime regression veto — new console error or
            5xx on this flow since the baseline forces a defect verdict even if the locator still
            resolves.
          </li>
        </ul>
      </section>

      <section className="panel" aria-labelledby="residual-heading" data-testid="residual-gaps">
        <h2 id="residual-heading">4a. Residual coverage gaps</h2>
        {residual.length === 0 ? (
          <p className="empty">
            The agent compared discovered flows, requirements, and usage patterns and did not detect
            any residual coverage gaps for this session. When future runs find gaps, they will be
            listed here with the missing scenarios and suggested new tests.
          </p>
        ) : (
          <ul className="gap-list">
            {residual.map((g) => (
              <li key={g.title}>
                <span className="severity">[{g.severity}]</span> {g.title} — {g.why}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="accepted-heading" data-testid="accepted-risk">
        <h2 id="accepted-heading">4b. Accepted risk</h2>
        {accepted.length === 0 ? (
          <p className="empty">
            The agent did not find any high-impact coverage gaps that required an explicit waiver,
            so no additional accepted risk is being tracked for this release beyond standard
            non-regression risk. If the team consciously defers a gap in a later run, it will be
            summarized here with its owner and expiry.
          </p>
        ) : (
          <ul className="gap-list">
            {accepted.map((g) => (
              <li key={g.title}>
                <span className="severity">[{g.severity}]</span> {g.title} — {g.why}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="untested-heading">
        <h2 id="untested-heading">5. Untested flow risk</h2>
        {report.untestedFlowRisk.length === 0 ? (
          <p className="empty">
            For this run, the agent did not identify any user journeys with zero test coverage above
            the risk threshold. When untested flows exist, they will appear here ordered by impact,
            together with the next tests that would close the risk.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Capability</th>
                <th>Risk</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {report.untestedFlowRisk.map((u) => (
                <tr key={u.name}>
                  <td>{u.name}</td>
                  <td className="mono">{u.riskScore.toFixed(3)}</td>
                  <td>{u.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {report.defects.length > 0 ? (
        <section className="panel" aria-labelledby="defects-heading">
          <h2 id="defects-heading">Defects found</h2>
          <ul className="gap-list">
            {report.defects.map((d) => (
              <li key={`${d.capability}-${d.expected}`}>
                <strong>{d.capability}</strong> ({d.severity}): expected{" "}
                <code className="mono">{d.expected}</code> · actual{" "}
                <code className="mono">{d.actual}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
