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

function pillClass(decision: string): string {
  if (decision === "HEALED") return "pill pill-healed";
  if (decision === "BLOCKED") return "pill pill-blocked";
  return "pill pill-escalated";
}

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const report = await loadReport(sessionId);

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

      <section className="panel" aria-labelledby="score-heading">
        <h2 id="score-heading">Robustness score</h2>
        <p className="score-display" data-testid="score-current">
          {report.score.current}
        </p>
        <p className="score-meta">
          → {report.score.projected} if open findings are fixed · every term recomputes from stored
          rows
        </p>
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
      </section>

      <section className="panel" aria-labelledby="healer-heading">
        <h2 id="healer-heading">3. Self-healing actions taken</h2>
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

      <section className="panel" aria-labelledby="residual-heading" data-testid="residual-gaps">
        <h2 id="residual-heading">4a. Residual coverage gaps</h2>
        {residual.length === 0 ? (
          <p className="empty">None.</p>
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
          <p className="empty">None.</p>
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
          <p className="empty">None.</p>
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
