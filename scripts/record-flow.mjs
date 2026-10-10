// Live check of the shared record: phone A pays, phone B ghosts; in the next drop A puts down 25 and B 100.
// Usage: PRESENTER_KEY=… SP=/tmp node scripts/record-flow.mjs <base>
import { chromium } from "@playwright/test";
const base = process.argv[2];
const key = process.env.PRESENTER_KEY;
const start = async (payWindow) => {
  const r = await fetch(`${base}/api/admin/start`, { method: "POST", headers: { "x-presenter-key": key, "content-type": "application/json" }, body: JSON.stringify({ payWindow }) });
  return r.json();
};
const b = await chromium.launch();
const phone = async () => (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const [A, B] = [await phone(), await phone()];
const main = (p) => p.locator("div.fixed button").first();
const strip = async (p) => (await p.getByText(/Your deposit here/).first().textContent())?.replace(/\s+/g, " ");
console.log("drop", (await start(20)).id);
await Promise.all([A.goto(`${base}/d/latest`), B.goto(`${base}/d/latest`)]);
await Promise.all([main(A).filter({ hasText: "DIBS" }).waitFor({ timeout: 90000 }), main(B).filter({ hasText: "DIBS" }).waitFor({ timeout: 90000 })]);
console.log("round 1 strips:", await strip(A), "|", await strip(B));
await main(A).click(); // A: jacket
await B.getByRole("button", { name: "Dibs", exact: true }).first().click(); // B: next piece
await main(A).filter({ hasText: /PAY/ }).waitFor({ timeout: 20000 });
console.log("A holder:", await main(A).textContent());
await main(A).click();
await main(A).filter({ hasText: /It's yours/ }).waitFor({ timeout: 20000 });
console.log("A paid");
await main(B).filter({ hasText: /Time ran out/ }).waitFor({ timeout: 60000 });
console.log("B ghosted:", (await B.getByText(/You ghosted/).first().textContent())?.slice(0, 120));
console.log("drop", (await start(20)).id);
await Promise.all([main(A).filter({ hasText: "DIBS" }).waitFor({ timeout: 90000 }), main(B).filter({ hasText: "DIBS" }).waitFor({ timeout: 90000 })]);
console.log("round 2 strips:", await strip(A), "|", await strip(B));
await Promise.all([main(A).click(), main(B).click()]);
await Promise.all([main(A).filter({ hasText: /You're #|PAY/ }).waitFor({ timeout: 20000 }), main(B).filter({ hasText: /You're #|PAY/ }).waitFor({ timeout: 20000 })]);
console.log("round 2 claimed:", await main(A).textContent(), "|", await main(B).textContent());
await A.screenshot({ path: `${process.env.SP}/rec-A.png` });
await B.screenshot({ path: `${process.env.SP}/rec-B.png` });
await b.close();
