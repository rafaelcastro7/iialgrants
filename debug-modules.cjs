const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("console", (msg) => console.log("[" + msg.type() + "]", msg.text()));
  page.on("pageerror", (err) => console.log("PAGE_ERROR:", err.message));

  await page.goto("http://localhost:8080/auth", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Member A" }).click();
  await page.waitForTimeout(3000);

  await page.goto("http://localhost:8080/admin/modules", {
    waitUntil: "domcontentloaded",
    timeout: 10000,
  });
  await page.waitForTimeout(5000);
  const body = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log("BODY TEXT:", JSON.stringify(body));
  const title = await page.evaluate(() => document.title);
  console.log("TITLE:", JSON.stringify(title));
  await page.screenshot({ path: "admin-modules-2.png" });
  await browser.close();
})();
