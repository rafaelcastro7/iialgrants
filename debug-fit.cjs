const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("console", (msg) => console.log("[" + msg.type() + "]", msg.text().substring(0, 200)));
  page.on("pageerror", (err) => console.log("PAGE_ERROR:", err.message));

  // Sign in as Admin
  await page.goto("http://localhost:8080/auth", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Admin" }).click();
  await page.waitForTimeout(3000);
  console.log("Signed in. URL:", page.url());

  // Navigate to fit-rules
  console.log("Navigating to /fit-rules...");
  try {
    await page.goto("http://localhost:8080/fit-rules", {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    console.log("DOM content loaded");
    await page.waitForTimeout(5000);
    const body = await page.evaluate(() => document.body.innerText.substring(0, 300));
    console.log("BODY:", JSON.stringify(body));
    const title = await page.evaluate(() => document.title);
    console.log("TITLE:", JSON.stringify(title));
  } catch (e) {
    console.log("ERROR:", e.message);
  }
  await page.screenshot({ path: "fit-rules.png" });
  await browser.close();
})();
