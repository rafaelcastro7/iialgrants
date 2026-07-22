import { chromium } from "playwright";

const targets = [
  { name: "Innovation Canada", url: "https://innovation.ised-isde.canada.ca/innovation/s/?language=en_CA" },
  { name: "Trade Commissioner Service", url: "https://www.tradecommissioner.gc.ca/funding-financement.aspx?lang=eng" },
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const browser = await chromium.launch({ headless: true });
for (const t of targets) {
  const context = await browser.newContext({ userAgent: UA, locale: "en-CA" });
  const page = await context.newPage();
  const t0 = Date.now();
  try {
    const resp = await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(1500);
    const html = await page.content();
    const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
    console.log(`\n=== ${t.name} ===`);
    console.log("http_status:", resp?.status());
    console.log("latency_ms:", Date.now() - t0);
    console.log("html_length:", html.length);
    console.log("visible_text_length:", bodyText.length);
    console.log("visible_text_sample:", bodyText.slice(0, 300).replace(/\s+/g, " "));
  } catch (e) {
    console.log(`\n=== ${t.name} ===`);
    console.log("ERROR:", e.message);
    console.log("latency_ms:", Date.now() - t0);
  } finally {
    await context.close();
  }
}
await browser.close();
