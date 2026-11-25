import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig, safeParseConfig } from "./parse";

const example = readFileSync(join(process.cwd(), "examples/mariasplace.stagedirector.yml"), "utf8");

describe("parseConfig", () => {
  it("parses the Maria's Place example", () => {
    const cfg = parseConfig(example);
    expect(cfg.name).toBe("Maria's Place");
    expect(cfg.branch).toBe("main");
    expect(cfg.stages.map((s) => s.id)).toEqual(["local", "staging", "live"]);
    expect(cfg.stages[2].pushers).toBe("code-owners");
    expect(cfg.stages[1].smokeTest).toContain("/login/");
    expect(cfg.tools?.clearCache).toBe("scripts/clear-cache.sh");
    expect(cfg.tools?.copyLiveToStaging).toBe("scripts/copy-live-to-staging.sh");
    expect(cfg.liveTodo?.[0]).toMatch(/backup/i);
  });

  it("defaults branch to main", () => {
    const cfg = parseConfig(`version: 1\nname: X\nstages:\n  - {id: local, name: Local, pushers: none, trigger: manual}\n`);
    expect(cfg.branch).toBe("main");
  });

  it("rejects bad YAML", () => {
    expect(() => parseConfig("version: [1")).toThrow(ConfigError);
  });

  it("rejects unknown version, keys and duplicate stages", () => {
    const r = safeParseConfig(
      `version: 2\nname: X\nbranch: main\nfoo: 1\nstages:\n  - {id: a, name: A, pushers: none, trigger: manual}\n  - {id: a, name: B, pushers: none, trigger: manual}\n`,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.join("\n")).toMatch(/version/);
      expect(r.issues.join("\n")).toMatch(/foo/);
    }
    const d = safeParseConfig(
      `version: 1\nname: X\nstages:\n  - {id: a, name: A, pushers: none, trigger: manual}\n  - {id: a, name: B, pushers: none, trigger: manual}\n`,
    );
    expect(!d.ok && d.issues.join("\n")).toMatch(/duplicate stage id/);
  });

  it("refuses a last stage that developers can push", () => {
    const r = safeParseConfig(
      `version: 1\nname: X\nbranch: main\nstages:\n  - {id: staging, name: S, pushers: developers, trigger: auto, deploy: d}\n  - {id: live, name: L, pushers: developers, trigger: manual, deploy: d}\n`,
    );
    expect(r.ok).toBe(false);
  });

  it("requires a deploy command on pushable stages", () => {
    const r = safeParseConfig(
      `version: 1\nname: X\nbranch: main\nstages:\n  - {id: live, name: L, pushers: code-owners, trigger: manual}\n`,
    );
    expect(r.ok).toBe(false);
  });

  it("parses the Loquio app example (type app, no host, longer runs)", () => {
    const cfg = parseConfig(readFileSync(join(process.cwd(), "examples/loquio.stagedirector.yml"), "utf8"));
    expect(cfg.type).toBe("app");
    expect(cfg.host).toBe("none");
    expect(cfg.timeoutMinutes).toBe(300);
    expect(cfg.stages.map((s) => s.name)).toEqual(["Loquio Dev", "Beta", "Released"]);
  });

  it("refuses an unknown host, type or a timeout over 6 hours", () => {
    const base = `version: 1\nname: X\nstages:\n  - {id: local, name: Local, pushers: none, trigger: manual}\n`;
    expect(safeParseConfig(base + "host: ovh1\n").ok).toBe(false);
    expect(safeParseConfig(base + "type: game\n").ok).toBe(false);
    expect(safeParseConfig(base + "timeoutMinutes: 400\n").ok).toBe(false);
    expect(safeParseConfig(base + "timeoutMinutes: 360\n").ok).toBe(true);
  });
});
