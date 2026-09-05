export default function HomePage() {
  return (
    <main className="shell">
      <h1 className="brand">FORGE</h1>
      <p className="lede">
        Point it at a URL. It explores, plans, critiques, generates, runs, and tells you what it
        could not test.
      </p>
      <div className="home-card">
        <strong>Report preview</strong>
        <p>
          Full five-screen dashboard is Ph6.3. This sitting ships the report screen so you can audit
          RobustnessScore, healer actions (including refusals), and residual gaps vs accepted risk.
        </p>
        <a className="btn" href="/s/ses_demo/report">
          Open demo report →
        </a>
      </div>
    </main>
  );
}
