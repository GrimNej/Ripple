"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowRight, Check, Clock3, ScanSearch } from "lucide-react";

import type { Finding, Monitor } from "../../lib/contracts";
import { MonitorPanel } from "./monitor-panel";
import { EmptySurface, SurfaceError, SurfaceLoading } from "./surface-state";
import { surfaceError, type SurfaceProperties } from "./surface-types";

function displayType(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function distinctChanges(findings: Finding[]): Finding[] {
  return [...new Map(findings.map((finding) => [finding.changeAtomId, finding])).values()];
}

export function CommandSurface(
  properties: SurfaceProperties & Readonly<{ monitors: UseQueryResult<Monitor[]> }>,
) {
  const error = surfaceError(properties);
  const retry = () => {
    void properties.dashboard.refetch();
    void properties.run.refetch();
    void properties.findings.refetch();
    void properties.patches.refetch();
  };

  if (properties.dashboard.isPending) return <SurfaceLoading />;
  if (error) return <SurfaceError error={error} retry={retry} />;
  if (!properties.dashboard.data) {
    return (
      <div className="surface command-surface">
        <MonitorPanel monitors={properties.monitors} />
        <EmptySurface
          body="Connect a source, capture its baseline, then check again after an authoritative fact changes."
          title="Your first live change map starts here."
        />
      </div>
    );
  }

  const dashboard = properties.dashboard.data;
  const findings = properties.findings.data ?? [];
  const changes = distinctChanges(findings);
  const patches = properties.patches.data ?? [];
  const activeMonitorCount =
    properties.monitors.data?.filter((monitor) => monitor.enabled).length ?? 0;
  const nextPatch = patches.find((patch) => patch.status === "REVIEW_REQUIRED") ?? patches[0];

  return (
    <div className="surface command-surface">
      <header className="surface-heading command-heading">
        <div>
          <p className="eyebrow">
            <span className="live-dot" />
            Latest source pair analyzed
          </p>
          <h1>
            {dashboard.changeCount} changes need
            <br />a clear <em>decision.</em>
          </h1>
          <p>Every count below comes from the current Snowflake run.</p>
        </div>
        <div className="source-health-summary">
          <span>
            {activeMonitorCount} live source{activeMonitorCount === 1 ? "" : "s"}
          </span>
          <b>Manual and automatic checks enabled</b>
        </div>
      </header>

      <MonitorPanel monitors={properties.monitors} />

      <section aria-label="Workspace summary" className="metric-strip">
        <article>
          <span>Material changes</span>
          <b>{String(dashboard.changeCount).padStart(2, "0")}</b>
          <small>Validated source atoms</small>
        </article>
        <article>
          <span>Confirmed impacts</span>
          <b>{String(dashboard.confirmedCount).padStart(2, "0")}</b>
          <small>Evidence-backed assets</small>
        </article>
        <article>
          <span>Awaiting decision</span>
          <b>{String(dashboard.reviewRequiredCount).padStart(2, "0")}</b>
          <small>Human review required</small>
        </article>
        <article>
          <span>Verified repairs</span>
          <b>{String(dashboard.verifiedPatchCount).padStart(2, "0")}</b>
          <small>
            <i className="metric-good" />
            Deterministic checks
          </small>
        </article>
      </section>

      <div className="command-grid">
        <section aria-labelledby="change-stack-title" className="change-stack panel">
          <header className="panel-header">
            <div>
              <span>Material change stack</span>
              <h2 id="change-stack-title">What moved</h2>
            </div>
            <a href="/workspace/change">
              Inspect event <ArrowRight size={15} />
            </a>
          </header>
          <div className="change-list">
            {changes.map((change, index) => {
              const impactCount = findings.filter(
                (finding) =>
                  finding.changeAtomId === change.changeAtomId && finding.status === "CONFIRMED",
              ).length;
              return (
                <a className="change-row" href="/workspace/impact" key={change.changeAtomId}>
                  <span className="change-index">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <small>{displayType(change.changeType)}</small>
                    <h3>
                      <del>{change.oldClaim}</del>
                      <ArrowRight size={14} />
                      <ins>{change.newClaim}</ins>
                    </h3>
                  </div>
                  <span className="impact-count">
                    <b>{impactCount}</b>confirmed
                  </span>
                  <span className="row-action">
                    Trace <ArrowRight size={14} />
                  </span>
                </a>
              );
            })}
          </div>
        </section>

        <aside aria-labelledby="decision-title" className="decision-panel panel">
          <header className="panel-header">
            <div>
              <span>Decision queue</span>
              <h2 id="decision-title">Needs your eye</h2>
            </div>
            <b>{dashboard.reviewRequiredCount}</b>
          </header>
          {nextPatch ? (
            <a
              className="decision-card"
              href={`/workspace/review?patch=${encodeURIComponent(nextPatch.patchId)}`}
            >
              <div>
                <span>{displayType(nextPatch.changeType)}</span>
                <Clock3 size={14} />
              </div>
              <h3>
                {nextPatch.oldClaim}
                <ArrowRight size={15} />
                {nextPatch.newClaim}
              </h3>
              <p>{nextPatch.assetTitle}</p>
              <footer>
                <span>
                  <ScanSearch size={14} />
                  {nextPatch.severity.toLowerCase()} impact
                </span>
                <b>
                  Review repair <ArrowRight size={14} />
                </b>
              </footer>
            </a>
          ) : (
            <div className="queue-clear">
              <Check />
              <b>Decision queue clear</b>
              <span>No repair currently needs review.</span>
            </div>
          )}
          <div className="run-state">
            <span>
              <i className={`state-dot state-dot--${dashboard.status.toLowerCase()}`} />
              {displayType(dashboard.status)}
            </span>
            <code>{dashboard.runId}</code>
          </div>
        </aside>
      </div>
    </div>
  );
}
