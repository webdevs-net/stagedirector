import { expect, test } from "@playwright/test";

// Demo mode (no credentials): every screen and button on the built-in data.
const MP = "/p/netdevs-net~mariasplace";

test("home lists projects, filters and searches", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your projects/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Waiting on you" })).toBeVisible();
  await page.getByRole("searchbox").or(page.getByPlaceholder(/search/i)).first().fill("Maria");
  await expect(page.getByText("Maria's Place").first()).toBeVisible();
  await expect(page.getByText("Harbor Dental · Booking")).toHaveCount(0);
});

test("project page shows stages, waiting changes and the live lock", async ({ page }) => {
  await page.goto(MP);
  await expect(page.getByRole("heading", { name: "Maria's Place" })).toBeVisible();
  await expect(page.getByText("New login page design")).toBeVisible();
  await expect(page.getByRole("button", { name: /Update staging from main/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Live site", exact: true })).toBeVisible();
});

test("update staging: run window, overlay, Stop", async ({ page }) => {
  await page.goto(MP);
  await page.getByRole("button", { name: /Update staging from main/ }).click();
  const win = page.getByRole("complementary", { name: "Runs in progress" });
  await expect(win.getByText(/Updating staging/)).toBeVisible();
  await expect(page.getByText("Busy · one run at a time").first()).toBeVisible();
  await win.getByRole("button", { name: "Stop" }).click();
  await expect(win.getByText("Stopped — nothing changed")).toBeVisible();
});

test("a full demo run finishes and checks run afterwards", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(MP);
  await page.getByRole("button", { name: /Update staging from main/ }).click();
  await page.goto(`${MP}/updating?stage=staging`);
  await expect(page.getByRole("progressbar").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Staging updated" })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("heading", { name: "Checks after the update" })).toBeVisible();
  await expect(page.getByText("Everything checked out.")).toBeVisible();
});

test("pin and unpin staging", async ({ page }) => {
  await page.goto(MP);
  await page.getByRole("button", { name: "Pin staging" }).click();
  await expect(page.getByText(/Staging is pinned, so it won.t update/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Update staging from main/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Unpin staging" }).click();
  await expect(page.getByRole("button", { name: /Update staging from main/ })).toBeVisible();
});

test("developer preview cannot pin live or approve", async ({ page }) => {
  await page.goto(`${MP}?as=developer`);
  await expect(page.getByRole("button", { name: "Pin live site" })).toHaveCount(0);
  await expect(page.getByText("Code owners only").first()).toBeVisible();
  await page.goto(`${MP}/review?as=developer`);
  await expect(page.getByText("Only a code owner can approve.")).toBeVisible();
});

test("review: checks run by themselves, then approve leads to put live", async ({ page }) => {
  await page.goto(`${MP}/review`);
  await expect(page.getByRole("heading", { name: "Checks on staging" })).toBeVisible();
  await expect(page.getByText("Everything checked out.")).toBeVisible();
  await page.getByRole("button", { name: "Looks good, approve" }).click();
  await expect(page).toHaveURL(/\/live/);
});

test("Claude request: a person OKs it and History records it", async ({ page }) => {
  await page.goto(MP);
  const box = page.getByRole("region", { name: /Claude asks/ });
  test.skip((await box.count()) === 0, "demo request already answered (dev server reused); restart it to run this test");
  await box.getByRole("button", { name: "OK, do it" }).click();
  await expect(page.getByRole("region", { name: /Claude asks/ })).toHaveCount(0);
  await page.goto(`${MP}/history`);
  await expect(page.getByText(/OK for claude:ryan's request/)).toBeAttached();
});

test("history filters and CSV download", async ({ page }) => {
  await page.goto(`${MP}/history`);
  await page.getByRole("link", { name: "Live site" }).click();
  await expect(page).toHaveURL(/f=live/);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^stagedirector-activity-netdevs-net-mariasplace-.*\.csv$/);
  const text = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
  expect(text.split("\r\n")[0]).toBe("time,project,repo,stage,action,actor,result,commit,run_id,note");
});

test("activity record across projects filters by stage and action", async ({ page }) => {
  await page.goto("/activity");
  await page.getByLabel("Stage", { exact: true }).selectOption("live");
  await page.getByLabel("What happened", { exact: true }).selectOption("push");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/stage=live/);
  await expect(page.getByText("push · live").first()).toBeVisible();
  await expect(page.getByText("push · staging")).toHaveCount(0);
});

test("toolbox, banners and no-downtime label render", async ({ page }) => {
  await page.goto(`${MP}/toolbox`);
  await expect(page.getByText("No-downtime switch")).toBeVisible();
  await page.goto("/p/northwind~website/toolbox");
  await expect(page.getByText("Updates swap in one step; Undo takes seconds")).toBeVisible();
  await page.goto("/banners");
  await expect(page.locator("body")).not.toContainText("Application error");
});

test("API: health and activity JSON", async ({ request }) => {
  expect(await (await request.get("/api/health")).json()).toEqual({ ok: true, source: "sample" });
  const a = await (await request.get("/api/activity?actor=claude")).json();
  expect(a.events.every((e: { actor: string }) => e.actor.startsWith("claude:"))).toBe(true);
});

test("preview toggle: the selected view is not a link; switching changes the buttons", async ({ page }) => {
  await page.goto(MP);
  const group = page.getByRole("group", { name: "Preview this page as" });
  await expect(group.getByText("Code owner")).toHaveAttribute("aria-current", "true");
  await expect(group.getByRole("link", { name: "Code owner" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pin live site" })).toBeVisible();
  await group.getByRole("link", { name: "Developer" }).click();
  await expect(page).toHaveURL(/as=developer/);
  await expect(page.getByRole("button", { name: "Pin live site" })).toHaveCount(0);
  await expect(group.getByText("Developer")).toHaveAttribute("aria-current", "true");
});
