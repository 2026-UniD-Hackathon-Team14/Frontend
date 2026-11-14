const fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict"),
  vm = require("vm"),
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
  const root = process.argv[2] || path.resolve(__dirname, ".."),
    context = { window: {} };
  for (const l of ["ko", "en", "vi", "de"])
    vm.runInNewContext(
      fs.readFileSync(path.join(root, "js/locales/" + l + ".js"), "utf8"),
      context,
    );
  const dict = context.window.NunchiLocales;
  for (const l of ["en", "vi", "de"])
    assert.deepEqual(Object.keys(dict[l]).sort(), Object.keys(dict.ko).sort());
  const executablePath = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].find(fs.existsSync);
  const browser = await pw.chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (e) => (errors.push(e.message), console.error("PAGE ERROR", e.stack)));
    const url = (f) => pathToFileURL(path.join(root, f)).href;
    await page.goto(url("test.html"));
    for (const lang of ["ko", "en", "vi", "de"]) {
      await page.selectOption("#ui-language", lang);
      assert.equal(await page.locator("html").getAttribute("lang"), lang);
      assert.equal(
        (await page.locator("#create-card").textContent()).trim(),
        dict[lang].createCard,
      );
      assert.equal((await page.locator("#send").textContent()).trim(), dict[lang].send);
      await page.click("#create-workspace");
      assert.equal(
        (await page.locator("#workspace-dialog-title").textContent()).trim(),
        dict[lang].workspaceTitle,
      );
      await page.locator("#workspace-dialog .close").first().click();
    }
    await page.reload();
    assert.equal(await page.locator("html").getAttribute("lang"), "de");
    await page.fill("#message-input", "원문 <keep>");
    await page.selectOption("#ui-language", "vi");
    assert.equal(await page.locator("#message-input").inputValue(), "원문 <keep>");
    await page.click("#send");
    await page.locator(".bubble").waitFor();
    assert.equal(await page.locator(".bubble").textContent(), "원문 <keep>");
    assert.equal(await page.locator("#toast").textContent(), dict.vi.messageAdded);
    await page.selectOption("#ui-language", "de");
    assert.equal(await page.locator("#toast").textContent(), dict.de.messageAdded);
    await page.click("#create-card");
    await page.fill("#agreement-title", "사용자 제목");
    await page.fill("#agreement-text", "사용자 내용");
    await page.fill("#agreement-date", "2026-12-02");
    await page.evaluate(() => I18n.setLanguage("en"));
    assert.equal(await page.locator("#agreement-title").inputValue(), "사용자 제목");
    await page.click("#agreement-form button[type=submit]");
    assert.equal(await page.locator(".chat-agreement h3").textContent(), "사용자 제목");
    for (const id of ["me", "lena", "seoyeon", "linh"]) {
      await page.selectOption("#agreement-viewer", id);
      await page.click("[data-confirm-agreement]");
    }
    assert.equal(await page.locator(".pinned-agreement").count(), 1);
    await page.selectOption("#ui-language", "de");
    assert.equal(await page.locator(".pinned-agreement h3").textContent(), "사용자 제목");
    assert.equal(
      await page.locator(".pinned-agreement .confirmed").textContent(),
      "✓ " + dict.de.confirmedCount.replace("{count}", "4"),
    );
    await page.click("#invite-friends");
    await page.fill("#invite-name", "Hans");
    await page.fill("#invite-email", "hans@example.com");
    await page.click("#invite-form button[type=submit]");
    assert.equal(
      (await page.locator("[data-accept-invite]").textContent()).trim(),
      dict.de.acceptDemo,
    );
    await page.evaluate(() => I18n.setLanguage("vi"));
    assert.equal(
      (await page.locator("[data-accept-invite]").textContent()).trim(),
      dict.vi.acceptDemo,
    );
    await page.click("[data-accept-invite]");
    await page.click("#invite-dialog .close");
    const leftovers = await page.evaluate(() => {
      const result = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const n = walk.currentNode,
          p = n.parentElement;
        if (
          /[가-힣]/.test(n.textContent) &&
          !p.closest(
            "script,style,option,[data-workspace],.bubble,.who,.avatar,.agreement-person,.chat-agreement,.pinned-agreement,#room-title,#page-title,#breadcrumb,.date-divider,#profile-name,#profile-avatar,#translation-hint,#viewing-language,#profile-language,#pending-text,#agreement-preview-title,#assignee-picker,#assignee-chips,#invite-workspace-name",
          )
        )
          result.push({ text: n.textContent.trim(), parent: p.outerHTML.slice(0, 200) });
      }
      return result;
    });
    assert.deepEqual(leftovers, []);
    await page.goto(url("login.html"));
    for (const lang of ["ko", "en", "vi", "de"]) {
      await page.click("[data-language=" + lang + "]");
      assert.equal(await page.locator("#login-heading").textContent(), dict[lang].loginTitle);
    }
    await page.click("#open-signup");
    await page.fill("#signup-name", "Lena Test");
    await page.selectOption("#signup-language", "vi");
    await page.click("#signup-submit");
    await page.waitForURL("**/test.html");
    assert.equal(await page.locator("html").getAttribute("lang"), "vi");
    assert.equal(await page.locator("#profile-name").textContent(), "Lena Test");
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem("nunchichat.user")).language),
      "vi",
    );
    await page.reload();
    assert.equal(await page.locator("html").getAttribute("lang"), "vi");
    await page.evaluate(() =>
      UserAPI.applyUser({ success: true, data: { ...UserAPI.user, language: "de" }, error: null }),
    );
    assert.equal(await page.locator("html").getAttribute("lang"), "de");
    const before = await page.evaluate(() => I18n.language);
    assert.equal(await page.evaluate(() => I18n.setLanguage("zz")), false);
    assert.equal(await page.evaluate(() => I18n.language), before);
    await page.route("https://nunchi.test/api/users", async (route) => {
      assert.deepEqual(route.request().postDataJSON(), { name: "API user", language: "en" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          success: true,
          data: { id: 42, name: "API user", language: "en" },
          error: null,
        }),
      });
    });
    await page.goto(url("login.html"));
    await page.evaluate(() =>
      UserAPI.configure({ mode: "api", baseUrl: "https://nunchi.test/api" }),
    );
    await page.click("#open-signup");
    await page.fill("#signup-name", "API user");
    await page.selectOption("#signup-language", "en");
    await page.click("#signup-submit");
    await page.waitForURL("**/test.html");
    assert.equal(await page.locator("#profile-name").textContent(), "API user");
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    for (const lang of ["en", "vi", "de"]) {
      await page.selectOption("#ui-language", lang);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: dictionaries, four locales, live dialogs/toasts, draft/content preservation, card confirmation, invitations, registration language persistence, server-language initialization, API payload, mobile.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
