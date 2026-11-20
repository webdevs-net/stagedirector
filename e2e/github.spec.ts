import { expect, test, type APIRequestContext } from "@playwright/test";

// GitHub mode against the fake GitHub API (e2e/fake-github-server.mjs), signed in as "owner" (a code owner).
const FAKE = "http://127.0.0.1:53190";
const P = "/p/acme~site";
const ctl = (r: APIRequestContext, what: string, extra = "") => r.post(`${FAKE}/_fake/${what}?repo=acme/site${extra}`);

/** Waits until the dashboard has dispatched a run with this action and stage; returns it. */
async function dispatched(r: APIRequestContext, action: string, stage: string) {
  let run: { id?: number; inputs?: Record<string, string> } = {};
  await expect
    .poll(async () => {
      run = await (await r.get(`${FAKE}/_fake/latest?repo=acme/site`)).json();
      return run.inputs ? `${run.inputs.action} ${run.inputs.stage}` : "";
    }, { timeout: 15_000 })
    .toBe(`${action} ${stage}`);
  return run;
}

test.beforeEach(async ({ request }) => {
  await ctl(request, "reset");
});

test("reads the project, its stages and waiting PRs from GitHub", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Test Site").first()).toBeVisible();
  await page.goto(P);
  await expect(page.getByRole("heading", { name: "Test Site" })).toBeVisible();
  await expect(page.getByText("New contact page")).toBeVisible();
  await expect(page.getByRole("group").getByText("Fix footer links", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("owner · code owner")).toBeVisible();
});

test("update staging follows the real run step by step to the end", async ({ page, request }) => {
  await page.goto(P);
  await page.getByRole("button", { name: /Update staging from (the )?main( branch)?/ }).click();
  const win = page.getByRole("complementary", { name: "Runs in progress" });
  await expect(win.getByText(/Updating staging/)).toBeVisible();
  const run = await dispatched(request, "deploy", "staging");
  expect(run.inputs).toMatchObject({ commit: "04".repeat(20), requested_by: "owner" });
  await ctl(request, "step", "&n=9");
  await expect(win.getByText("Copying files")).toBeVisible();
  await ctl(request, "finish");
  await expect(win.getByText("Staging updated")).toBeVisible();
});

test("Stop cancels the run on GitHub", async ({ page, request }) => {
  await page.goto(P);
  await page.getByRole("button", { name: /Update staging from (the )?main( branch)?/ }).click();
  const win = page.getByRole("complementary", { name: "Runs in progress" });
  await dispatched(request, "deploy", "staging");
  await ctl(request, "step");
  await expect(win.getByRole("button", { name: "Stop" })).toBeVisible();
  // Right after the click the window shows a "starting" run that cannot be stopped yet;
  // press Stop until GitHub reports the real run cancelled.
  const stop = win.getByRole("button", { name: "Stop" });
  const conclusion = async () => (await (await request.get(`${FAKE}/_fake/latest?repo=acme/site`)).json()).conclusion;
  await expect(async () => {
    if (await stop.isVisible()) await stop.click();
    await expect.poll(conclusion, { timeout: 3_000 }).toBe("cancelled");
  }).toPass({ timeout: 20_000 });
  await expect(win.getByText("Stopped — nothing changed")).toBeVisible();
});

test("the technical log shows the real run log", async ({ page, request }) => {
  await page.goto(P);
  await page.getByRole("button", { name: /Update staging from (the )?main( branch)?/ }).click();
  await dispatched(request, "deploy", "staging");
  await ctl(request, "finish");
  await page.goto(`${P}/updating?stage=staging`);
  await page.getByText("Show the technical log").click();
  await expect(page.getByText(/deploy staging .*: done/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open this run on GitHub" })).toBeVisible();
});

test("pin goes through the workflow and then blocks updates", async ({ page, request }) => {
  await page.goto(P);
  await page.getByRole("button", { name: "Pin staging" }).click();
  await dispatched(request, "pin", "staging");
  await ctl(request, "finish");
  await page.reload();
  await expect(page.getByText(/Staging is pinned/)).toBeVisible();
});

test("approve on review, then put live", async ({ page, request }) => {
  await page.goto(`${P}/review`);
  await page.getByRole("button", { name: "Looks good, approve" }).click();
  await expect(page).toHaveURL(/\/live/);
  await expect(page.getByText(/Approved by owner/)).toBeVisible();
  await page.getByRole("button", { name: "Yes, put it live" }).click();
  const run = await dispatched(request, "deploy", "live");
  expect(run.inputs).toMatchObject({ commit: "04".repeat(20), requested_by: "owner" });
});

test("Claude's API request shows up and a person OKs it", async ({ page, request }) => {
  const r = await request.post("/api/projects/acme/site/actions", {
    headers: { "x-stagedirector-agent": "claude", origin: "http://localhost:53122" },
    data: { stageId: "staging", action: "deploy", commit: "04".repeat(20), note: "footer fix is merged" },
  });
  expect((await r.json()).recordedAs).toBe("request");
  // Claude cannot answer its own request.
  const { requests } = await (await request.get("/api/projects/acme/site/requests")).json();
  const id = requests[0].id;
  const refused = await request.post(`/api/projects/acme/site/requests/${id}`, { headers: { "x-stagedirector-agent": "claude", origin: "http://localhost:53122" }, data: { answer: "ok" } });
  expect(refused.status()).toBe(403);
  await page.goto(P);
  await page.getByRole("region", { name: /Claude asks/ }).getByRole("button", { name: "OK, do it" }).click();
  await expect(page.getByRole("region", { name: /Claude asks/ })).toHaveCount(0);
});

test("activity CSV includes GitHub runs", async ({ page, request }) => {
  await page.goto(P);
  await page.getByRole("button", { name: /Update staging from (the )?main( branch)?/ }).click();
  await dispatched(request, "deploy", "staging");
  await ctl(request, "finish");
  const csv = await (await request.get("/api/activity?repo=acme/site&format=csv")).text();
  expect(csv).toMatch(/push,owner,passed/);
});
