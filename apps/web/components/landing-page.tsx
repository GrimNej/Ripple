"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, ChevronDown, Fingerprint, GitBranch, ScanSearch } from "lucide-react";

import { Brand } from "./brand";

const pillars = [
  {
    body: "Every conclusion carries the source and asset spans that justify it.",
    icon: ScanSearch,
    index: "01",
    title: "Evidence attached",
  },
  {
    body: "Nothing is rewritten until a person reviews the exact proposed change.",
    icon: Fingerprint,
    index: "02",
    title: "Humans decide",
  },
  {
    body: "Deterministic checks, content hashes, and the audit chain prove the result.",
    icon: GitBranch,
    index: "03",
    title: "Every repair verified",
  },
] as const;

export function LandingPage() {
  const reducedMotion = useReducedMotion();

  return (
    <main className="landing" id="main-content">
      <div aria-hidden="true" className="grain" />
      <nav aria-label="Primary navigation" className="landing-nav">
        <Brand />
        <div className="landing-nav__links">
          <a href="#product">Product</a>
          <a href="#principles">Principles</a>
          <a href="#security">Trust</a>
        </div>
        <a className="button button--small" href="/workspace">
          Enter workspace <ArrowRight aria-hidden="true" size={15} />
        </a>
      </nav>

      <section className="hero">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="hero-copy"
          initial={reducedMotion ? false : { opacity: 0, y: 20 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="eyebrow">
            <span className="live-dot" />
            Change intelligence, end to end
          </p>
          <h1>
            Nothing downstream
            <br />
            breaks in <em>silence.</em>
          </h1>
          <p className="hero-copy__body">
            Ripple traces authoritative changes through the knowledge your business depends on, then
            turns exact evidence into controlled, verifiable repair.
          </p>
          <div className="hero-actions">
            <a className="button" href="/workspace">
              Enter workspace <ArrowRight aria-hidden="true" size={17} />
            </a>
            <a className="text-action" href="#product">
              See the signal path <ChevronDown aria-hidden="true" size={17} />
            </a>
          </div>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          aria-label="A source change flowing into mapped impacts and verified repairs"
          className="product-scene"
          id="product"
          initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 28 }}
          transition={{ delay: reducedMotion ? 0 : 0.12, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        >
          <svg aria-hidden="true" className="ripple-field" viewBox="0 0 720 720">
            <defs>
              <linearGradient id="signal-line" x1="0" x2="1">
                <stop stopColor="#ff735c" />
                <stop offset=".54" stopColor="#ffc36e" />
                <stop offset="1" stopColor="#a8ffd8" />
              </linearGradient>
            </defs>
            <circle cx="360" cy="360" r="292" />
            <circle cx="360" cy="360" r="224" />
            <circle cx="360" cy="360" r="154" />
            <path
              className="ripple-field__signal"
              d="M74 382 C167 254 232 487 329 348 S499 216 645 356"
            />
          </svg>
          <div aria-hidden="true" className="scene-halo" />
          <article className="product-window">
            <header className="window-bar">
              <span className="window-brand">
                <span aria-hidden="true" className="brand-mark brand-mark--mini">
                  <i />
                  <i />
                  <i />
                </span>
                Ripple
              </span>
              <span className="window-state">
                <i />
                Source monitored
              </span>
              <span aria-hidden="true" className="window-menu">
                •••
              </span>
            </header>
            <div className="window-body">
              <div className="window-title">
                <span>Change detected</span>
                <time>09:42</time>
              </div>
              <h2>
                Runtime policy moved
                <br />
                to Python 3.12
              </h2>
              <div aria-label="Change pipeline" className="mini-flow">
                <div className="mini-flow__step is-done">
                  <i>
                    <Check size={14} />
                  </i>
                  <span>
                    Source<b>Confirmed</b>
                  </span>
                </div>
                <div className="mini-flow__line is-live" />
                <div className="mini-flow__step is-live">
                  <i>06</i>
                  <span>
                    Impacts<b>Mapped</b>
                  </span>
                </div>
                <div className="mini-flow__line" />
                <div className="mini-flow__step">
                  <i>03</i>
                  <span>
                    Repairs<b>Ready</b>
                  </span>
                </div>
              </div>
              <a className="window-cta" href="/workspace/impact">
                <span>Review material impact</span>
                <b>6 assets</b>
                <ArrowRight aria-hidden="true" size={17} />
              </a>
            </div>
          </article>
          <div aria-hidden="true" className="float-card float-card--source">
            <span>Authoritative source</span>
            <b>Runtime requirements</b>
            <i>Evidence captured</i>
          </div>
          <div aria-hidden="true" className="float-card float-card--verified">
            <Check size={18} />
            <span>
              <b>Repair verified</b>
              <small>Hash and audit recorded</small>
            </span>
          </div>
        </motion.div>
      </section>

      <section aria-label="Product guarantees" className="principles" id="principles">
        {pillars.map(({ body, icon: Icon, index, title }) => (
          <article key={title}>
            <div>
              <span>{index}</span>
              <Icon aria-hidden="true" size={21} />
            </div>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="trust-statement" id="security">
        <p className="eyebrow">Control stays human</p>
        <h2>
          Trace the consequence.
          <br />
          <em>Choose the repair.</em>
          <br />
          Prove the outcome.
        </h2>
        <p>
          Ripple keeps evidence, decisions, asset versions, and verification in one governed path.
          The model can advise. Only deterministic checks can mark a repair verified.
        </p>
        <a className="button button--light" href="/workspace">
          Open your workspace <ArrowRight size={17} />
        </a>
      </section>

      <footer className="landing-footer">
        <Brand />
        <p>Change one fact. See every consequence.</p>
        <span>Evidence-led change intelligence</span>
      </footer>
    </main>
  );
}
