import { expect, test } from "@playwright/test";

const phone = { width: 390, height: 844 };
const states: Record<string, RegExp> = {
  "pre-drop": /Opens in/,
  live: /DIBS/,
  claiming: /Calling dibs/,
  "in-line": /You're #4/,
  "your-turn": /PAY 400 tINR/,
  paying: /Paying/,
  bought: /It's yours/,
  "no-show": /Time ran out/,
  "sold-to-other": /Withdraw 50 tINR/,
  withdrawn: /Deposit back/,
  "sold-out": /Sold out/,
  error: /Try again/,
};

test.use({ viewport: phone });

for (const [state, label] of Object.entries(states)) {
  test(`buyer ${state} renders with the action on the first screen`, async ({ page }) => {
    await page.goto(`/d/1?state=${state}`);
    const button = page.locator("div.fixed button").first();
    await expect(button).toHaveText(label);
    await expect(button).toBeInViewport();
    await expect(page.getByText("pocket.thrift")).toBeVisible();
    await expect(page.getByText(/Test money \(tINR\) on Monad testnet/)).toBeVisible();
  });
}

test("rule line and no horizontal scroll at 320", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/d/1?state=live");
  await expect(page.getByText(/First dibs has 60 s to pay/)).toBeVisible();
  await expect(page.getByText(/Your deposit here/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("board states render", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const s of ["waiting", "live", "rolled", "sold", "disconnected"]) {
    await page.goto(`/board/1?state=${s}`);
    await expect(page.getByText(/FIRST DIBS|SOLD TO/).first()).toBeVisible();
    await expect(page.getByText("Scan to join the drop")).toBeVisible();
  }
});
