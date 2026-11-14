const fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict"),
  { pathToFileURL } = require("url");
let pw;
for (const bin of process.env.PATH.split(path.delimiter)) {
  const p = path.resolve(bin, "..", "playwright");
  if (fs.existsSync(path.join(p, "package.json"))) {
    pw = require(p);
    break;
  }
}
(async () => {
  const browser = await pw.chromium.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(process.cwd(), "test.html")).href);
    await page.selectOption("#ui-language", "en");
    await page.click("#create-card");
    await page.fill("#agreement-title", "Research plan");
    await page.fill("#agreement-text", "Keep original content");
    await page.fill("#agreement-date", "2026-12-04");
    await page.click("#agreement-form button[type=submit]");
    for (const id of ["me", "lena", "seoyeon", "linh"]) {
      await page.selectOption("#agreement-viewer", id);
      await page.click("[data-confirm-agreement]");
    }
    await page.click("#end-meeting");
    await page.locator(".meeting-receipt").waitFor();
    assert.equal(await page.locator("[data-export-receipt]").isDisabled(), true);
    for (const lang of ["ko", "en", "vi", "de"]) {
      await page.selectOption("#ui-language", lang);
      assert.equal(await page.locator("#receipt-language").inputValue(), lang);
      assert.equal(
        await page.locator(".tools-heading h2").textContent(),
        await page.evaluate(() => t("tools.receipt")),
      );
    }
    await page.locator("[data-dispute-item]").evaluate((el) => (el.closest("details").open = true));
    await page.fill("[name=reason]", "Original draft");
    await page.selectOption("#ui-language", "en");
    assert.equal(await page.locator("[name=reason]").inputValue(), "Original draft");
    for (const id of ["me", "lena", "seoyeon", "linh"]) {
      await page.selectOption("#tool-member", id);
      await page.click("[data-receipt-confirm]");
    }
    await page.click("[data-export-receipt]");
    await page.locator(".calendar-event").waitFor();
    assert.equal(await page.locator(".calendar-event").count(), 1);
    await page.click("[data-tool-view=todo]");
    await page.selectOption("#tool-member", "me");
    assert.equal(await page.locator("[data-todo-check]").count(), 1);
    await page.fill("#tool-todo-form [name=title]", "Personal draft");
    await page.selectOption("#ui-language", "de");
    assert.equal(await page.locator("#tool-todo-form [name=title]").inputValue(), "Personal draft");
    await page.click("#tool-todo-form button[type=submit]");
    assert.equal(await page.locator("[data-todo-check]").count(), 2);
    await page.reload();
    await page.click("[data-tool-view=todo]");
    assert.equal(await page.locator("[data-todo-check]").count(), 2);
    await page.click("[data-tool-view=receipt]");
    await page.selectOption("#tool-member", "lena");
    await page.locator("[data-dispute-item]").evaluate((el) => (el.closest("details").open = true));
    await page.fill("[name=reason]", "Wrong date");
    await page.click("[data-dispute-item] button");
    await page.click("[data-tool-view=chat]");
    assert.equal(await page.locator(".pinned-agreement").count(), 0);
    await page.click("[data-tool-view=calendar]");
    assert.equal(await page.locator(".calendar-event").count(), 0);
    await page.click("[data-tool-view=receipt]");
    await page.fill("[data-revise-item] [name=date]", "2026-12-05");
    await page.click("[data-revise-item] button");
    for (const id of ["me", "lena", "seoyeon", "linh"]) {
      await page.selectOption("#tool-member", id);
      await page.click("[data-receipt-confirm]");
    }
    await page.click("[data-export-receipt]");
    assert.equal(await page.locator(".calendar-event").count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: merged receipt UI, four languages, preserved drafts, confirmations, objections/revision, calendar export, todos, persistence, mobile, no runtime errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
