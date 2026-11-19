import { expect, test } from "@playwright/test";

// Phone width: every main screen fits without sideways scrolling.
for (const path of ["/", "/p/netdevs-net~mariasplace", "/p/netdevs-net~mariasplace/review", "/p/netdevs-net~mariasplace/history", "/p/netdevs-net~mariasplace/toolbox", "/activity"]) {
  test(`fits a phone: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });
}
