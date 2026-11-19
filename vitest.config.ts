import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "server-only": fileURLToPath(new URL("./src/lib/github/testing/server-only-stub.ts", import.meta.url)), "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node", env: { STAGEDIRECTOR_GITHUB_PER_MINUTE: "100000" } },
});
