import { useState } from "react";
import {
  Activity,
  BarChart3,
  Check,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Clock3,
  Code2,
  Download,
  Eye,
  FileCheck2,
  FileText,
  FolderKanban,
  GitCompare,
  History,
  LogOut,
  Menu,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Sparkles,
  TriangleAlert,
  WandSparkles,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

function Dashboard() {
  const [activeSection, setActiveSection] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();

  const navigation = [
    { label: "Overview", icon: BarChart3 },
    { label: "Test Suites", icon: FolderKanban },
    { label: "Design Checks", icon: ClipboardCheck },
    { label: "Self-Heal", icon: WandSparkles },
    { label: "Evidence", icon: FileCheck2 },
    { label: "History", icon: History },
  ];

  return (
    <main className="mission-control">
      <header className="control-bar">
        <div className="control-brand">
          <span className="control-dots">
            <i />
            <i />
            <i />
          </span>
          <NavLink to="/">FORGE</NavLink>
          <span className="brand-divider">/</span>
          <span>Mission Control</span>
        </div>
        <div className="control-actions">
          <span className="connection-status">
            <CircleDot size={11} /> Agent network online
          </span>
          <button type="button" aria-label="Search">
            <Search size={16} />
          </button>
          <button type="button" aria-label="Settings">
            <Settings2 size={16} />
          </button>
          <div className="profile-menu">
            <button
              className="control-avatar"
              type="button"
              onClick={() => setProfileOpen((isOpen) => !isOpen)}
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
            >
              AL
            </button>
            {profileOpen && (
              <div className="profile-popover">
                <div className="profile-summary">
                  <span className="profile-avatar-large">AL</span>
                  <div>
                    <strong>Alex Lee</strong>
                    <span>alex@forge.dev</span>
                  </div>
                </div>
                <div className="profile-divider" />
                <button className="logout-button" type="button" onClick={() => navigate("/login")}>
                  <span>
                    <LogOut size={15} />
                  </span>{" "}
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
        <button
          className="mobile-menu"
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle navigation"
        >
          <Menu size={20} />
        </button>
      </header>
      <div className="control-layout">
        <aside className={`control-sidebar ${sidebarOpen ? "is-open" : ""}`}>
          <div className="sidebar-project">
            <span className="project-mark">
              <Sparkles size={15} />
            </span>
            <div>
              <strong>Acme checkout</strong>
              <span>
                Production preview <CircleDot size={9} />
              </span>
            </div>
            <button
              type="button"
              aria-label="Collapse sidebar"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
          <span className="sidebar-label">WORKSPACE</span>
          <nav className="control-nav" aria-label="Dashboard sections">
            {navigation.map(({ label, icon: Icon }) => (
              <button
                className={activeSection === label ? "active" : ""}
                type="button"
                key={label}
                onClick={() => {
                  setActiveSection(label);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={16} />
                <span>{label}</span>
                {label === "Evidence" && <b>12</b>}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <span className="sidebar-label">CURRENT RUN</span>
            <div className="run-mini">
              <span className="run-icon">
                <Activity size={14} />
              </span>
              <div>
                <strong>Release 1.4</strong>
                <span>Updated 2m ago</span>
              </div>
              <ChevronRight size={14} />
            </div>
            <button className="collapse-button" type="button" onClick={() => setSidebarOpen(false)}>
              <PanelLeftOpen size={15} /> Collapse menu
            </button>
          </div>
        </aside>
        <section className="control-content">
          <div className="content-topline">
            <div>
              <span className="control-eyebrow">
                {activeSection === "Overview"
                  ? "RELEASE OVERVIEW"
                  : `WORKSPACE / ${activeSection.toUpperCase()}`}
              </span>
              <h1>{activeSection === "Overview" ? "Release 1.4 — Checkout" : activeSection}</h1>
              <p>
                1 target <span>·</span> 8 generated tests <span>·</span> 1 design baseline
              </p>
            </div>
            <span className="ready-pill">
              <span /> READY
            </span>
          </div>
          {activeSection === "Overview" ? (
            <Overview />
          ) : (
            <WorkspacePreview section={activeSection} />
          )}
        </section>
      </div>
    </main>
  );
}

function Overview() {
  return (
    <>
      <div className="overview-stats">
        <article>
          <div className="stat-heading">
            <span>Coverage</span>
            <BarChart3 size={14} />
          </div>
          <strong>92%</strong>
          <div className="coverage-track">
            <span />
          </div>
          <small>+8% from last run</small>
        </article>
        <article>
          <div className="stat-heading">
            <span>Last run</span>
            <Clock3 size={14} />
          </div>
          <strong>8 / 8 passed</strong>
          <small>2.8s · Chromium · Preview</small>
          <span className="passed-label">
            <Check size={12} /> All checks green
          </span>
        </article>
        <article>
          <div className="stat-heading">
            <span>Open findings</span>
            <Activity size={14} />
          </div>
          <strong>03</strong>
          <small>2 medium · 1 low severity</small>
          <span className="review-label">Needs review</span>
        </article>
      </div>
      <div className="autonomous-card">
        <div className="card-header">
          <div>
            <span className="control-eyebrow">ACTIVE PLAN</span>
            <h2>Autonomous test plan</h2>
          </div>
          <span className="generated-pill">
            <Sparkles size={12} /> AI GENERATED
          </span>
        </div>
        <div className="test-steps">
          <span>
            <b>01</b> Open checkout
          </span>
          <ChevronRight size={13} />
          <span>
            <b>02</b> Verify order summary
          </span>
          <ChevronRight size={13} />
          <span>
            <b>03</b> Apply coupon
          </span>
          <ChevronRight size={13} />
          <span>
            <b>04</b> Place order
          </span>
          <ChevronRight size={13} />
          <span>
            <b>05</b> Verify success state
          </span>
        </div>
        <div className="plan-footer">
          <span>
            <span className="pulse-dot" /> Agents are monitoring this plan
          </span>
          <button type="button">
            Open plan <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="lower-grid">
        <section className="activity-panel">
          <div className="panel-heading">
            <div>
              <span className="control-eyebrow">RECENT ACTIVITY</span>
              <h2>What changed</h2>
            </div>
            <button type="button">
              View all <ChevronRight size={14} />
            </button>
          </div>
          <ActivityRow
            icon={<Check size={14} />}
            tone="green"
            title="Payment retry path verified"
            meta="Explorer agent · 2 minutes ago"
          />
          <ActivityRow
            icon={<WandSparkles size={14} />}
            tone="purple"
            title="Locator healed automatically"
            meta="Self-heal agent · 5 minutes ago"
          />
          <ActivityRow
            icon={<Code2 size={14} />}
            tone="blue"
            title="New scenario generated"
            meta="Planner agent · 8 minutes ago"
          />
        </section>
        <section className="health-panel">
          <div className="panel-heading">
            <div>
              <span className="control-eyebrow">QUALITY SIGNAL</span>
              <h2>Good momentum</h2>
            </div>
            <span className="health-score">92</span>
          </div>
          <div className="signal-bars">
            <span style={{ height: "88%" }} />
            <span style={{ height: "73%" }} />
            <span style={{ height: "96%" }} />
            <span style={{ height: "81%" }} />
            <span style={{ height: "100%" }} />
            <span style={{ height: "90%" }} />
            <span style={{ height: "94%" }} />
            <span style={{ height: "100%" }} />
          </div>
          <div className="health-footer">
            <span>
              Runs this week <strong>8</strong>
            </span>
            <span>
              Pass rate <strong>96%</strong>
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

function ActivityRow({ icon, tone, title, meta }) {
  return (
    <div className="activity-row">
      <span className={`activity-badge ${tone}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <ChevronRight size={14} />
    </div>
  );
}

function WorkspacePreview({ section }) {
  if (section === "Test Suites") return <RunTimeline />;
  if (section === "Design Checks") return <FailureMicroscope />;
  if (section === "Self-Heal") return <HealingDiff />;
  if (section === "Evidence") return <EvidencePack />;
  return <RunHistory />;
}

function WorkspaceHeader({ eyebrow, title, detail, action }) {
  return (
    <div className="workspace-header">
      <div>
        <span className="control-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
}

function RunTimeline() {
  return (
    <div className="workspace-view">
      <WorkspaceHeader
        eyebrow="TEST SUITE / CHECKOUT"
        title="Run timeline"
        detail="Release 1.4 · 8 generated tests · 2m 14s total"
        action={
          <button className="workspace-action" type="button">
            <Sparkles size={14} /> Run again
          </button>
        }
      />
      <div className="timeline-summary">
        <div>
          <span>RUN STATUS</span>
          <strong>
            <span className="status-dot" /> Completed
          </strong>
        </div>
        <div>
          <span>STARTED</span>
          <strong>Today, 10:42 AM</strong>
        </div>
        <div>
          <span>ENVIRONMENT</span>
          <strong>Chromium · Preview</strong>
        </div>
        <div>
          <span>AGENTS</span>
          <strong>6 parallel</strong>
        </div>
      </div>
      <div className="timeline-panel">
        <div className="timeline-line" />
        <TimelineItem
          number="01"
          title="Explore product surface"
          detail="Explorer agent mapped 14 interactive states"
          time="10:42:08"
          tone="complete"
          icon={<Eye size={15} />}
        />
        <TimelineItem
          number="02"
          title="Generate test plan"
          detail="Planner agent produced 8 scenarios from release intent"
          time="10:42:31"
          tone="complete"
          icon={<Sparkles size={15} />}
        />
        <TimelineItem
          number="03"
          title="Execute checkout flow"
          detail="8 of 8 paths passed · 47 total assertions"
          time="10:43:12"
          tone="complete"
          icon={<MousePointer2 size={15} />}
        />
        <TimelineItem
          number="04"
          title="Critique coverage"
          detail="Found one untested guest retry state worth reviewing"
          time="10:44:02"
          tone="warning"
          icon={<TriangleAlert size={15} />}
        />
        <TimelineItem
          number="05"
          title="Package release signal"
          detail="Report assembled with screenshots and trace evidence"
          time="10:44:22"
          tone="complete"
          icon={<FileCheck2 size={15} />}
        />
      </div>
    </div>
  );
}

function TimelineItem({ number, title, detail, time, tone, icon }) {
  return (
    <div className="timeline-item">
      <span className={`timeline-icon ${tone}`}>{icon}</span>
      <div className="timeline-event">
        <div>
          <span className="timeline-number">{number}</span>
          <strong>{title}</strong>
        </div>
        <p>{detail}</p>
      </div>
      <time>{time}</time>
    </div>
  );
}

function FailureMicroscope() {
  return (
    <div className="workspace-view">
      <WorkspaceHeader
        eyebrow="DESIGN CHECK / FINDING 01"
        title="Failure microscope"
        detail="Inspect the exact moment a user-visible path diverged from expected behavior."
        action={
          <span className="severity-badge high">
            <TriangleAlert size={13} /> High severity
          </span>
        }
      />
      <div className="microscope-grid">
        <div className="failure-preview">
          <div className="preview-toolbar">
            <span>
              <i />
              <i />
              <i />
            </span>
            <span>preview.acme.dev / checkout</span>
            <span>01 / 03</span>
          </div>
          <div className="preview-screen">
            <div className="fake-nav">
              <span>
                acme<span>.</span>
              </span>
              <span>Cart · Account</span>
            </div>
            <div className="fake-checkout">
              <span className="fake-label">PAYMENT</span>
              <strong>Something went wrong</strong>
              <p>We couldn't confirm your payment. Your cart is still saved.</p>
              <button type="button">Try again</button>
              <small>Observed at 10:43:18 · guest session · 390px</small>
            </div>
          </div>
          <div className="preview-footer">
            <span>
              <Eye size={13} /> Screenshot captured
            </span>
            <button type="button">
              <Download size={13} /> Export frame
            </button>
          </div>
        </div>
        <div className="finding-detail">
          <span className="control-eyebrow">AGENT OBSERVATION</span>
          <h3>Payment retry loses cart state</h3>
          <p>
            The retry action returns the guest user to a payment error state, but the order summary
            no longer contains the applied coupon.
          </p>
          <div className="detail-list">
            <div>
              <span>EXPECTED</span>
              <strong>Order summary preserves coupon and items</strong>
            </div>
            <div>
              <span>OBSERVED</span>
              <strong>Coupon disappears after retry</strong>
            </div>
            <div>
              <span>CONFIDENCE</span>
              <strong>94% · reproduced 3 / 3 times</strong>
            </div>
          </div>
          <button className="detail-cta" type="button">
            Open trace <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function HealingDiff() {
  return (
    <div className="workspace-view">
      <WorkspaceHeader
        eyebrow="SELF-HEAL / PATCH 03"
        title="Healing diff"
        detail="Review the locator change before it is accepted into the generated suite."
        action={
          <span className="severity-badge healed">
            <Check size={13} /> Verified
          </span>
        }
      />
      <div className="healing-summary">
        <div className="healing-agent">
          <span className="healing-orb">
            <WandSparkles size={18} />
          </span>
          <div>
            <strong>Self-heal agent</strong>
            <span>Repaired and re-ran in 1.8s</span>
          </div>
        </div>
        <div>
          <span>CONFIDENCE</span>
          <strong>98.2%</strong>
        </div>
        <div>
          <span>RE-RUN</span>
          <strong>8 / 8 passed</strong>
        </div>
      </div>
      <div className="diff-panel">
        <div className="diff-heading">
          <div>
            <span className="control-eyebrow">LOCATOR DIFF</span>
            <h3>checkout / submit-order</h3>
          </div>
          <span className="diff-file">
            <FileText size={13} /> generated/checkout.spec.ts
          </span>
        </div>
        <div className="code-diff">
          <div className="code-line context">
            <span>42</span>
            <code>
              await page.getByRole('button', {"{"} name: 'Place order' {"}"}).click()
            </code>
          </div>
          <div className="code-line removed">
            <span>43</span>
            <code>- locator('button.submit-order')</code>
          </div>
          <div className="code-line added">
            <span>43</span>
            <code>
              + getByRole('button', {"{"} name: 'Place order' {"}"} )
            </code>
          </div>
          <div className="code-line context">
            <span>44</span>
            <code>await expect(page.getByText('Order confirmed')).toBeVisible()</code>
          </div>
        </div>
        <div className="diff-footer">
          <span>
            <Check size={13} /> Post-heal verification passed
          </span>
          <div>
            <button type="button">Reject</button>
            <button className="accept-button" type="button">
              Accept patch <Check size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidencePack() {
  return (
    <div className="workspace-view">
      <WorkspaceHeader
        eyebrow="EVIDENCE / RELEASE 1.4"
        title="Evidence pack"
        detail="A shareable record of what Forge explored, found, healed, and verified."
        action={
          <button className="workspace-action" type="button">
            <Download size={14} /> Download pack
          </button>
        }
      />
      <div className="evidence-hero">
        <div className="report-icon">
          <FileCheck2 size={25} />
        </div>
        <div>
          <span className="control-eyebrow">RELEASE READINESS REPORT</span>
          <h3>Checkout · build #1842</h3>
          <p>Generated today at 10:44 AM · 8 pages · 12 evidence items</p>
        </div>
        <span className="report-score">
          92<small>/100</small>
        </span>
      </div>
      <div className="evidence-grid">
        <EvidenceItem
          icon={<GitCompare size={17} />}
          title="Run summary"
          detail="8 tests · 47 paths · 96% pass rate"
        />
        <EvidenceItem
          icon={<Eye size={17} />}
          title="Coverage map"
          detail="14 states explored · 3 blind spots"
        />
        <EvidenceItem
          icon={<TriangleAlert size={17} />}
          title="Finding 01"
          detail="High · payment retry / guest checkout"
        />
        <EvidenceItem
          icon={<WandSparkles size={17} />}
          title="Healing record"
          detail="1 patch · 98.2% confidence · verified"
        />
      </div>
      <div className="evidence-table">
        <div className="evidence-table-head">
          <span>ARTIFACT</span>
          <span>TYPE</span>
          <span>STATUS</span>
          <span />
        </div>
        <EvidenceRow name="checkout-trace-1842.json" type="Agent trace" status="Ready" />
        <EvidenceRow name="failure-frame-01.png" type="Screenshot" status="Ready" />
        <EvidenceRow name="release-readiness.pdf" type="Report" status="Ready" />
      </div>
    </div>
  );
}

function EvidenceItem({ icon, title, detail }) {
  return (
    <article className="evidence-item">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <ChevronRight size={14} />
    </article>
  );
}
function EvidenceRow({ name, type, status }) {
  return (
    <div className="evidence-row">
      <span>
        <FileText size={14} /> {name}
      </span>
      <span>{type}</span>
      <b>
        <Check size={11} /> {status}
      </b>
      <button type="button" aria-label={`Download ${name}`}>
        <Download size={14} />
      </button>
    </div>
  );
}

function RunHistory() {
  return (
    <div className="workspace-view">
      <WorkspaceHeader
        eyebrow="HISTORY / ALL RUNS"
        title="Run history"
        detail="A record of every release signal generated for this project."
        action={
          <button className="workspace-action" type="button">
            Export history <Download size={14} />
          </button>
        }
      />
      <div className="history-panel">
        <div className="history-head">
          <span>RUN</span>
          <span>BRANCH</span>
          <span>RESULT</span>
          <span>WHEN</span>
        </div>
        <HistoryRow
          run="Release 1.4"
          branch="checkout-release"
          result="Ready"
          when="Today, 10:44 AM"
          score="92"
        />
        <HistoryRow
          run="Release 1.3"
          branch="checkout-release"
          result="Ready"
          when="Yesterday, 4:12 PM"
          score="88"
        />
        <HistoryRow
          run="Release 1.2"
          branch="main"
          result="Review"
          when="Aug 28, 11:07 AM"
          score="74"
        />
        <HistoryRow
          run="Release 1.1"
          branch="main"
          result="Ready"
          when="Aug 21, 9:31 AM"
          score="91"
        />
      </div>
    </div>
  );
}
function HistoryRow({ run, branch, result, when, score }) {
  return (
    <div className="history-row">
      <strong>
        {run}
        <small>{score}/100 signal</small>
      </strong>
      <span>{branch}</span>
      <b className={result === "Ready" ? "history-ready" : "history-review"}>{result}</b>
      <time>{when}</time>
      <ChevronRight size={14} />
    </div>
  );
}

export default Dashboard;
