"use client";

import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Bell, Check, CirclePause, CirclePlay, GitBranch, Plus, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";

import { apiRequest } from "../../lib/api";
import { monitorSchema, mutationResultSchema, type Monitor } from "../../lib/contracts";

type AssetDraft = {
  assetType: "README" | "INSTALL_GUIDE" | "SUPPORT_MACRO" | "TROUBLESHOOTING" | "WORKFLOW";
  criticality: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  path: string;
  title: string;
};

const blankAsset = (): AssetDraft => ({
  assetType: "README",
  criticality: "HIGH",
  path: "",
  title: "",
});

export function MonitorPanel({ monitors }: Readonly<{ monitors: UseQueryResult<Monitor[]> }>) {
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [interval, setInterval] = useState<720 | 1440>(1440);
  const [assets, setAssets] = useState<AssetDraft[]>([blankAsset()]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["monitors"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };

  const connect = useMutation({
    mutationFn: () =>
      apiRequest("/api/monitors", mutationResultSchema, {
        body: JSON.stringify({
          assets,
          branch,
          checkIntervalMinutes: interval,
          name,
          notificationEmail,
          repositoryUrl,
          sourcePath,
        }),
        method: "POST",
      }),
    onSuccess: async () => {
      setMessage("Baseline captured. Change the authoritative file on GitHub, then check now.");
      setOpen(false);
      setName("");
      setRepositoryUrl("");
      setBranch("");
      setSourcePath("");
      setNotificationEmail("");
      setAssets([blankAsset()]);
      await refresh();
    },
  });

  const check = useMutation({
    mutationFn: (monitor: Monitor) =>
      apiRequest(`/api/monitors/${monitor.monitorId}/check`, mutationResultSchema, {
        body: "{}",
        method: "POST",
      }),
    onSuccess: async (result) => {
      setMessage(
        result.status === "NO_CHANGE"
          ? "Source checked. The authoritative commit has not changed."
          : "Change detected. Ripple started tracing every downstream consequence.",
      );
      await refresh();
    },
  });

  const toggle = useMutation({
    mutationFn: (monitor: Monitor) =>
      apiRequest(`/api/monitors/${monitor.monitorId}/state`, mutationResultSchema, {
        body: JSON.stringify({ enabled: !monitor.enabled, expectedRowVersion: monitor.rowVersion }),
        method: "POST",
      }),
    onSuccess: refresh,
  });

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    connect.mutate();
  }

  function updateAsset(index: number, patch: Partial<AssetDraft>) {
    setAssets((current) =>
      current.map((asset, candidateIndex) =>
        candidateIndex === index ? { ...asset, ...patch } : asset,
      ),
    );
  }

  const rows = monitors.data ?? [];
  return (
    <section aria-labelledby="monitor-title" className="monitor-panel panel">
      <header className="panel-header monitor-header">
        <div>
          <span>Authoritative source monitors</span>
          <h2 id="monitor-title">Keep knowledge current</h2>
        </div>
        <button className="button" onClick={() => setOpen(true)} type="button">
          <Plus size={16} /> Connect source
        </button>
      </header>

      {message && (
        <p className="monitor-message" role="status">
          <Check size={16} /> {message}
        </p>
      )}
      {check.error && (
        <p className="form-error" role="alert">
          {check.error.message}
        </p>
      )}

      {monitors.isPending ? (
        <div aria-label="Loading source monitors" className="monitor-loading" role="status">
          <i />
          <i />
          <i />
          <span className="sr-only">Loading source monitors</span>
        </div>
      ) : monitors.error ? (
        <div className="monitor-empty" role="alert">
          <GitBranch />
          <div>
            <b>Sources could not be loaded</b>
            <span>{monitors.error.message}</span>
          </div>
          <button className="text-button" onClick={() => void monitors.refetch()} type="button">
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="monitor-empty">
          <GitBranch />
          <div>
            <b>No live sources connected</b>
            <span>
              Connect a public GitHub repository, its authoritative file, and the knowledge files
              that depend on it.
            </span>
          </div>
        </div>
      ) : (
        <div className="monitor-grid">
          {rows.map((monitor) => {
            const isChecking = check.isPending && check.variables.monitorId === monitor.monitorId;
            const isToggling = toggle.isPending && toggle.variables.monitorId === monitor.monitorId;
            return (
              <article className="monitor-card" key={monitor.monitorId}>
                <header>
                  <span className={`monitor-pulse ${monitor.enabled ? "is-live" : ""}`} />
                  <div>
                    <b>{monitor.name}</b>
                    <a
                      href={`https://github.com/${monitor.repositoryOwner}/${monitor.repositoryName}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {monitor.repositoryOwner}/{monitor.repositoryName}
                    </a>
                  </div>
                  <span>{monitor.enabled ? "Monitoring" : "Paused"}</span>
                </header>
                <dl>
                  <div>
                    <dt>Authoritative file</dt>
                    <dd>{monitor.sourcePath}</dd>
                  </div>
                  <div>
                    <dt>Knowledge scope</dt>
                    <dd>
                      {monitor.assetManifest.length} file
                      {monitor.assetManifest.length === 1 ? "" : "s"}
                    </dd>
                  </div>
                  <div>
                    <dt>Last checked</dt>
                    <dd>
                      {monitor.lastCheckedAt
                        ? new Date(monitor.lastCheckedAt).toLocaleString()
                        : "Not checked"}
                    </dd>
                  </div>
                  <div>
                    <dt>Current commit</dt>
                    <dd>{monitor.lastCommitSha?.slice(0, 12) ?? "Pending"}</dd>
                  </div>
                </dl>
                <footer>
                  <span>
                    <Bell size={14} /> Every{" "}
                    {monitor.checkIntervalMinutes === 720 ? "12 hours" : "day"}
                  </span>
                  <div>
                    <button
                      aria-label={
                        monitor.enabled ? `Pause ${monitor.name}` : `Resume ${monitor.name}`
                      }
                      className="icon-button"
                      disabled={isToggling}
                      onClick={() => toggle.mutate(monitor)}
                      type="button"
                    >
                      {monitor.enabled ? <CirclePause /> : <CirclePlay />}
                    </button>
                    <button
                      className="button button--compact"
                      disabled={!monitor.enabled || isChecking}
                      onClick={() => check.mutate(monitor)}
                      type="button"
                    >
                      <RefreshCw className={isChecking ? "is-spinning" : ""} />
                      {isChecking ? "Checking" : "Check now"}
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <dialog
        aria-labelledby="connect-title"
        className="monitor-modal"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        ref={dialogRef}
      >
        <form className="monitor-form" onSubmit={submit}>
          <header>
            <div>
              <span>New source monitor</span>
              <h2 id="connect-title">Connect GitHub</h2>
              <p>
                Tell Ripple which file defines the truth and which knowledge files depend on it.
              </p>
            </div>
            <button aria-label="Close source setup" onClick={() => setOpen(false)} type="button">
              <X />
            </button>
          </header>
          <div className="monitor-form-grid">
            <label>
              Monitor name
              <input onChange={(event) => setName(event.target.value)} required value={name} />
            </label>
            <label>
              Public GitHub repository
              <input
                onChange={(event) => setRepositoryUrl(event.target.value)}
                placeholder="https://github.com/owner/repository"
                required
                type="url"
                value={repositoryUrl}
              />
            </label>
            <label>
              Branch
              <input
                onChange={(event) => setBranch(event.target.value)}
                placeholder="Default branch"
                value={branch}
              />
            </label>
            <label>
              Authoritative Markdown file
              <input
                onChange={(event) => setSourcePath(event.target.value)}
                placeholder="authoritative/runtime-policy.md"
                required
                value={sourcePath}
              />
            </label>
            <label>
              Alert email, optional
              <input
                onChange={(event) => setNotificationEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                value={notificationEmail}
              />
            </label>
            <label>
              Automatic checks
              <select
                onChange={(event) => setInterval(Number(event.target.value) as 720 | 1440)}
                value={interval}
              >
                <option value={720}>Every 12 hours</option>
                <option value={1440}>Every 24 hours</option>
              </select>
            </label>
          </div>

          <section className="asset-builder">
            <header>
              <div>
                <span>Downstream knowledge</span>
                <b>Files Ripple should protect</b>
              </div>
              <button
                disabled={assets.length >= 8}
                onClick={() => setAssets((current) => [...current, blankAsset()])}
                type="button"
              >
                <Plus /> Add file
              </button>
            </header>
            {assets.map((asset, index) => (
              <div className="asset-row" key={index}>
                <input
                  aria-label={`Knowledge file ${index + 1} path`}
                  onChange={(event) => updateAsset(index, { path: event.target.value })}
                  placeholder="knowledge/install-guide.md"
                  required
                  value={asset.path}
                />
                <input
                  aria-label={`Knowledge file ${index + 1} title`}
                  onChange={(event) => updateAsset(index, { title: event.target.value })}
                  placeholder="Install guide"
                  required
                  value={asset.title}
                />
                <select
                  aria-label={`Knowledge file ${index + 1} type`}
                  onChange={(event) =>
                    updateAsset(index, {
                      assetType: event.target.value as AssetDraft["assetType"],
                    })
                  }
                  value={asset.assetType}
                >
                  <option value="README">README</option>
                  <option value="INSTALL_GUIDE">Install guide</option>
                  <option value="SUPPORT_MACRO">Support response</option>
                  <option value="TROUBLESHOOTING">Troubleshooting</option>
                  <option value="WORKFLOW">Workflow</option>
                </select>
                <select
                  aria-label={`Knowledge file ${index + 1} criticality`}
                  onChange={(event) =>
                    updateAsset(index, {
                      criticality: event.target.value as AssetDraft["criticality"],
                    })
                  }
                  value={asset.criticality}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
                <button
                  aria-label={`Remove knowledge file ${index + 1}`}
                  disabled={assets.length === 1}
                  onClick={() =>
                    setAssets((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                  type="button"
                >
                  <X />
                </button>
              </div>
            ))}
          </section>

          {connect.error && (
            <p className="form-error" role="alert">
              {connect.error.message}
            </p>
          )}
          <footer>
            <button className="text-button" onClick={() => setOpen(false)} type="button">
              Cancel
            </button>
            <button className="button" disabled={connect.isPending} type="submit">
              {connect.isPending ? "Capturing baseline" : "Connect and capture baseline"}
              <GitBranch />
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}

export const monitorListSchema = monitorSchema.array();
