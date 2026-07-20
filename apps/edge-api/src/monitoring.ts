import { z } from "zod";

import { fetchGitHubSnapshot, type GitHubAssetRequest } from "./github";
import { ApiError, domainError } from "./http";
import { snowflakeApi } from "./snowflake/client";

const monitorRowSchema = z.object({
  assetManifest: z.array(
    z.object({
      assetType: z.enum([
        "README",
        "INSTALL_GUIDE",
        "SUPPORT_MACRO",
        "TROUBLESHOOTING",
        "WORKFLOW",
      ]),
      criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      path: z.string(),
      title: z.string(),
    }),
  ),
  branchName: z.string(),
  checkIntervalMinutes: z.union([z.number(), z.string()]),
  monitorId: z.string(),
  name: z.string(),
  notificationEmail: z.string().nullable(),
  repositoryName: z.string(),
  repositoryOwner: z.string(),
  sourcePath: z.string(),
});

const notificationRowSchema = z.object({
  changeCount: z.union([z.number(), z.string()]).nullable(),
  checkId: z.string(),
  commitSha: z.string(),
  commitUrl: z.string(),
  confirmedCount: z.union([z.number(), z.string()]).nullable(),
  monitorName: z.string(),
  notificationEmail: z.string(),
  patchCount: z.union([z.number(), z.string()]).nullable(),
  repositoryName: z.string(),
  repositoryOwner: z.string(),
  runId: z.string().nullable(),
  runStatus: z.string().nullable(),
  sourcePath: z.string(),
  uncertainCount: z.union([z.number(), z.string()]).nullable(),
});

export type MonitorRow = z.infer<typeof monitorRowSchema>;

function trustedKey(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]/gu, " ").slice(0, 100);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function numeric(value: number | string | null): number {
  return value === null ? 0 : Number(value);
}

export async function captureMonitor(
  env: CloudflareBindings,
  monitor: MonitorRow,
  triggerType: "MANUAL" | "SCHEDULED",
  correlationId: string,
): Promise<Record<string, unknown>> {
  const snapshot = await fetchGitHubSnapshot({
    assets: [],
    branch: monitor.branchName,
    repositoryName: monitor.repositoryName,
    repositoryOwner: monitor.repositoryOwner,
    sourcePath: monitor.sourcePath,
  });
  const result = await snowflakeApi.ingestMonitor(env, {
    correlationId,
    idempotencyKey: trustedKey(),
    payloadJson: JSON.stringify({
      ...snapshot,
      assets: [],
      checkIntervalMinutes: Number(monitor.checkIntervalMinutes),
      monitorId: monitor.monitorId,
      name: monitor.name,
      notificationEmail: monitor.notificationEmail ?? "",
      repositoryName: monitor.repositoryName,
      repositoryOwner: monitor.repositoryOwner,
      sourcePath: monitor.sourcePath,
    }),
    triggerType,
  });
  const failure = domainError(result);
  if (failure) throw failure;
  return result;
}

export async function connectMonitor(
  env: CloudflareBindings,
  input: {
    assets: GitHubAssetRequest[];
    branch: string;
    checkIntervalMinutes: 720 | 1440;
    monitorId: string;
    name: string;
    notificationEmail: string;
    repositoryName: string;
    repositoryOwner: string;
    sourcePath: string;
  },
  correlationId: string,
): Promise<Record<string, unknown>> {
  const snapshot = await fetchGitHubSnapshot(input);
  const result = await snowflakeApi.ingestMonitor(env, {
    correlationId,
    idempotencyKey: trustedKey(),
    payloadJson: JSON.stringify({ ...input, ...snapshot }),
    triggerType: "CONNECT",
  });
  const failure = domainError(result);
  if (failure) throw failure;
  return result;
}

async function sendPendingNotifications(
  env: CloudflareBindings,
  correlationId: string,
): Promise<void> {
  const rawRows = await snowflakeApi.monitorNotifications(env, correlationId);
  for (const raw of rawRows) {
    const parsed = notificationRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const changeCount = numeric(row.changeCount);
    const confirmedCount = numeric(row.confirmedCount);
    const patchCount = numeric(row.patchCount);
    const uncertainCount = numeric(row.uncertainCount);
    const repository = `${row.repositoryOwner}/${row.repositoryName}`;
    const reviewUrl = `${env.APP_ORIGIN}/workspace/change`;
    const subject = cleanHeader(`Ripple found ${changeCount} changes in ${row.monitorName}`);
    const text = [
      `${row.monitorName} changed at ${row.commitSha.slice(0, 12)}.`,
      `${changeCount} material changes, ${confirmedCount} confirmed impacts, ${patchCount} repair proposals, ${uncertainCount} uncertain findings.`,
      `Source: ${row.commitUrl}`,
      `Review: ${reviewUrl}`,
    ].join("\n\n");
    const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:32px;color:#171713"><p style="color:#67675f">Ripple source monitor</p><h1 style="font-size:28px">${escapeHtml(row.monitorName)} changed.</h1><p><strong>${changeCount}</strong> material changes produced <strong>${confirmedCount}</strong> confirmed impacts and <strong>${patchCount}</strong> repair proposals.</p><p>${uncertainCount} findings remain uncertain for human review.</p><p><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:12px 18px;background:#191914;color:white;text-decoration:none;border-radius:999px">Review in Ripple</a></p><p style="font-size:13px;color:#67675f">${escapeHtml(repository)} · ${escapeHtml(row.sourcePath)} · <a href="${escapeHtml(row.commitUrl)}">commit ${escapeHtml(row.commitSha.slice(0, 12))}</a></p></div>`;
    try {
      await env.EMAIL.send({
        from: { email: "ripple@notify.grimnej.com", name: "Ripple" },
        html,
        subject,
        text,
        to: row.notificationEmail,
      });
      await snowflakeApi.markMonitorNotification(env, row.checkId, "SENT", correlationId);
    } catch {
      await snowflakeApi.markMonitorNotification(env, row.checkId, "FAILED", correlationId);
    }
  }
}

export async function runScheduledMonitoring(env: CloudflareBindings): Promise<void> {
  const correlationId = crypto.randomUUID();
  const dueRows = await snowflakeApi.dueMonitors(env, correlationId);
  for (const raw of dueRows) {
    const parsed = monitorRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    try {
      await captureMonitor(env, parsed.data, "SCHEDULED", correlationId);
    } catch (error) {
      console.error(
        JSON.stringify({
          code: error instanceof ApiError ? error.code : "SCHEDULED_MONITOR_FAILED",
          event: "scheduled_monitor_error",
          monitorId: parsed.data.monitorId,
        }),
      );
    }
  }
  await sendPendingNotifications(env, correlationId);
}

export function validateMonitorRow(value: unknown): MonitorRow {
  const result = monitorRowSchema.safeParse(value);
  if (!result.success) {
    throw new ApiError("MONITOR_INVALID", "The monitor configuration could not be loaded.", 502);
  }
  return result.data;
}
