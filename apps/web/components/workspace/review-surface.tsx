"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CircleAlert,
  FileLock2,
  PencilLine,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { apiRequest, idempotencyKey } from "../../lib/api";
import { mutationResultSchema, patchDetailSchema, type PatchDetail } from "../../lib/contracts";
import { patchTransition, type PatchUiState } from "../../lib/patch-state";
import { EmptySurface, SurfaceError, SurfaceLoading } from "./surface-state";
import { surfaceError, type SurfaceProperties } from "./surface-types";

function humanize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function errorState(code: string): PatchUiState {
  if (code === "STALE_ASSET_VERSION") return "staleAsset";
  if (code === "STALE_PATCH_REVISION") return "stalePatch";
  if (code === "PATCH_ALREADY_DECIDED") return "alreadyDecided";
  if (code === "SESSION_REQUIRED") return "sessionExpired";
  return "humanRequired";
}

function detailState(detail: PatchDetail): PatchUiState {
  if (detail.status === "VERIFIED") return "verified";
  if (detail.status === "VERIFICATION_FAILED") return "verificationFailed";
  if (detail.status === "HUMAN_VERIFICATION_REQUIRED") return "humanRequired";
  if (detail.status === "APPLIED") return "applied";
  return "reviewReady";
}

export function ReviewSurface(properties: SurfaceProperties) {
  const queryClient = useQueryClient();
  const patches = useMemo(() => properties.patches.data ?? [], [properties.patches.data]);
  const [selectedPatchId, setSelectedPatchId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("patch"),
  );
  const patchId = useMemo(
    () =>
      patches.find((patch) => patch.patchId === selectedPatchId)?.patchId ??
      patches.find((patch) => patch.status === "REVIEW_REQUIRED")?.patchId ??
      patches[0]?.patchId,
    [patches, selectedPatchId],
  );
  const detail = useQuery({
    enabled: Boolean(patchId),
    queryKey: ["patch", patchId],
    queryFn: () => apiRequest(`/api/patches/${patchId}`, patchDetailSchema),
  });
  const [contentDraft, setContentDraft] = useState<string | null>(null);
  const [uiStateOverride, setUiStateOverride] = useState<PatchUiState | null>(null);
  const [message, setMessage] = useState("");

  const content = contentDraft ?? detail.data?.proposedContent ?? "";
  const uiState = uiStateOverride ?? (detail.data ? detailState(detail.data) : "loading");

  const revise = useMutation({
    mutationFn: (patch: PatchDetail) =>
      apiRequest(`/api/patches/${patch.patchId}/revise`, mutationResultSchema, {
        body: JSON.stringify({
          editedContent: content,
          expectedPatchRevision: patch.revision,
          expectedPatchRowVersion: patch.rowVersion,
          idempotencyKey: idempotencyKey(),
          reason: "Operator refined the proposed repair",
        }),
        method: "POST",
      }),
    onError: (error) => setMessage(error.message),
    onSuccess: async () => {
      setMessage("Revision saved to the authoritative patch record.");
      setContentDraft(null);
      setUiStateOverride(null);
      await detail.refetch();
    },
  });

  const verify = useMutation({
    mutationFn: ({ patch, rowVersion }: { patch: PatchDetail; rowVersion: number }) =>
      apiRequest(`/api/patches/${patch.patchId}/verify`, mutationResultSchema, {
        body: JSON.stringify({
          expectedPatchRowVersion: rowVersion,
          idempotencyKey: idempotencyKey(),
        }),
        method: "POST",
      }),
    onError: (error: Error & { code?: string }) => {
      setUiStateOverride(errorState(error.code ?? "UNKNOWN"));
      setMessage(error.message);
    },
    onSuccess: async (result, { patch }) => {
      setSelectedPatchId(patch.patchId);
      const next =
        result.status === "VERIFIED"
          ? "VERIFIED"
          : result.status === "VERIFICATION_FAILED"
            ? "VERIFY_FAILED"
            : "HUMAN_REQUIRED";
      setUiStateOverride((state) => patchTransition(state ?? uiState, next));
      setMessage(
        result.status === "VERIFIED"
          ? "Deterministic verification passed."
          : "The result needs human attention.",
      );
      await Promise.all([
        detail.refetch(),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["patches", properties.runId] }),
        queryClient.invalidateQueries({ queryKey: ["proof"] }),
      ]);
    },
  });

  const apply = useMutation({
    mutationFn: (patch: PatchDetail) =>
      apiRequest(`/api/patches/${patch.patchId}/apply`, mutationResultSchema, {
        body: JSON.stringify({
          approvedContent: content,
          expectedAssetVersionId: patch.currentVersionId,
          expectedPatchRevision: patch.revision,
          expectedPatchRowVersion: patch.rowVersion,
          idempotencyKey: idempotencyKey(),
          reason: "Operator approved evidence-backed repair",
        }),
        method: "POST",
      }),
    onError: (error: Error & { code?: string }) => {
      setUiStateOverride(errorState(error.code ?? "UNKNOWN"));
      setMessage(error.message);
    },
    onSuccess: (result, patch) => {
      const rowVersion = result.rowVersion;
      setUiStateOverride((state) =>
        patchTransition(patchTransition(state ?? uiState, "APPLIED"), "VERIFY"),
      );
      setMessage("New asset version created. Running deterministic checks.");
      if (rowVersion === undefined) {
        setUiStateOverride("humanRequired");
        setMessage(
          "The repair was applied, but verification needs a refreshed authoritative version.",
        );
        return;
      }
      verify.mutate({ patch, rowVersion });
    },
  });

  const reject = useMutation({
    mutationFn: (patch: PatchDetail) =>
      apiRequest(`/api/patches/${patch.patchId}/reject`, mutationResultSchema, {
        body: JSON.stringify({
          expectedPatchRevision: patch.revision,
          expectedPatchRowVersion: patch.rowVersion,
          idempotencyKey: idempotencyKey(),
          reason: "Operator rejected the proposed repair",
        }),
        method: "POST",
      }),
    onError: (error) => setMessage(error.message),
    onSuccess: async () => {
      setMessage("Repair rejected. No asset version was changed.");
      await Promise.all([
        detail.refetch(),
        queryClient.invalidateQueries({ queryKey: ["patches", properties.runId] }),
      ]);
    },
  });

  const error = surfaceError(properties) ?? (detail.error instanceof Error ? detail.error : null);
  if (properties.dashboard.isPending || properties.patches.isPending || detail.isPending)
    return <SurfaceLoading />;
  if (error)
    return (
      <SurfaceError
        error={error}
        retry={() => {
          void properties.patches.refetch();
          void detail.refetch();
        }}
      />
    );
  if (!patchId || !detail.data) {
    return (
      <EmptySurface
        body="Confirmed impacts will produce bounded repair proposals for human review."
        title="No repair is ready for review."
      />
    );
  }

  const patch = detail.data;
  const editable =
    ["reviewReady", "editing"].includes(uiState) && patch.status === "REVIEW_REQUIRED";
  const terminal = [
    "verified",
    "verificationFailed",
    "humanRequired",
    "staleAsset",
    "stalePatch",
    "alreadyDecided",
    "sessionExpired",
  ].includes(uiState);

  return (
    <div className="surface review-surface">
      <header className="surface-heading split-heading review-heading">
        <div>
          <p className="eyebrow">Repair proposal / {patch.patchId.slice(-8)}</p>
          <h1>
            Update the asset
            <br />
            without losing <em>truth.</em>
          </h1>
        </div>
        <div className="heading-status">
          <span>
            <ShieldCheck size={15} />
            {humanize(patch.status)}
          </span>
          <small>{patch.assetTitle}</small>
        </div>
      </header>

      <div className="review-grid">
        <section aria-labelledby="source-change-title" className="source-change panel">
          <header className="panel-header">
            <div>
              <span>01 / Source change</span>
              <h2 id="source-change-title">{humanize(patch.changeType)}</h2>
            </div>
            <FileLock2 size={18} />
          </header>
          <div className="source-lines">
            <div className="is-removed">
              <b>−</b>
              <p>{patch.oldClaim}</p>
              <small>Previous fact</small>
            </div>
            <div className="is-added">
              <b>+</b>
              <p>{patch.newClaim}</p>
              <small>Current fact</small>
            </div>
          </div>
          <footer>
            <span>
              <Check size={14} />
              Exact source span captured
            </span>
            <code>{patch.originalContentSha256.slice(0, 12)}…</code>
          </footer>
        </section>

        <section aria-labelledby="repair-editor-title" className="repair-editor panel">
          <header className="panel-header">
            <div>
              <span>02 / Approved content</span>
              <h2 id="repair-editor-title">{patch.assetTitle}</h2>
            </div>
            <span className="edit-state">
              <PencilLine size={14} />
              {editable ? "Editable" : "Locked"}
            </span>
          </header>
          <label className="sr-only" htmlFor="repair-content">
            Reviewed asset content
          </label>
          <textarea
            disabled={!editable}
            id="repair-content"
            onChange={(event) => {
              setContentDraft(event.target.value);
              setUiStateOverride((state) => patchTransition(state ?? uiState, "EDIT"));
            }}
            spellCheck="true"
            value={content}
          />
          <div className="content-delta">
            <span>Current version</span>
            <p>{patch.originalContent}</p>
          </div>
          <footer>
            <span>{content.length} characters</span>
            <span>
              <Check size={14} />
              Plain text, safely escaped
            </span>
          </footer>
        </section>

        <aside aria-labelledby="evidence-rail-title" className="evidence-rail panel">
          <header className="panel-header">
            <div>
              <span>03 / Evidence</span>
              <h2 id="evidence-rail-title">Why this is safe</h2>
            </div>
          </header>
          <ol>
            <li>
              <i>1</i>
              <p>
                <b>Source authority</b>
                <span>Validated source span</span>
                <small>Content hash locked</small>
              </p>
            </li>
            <li>
              <i>2</i>
              <p>
                <b>Causal relationship</b>
                <span>{humanize(patch.changeType)}</span>
                <small>{humanize(patch.severity)} severity</small>
              </p>
            </li>
            <li>
              <i>3</i>
              <p>
                <b>Deterministic check</b>
                <span>Expected: {patch.newClaim}</span>
                <small>Controls final status</small>
              </p>
            </li>
          </ol>
          <a href="/workspace/impact">
            Inspect complete evidence <ArrowRight size={15} />
          </a>
        </aside>
      </div>

      <section aria-live="polite" className={`apply-bar apply-bar--${uiState}`}>
        <div className="apply-proof">
          <span className="proof-seal">
            {uiState === "verified" ? <Check /> : terminal ? <CircleAlert /> : <FileLock2 />}
          </span>
          <p>
            <b>
              {uiState === "verified"
                ? "Repair applied and verified"
                : "Atomic, append-only repair"}
            </b>
            <span>
              {message ||
                "Approval creates a new asset version, content hash, review record, and audit event in one transaction."}
            </span>
          </p>
        </div>
        <div className="apply-actions">
          {editable && (
            <button
              className="text-button"
              disabled={reject.isPending}
              onClick={() => reject.mutate(patch)}
              type="button"
            >
              <X size={15} />
              Reject
            </button>
          )}
          {editable && content !== patch.proposedContent && (
            <button
              className="text-button"
              disabled={revise.isPending}
              onClick={() => revise.mutate(patch)}
              type="button"
            >
              <RotateCcw size={15} />
              Save revision
            </button>
          )}
          {editable && (
            <button
              className="button"
              disabled={apply.isPending || verify.isPending || content.trim().length === 0}
              onClick={() => {
                setUiStateOverride((state) => patchTransition(state ?? uiState, "APPLY"));
                apply.mutate(patch);
              }}
              type="button"
            >
              {apply.isPending || verify.isPending
                ? "Applying and verifying"
                : "Apply verified repair"}
              <ArrowRight size={16} />
            </button>
          )}
          {uiState === "verified" && (
            <a className="button" href="/workspace/proof">
              View technical proof <ArrowRight size={16} />
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
