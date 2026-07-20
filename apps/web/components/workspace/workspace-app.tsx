"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Check,
  FileDiff,
  Fingerprint,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";

import { apiRequest, clearCsrfToken, saveCsrfToken } from "../../lib/api";
import {
  dashboardSchema,
  findingSchema,
  loginSchema,
  logoutSchema,
  monitorSchema,
  proofSchema,
  runDetailSchema,
  runPatchSchema,
  runProvenanceSchema,
  sessionStatusSchema,
} from "../../lib/contracts";
import { Brand } from "../brand";
import { ChangeSurface } from "./change-surface";
import { CommandSurface } from "./command-surface";
import { ImpactSurface } from "./impact-surface";
import { ProofSurface } from "./proof-surface";
import { ReviewSurface } from "./review-surface";

export type WorkspaceSurface = "command" | "change" | "impact" | "review" | "proof";

const surfaceMeta: Record<
  WorkspaceSurface,
  { label: string; href: string; icon: typeof Activity }
> = {
  command: { label: "Command Center", href: "/workspace", icon: LayoutDashboard },
  change: { label: "Change Event", href: "/workspace/change", icon: FileDiff },
  impact: { label: "Impact View", href: "/workspace/impact", icon: Network },
  review: { label: "Patch Review", href: "/workspace/review", icon: ScanSearch },
  proof: { label: "Verification", href: "/workspace/proof", icon: ShieldCheck },
};

type WorkspaceAppProperties = Readonly<{ surface: WorkspaceSurface }>;

function LoginGate({ onAuthenticated }: Readonly<{ onAuthenticated: () => void }>) {
  const [accessCode, setAccessCode] = useState("");
  const login = useMutation({
    mutationFn: () =>
      apiRequest("/api/auth/login", loginSchema, {
        body: JSON.stringify({ accessCode }),
        method: "POST",
      }),
    onSuccess: (session) => {
      saveCsrfToken(session.csrfToken);
      setAccessCode("");
      onAuthenticated();
    },
  });

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accessCode) login.mutate();
  }

  return (
    <main className="auth-page" id="main-content">
      <div aria-hidden="true" className="grain" />
      <a className="auth-back" href="/">
        Back to ripple.grimnej.com
      </a>
      <section aria-labelledby="auth-title" className="auth-card">
        <Brand />
        <div className="auth-signal" aria-hidden="true">
          <i />
          <i />
          <i />
          <span />
        </div>
        <p className="eyebrow">Private workspace</p>
        <h1 id="auth-title">Enter the signal room.</h1>
        <p>Use your operator access code to review evidence and authorize repairs.</p>
        <form onSubmit={submit}>
          <label htmlFor="access-code">Operator access code</label>
          <input
            autoComplete="current-password"
            autoFocus
            id="access-code"
            name="access-code"
            onChange={(event) => setAccessCode(event.target.value)}
            required
            type="password"
            value={accessCode}
          />
          {login.error && (
            <p className="form-error" role="alert">
              {login.error.message}
            </p>
          )}
          <button className="button" disabled={login.isPending} type="submit">
            {login.isPending ? "Verifying access" : "Enter workspace"}
            <ArrowRight size={16} />
          </button>
        </form>
        <small>
          <Fingerprint size={15} />
          Short-lived session. Exact origin and CSRF protected.
        </small>
      </section>
    </main>
  );
}

function AppSkeleton() {
  return (
    <div aria-label="Loading workspace" className="app-skeleton" role="status">
      <div />
      <div />
      <div />
      <div />
      <span className="sr-only">Loading workspace</span>
    </div>
  );
}

function WorkspaceFrame({
  children,
  surface,
}: Readonly<{ children: ReactNode; surface: WorkspaceSurface }>) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const logout = useMutation({
    mutationFn: () => apiRequest("/api/auth/logout", logoutSchema, { method: "POST" }),
    onSettled: async () => {
      clearCsrfToken();
      await queryClient.invalidateQueries();
    },
  });

  return (
    <main className="workspace" id="main-content">
      <div aria-hidden="true" className="grain" />
      <button
        aria-expanded={menuOpen}
        aria-label="Toggle workspace navigation"
        className="mobile-menu"
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        {menuOpen ? <X /> : <Menu />}
      </button>
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
        <Brand compact />
        <nav aria-label="Workspace navigation">
          {(
            Object.entries(surfaceMeta) as [
              WorkspaceSurface,
              (typeof surfaceMeta)[WorkspaceSurface],
            ][]
          ).map(([key, item]) => {
            const Icon = item.icon;
            return (
              <a
                aria-current={surface === key ? "page" : undefined}
                aria-label={item.label}
                className={surface === key ? "is-active" : ""}
                href={item.href}
                key={key}
                onClick={() => setMenuOpen(false)}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        <button aria-label="Sign out" onClick={() => logout.mutate()} type="button">
          <LogOut />
          <span>Sign out</span>
        </button>
      </aside>
      <div className="workspace-shell">
        <header className="workspace-topbar">
          <div>
            <span>Ripple workspace</span>
            <b>/</b>
            <strong>{surfaceMeta[surface].label}</strong>
          </div>
          <div>
            <span className="health">
              <i />
              System connected
            </span>
            <span className="operator">GN</span>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

export function WorkspaceApp({ surface }: WorkspaceAppProperties) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => apiRequest("/api/session", sessionStatusSchema),
    retry: false,
  });

  useEffect(() => {
    document.title = `${surfaceMeta[surface].label} | Ripple`;
  }, [surface]);

  if (session.isPending) return <AppSkeleton />;
  if (session.isError || !session.data.authenticated) {
    return (
      <LoginGate
        onAuthenticated={() => void queryClient.invalidateQueries({ queryKey: ["session"] })}
      />
    );
  }

  return (
    <WorkspaceFrame surface={surface}>
      <WorkspaceData surface={surface} />
    </WorkspaceFrame>
  );
}

function WorkspaceData({ surface }: WorkspaceAppProperties) {
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiRequest("/api/dashboard", dashboardSchema),
  });
  const runId = dashboard.data?.runId;
  const run = useQuery({
    enabled: Boolean(runId),
    queryKey: ["run", runId],
    queryFn: () => apiRequest(`/api/runs/${runId}`, runDetailSchema),
    refetchInterval: (query) => {
      if (document.visibilityState === "hidden") return false;
      const status = query.state.data?.run.status;
      return status && !["COMPLETED", "FAILED"].includes(status) ? 2000 : false;
    },
  });
  const findings = useQuery({
    enabled: Boolean(runId),
    queryKey: ["findings", runId],
    queryFn: () => apiRequest(`/api/runs/${runId}/findings`, findingSchema.array()),
  });
  const patches = useQuery({
    enabled: Boolean(runId),
    queryKey: ["patches", runId],
    queryFn: () => apiRequest(`/api/runs/${runId}/patches`, runPatchSchema.array()),
  });
  const proof = useQuery({
    enabled: surface === "proof",
    queryKey: ["proof"],
    queryFn: () => apiRequest("/api/proof", proofSchema),
  });
  const provenance = useQuery({
    enabled: Boolean(runId) && surface === "change",
    queryKey: ["provenance", runId],
    queryFn: () => apiRequest(`/api/runs/${runId}/provenance`, runProvenanceSchema),
  });
  const monitors = useQuery({
    enabled: surface === "command",
    queryKey: ["monitors"],
    queryFn: () => apiRequest("/api/monitors", monitorSchema.array()),
  });

  const common = { dashboard, findings, patches, provenance, run, runId };
  if (surface === "command") return <CommandSurface {...common} monitors={monitors} />;
  if (surface === "change") return <ChangeSurface {...common} />;
  if (surface === "impact") return <ImpactSurface {...common} />;
  if (surface === "review") return <ReviewSurface {...common} />;
  return <ProofSurface {...common} proof={proof} />;
}

export function StatusIcon({ status }: Readonly<{ status: string }>) {
  if (["COMPLETED", "CONFIRMED", "VERIFIED", "SUCCEEDED"].includes(status))
    return <Check aria-hidden="true" />;
  if (["UNCERTAIN", "HUMAN_REQUIRED"].includes(status)) return <Sparkles aria-hidden="true" />;
  return <GitBranch aria-hidden="true" />;
}
