import { z } from "zod";
import type { ProjectConfig } from "@/lib/types";

const stageId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "stage id must be lowercase letters, digits or dashes");

export const stageSchema = z
  .object({
    id: stageId,
    name: z.string().min(1),
    url: z.string().url().optional(),
    pushers: z.enum(["developers", "code-owners", "none"]),
    trigger: z.enum(["auto", "manual"]),
    deploy: z.string().min(1).optional(),
    rollback: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    smokeTest: z.array(z.string().startsWith("/")).optional(),
    runner: z.string().min(1).optional(),
  })
  .strict()
  .refine((s) => s.pushers === "none" || !!s.deploy, {
    message: "a stage people can push to needs a deploy command",
    path: ["deploy"],
  });

export const projectConfigSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),
    group: z.string().min(1).optional(),
    kind: z.string().min(1).optional(),
    branch: z.string().min(1).default("main"),
    stages: z.array(stageSchema).min(1),
    tools: z
      .object({
        clearCache: z.string().min(1).optional(),
        syncCheck: z.string().min(1).optional(),
        copyLiveToStaging: z.string().min(1).optional(),
        snapshot: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    liveTodo: z.array(z.string()).optional(),
    noDowntime: z.boolean().optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    cfg.stages.forEach((s, i) => {
      if (seen.has(s.id)) {
        ctx.addIssue({ code: "custom", message: `duplicate stage id "${s.id}"`, path: ["stages", i, "id"] });
      }
      seen.add(s.id);
    });
    const last = cfg.stages[cfg.stages.length - 1];
    if (cfg.stages.length > 1 && last.pushers === "developers") {
      ctx.addIssue({
        code: "custom",
        message: "the last stage must be pushed by code owners (or nobody)",
        path: ["stages", cfg.stages.length - 1, "pushers"],
      });
    }
  });

// Compile-time check that the schema output fits the shared type.
type Parsed = z.infer<typeof projectConfigSchema>;
export const _typecheck: (p: Parsed) => ProjectConfig = (p) => p;
