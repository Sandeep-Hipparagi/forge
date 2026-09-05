import { useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronDown,
  CircleDot,
  GitBranch,
  Menu,
  Play,
  ShieldCheck,
  Sparkles,
  Target,
  WandSparkles,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

const faqs = [
  ['Does Forge need my existing tests?', 'No. Forge can begin from a product URL and your release intent. Bring your current suite when you have one, then let the agents find the paths your assertions missed.'],
  ['Will it change my code or data?', 'Forge works against an isolated environment and proposes changes before applying them. Every healed locator includes the evidence behind the fix.'],
  ['What does a run actually produce?', 'You get an executable plan, coverage gaps, prioritized findings, healed locators, and a release-readiness report your team can share.'],
  ['Can my team review the agent decisions?', 'Yes. Every agent action is recorded with its input, reasoning signal, and outcome, so a human can accept, reject, or rerun any step.'],
]

function HomePage() {
  const [openFaq, setOpenFaq] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <main className="landing-page editorial-page">
      <nav className="site-nav" aria-label="Main navigation">
        <NavLink className="wordmark" to="/" aria-label="Forge home">
          <span className="wordmark-mark"><Sparkles size={16} strokeWidth={2.5} /></span>
          forge<span className="wordmark-dot">.</span>
        </NavLink>
        <div className="nav-links">
          <a href="#system">The system</a>
          <a href="#modules">Modules</a>
          <a href="#how-it-works">How it works</a>
          <a href="#faq">Questions</a>
        </div>
        <div className="nav-actions">
          <NavLink className="text-button no-underline" to="/login">Log in</NavLink>
          <NavLink className="nav-cta no-underline" to="/register">Start building <ArrowRight size={15} /></NavLink>
        </div>
        <button className="menu-button" type="button" onClick={() => setMenuOpen((isOpen) => !isOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <div className={`mobile-nav ${menuOpen ? 'is-open' : ''}`}>
          <a href="#system" onClick={closeMenu}>The system</a>
          <a href="#modules" onClick={closeMenu}>Modules</a>
          <a href="#how-it-works" onClick={closeMenu}>How it works</a>
          <a href="#faq" onClick={closeMenu}>Questions</a>
          <div className="mobile-nav-actions">
            <NavLink className="text-button no-underline" to="/login" onClick={closeMenu}>Log in</NavLink>
            <NavLink className="nav-cta no-underline" to="/register" onClick={closeMenu}>Start building <ArrowRight size={15} /></NavLink>
          </div>
        </div>
      </nav>

      <section className="editorial-hero" id="top">
        <div className="editorial-hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> AUTONOMOUS QUALITY WORKBENCH · EST. 2026</div>
          <h1>Your product is not a guess.<br /><em>Your coverage is.</em></h1>
          <p>Forge turns your product into a living test strategy. It explores the surface, prioritises the risk, and gives your team evidence before release day asks for it.</p>
          <div className="hero-actions">
            <NavLink className="primary-button no-underline" to="/register">Find your blind spots <ArrowRight size={17} /></NavLink>
            <a className="secondary-link" href="#how-it-works"><span className="play-icon"><Play size={12} fill="currentColor" /></span> See the system</a>
          </div>
          <div className="hero-note"><ShieldCheck size={14} /> No production access required. Start from an isolated preview.</div>
        </div>
        <div className="worked-example">
          <div className="specimen-label"><span>01</span> A WORKED EXAMPLE <span className="specimen-live"><CircleDot size={10} /> LIVE FROM THE ENGINE</span></div>
          <h2>A release candidate<br /><em>under inspection.</em></h2>
          <p className="specimen-copy">A checkout flow with 12 existing tests. Forge explores what happens between the steps your suite already knows.</p>
          <div className="specimen-metrics"><div><strong>47</strong><span>paths explored</span></div><div><strong>06</strong><span>agents working</span></div><div><strong>92</strong><span>coverage score</span></div></div>
          <div className="specimen-callout"><span className="callout-marker"><Target size={15} /></span><div><strong>One gap worth fixing</strong><span>Guest checkout loses state after a payment retry.</span></div><ArrowDownRight size={18} /></div>
          <div className="specimen-foot"><span><span className="pulse-dot" /> computed against build #1842</span><span>02m 14s</span></div>
        </div>
      </section>

      <section className="intro-section" id="system">
        <div className="section-kicker"><span>02</span> THE SYSTEM</div>
        <div className="intro-copy"><h2>Nobody ever showed you<br /><em>what the gaps cost.</em></h2><p>Most test suites describe the happy path. Forge connects the product surface to the release decision, so a missing state is not just a red row in a report. It is a risk your team can understand and close.</p></div>
      </section>

      <section className="gap-grid" aria-label="Common quality gaps">
        <article><span className="card-number">01</span><h3>You test the button,<br />not what happens after.</h3><strong>STATE LOSS</strong><p>Critical transitions disappear between assertions. Forge follows the state, not just the click.</p></article>
        <article><span className="card-number">02</span><h3>You ship the fix<br />without a second read.</h3><strong>REGRESSION RISK</strong><p>A healed locator is only useful when the behavior is still true. Forge verifies the repaired path.</p></article>
        <article><span className="card-number">03</span><h3>You know what failed,<br />not what matters most.</h3><strong>NO PRIORITY</strong><p>Coverage, severity, and user impact combine into the next best action instead of another queue.</p></article>
        <article><span className="card-number">04</span><h3>Your release report<br />arrives after release.</h3><strong>LATE SIGNAL</strong><p>Run the same quality read on every preview and see the decision while there is still time to act.</p></article>
      </section>

      <section className="dashboard-section">
        <div className="section-kicker"><span>03</span> ONE SCREEN</div>
        <div className="dashboard-heading"><h2>Every path knows<br /><em>where it belongs.</em></h2><p>Explore, prioritise, generate, heal. One run keeps the context between each move, so your team gets a decision instead of a pile of disconnected tools.</p></div>
        <div className="dashboard-specimen">
          <div className="dashboard-tabs"><span className="active">RELEASE READINESS</span><span>FINDINGS <b>03</b></span><span>AGENT LOG</span><span className="dashboard-build">BUILD #1842 <CircleDot size={10} /></span></div>
          <div className="dashboard-content">
            <div className="dashboard-score"><span className="micro-label">CURRENT SIGNAL</span><div className="large-score">92<span>/100</span></div><strong>Ready with one decision</strong><p>2 critical paths need review before the branch can merge.</p><div className="score-bar"><span /></div></div>
            <div className="dashboard-list"><div className="list-heading"><span>ACTIVE FINDINGS</span><span>SEVERITY</span></div><div className="finding-row"><span className="finding-icon orange"><Target size={14} /></span><div><strong>Payment retry loses cart state</strong><small>checkout / guest / retry</small></div><b className="severity-high">HIGH</b></div><div className="finding-row"><span className="finding-icon green"><Check size={14} /></span><div><strong>Locator healed and re-verified</strong><small>account / profile / save</small></div><b className="severity-low">CLOSED</b></div><div className="finding-row"><span className="finding-icon blue"><GitBranch size={14} /></span><div><strong>Mobile menu untested at 320px</strong><small>navigation / responsive</small></div><b className="severity-medium">MEDIUM</b></div><button className="dashboard-link" type="button">Open full report <ArrowRight size={14} /></button></div>
          </div>
        </div>
      </section>

      <section className="modules-section" id="modules">
        <div className="section-kicker"><span>04</span> THE MODULES</div>
        <div className="modules-intro"><h2>Six instruments.<br /><em>One release signal.</em></h2><p>Every capability is useful by itself. The point is what happens when the same evidence moves through all of them.</p></div>
        <div className="module-grid"><Module icon={<WandSparkles size={18} />} number="04.1" title="Explore" text="Map the product surface and the states your suite never named." /><Module icon={<Target size={18} />} number="04.2" title="Prioritise" text="Rank findings by user impact, confidence, and release risk." /><Module icon={<GitBranch size={18} />} number="04.3" title="Generate" text="Turn intent into readable, executable scenarios." /><Module icon={<Sparkles size={18} />} number="04.4" title="Heal" text="Repair locators with evidence, then verify the behavior again." /><Module icon={<ShieldCheck size={18} />} number="04.5" title="Critique" text="Find shallow assertions and blind spots before they become incidents." /><Module icon={<Check size={18} />} number="04.6" title="Report" text="Hand the team one clear release decision with the proof behind it." /></div>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="section-kicker"><span>05</span> HOW IT WORKS</div>
        <h2>Ten minutes now,<br /><em>fewer surprises later.</em></h2>
        <div className="process-grid"><Process number="01" title="Give it the surface" text="Connect a preview URL, your test intent, and the environments that matter." /><Process number="02" title="Watch the evidence" text="Agents explore in parallel and keep every observation attached to the path." /><Process number="03" title="Make the call" text="Review the prioritized report, fix what matters, and rerun the changed paths." /></div>
      </section>

      <section className="price-section">
        <div><div className="section-kicker"><span>06</span> THE PROMISE</div><h2>Every release.<br /><em>More certainty.</em></h2></div>
        <div className="price-copy"><p>Forge is built to give small teams the kind of quality signal that usually arrives after a production incident. Start with a preview, keep your evidence, and bring the whole team into the decision.</p><div className="promise-list"><span><Check size={14} /> Preview-first by default</span><span><Check size={14} /> Human review at every gate</span><span><Check size={14} /> Reports your team can keep</span></div><NavLink className="inline-link strong-link no-underline" to="/register">Start your first run <ArrowRight size={15} /></NavLink></div>
      </section>

      <section className="faq-section" id="faq">
        <div className="section-kicker"><span>07</span> QUESTIONS</div>
        <div className="faq-heading"><h2>The questions teams<br /><em>ask first.</em></h2><p>Short answers for the decisions that matter before you give an agent access to your work.</p></div>
        <div className="faq-list">{faqs.map(([question, answer], index) => <div className={`faq-item ${openFaq === index ? 'is-open' : ''}`} key={question}><button type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><span>{question}</span><ChevronDown size={18} /></button>{openFaq === index && <p>{answer}</p>}</div>)}</div>
      </section>

      <section className="final-cta"><div className="section-kicker"><span>ONE LAST CHECK</span></div><h2>Ship the thing<br /><em>you meant to ship.</em></h2><p>Start with one preview and see what your current suite cannot.</p><NavLink className="primary-button no-underline" to="/register">Build your first run <ArrowRight size={17} /></NavLink><div className="cta-tags"><span>NO PRODUCTION ACCESS</span><span>HUMAN REVIEW</span><span>KEEP YOUR REPORTS</span></div></section>
      <footer className="site-footer"><NavLink className="wordmark" to="/"><span className="wordmark-mark"><Sparkles size={14} /></span> forge<span className="wordmark-dot">.</span></NavLink><span>Autonomous quality for ambitious teams.</span><span>© 2026 Forge</span></footer>
    </main>
  )
}

function Module({ icon, number, title, text }) {
  return <article className="module-card"><span className="module-icon">{icon}</span><span className="module-number">{number}</span><h3>{title}</h3><p>{text}</p><ArrowRight size={15} /></article>
}

function Process({ number, title, text }) {
  return <article className="process-card"><span>{number}</span><h3>{title}</h3><p>{text}</p></article>
}

export default HomePage
