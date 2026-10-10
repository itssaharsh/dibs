/**
 * prod-build browser smoke test. Copy it to tests/smoke/smoke.spec.ts, then:
 *   npm i -D @playwright/test @axe-core/playwright
 *   Browser: where Chromium is preinstalled (cloud workspaces), set PW_CHROMIUM to it and never run
 *   `playwright install` there; elsewhere run `npx playwright install chromium` once.
 *   BASE_URL=https://your.app ROUTES=/,/app npx playwright test tests/smoke
 * It fails on HTTP >= 400, uncaught errors, console errors, failed requests,
 * broken assets, horizontal overflow and critical axe violations, at 3 viewports.
 *
 * Optional env:
 *   NOISE                          regex of third-party URLs to ignore (reviewed allowlist)
 *   READY_SELECTOR                 element that proves the page rendered (default: body)
 *   PW_CHROMIUM                    path to a preinstalled Chromium (e.g. /opt/pw-browsers/chromium)
 *   VERCEL_AUTOMATION_BYPASS_SECRET   for protected Vercel previews
 * axe runs only if @axe-core/playwright is installed (npm i -D @axe-core/playwright).
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const ROUTES = (process.env.ROUTES ?? '/').split(',').map((r) => r.trim()).filter(Boolean);
const VIEWPORTS: Array<[number, number]> = [[390, 844], [1024, 768], [1440, 900]];
const NOISE = new RegExp(process.env.NOISE ?? 'googletagmanager|google-analytics|vercel-insights|/_vercel/insights');
const READY = process.env.READY_SELECTOR ?? 'body';
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

test.use({
  launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  extraHTTPHeaders: bypass ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' } : {},
});
test.describe.configure({ retries: 1, timeout: 90_000 }); // cold starts on free tiers

async function axeCritical(page: Page): Promise<string[]> {
  try {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    return res.violations.filter((v) => v.impact === 'critical').map((v) => `axe: ${v.id} (${v.nodes.length} nodes)`);
  } catch {
    return []; // axe not installed: skip silently, the report says "a11y: not run"
  }
}

for (const [w, h] of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`${route} @${w}px`, async ({ page }) => {
      const problems: string[] = [];
      page.on('console', (m) => {
        const where = m.location().url ?? '';
        if (m.type() === 'error' && !NOISE.test(where)) problems.push(`console: ${m.text()}${where ? ` @ ${where}` : ''}`);
      });
      page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
      page.on('requestfailed', (r) => {
        const err = r.failure()?.errorText ?? '';
        if (!NOISE.test(r.url()) && !err.includes('ERR_ABORTED')) problems.push(`failed: ${r.url()} ${err}`);
      });
      page.on('response', (r) => { if (r.status() >= 400 && !NOISE.test(r.url())) problems.push(`${r.status()} ${r.url()}`); });

      await page.setViewportSize({ width: w, height: h });
      const res = await page.goto(BASE + route, { waitUntil: 'load' });
      const status = res?.status() ?? 0; // goto does not throw on 404/500
      if (status >= 400 || status === 0) problems.push(`page status ${status} for ${route}`);
      await expect(page.locator(READY).first(), 'page rendered').toBeVisible();
      await page.waitForTimeout(300); // let late console errors surface; not a readiness wait
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
        problems.push(`horizontal scroll at ${w}px`);
      }
      problems.push(...(await axeCritical(page)));
      expect(problems, problems.join('\n')).toEqual([]); // one assertion so every problem is listed
    });
  }
}
