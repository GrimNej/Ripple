import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchGitHubSnapshot, parseGitHubRepositoryUrl } from "../src/github";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("bounded GitHub source connector", () => {
  it("accepts only a complete public GitHub repository URL", () => {
    expect(parseGitHubRepositoryUrl("https://github.com/GrimNej/ripple-source-lab")).toEqual({
      repositoryName: "ripple-source-lab",
      repositoryOwner: "GrimNej",
    });
    expect(() => parseGitHubRepositoryUrl("https://example.com/GrimNej/repo")).toThrow(
      "Enter a public GitHub repository URL.",
    );
  });

  it("pins every selected file to the same resolved commit", async () => {
    const commitSha = "a".repeat(40);
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { default_branch: "main" },
          { headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            commit: { committer: { date: "2026-07-20T12:00:00Z" } },
            html_url: `https://github.com/GrimNej/repo/commit/${commitSha}`,
            sha: commitSha,
          },
          { headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response("# Runtime\n\nPython 3.12 is required."))
      .mockResolvedValueOnce(new Response("# Install\n\nUse Python 3.10."));
    globalThis.fetch = upstream;

    const snapshot = await fetchGitHubSnapshot({
      assets: [
        {
          assetType: "INSTALL_GUIDE",
          criticality: "HIGH",
          path: "knowledge/install.md",
          title: "Install guide",
        },
      ],
      branch: "main",
      repositoryName: "repo",
      repositoryOwner: "GrimNej",
      sourcePath: "authoritative/runtime.md",
    });

    expect(snapshot.commitSha).toBe(commitSha);
    expect(snapshot.assets[0]?.content).toContain("Python 3.10");
    expect(
      upstream.mock.calls
        .slice(2)
        .every((call) => typeof call[0] === "string" && call[0].includes(`ref=${commitSha}`)),
    ).toBe(true);
  });
});
