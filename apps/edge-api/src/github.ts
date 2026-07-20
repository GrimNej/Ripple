import { z } from "zod";

import { ApiError } from "./http";

const API_ROOT = "https://api.github.com";
const MAX_SOURCE_BYTES = 1_048_576;
const MAX_ASSET_BYTES = 262_144;
const MAX_METADATA_BYTES = 65_536;
const githubRepositorySchema = z.object({ default_branch: z.string().min(1).max(100) });
const githubCommitSchema = z.object({
  commit: z.object({ committer: z.object({ date: z.string() }).nullable() }),
  html_url: z.url(),
  sha: z.string().regex(/^[0-9a-f]{40}$/u),
});

export type GitHubAssetRequest = {
  assetType: "README" | "INSTALL_GUIDE" | "SUPPORT_MACRO" | "TROUBLESHOOTING" | "WORKFLOW";
  criticality: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  path: string;
  title: string;
};

export type GitHubMonitorRequest = {
  assets: GitHubAssetRequest[];
  branch: string;
  repositoryOwner: string;
  repositoryName: string;
  sourcePath: string;
};

export type GitHubSnapshot = {
  assets: (GitHubAssetRequest & { content: string; contentSha256: string })[];
  branch: string;
  commitSha: string;
  commitUrl: string;
  committedAt: string;
  sourceContent: string;
  sourceSha256: string;
};

function githubHeaders(accept = "application/vnd.github+json"): Headers {
  return new Headers({
    Accept: accept,
    "User-Agent": "ripple-change-monitor/1.0",
    "X-GitHub-Api-Version": "2026-03-10",
  });
}

async function boundedText(response: Response, maximum: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maximum || response.body === null) {
    throw new ApiError("GITHUB_CONTENT_TOO_LARGE", "The selected file is too large.", 413);
  }
  const rawReader: unknown = response.body.getReader();
  const reader = rawReader as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new ApiError("GITHUB_CONTENT_TOO_LARGE", "The selected file is too large.", 413);
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new ApiError("GITHUB_CONTENT_INVALID", "The selected file is not UTF-8 text.", 422);
  }
}

async function githubJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", headers: githubHeaders() });
  if (response.status === 403 || response.status === 429) {
    throw new ApiError(
      "GITHUB_RATE_LIMITED",
      "GitHub temporarily limited source checks.",
      429,
      true,
    );
  }
  if (response.status === 404) {
    throw new ApiError("GITHUB_NOT_FOUND", "The repository, branch, or file was not found.", 404);
  }
  if (!response.ok) {
    throw new ApiError(
      "GITHUB_UNAVAILABLE",
      "GitHub could not complete the source check.",
      502,
      true,
    );
  }
  const text = await boundedText(response, MAX_METADATA_BYTES);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      "GITHUB_INVALID_RESPONSE",
      "GitHub returned an invalid response.",
      502,
      true,
    );
  }
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function githubContent(
  owner: string,
  repository: string,
  path: string,
  commitSha: string,
  maximum: number,
): Promise<{ content: string; contentSha256: string }> {
  const endpoint = `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?ref=${encodeURIComponent(commitSha)}`;
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: githubHeaders("application/vnd.github.raw+json"),
  });
  if (response.status === 404) {
    throw new ApiError("GITHUB_FILE_NOT_FOUND", `GitHub file not found: ${path}`, 404);
  }
  if (response.status === 403 || response.status === 429) {
    throw new ApiError(
      "GITHUB_RATE_LIMITED",
      "GitHub temporarily limited source checks.",
      429,
      true,
    );
  }
  if (!response.ok) {
    throw new ApiError("GITHUB_UNAVAILABLE", "GitHub could not read the selected file.", 502, true);
  }
  const content = await boundedText(response, maximum);
  return { content, contentSha256: await sha256Text(content) };
}

export async function fetchGitHubSnapshot(request: GitHubMonitorRequest): Promise<GitHubSnapshot> {
  const repositoryEndpoint = `${API_ROOT}/repos/${encodeURIComponent(request.repositoryOwner)}/${encodeURIComponent(request.repositoryName)}`;
  const repositoryResult = githubRepositorySchema.safeParse(await githubJson(repositoryEndpoint));
  if (!repositoryResult.success) {
    throw new ApiError(
      "GITHUB_INVALID_RESPONSE",
      "GitHub returned an invalid response.",
      502,
      true,
    );
  }
  const repository = repositoryResult.data;
  const branch = request.branch || repository.default_branch;
  const commitEndpoint = `${repositoryEndpoint}/commits/${encodeURIComponent(branch)}`;
  const commitResult = githubCommitSchema.safeParse(await githubJson(commitEndpoint));
  if (!commitResult.success) {
    throw new ApiError(
      "GITHUB_INVALID_RESPONSE",
      "GitHub returned an invalid response.",
      502,
      true,
    );
  }
  const commit = commitResult.data;
  const source = await githubContent(
    request.repositoryOwner,
    request.repositoryName,
    request.sourcePath,
    commit.sha,
    MAX_SOURCE_BYTES,
  );
  const assets: GitHubSnapshot["assets"] = [];
  for (const asset of request.assets) {
    const fetched = await githubContent(
      request.repositoryOwner,
      request.repositoryName,
      asset.path,
      commit.sha,
      MAX_ASSET_BYTES,
    );
    assets.push({ ...asset, ...fetched });
  }
  return {
    assets,
    branch,
    commitSha: commit.sha,
    commitUrl: commit.html_url,
    committedAt: commit.commit.committer?.date ?? new Date().toISOString(),
    sourceContent: source.content,
    sourceSha256: source.contentSha256,
  };
}

export function parseGitHubRepositoryUrl(value: string): {
  repositoryName: string;
  repositoryOwner: string;
} {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError("INVALID_GITHUB_REPOSITORY", "Enter a valid GitHub repository URL.", 422);
  }
  const parts = url.pathname
    .replace(/\.git$/u, "")
    .split("/")
    .filter(Boolean);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || parts.length !== 2) {
    throw new ApiError("INVALID_GITHUB_REPOSITORY", "Enter a public GitHub repository URL.", 422);
  }
  const [repositoryOwner, repositoryName] = parts;
  if (!repositoryOwner || !repositoryName) {
    throw new ApiError("INVALID_GITHUB_REPOSITORY", "Enter a public GitHub repository URL.", 422);
  }
  return { repositoryName, repositoryOwner };
}
