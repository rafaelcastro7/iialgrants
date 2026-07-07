const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (err) => {
    errors.push(err.message);
    console.log("PAGE ERROR:", err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
  });

  await page.goto("http://localhost:8080/auth", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(5000);

  const heading = await page.locator("h1").textContent();
  console.log("H1 text:", JSON.stringify(heading));

  const html = await page.content();
  // Check for key elements
  const hasForm = html.includes('type="email"') || html.includes("auth.email");
  const hasDemo = html.includes("Member A") || html.includes("Demo");
  console.log("Has form:", hasForm, "Has demo:", hasDemo);
  console.log("Errors:", JSON.stringify(errors));

  await page.screenshot({ path: "auth-page.png" });
  console.log("Auth screenshot saved");
  await browser.close();
})();
