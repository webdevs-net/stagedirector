// Starts the fake GitHub API for the browser tests (GitHub mode).
// Node >= 22.18 runs the TypeScript file directly (type stripping).
import { FakeGitHub, seedTestRepo } from "../src/lib/github/testing/fake-github.ts";

const port = Number(process.env.FAKE_GITHUB_PORT ?? 53190);
const fake = new FakeGitHub();
seedTestRepo(fake, "acme/site");
await fake.start(port);
console.log(`fake GitHub on ${fake.url}`);
