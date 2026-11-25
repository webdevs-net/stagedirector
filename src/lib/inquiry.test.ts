import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Map([["host", "localhost:53100"]]) }));
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: (p: string) => p === "/Users/you/Sites/MariasPlace" };
});
vi.mock("./local/git", () => ({
  localPaths: () => ({ "netdevs-net/mariasplace": "/Users/you/Sites/MariasPlace" }),
  onLocalhost: async () => true,
}));

import { inquireStages } from "./inquiry";
import type { ProjectConfig } from "./types";

const config: ProjectConfig = {
  version: 1,
  name: "Maria's Place",
  branch: "main",
  stages: [
    { id: "local", name: "Local", url: "http://localhost:58410/", pushers: "none", trigger: "manual" },
    { id: "staging", name: "Staging", url: "https://staging.mariasplace.com/", pushers: "developers", trigger: "auto", runner: "ovh1" },
    { id: "live", name: "Live site", url: "https://mariasplace.com/", pushers: "code-owners", trigger: "manual", runner: "ovh1" },
  ],
};

describe("inquireStages", () => {
  it("probes each configured stage URL and attaches the local path", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("localhost")) return { status: 200 };
      if (url.includes("staging")) return { status: 401 };
      return { status: 200 };
    });
    const rows = await inquireStages("netdevs-net/mariasplace", config, fetcher);
    expect(rows).toHaveLength(3);
    expect(rows[0].localPath).toBe("/Users/you/Sites/MariasPlace");
    expect(rows[0].localPathExists).toBe(true);
    expect(rows[0].reachable).toBe(true);
    expect(rows[1].status).toBe(401);
    expect(rows[1].reachable).toBe(true); // stage answered
    expect(rows[1].runner).toBe("ovh1");
    expect(rows[2].reachable).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("reports unreachable when the fetch fails", async () => {
    const fetcher = vi.fn(async () => {
      throw Object.assign(new Error("boom"), { name: "TimeoutError" });
    });
    const rows = await inquireStages("netdevs-net/mariasplace", config, fetcher);
    expect(rows[1].reachable).toBe(false);
    expect(rows[1].detail).toMatch(/no answer/);
  });
});
