import { chromium } from "playwright";

console.log("launching...");
const start = Date.now();
try {
  const browser = await Promise.race([
    chromium.launch({ headless: true }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("MANUAL_TIMEOUT_10s")), 10000)),
  ]);
  console.log("launched OK in", Date.now() - start, "ms");
  const page = await browser.newPage();
  await page.goto("data:text/html,<h1>hi</h1>");
  console.log("title:", await page.title());
  await browser.close();
  console.log("closed OK");
} catch (e) {
  console.log("FAILED after", Date.now() - start, "ms:", e.message);
}
