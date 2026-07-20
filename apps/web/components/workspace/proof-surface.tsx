"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Check,
  Coins,
  Database,
  Fingerprint,
  History,
  ShieldCheck,
} from "lucide-react";

import { apiRequest } from "../../lib/api";
import { patchDetailSchema, type Proof } from "../../lib/contracts";
import { EmptySurface, SurfaceError, SurfaceLoading } from "./surface-state";
import { surfaceError, type SurfaceProperties } from "./surface-types";

function humanize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

type ProofSurfaceProperties = SurfaceProperties & Readonly<{ proof: UseQueryResult<Proof> }>;

export function ProofSurface(properties: ProofSurfaceProperties) {
  const verifiedPatch =
    (properties.patches.data ?? []).find((patch) => patch.status === "VERIFIED") ??
    (properties.patches.data ?? []).find((patch) => patch.appliedAssetVersionId);
  const patchDetail = useQuery({
    enabled: Boolean(verifiedPatch),
    queryKey: ["patch", verifiedPatch?.patchId],
    queryFn: () => apiRequest(`/api/patches/${verifiedPatch?.patchId}`, patchDetailSchema),
  });
  const error =
    surfaceError(properties) ??
    (properties.proof.error instanceof Error ? properties.proof.error : null) ??
    (patchDetail.error instanceof Error ? patchDetail.error : null);

  if (properties.dashboard.isPending || properties.proof.isPending) return <SurfaceLoading />;
  if (error)
    return (
      <SurfaceError
        error={error}
        retry={() => {
          void properties.proof.refetch();
          void patchDetail.refetch();
        }}
      />
    );
  if (!properties.proof.data || !properties.run.data) {
    return (
      <EmptySurface
        body="Technical proof appears after the governed pipeline has produced authoritative state."
        title="No verification record is available."
      />
    );
  }

  const proof = properties.proof.data;
  const detail = patchDetail.data;
  const stages = properties.run.data.stages.filter((stage) => stage.stageName);

  return (
    <div className="surface proof-surface">
      <header className="surface-heading split-heading">
        <div>
          <p className="eyebrow">Verification and technical proof</p>
          <h1>
            The repair leaves
            <br />a <em>provable trail.</em>
          </h1>
        </div>
        <div className="heading-status">
          <span>
            <ShieldCheck size={15} />
            Audit head {proof.auditHeadValid === 1 ? "valid" : "requires attention"}
          </span>
          <small>Deterministic state from Snowflake</small>
        </div>
      </header>

      <section aria-label="Technical proof summary" className="proof-ribbon">
        <article>
          <span>
            <Database />
            Migrations applied
          </span>
          <b>{proof.appliedMigrationCount}</b>
          <small>Versioned schema history</small>
        </article>
        <article>
          <span>
            <History />
            Audit events
          </span>
          <b>{proof.auditEventCount}</b>
          <small>Append-only application chain</small>
        </article>
        <article>
          <span>
            <Check />
            Verified repairs
          </span>
          <b>{proof.verifiedPatchCount}</b>
          <small>Deterministic checks passed</small>
        </article>
        <article>
          <span>
            <Coins />
            AI calls today
          </span>
          <b>
            {proof.admittedAiCallCount}
            <sup>/2</sup>
          </b>
          <small>Development admission cap</small>
        </article>
      </section>

      <div className="proof-layout">
        <section aria-labelledby="verification-record-title" className="verification-record panel">
          <header className="panel-header">
            <div>
              <span>Verification record</span>
              <h2 id="verification-record-title">Immutable result</h2>
            </div>
            <Fingerprint size={19} />
          </header>
          {detail ? (
            <div className="record-body">
              <div className="verification-seal">
                <span>
                  <Check />
                </span>
                <p>
                  <b>{humanize(detail.verificationStatus ?? detail.status)}</b>
                  <small>Deterministic verifier</small>
                </p>
              </div>
              <dl>
                <div>
                  <dt>New asset version</dt>
                  <dd>
                    <code>{detail.appliedAssetVersionId ?? "Pending"}</code>
                  </dd>
                </div>
                <div>
                  <dt>Content SHA-256</dt>
                  <dd>
                    <code>{detail.currentContentSha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Verification ID</dt>
                  <dd>
                    <code>{detail.verificationId ?? "Pending"}</code>
                  </dd>
                </div>
                <div>
                  <dt>Asset</dt>
                  <dd>{detail.assetTitle}</dd>
                </div>
              </dl>
              <p className="record-note">
                <ShieldCheck size={15} />
                The model advisory cannot set this status. Only deterministic checks control
                verification.
              </p>
            </div>
          ) : (
            <div className="record-empty">
              <Activity />
              <b>No applied repair yet</b>
              <span>Review one proposal to create an immutable verification record.</span>
              <a href="/workspace/review">
                Open patch review <ArrowRight size={14} />
              </a>
            </div>
          )}
        </section>

        <section aria-labelledby="task-history-title" className="task-history panel">
          <header className="panel-header">
            <div>
              <span>Snowflake task history</span>
              <h2 id="task-history-title">One governed pipeline</h2>
            </div>
            <Activity size={18} />
          </header>
          <ol>
            {stages.map((stage, index) => (
              <li key={`${stage.stageName}-${index}`}>
                <span>
                  {stage.stageStatus === "SUCCEEDED" || stage.stageStatus === "COMPLETED" ? (
                    <Check />
                  ) : (
                    <Activity />
                  )}
                </span>
                <div>
                  <b>{humanize(stage.stageName ?? "queued")}</b>
                  <small>
                    {humanize(stage.stageStatus ?? "queued")} · attempt {stage.attemptCount ?? 0}
                  </small>
                </div>
                <time>
                  {stage.completedAt
                    ? new Date(stage.completedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Active"}
                </time>
              </li>
            ))}
          </ol>
        </section>

        <aside aria-labelledby="governance-title" className="governance-panel panel">
          <header className="panel-header">
            <div>
              <span>Governance</span>
              <h2 id="governance-title">Bounded by design</h2>
            </div>
          </header>
          <ul>
            <li>
              <Check />
              <span>
                <b>{proof.frozenLabelCount} frozen labels</b>Authored before model execution
              </span>
            </li>
            <li>
              <Check />
              <span>
                <b>{proof.successfulAiRunCount} successful AI runs</b>Structured output with
                evidence validation
              </span>
            </li>
            <li>
              <Check />
              <span>
                <b>{proof.taskProofCount} task proofs</b>Persisted execution history
              </span>
            </li>
            <li>
              <Check />
              <span>
                <b>One human decision</b>No automatic patch publication
              </span>
            </li>
          </ul>
          <a href="/workspace">
            Return to Command Center <ArrowRight size={14} />
          </a>
        </aside>
      </div>
    </div>
  );
}
