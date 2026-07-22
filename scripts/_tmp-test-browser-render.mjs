import { chromium } from "playwright";

const url = "https://innovation.ised-isde.canada.ca/innovation/s/?language=en_CA";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, locale: "en-CA" });
const page = await context.newPage();
const t0 = Date.now();
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  // Try a much longer settle time (Salesforce Lightning apps can be slow).
  for (const waitMs of [2000, 3000, 5000]) {
    await page.waitForTimeout(waitMs);
    const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
    console.log(`after +${waitMs}ms (total ${Date.now() - t0}ms): visible_text_length=${bodyText.length}`);
  }
  const finalText = await page.evaluate(() => document.body?.innerText ?? "");
  console.log("\nFINAL sample:", finalText.slice(0, 500).replace(/\s+/g, " "));
  // Check for common SPA-loading indicators still present.
  const hasSpinner = await page.locator('[class*="loading"], [class*="spinner"], [aria-busy="true"]').count();
  console.log("loading/spinner elements still present:", hasSpinner);
} catch (e) {
  console.log("ERROR:", e.message);
} finally {
  await context.close();
  await browser.close();
}
