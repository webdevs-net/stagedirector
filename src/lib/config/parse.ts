import { parse as parseYaml } from "yaml";
import type { ProjectConfig } from "@/lib/types";
import { projectConfigSchema } from "./schema";

export class ConfigError extends Error {
  constructor(message: string, readonly issues: string[]) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Parse and validate the text of a stagedirector.yml file. Throws ConfigError. */
export function parseConfig(text: string): ProjectConfig {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (e) {
    throw new ConfigError(`stagedirector.yml is not valid YAML: ${(e as Error).message}`, []);
  }
  const result = projectConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new ConfigError(`stagedirector.yml has ${issues.length} problem(s)`, issues);
  }
  return result.data;
}

/** Same as parseConfig but returns a result instead of throwing. */
export function safeParseConfig(
  text: string,
): { ok: true; config: ProjectConfig } | { ok: false; error: string; issues: string[] } {
  try {
    return { ok: true, config: parseConfig(text) };
  } catch (e) {
    const err = e as ConfigError;
    return { ok: false, error: err.message, issues: err.issues ?? [] };
  }
}

export function stageIndex(config: ProjectConfig, stageId: string): number {
  return config.stages.findIndex((s) => s.id === stageId);
}
