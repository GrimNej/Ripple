"use client";

import { ArrowRight, Check, CircleDashed, Clock3, FileText, ShieldCheck } from "lucide-react";

import type { Finding } from "../../lib/contracts";
import { EmptySurface, SurfaceError, SurfaceLoading } from "./surface-state";
import { surfaceError, type SurfaceProperties } from "./surface-types";

function changesFrom(findings: Finding[]): Finding[] {
  return [...new Map(findings.map((finding) => [finding.changeAtomId, finding])).values()];
}

function humanize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

export function ChangeSurface(properties: SurfaceProperties) {
  const error = surfaceError(properties);
  const retry = () => {
    void properties.dashboard.refetch();
    void properties.run.refetch();
    void properties.findings.refetch();
  };

  if (properties.dashboard.isPending || (properties.runId && properties.run.isPending))
    return <SurfaceLoading />;
  if (error) return <SurfaceError error={error} retry={retry} />;
  if (!properties.runId || !properties.run.data) {
    return (
      <EmptySurface
        body="Run a source comparison before inspecting its evidence and pipeline stages."
        title="No change event is active."
      />
    );
  }

  const { run, stages } = properties.run.data;
  const changes = changesFrom(properties.findings.data ?? []);

  return (
    <div className="surface change-surface">
      <header className="surface-heading split-heading">
        <div>
          <p className="eyebrow">Change event / {run.runId.slice(-8)}</p>
          <h1>
            One source moved.
            <br />
            <em>The trail is exact.</em>
          </h1>
        </div>
        <div className="heading-status">
          <span>
            <i className={`state-dot state-dot--${run.status.toLowerCase()}`} />
            {humanize(run.status)}
          </span>
          <small>Started {new Date(run.createdAt).toLocaleString()}</small>
        </div>
      </header>

      <section aria-labelledby="pipeline-title" className="pipeline-band">
        <header>
          <span>Pipeline state</span>
          <h2 id="pipeline-title">From source pair to repair candidates</h2>
        </header>
        <ol>
          {stages
            .filter((stage) => stage.stageName)
            .map((stage, index) => (
              <li
                className={`stage stage--${stage.stageStatus?.toLowerCase() ?? "queued"}`}
                key={`${stage.stageName}-${index}`}
              >
                <span>
                  {stage.stageStatus === "SUCCEEDED" || stage.stageStatus === "COMPLETED" ? (
                    <Check />
                  ) : (
                    <CircleDashed />
                  )}
                </span>
                <div>
                  <b>{humanize(stage.stageName ?? "queued")}</b>
                  <small>Attempt {stage.attemptCount ?? 0}</small>
                </div>
              </li>
            ))}
        </ol>
      </section>

      <div className="change-layout">
        <section aria-labelledby="source-diff-title" className="source-diff panel">
          <header className="panel-header">
            <div>
              <span>Source diff</span>
              <h2 id="source-diff-title">Validated factual changes</h2>
            </div>
            <span className="evidence-lock">
              <ShieldCheck size={15} />
              Evidence locked
            </span>
          </header>
          <div className="diff-stack">
            {changes.map((change, index) => (
              <article className="diff-block" key={change.changeAtomId}>
                <header>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <b>{humanize(change.changeType)}</b>
                  <small>{change.severity.toLowerCase()} severity</small>
                </header>
                <div className="diff-line diff-line--old">
                  <b>−</b>
                  <p>{change.oldClaim}</p>
                  <small>Previous source</small>
                </div>
                <div className="diff-line diff-line--new">
                  <b>+</b>
                  <p>{change.newClaim}</p>
                  <small>Current source</small>
                </div>
                <footer>
                  <span>
                    <FileText size={14} />
                    Exact span verified
                  </span>
                  <code>{change.changeAtomId.slice(0, 18)}…</code>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <aside aria-labelledby="event-summary-title" className="event-summary panel">
          <header className="panel-header">
            <div>
              <span>Event summary</span>
              <h2 id="event-summary-title">What the run proved</h2>
            </div>
          </header>
          <dl>
            <div>
              <dt>Material changes</dt>
              <dd>{run.changeCount}</dd>
            </div>
            <div>
              <dt>Confirmed impacts</dt>
              <dd>{run.confirmedCount}</dd>
            </div>
            <div>
              <dt>Uncertain</dt>
              <dd>{run.uncertainCount}</dd>
            </div>
            <div>
              <dt>Rejected candidates</dt>
              <dd>{run.rejectedCount}</dd>
            </div>
          </dl>
          <div className="event-note">
            <Clock3 size={16} />
            <p>
              <b>Persisted state</b>
              <span>Refresh-safe run status and stage history come directly from Snowflake.</span>
            </p>
          </div>
          <a className="button" href="/workspace/impact">
            Trace downstream impact <ArrowRight size={16} />
          </a>
        </aside>
      </div>
    </div>
  );
}
