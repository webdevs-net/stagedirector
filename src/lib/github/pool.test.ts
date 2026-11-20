import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, routeOf } from "./pool";

describe("routeOf", () => {
  it("drops owners, ids, shas and paths", () => {
    expect(routeOf("get", "https://api.github.com/repos/a/b/deployments/123/statuses?per_page=1")).toBe("GET /repos/{owner}/{repo}/deployments/{id}/statuses");
    expect(routeOf("GET", "https://api.github.com/repos/a/b/commits/" + "f".repeat(40) + "/statuses")).toBe("GET /repos/{owner}/{repo}/commits/{sha}/statuses");
    expect(routeOf("GET", "https://api.github.com/repos/a/b/contents/x/y.yml")).toBe("GET /repos/{owner}/{repo}/contents/{path}");
    expect(routeOf("GET", "https://api.github.com/repos/a/b/collaborators/ryan/permission")).toBe("GET /repos/{owner}/{repo}/collaborators/{username}/permission");
    expect(routeOf("POST", "https://api.github.com/app/installations/42/access_tokens")).toBe("POST /app/installations/{id}/access_tokens");
  });
});

describe("Pool over a real socket", () => {
  let base = "";
  let used = 0;
  const server = createServer((req, res) => {
    used++;
    const headers: Record<string, string> = { "content-type": "application/json", "x-ratelimit-limit": "5000", "x-ratelimit-remaining": String(5000 - used), "x-ratelimit-used": String(used), "x-ratelimit-reset": "9999999999", "x-ratelimit-resource": "core" };
    if (req.headers["if-none-match"]) { res.writeHead(304, headers); res.end(); return; }
    if (req.url?.includes("missing")) { res.writeHead(404, headers); res.end("{}"); return; }
    res.writeHead(200, headers);
    res.end("{}");
  });
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("counts every request, by identity, and reuses one connection", async () => {
    const p = new Pool();
    const app = p.fetchAs("app");
    for (let i = 0; i < 5; i++) await (await app(`${base}/repos/o/r/deployments?n=${i}`)).text();
    await (await app(`${base}/repos/o/r/deployments`, { headers: { "if-none-match": "x" } })).text();
    await (await p.fetchAs("person")(`${base}/repos/o/r/missing`)).text();
    const s = p.summary();
    expect(s.sent).toBe(7);
    expect(s.notModified).toBe(1);
    expect(s.counted).toBe(6);
    expect(s.rows.find((r) => r.identity === "app")).toMatchObject({ route: "GET /repos/{owner}/{repo}/deployments", sent: 6, notModified: 1 });
    expect(s.rows.find((r) => r.identity === "person")).toMatchObject({ failed: 1 });
    expect(s.connectionsOpened).toBeGreaterThan(0);
    expect(s.connectionsOpened).toBeLessThanOrEqual(2); // 7 requests, kept-alive connections reused
    expect(s.budgets.find((b) => b.key === "app:core")?.used).toBe(6);
    await p.agent.close();
  });
});
