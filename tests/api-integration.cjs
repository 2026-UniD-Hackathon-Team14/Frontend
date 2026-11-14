const fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict"),
  http = require("http");
let pw;
for (const bin of process.env.PATH.split(path.delimiter)) {
  const p = path.resolve(bin, "..", "playwright");
  if (fs.existsSync(path.join(p, "package.json"))) {
    pw = require(p);
    break;
  }
}
const root = path.resolve(__dirname, "..");
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, "openapi.json"), "utf8"));
const vm = require("vm"),
  locales = { window: {} };
for (const language of ["ko", "en", "vi", "de"])
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/locales/" + language + ".js"), "utf8"),
    locales,
  );
for (const language of ["en", "vi", "de"])
  assert.deepEqual(
    Object.keys(locales.window.NunchiLocales[language]).sort(),
    Object.keys(locales.window.NunchiLocales.ko).sort(),
  );
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const data = fs.readFileSync(file);
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".html")
            ? "text/html"
            : "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
const users = [],
  rooms = [],
  messages = [],
  cards = [],
  todos = [],
  events = [],
  receipts = [];
const requests = [],
  errors = [];
let failSend = false,
  failCard = false,
  failJoin = false,
  failGet = false;
const clone = (o) => JSON.parse(JSON.stringify(o));
async function routeAPI(route) {
  const req = route.request(),
    url = new URL(req.url()),
    p = url.pathname.replace("/api", ""),
    method = req.method(),
    body = req.postDataJSON(),
    uid = Number(req.headers()["x-user-id"]);
  requests.push({ p, method, body, uid });
  const actual = url.pathname.split("/");
  const operation = Object.entries(spec.paths).find(([template]) => {
    const parts = template.split("/");
    return (
      parts.length === actual.length &&
      parts.every((part, i) => part.startsWith("{") || part === actual[i])
    );
  })?.[1][method.toLowerCase()];
  assert(operation, "Endpoint must exist in Swagger: " + method + " " + url.pathname);
  const ref = operation.requestBody?.content?.["application/json"]?.schema?.$ref;
  if (ref) {
    const schema = spec.components.schemas[ref.split("/").at(-1)];
    for (const key of schema.required || []) assert(body[key] !== undefined, key + " is required");
    for (const [key, value] of Object.entries(body)) {
      assert(schema.properties[key], "Unknown request property " + key);
      if (value !== null && schema.properties[key].type === "integer")
        assert(Number.isInteger(value));
    }
  }
  const reply = async (data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({
        success: status < 400,
        data: status < 400 ? data : null,
        error: status < 400 ? null : { code: "TEST_FAILURE", message: String(data) },
      }),
    });
  let match;
  if (p === "/users" && method === "POST") {
    assert.deepEqual(Object.keys(body).sort(), ["language", "name"]);
    const u = { id: users.length + 1, ...body };
    users.push(u);
    return reply(u, 201);
  }
  if ((match = p.match(/^\/users\/(\d+)$/)))
    return reply(
      users.find((u) => u.id === Number(match[1])) || "Missing user",
      users.some((u) => u.id === Number(match[1])) ? 200 : 404,
    );
  if (!users.some((u) => u.id === uid)) return reply("Missing user header", 401);
  if (p === "/rooms" && method === "POST") {
    assert.deepEqual(Object.keys(body), ["name"]);
    const room = { id: rooms.length + 1, name: body.name, members: [] };
    rooms.push(room);
    return reply({ id: room.id, name: room.name }, 201);
  }
  if ((match = p.match(/^\/rooms\/(\d+)(.*)$/))) {
    const id = Number(match[1]),
      room = rooms.find((r) => r.id === id),
      suffix = match[2];
    if (!room) return reply("Missing room", 404);
    if (suffix === "/members") {
      if (failJoin) {
        failJoin = false;
        return reply("Membership unavailable", 503);
      }
      const user = users.find((u) => u.id === body.userId);
      if (!user) return reply("Missing member", 404);
      if (!room.members.some((m) => m.id === user.id)) room.members.push(user);
      return reply({ roomId: id, members: room.members }, 201);
    }
    if (!suffix) return reply(room);
    if (!room.members.some((m) => m.id === uid)) return reply("Not a member", 403);
    if (suffix === "/messages/analyze") {
      return reply({
        ambiguous: body.text.includes("maybe"),
        expressions: body.text.includes("maybe")
          ? [
              {
                phrase: "maybe",
                start: 0,
                end: 5,
                candidates: [
                  { intent: "UNDECIDED", label: "Not decided yet" },
                  { intent: "REJECT", label: "A polite refusal" },
                ],
              },
            ]
          : [],
      });
    }
    if (suffix === "/messages") {
      if (method === "POST") {
        assert.deepEqual(Object.keys(body).sort(), ["selectedIntent", "sendOriginal", "text"]);
        if (failSend) {
          failSend = false;
          return reply("Send failed", 503);
        }
        const m = {
          id: messages.length + 1,
          roomId: id,
          senderId: uid,
          senderName: users.find((u) => u.id === uid).name,
          originalText: body.text,
          originalLanguage: users.find((u) => u.id === uid).language,
          selectedIntent: body.selectedIntent,
          createdAt: new Date().toISOString(),
        };
        messages.push(m);
        return reply(m, 201);
      }
      if (failGet) return reply("Read failed", 503);
      assert(url.searchParams.get("lang"));
      return reply(
        messages
          .filter((m) => m.roomId === id)
          .map((m) => ({
            ...m,
            translatedText:
              url.searchParams.get("lang") === "de"
                ? "Server translation: " + m.originalText
                : m.originalText,
          })),
      );
    }
    if (suffix === "/cards") {
      if (method === "POST") {
        assert.deepEqual(Object.keys(body).sort(), ["assigneeId", "content", "dueDate", "title"]);
        if (failCard) {
          failCard = false;
          return reply("Card failed", 503);
        }
        const c = {
          id: cards.length + 1,
          roomId: id,
          title: body.title,
          content: body.content,
          assignee: users.find((u) => u.id === body.assigneeId),
          dueDate: body.dueDate,
          displayDate: body.dueDate,
          status: "PENDING",
          confirmations: [],
        };
        cards.push(c);
        return reply(c, 201);
      }
      return reply(cards.filter((c) => c.roomId === id));
    }
    if (suffix === "/meetings/start")
      return reply({ meetingId: id, startedAt: new Date().toISOString() }, 201);
    if (suffix === "/calendar-events") {
      if (method === "GET") return reply(events.filter((e) => e.roomId === id));
      assert(["CARD", "RECEIPT_ITEM"].includes(body.sourceType));
      const e = {
        id: events.length + 1,
        roomId: id,
        title: "Server event",
        date: "2026-12-04",
        displayDate: "Dec 4",
        ...body,
      };
      events.push(e);
      return reply(e, 201);
    }
  }
  if ((match = p.match(/^\/cards\/(\d+)\/confirm$/))) {
    const c = cards.find((c) => c.id === Number(match[1]));
    if (!c.confirmations.some((x) => x.userId === uid))
      c.confirmations.push({ userId: uid, confirmedAt: new Date().toISOString() });
    if (
      rooms
        .find((r) => r.id === c.roomId)
        .members.every((m) => c.confirmations.some((x) => x.userId === m.id))
    )
      c.status = "CONFIRMED";
    return reply(c);
  }
  if ((match = p.match(/^\/meetings\/(\d+)\/end$/))) {
    const room = rooms.find((r) => r.id === Number(match[1]));
    const receipt = {
      id: receipts.length + 1,
      meetingId: room.id,
      status: "PENDING",
      participants: room.members,
      items: [
        {
          id: receipts.length + 1,
          what: "Server extracted decision",
          assignee: users[0],
          dueDate: "2026-12-04",
          displayDate: "Dec 4",
          status: "PENDING",
          responses: [],
        },
      ],
    };
    receipts.push(receipt);
    return reply({ meetingId: room.id, endedAt: new Date().toISOString(), receiptId: receipt.id });
  }
  if ((match = p.match(/^\/receipts\/(\d+)$/)))
    return reply(receipts.find((r) => r.id === Number(match[1])));
  if ((match = p.match(/^\/receipt-items\/(\d+)\/responses$/))) {
    const receipt = receipts.find((r) => r.items.some((i) => i.id === Number(match[1]))),
      item = receipt.items.find((i) => i.id === Number(match[1]));
    item.responses = item.responses.filter((r) => r.userId !== uid);
    item.responses.push({ userId: uid, ...body });
    item.status = item.responses.some((r) => r.type === "OBJECT")
      ? "OBJECTED"
      : receipt.participants.every((p) =>
            item.responses.some((r) => r.userId === p.id && r.type === "CONFIRM"),
          )
        ? "CONFIRMED"
        : "PENDING";
    receipt.status = item.status === "CONFIRMED" ? "CONFIRMED" : "PENDING";
    return reply({ itemId: item.id, status: item.status, responses: item.responses });
  }
  if (p === "/todos") {
    if (method === "GET") return reply(todos.filter((t) => t.userId === uid));
    assert.deepEqual(Object.keys(body), ["title"]);
    const todo = { id: todos.length + 1, userId: uid, title: body.title, done: false };
    todos.push(todo);
    return reply(todo, 201);
  }
  if ((match = p.match(/^\/todos\/(\d+)$/))) {
    const i = todos.findIndex((t) => t.id === Number(match[1]) && t.userId === uid);
    if (i < 0) return reply("Not found", 404);
    if (method === "DELETE") {
      todos.splice(i, 1);
      return reply(null);
    }
    Object.assign(todos[i], body);
    return reply(todos[i]);
  }
  throw Error("Unexpected API call " + method + " " + p);
}
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  try {
    async function client() {
      const context = await browser.newContext();
      await context.addInitScript(() => {
        window.NUNCHI_API_CONFIG = {
          baseUrl: "https://api.test/api",
          wsUrl: "wss://api.test/ws",
          pollInterval: 600000,
        };
        window.framesSent = [];
        window.WebSocket = class {
          constructor() {
            window.testSocket = this;
            setTimeout(() => this.onopen?.(), 0);
          }
          send(frame) {
            window.framesSent.push(frame);
            if (frame.startsWith("CONNECT\n"))
              setTimeout(() => this.onmessage?.({ data: "CONNECTED\nversion:1.2\n\n\0" }), 0);
          }
          close() {
            this.onclose?.();
          }
        };
      });
      await context.route("https://api.test/api/**", routeAPI);
      const page = await context.newPage();
      page.on("pageerror", (e) => (errors.push(e.stack), console.error(e.stack)));
      return page;
    }
    async function signup(page, name, language) {
      await page.goto(base + "/login.html");
      await page.click("#open-signup");
      await page.fill("#signup-name", name);
      await page.selectOption("#signup-language", language);
      await page.click("#signup-submit");
      await page.waitForURL("**/test.html");
      await page.waitForFunction(() => ready);
    }
    const a = await client(),
      b = await client();
    await signup(a, "Alice", "en");
    assert.equal(await a.locator("[data-workspace]").count(), 0);
    assert.equal(
      await a.locator("#agreement-viewer,#leave-workspace,[data-accept-invite]").count(),
      0,
    );
    await a.click("#create-workspace");
    await a.fill("#workspace-name", "Server team");
    failJoin = true;
    await a.click("#workspace-form [type=submit]");
    await a.locator(".api-inline-error").waitFor();
    assert.equal(rooms.length, 1);
    await a.click("#workspace-form [type=submit]");
    await a.waitForFunction(() => activeWorkspace()?.id === "1");
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].members[0].id, 1);
    await signup(b, "Bob", "de");
    await b.click("#create-workspace");
    await b.fill("#join-room-id", "1");
    await b.click("#join-room-form [type=submit]");
    await b.waitForFunction(() => activeWorkspace()?.id === "1");
    await a.evaluate(() => refreshRoom());
    assert.equal(await a.locator("#member-avatars .avatar").count(), 2);
    assert(
      await a.evaluate(() => framesSent.some((f) => f.includes("destination:/topic/rooms/1\n"))),
    );
    await a.fill("#message-input", "maybe tomorrow");
    await a.click("#send");
    await a.locator("#meaning-dialog[open]").waitFor();
    await a.click("[data-meaning=UNDECIDED]");
    await a.waitForFunction(() => chats[channel].some((m) => m.originalText === "maybe tomorrow"));
    assert.equal(messages[0].selectedIntent, "UNDECIDED");
    assert.equal(messages[0].senderId, 1);
    await b.evaluate(() =>
      testSocket.onmessage({
        data:
          "MESSAGE\ndestination:/topic/rooms/1\n\n" +
          JSON.stringify({ type: "MESSAGE_CREATED", data: { id: 1 } }) +
          "\0",
      }),
    );
    await b.locator(".bubble").filter({ hasText: "Server translation: maybe tomorrow" }).waitFor();
    failSend = true;
    await a.fill("#message-input", "Keep failed draft");
    await a.click("#send");
    await a.locator("#api-error:not([hidden])").waitFor();
    await a.waitForFunction(() => !busy);
    assert.equal(await a.locator("#message-input").inputValue(), "Keep failed draft");
    assert.equal(messages.length, 1);
    await a.click("#dismiss-error");
    await a.click("#create-card");
    await a.fill("#agreement-title", "Actual card");
    await a.fill("#agreement-text", "Original details");
    await a.fill("#agreement-date", "2026-12-04");
    failCard = true;
    await a.click("#agreement-form [type=submit]");
    await a.locator("#agreement-dialog .api-inline-error").waitFor();
    assert.equal(cards.length, 0);
    assert.equal(await a.locator("#agreement-title").inputValue(), "Actual card");
    await a.click("#agreement-form [type=submit]");
    await a.locator(".chat-agreement").waitFor();
    await a.fill("#message-input", "Message after card");
    await a.click("#send");
    await a.waitForFunction(() =>
      chats[channel].some((m) => m.originalText === "Message after card"),
    );
    const checkOrder = async () => {
      assert.equal(
        await a.evaluate(() => {
          const card = document.querySelector("#messages .chat-agreement");
          const bubble = [...document.querySelectorAll("#messages .bubble")].find(
            (el) => el.textContent === "Message after card",
          );
          return Boolean(card.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING);
        }),
        true,
      );
    };
    await checkOrder();
    await a.reload();
    await a.waitForFunction(
      () => ready && chats[channel]?.some((m) => m.originalText === "Message after card"),
    );
    await checkOrder();

    await a.click("[data-confirm-agreement]");
    assert.equal(await a.locator(".pinned-agreement").count(), 0);
    await b.evaluate(() => refreshRoom());
    await b.click("[data-confirm-agreement]");
    await a.evaluate(() => refreshRoom());
    assert.equal(await a.locator(".pinned-agreement").count(), 1);
    assert.deepEqual(
      cards[0].confirmations.map((c) => c.userId),
      [1, 2],
    );
    await a.click("[data-export-card]");
    await a.locator(".tools-calendar").waitFor();
    assert.equal(events.length, 1);
    await a.click("[data-tool-view=chat]");
    await a.click("#settle-agreements");
    await a.locator("#api-error:not([hidden])").waitFor();
    assert.equal(
      requests.filter((r) => r.method === "POST" && r.p.includes("/meetings")).length,
      0,
    );
    assert.equal(receipts.length, 0, "Unsupported settlement must not fabricate a receipt");
    assert.equal(await a.locator("#end-meeting").count(), 0);
    await a.click("#dismiss-error");
    // Existing server receipts remain viewable/respondable while new settlement awaits backend support.
    receipts.push({
      id: 1,
      meetingId: 1,
      status: "PENDING",
      participants: rooms[0].members,
      items: [
        {
          id: 1,
          what: "Existing server receipt",
          assignee: users[0],
          dueDate: "2026-12-04",
          displayDate: "Dec 4",
          status: "PENDING",
          responses: [],
        },
      ],
    });
    await a.click("[data-tool-view=receipt]");
    await a.fill("#receipt-open-form input", "1");
    await a.click("#receipt-open-form button");
    await a.locator(".meeting-receipt").waitFor();
    await a.click("[data-receipt-confirm]");
    await b.click("[data-tool-view=receipt]");
    await b.fill("#receipt-open-form input", "1");
    await b.click("#receipt-open-form button");
    await b.locator("[data-receipt-confirm]").waitFor();
    await b.click("[data-receipt-confirm]");
    await a.evaluate(() => loadWorkspaceTool());
    assert.equal(receipts[0].status, "CONFIRMED");
    await a.click("[data-tool-view=todo]");
    await a.fill("#tool-todo-form input", "Server task");
    await a.click("#tool-todo-form button");
    await a.locator("[data-todo-check]").waitFor();
    await a.check("[data-todo-check]");
    await a.waitForFunction(() => serverTools.todos[0]?.done);
    await a.fill("[data-edit-todo] input", "Edited task");
    await a.click("[data-edit-todo] button");
    assert.equal(todos[0].title, "Edited task");
    await b.click("[data-tool-view=todo]");
    assert.equal(await b.locator("[data-todo-check]").count(), 0);
    await a.reload();
    await a.waitForFunction(() => ready);
    await a.click("[data-tool-view=todo]");
    await a.locator("[data-todo-check]").waitFor();
    assert.equal(await a.locator("[data-todo-check]").isChecked(), true);
    await a.click("[data-delete-todo]");
    await a.waitForFunction(() => serverTools.todos.length === 0);
    for (const lang of ["ko", "en", "vi", "de"]) {
      await a.selectOption("#ui-language", lang);
      await a.waitForFunction(() => I18n.language === document.querySelector("#ui-language").value);
      assert.equal(await a.locator("html").getAttribute("lang"), lang);
    }
    await a.setViewportSize({ width: 390, height: 844 });
    assert.equal(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await a.screenshot({
      path: path.join(require("os").tmpdir(), "nunchi-api-mobile.png"),
      fullPage: true,
    });
    await a.reload();
    await a.waitForFunction(() => ready);
    assert.equal(await a.locator("html").getAttribute("lang"), "de");
    await a.click("#logout");
    await a.waitForURL("**/login.html");
    await a.fill("#user-id", "1");
    await a.click("#login-form button");
    await a.waitForURL("**/test.html");
    await a.waitForFunction(() => ready);
    assert.equal(await a.locator("#profile-name").textContent(), "Alice");
    const state = await a.evaluate(() => JSON.parse(localStorage.getItem(STORAGE_KEY)));
    assert.equal(state.workspaces, undefined);
    assert.equal(state.messages, undefined);
    // Reproduce creator -> add member -> sign out -> invited account in the SAME browser.
    // No ID has been saved for Bob in this browser and joining must not be repeated.
    await a.setViewportSize({ width: 1440, height: 1000 });
    await a.evaluate(() => localStorage.removeItem("nunchichat.server-index.v1.2"));
    rooms.push({
      id: 2,
      name: "Not my room",
      members: [{ id: 999, name: "Unrelated", language: "en" }],
    });
    await a.evaluate(() =>
      localStorage.setItem("nunchichat.server-index.v1.999", JSON.stringify({ roomIds: ["2"] })),
    );
    const memberWrites = requests.filter(
      (r) => r.method === "POST" && r.p.endsWith("/members"),
    ).length;
    await a.click("#logout");
    await a.waitForURL("**/login.html");
    await a.fill("#user-id", "2");
    await a.click("#login-form button");
    await a.waitForURL("**/test.html");
    await a.waitForFunction(() => ready && activeWorkspace()?.id === "1");
    assert.equal(await a.locator('[data-workspace="1"]').count(), 1);
    assert.equal(await a.locator('[data-workspace="2"]').count(), 0);
    assert.equal(
      requests.filter((r) => r.method === "POST" && r.p.endsWith("/members")).length,
      memberWrites,
    );
    assert.deepEqual(
      await a.evaluate(
        () => JSON.parse(localStorage.getItem("nunchichat.server-index.v1.2")).roomIds,
      ),
      ["1"],
    );
    await a.reload();
    await a.waitForFunction(() => ready && activeWorkspace()?.id === "1");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: API contracts, two users, real identity headers, create/join retry, server-only chat/card/receipt/calendar/todo, failed writes preserve drafts, STOMP refresh, language changes, ID sign-in, persistence references, mobile.",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
