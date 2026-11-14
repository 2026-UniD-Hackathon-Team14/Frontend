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
  failSettlement = false,
  failLeave = false,
  failAfterLeave = false,
  failGet = false;
let nextReceiptItemId = 1;
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
  const reply = async (data, status = 200, code = "TEST_FAILURE") =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({
        success: status < 400,
        data: status < 400 ? data : null,
        error: status < 400 ? null : { code, message: String(data) },
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
  if (p === "/users/me/rooms" && method === "GET")
    return reply(rooms.filter(room => room.members.some(member => member.id === uid)).map(room => ({id:room.id,name:room.name})));
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
    if (suffix === "/members/me" && method === "DELETE") {
      assert.equal(body,null,'탈퇴는 사용자 헤더만 사용하고 본문을 보내지 않음');
      if (failLeave) { failLeave=false; return reply('Leave failed',503); }
      room.members=room.members.filter(member=>member.id!==uid);
      if (failAfterLeave) { failAfterLeave=false; return reply('Leave response lost',503); }
      return reply({roomId:id,userId:uid});
    }
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
      return reply(cards.filter((c) => c.roomId === id).map(card => {
        const linked = receipts.filter(receipt => receipt.roomId === id).flatMap(receipt => receipt.items).filter(item => item.sourceCardId === card.id);
        const item = linked.find(item => item.status === "CONFIRMED") || linked.at(-1);
        return {...card,version:1,receiptStatus:item?.status || "NOT_CREATED",receiptItemId:item?.id || null};
      }));
    }
    if (suffix === "/receipts") {
      if (method === "GET") return reply(receipts.filter(receipt => receipt.roomId === id).reverse().map(receipt => ({
        id: receipt.id, roomId: id, createdAt: receipt.createdAt, status: receipt.status,
        sourceCardIds: receipt.items.map(item => item.sourceCardId), itemCount: receipt.items.length,
        confirmedItemCount: receipt.items.filter(item => item.status === "CONFIRMED").length,
      })));
      assert.equal(body, null, "중간결산 요청에는 메시지나 카드 목록을 보내지 않음");
      if (failSettlement) { failSettlement = false; return reply("Settlement failed", 503); }
      const eligible = cards.filter(card => card.roomId === id && card.status === "CONFIRMED" && !receipts.some(receipt =>
        receipt.roomId === id && receipt.items.some(item => item.sourceCardId === card.id && item.status === "CONFIRMED")));
      if (!eligible.length) return reply("No eligible cards", 409, "NO_ELIGIBLE_CARDS");
      const existing = receipts.find(receipt => receipt.roomId === id && receipt.items.length === eligible.length &&
        eligible.every(card => receipt.items.some(item => item.sourceCardId === card.id)));
      if (existing) return reply({receiptId:existing.id,roomId:id,created:false,sourceCardIds:eligible.map(card => card.id),status:existing.status});
      const receipt = {id:receipts.length+1,roomId:id,createdAt:new Date().toISOString(),status:"PENDING",participants:room.members,
        items:eligible.map(card => receipts.flatMap(receipt => receipt.items).find(item => item.sourceCardId === card.id && item.status !== "CONFIRMED") || {
          id:nextReceiptItemId++,sourceCardId:card.id,sourceCardVersion:1,title:card.title,what:card.content,
          assignee:card.assignee,dueDate:card.dueDate,displayDate:card.displayDate,status:"PENDING",responses:[],
        })};
      receipts.push(receipt);
      return reply({receiptId:receipt.id,roomId:id,created:true,sourceCardIds:eligible.map(card => card.id),status:receipt.status},201);
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
    receipts.forEach(receipt => { receipt.status = receipt.items.every(item => item.status === "CONFIRMED") ? "CONFIRMED" : "PENDING"; });
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
    await a.locator("#workspace-dialog .api-inline-error").waitFor();
    assert.equal(rooms.length, 1);
    await a.click("#workspace-form [type=submit]");
    await a.waitForFunction(() => activeWorkspace()?.id === "1");
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].members[0].id, 1);
    assert.equal(await a.locator("#settle-agreements + #leave-room").count(), 1);
    await a.click("#leave-room");
    await a.locator("#leave-room-dialog[open]").waitFor();
    assert.equal(await a.locator("#confirm-room-leave").isDisabled(), false);
    await a.locator("#leave-room-dialog .close").last().click();
    assert.equal(await a.evaluate(() => activeWorkspace().id), "1");
    assert.equal(requests.filter(request=>request.method==='DELETE'&&request.p.endsWith('/members/me')).length,0,'취소 시 서버 탈퇴 요청을 보내지 않음');
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
    assert.equal(messages.length, 0, "Analysis must not publish a message");
    assert.equal(await a.locator("#pending-text mark").textContent(), "maybe");
    assert.equal(await a.locator("#message-input").getAttribute("readonly"), "");
    await a.click("#dismiss-error");
    await a.setViewportSize({ width: 390, height: 844 });
    await a.waitForTimeout(250);
    const bounds = await a.evaluate(() => {
      const sheet = document.querySelector("#meaning-dialog").getBoundingClientRect(),
        composer = document.querySelector("#message-form").getBoundingClientRect();
      return {
        left: sheet.left,
        right: sheet.right,
        bottom: sheet.bottom,
        composerTop: composer.top,
        width: innerWidth,
        height: sheet.height,
      };
    });
    assert(bounds.left >= 0 && bounds.right <= bounds.width && bounds.height > 100);
    assert(bounds.bottom <= bounds.composerTop + 1);
    await a.screenshot({
      path: path.join(require("os").tmpdir(), "nunchi-meaning-sheet.png"),
      fullPage: true,
    });
    await a.locator("#meaning-dialog").press("Escape");
    assert.equal(await a.locator("#meaning-dialog").getAttribute("open"), null);
    assert.equal(await a.locator("#message-input").inputValue(), "maybe tomorrow");
    assert.equal(messages.length, 0);
    await a.setViewportSize({ width: 1440, height: 1000 });
    await a.locator("#message-input").press("Enter");
    await a.locator("#meaning-dialog[open]").waitFor();
    failSend = true;
    await a.click("[data-meaning=UNDECIDED]");
    await a.locator("#meaning-error:not([hidden])").waitFor();
    await a.waitForFunction(() => !busy);
    assert.equal(messages.length, 0, "Failed intent submission must remain unsent");
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
    assert((await b.locator(".meaning-confirmation").textContent()).includes("Alice"));
    assert.equal(await b.locator(".intent-confirmed .bubble").count(), 1);
    await b.click("[data-original]");
    assert.equal(await b.locator("[data-original]").getAttribute("aria-expanded"), "true");
    assert((await b.locator(".original:not([hidden])").textContent()).includes("maybe tomorrow"));
    await b.click("[data-original]");

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
    assert.equal(await a.locator('.board-unsettled-card').count(),0,'Card stays out of board until all members confirm');
    await b.evaluate(() => refreshRoom());
    await b.click("[data-confirm-agreement]");
    await a.evaluate(() => refreshRoom());
    assert.equal(await a.locator(".board-receipt").count(), 0);
    assert.equal(await a.locator('.board-unsettled-card').count(),1,'Fully confirmed card appears immediately before settlement');
    assert.equal(await a.locator('.board-unsettled-card strong').textContent(),'Actual card');
    assert.equal(await a.locator('.board-unsettled-card > span').textContent(),await a.evaluate(()=>t('api.receiptNotCreated')));
    assert.equal(await a.locator('.board-unsettled-card p, .board-unsettled-card button').count(),0,'Standalone card contains only title and receipt-ID state');
    assert.deepEqual(
      cards[0].confirmations.map((c) => c.userId),
      [1, 2],
    );
    cards.push({ ...clone(cards[0]), id:2, title:'Unconfirmed card', status:'PENDING', confirmations:[] });
    failSettlement = true;
    await a.click("#settle-agreements");
    await a.locator("#api-error:not([hidden])").waitFor();
    assert.equal(receipts.length,0,'Failed settlement must not fabricate a receipt');
    await a.click('#dismiss-error');
    await a.evaluate(() => { document.querySelector('#settle-agreements').click(); document.querySelector('#settle-agreements').click(); });
    await a.locator('.meeting-receipt').waitFor();
    assert.equal(receipts.length,1,'Rapid duplicate click creates only one receipt');
    assert.deepEqual(receipts[0].items.map(item=>item.sourceCardId),[1],'Only board-confirmed cards are settled');
    assert.equal(await a.locator('.receipt-item h4').textContent(),'Actual card');
    assert.equal(requests.filter(r=>r.method==='POST'&&r.p.includes('/meetings')).length,0);
    assert.equal(await a.locator('#end-meeting').count(),0);
    await a.click('[data-receipt-confirm]');
    await a.waitForFunction(()=>serverTools.receipt?.items[0].responses.some(response=>String(response.userId)===currentUser.id));
    await a.click('[data-tool-view=chat]');
    assert.equal(await a.locator('.board-receipt').count(),1,'Pending receipt is already represented by one receipt cell');
    assert.equal(await a.locator('.board-unsettled-card').count(),0,'Receipt grouping replaces its standalone card');
    await a.click('#settle-agreements');
    await a.locator('.meeting-receipt').waitFor();
    assert.equal(receipts.length,1,'Repeated settlement reuses a pending receipt');
    assert.equal(receipts[0].items[0].responses.length,1,'Reusing a receipt preserves confirmations');
    await b.click('[data-tool-view=receipt]');
    await b.locator('[data-receipt-confirm]').waitFor();
    assert.equal(await b.locator('#receipt-choice').inputValue(),'1','Another account discovers the receipt without cached IDs');
    await b.click('[data-receipt-confirm]');
    await b.waitForFunction(()=>serverTools.receipt?.status==='CONFIRMED');
    await a.evaluate(()=>loadWorkspaceTool());
    assert.equal(receipts[0].status,'CONFIRMED');
    await a.click('[data-export-item]');
    await a.locator('.tools-calendar').waitFor();
    assert.equal(events.length,1);
    await a.evaluate(()=>refreshRoom());
    await a.click('[data-tool-view=chat]');
    await a.locator('.board-receipt').waitFor();
    assert.equal(await a.locator('.board-receipt > span').count(),1,'Receipt-only cell has one label when not disputed');
    assert.equal(await a.locator('.board-receipt').textContent(),await a.evaluate(()=>t('api.receiptNumber',{id:1})));
    assert.equal(await a.locator('.board [data-export-card]').count(),0);
    assert(!(await a.locator('#board-cards').textContent()).includes('Actual card'));
    assert(!(await a.locator('#board-cards').textContent()).includes('Original details'));
    await a.click('.board-receipt');
    await a.waitForFunction(()=>workspaceTool==='receipt'&&serverTools.receipt?.id===1);
    assert.equal(await a.locator('#receipt-choice').inputValue(),'1');
    await a.reload();
    await a.waitForFunction(()=>ready&&activeWorkspace()?.boardReceipts?.some(receipt=>receipt.id==='1'));
    await a.locator('.board-receipt').waitFor();
    await b.locator('[data-receipt-item="1"] details').evaluate(element=>{element.open=true;});
    await b.fill('[data-dispute-item="1"] textarea','Please check the deadline');
    await b.click('[data-dispute-item="1"] button');
    await b.waitForFunction(()=>serverTools.receipt?.items[0]?.status==='OBJECTED');
    assert.equal(await b.locator('[data-receipt-item="1"]').evaluate(element=>getComputedStyle(element).borderTopColor),'rgb(217, 105, 95)');
    await a.evaluate(()=>testSocket.onmessage({data:'MESSAGE\ndestination:/topic/rooms/1\n\n'+JSON.stringify({type:'RECEIPT_UPDATED',data:{roomId:1,receiptId:1}})+'\0'}));
    await a.locator('.board [data-open-board-receipt="1"].has-dispute').waitFor();
    assert.equal(await a.locator('.board .has-dispute').count(),1);
    assert.equal(await a.locator('.board .agreement-dispute-tag').textContent(),await a.evaluate(()=>t('api.boardDisputed')));
    assert.equal(await a.locator('.board .has-dispute').evaluate(element=>getComputedStyle(element).borderTopColor),'rgb(217, 105, 95)');
    assert.equal(await a.locator('.board .agreement-dispute-tag').evaluate(element=>getComputedStyle(element).borderTopColor),'rgb(217, 105, 95)');
    assert.equal(await a.locator('.board-receipt').count(),1,'Dispute keeps the same receipt cell');
    assert.equal(await a.locator('.board-receipt > span').count(),2,'Disputed cell contains only its ID and the dispute warning');
    const settlementWritesBeforeObjection=requests.filter(request=>request.method==='POST'&&request.p.endsWith('/receipts')).length;
    await a.click('#settle-agreements');
    await a.waitForFunction(()=>!pendingActions.size);
    assert.equal(requests.filter(request=>request.method==='POST'&&request.p.endsWith('/receipts')).length,settlementWritesBeforeObjection,'Known objected cards must not be resubmitted through the unsafe bodyless endpoint');
    await a.locator('#api-error:not([hidden])').waitFor();
    await a.click('#dismiss-error');
    await b.click('[data-receipt-confirm="1"]');
    await b.waitForFunction(()=>serverTools.receipt?.items[0]?.status==='CONFIRMED');
    assert.equal(await b.locator('[data-receipt-item="1"].has-dispute').count(),0);
    await a.evaluate(()=>refreshRoom());
    await a.locator('.board-receipt').waitFor();
    assert.equal(await a.locator('.board .agreement-dispute-tag').count(),0,'Resolved objections remove the warning badge');
    await a.click('[data-tool-view=chat]');
    await a.click('#settle-agreements');
    await a.waitForFunction(()=>!pendingActions.size);
    assert.equal(receipts.length,1,'No eligible cards must not create an empty receipt');
    assert.equal(await a.locator('#toast').textContent(),await a.evaluate(()=>t('api.noEligibleCards')));
    // After the second card reaches the board, only this new card is included.
    cards[1].status='CONFIRMED';
    cards[1].confirmations=rooms[0].members.map(member=>({userId:member.id,confirmedAt:new Date().toISOString()}));
    await a.click('#settle-agreements');
    await a.waitForFunction(()=>serverTools.receipt?.id===2);
    assert.deepEqual(receipts[1].items.map(item=>item.sourceCardId),[2],'Already-approved cards stay excluded');
    assert.equal(await a.locator('#receipt-choice option').count(),3);
    await b.evaluate(()=>testSocket.onmessage({data:'MESSAGE\ndestination:/topic/rooms/1\n\n'+JSON.stringify({type:'RECEIPT_CREATED',data:{roomId:1,receiptId:2}})+'\0'}));
    await b.locator('#receipt-choice option[value="2"]').waitFor({state:'attached'});
    await a.reload();
    await a.waitForFunction(()=>ready&&activeWorkspace()?.id==='1');
    await a.evaluate(()=>{appState.receiptIds={};saveState();});
    await a.click('[data-tool-view=receipt]');
    await a.waitForFunction(()=>serverTools.receipt?.id===2);
    assert.equal(await a.locator('#receipt-choice option').count(),3,'Receipt history is fetched from the server after reload');
    cards.push({...clone(cards[0]),id:3,title:'Third card'});
    await a.click('[data-tool-view=chat]');
    await a.click('#settle-agreements');
    await a.waitForFunction(()=>serverTools.receipt?.id===3);
    assert.deepEqual(receipts[2].items.map(item=>item.sourceCardId),[2,3]);
    await a.evaluate(()=>refreshRoom());
    await a.click('[data-tool-view=chat]');
    assert.equal(await a.locator('[data-open-board-receipt="3"]').count(),1,'Two cards in the same receipt produce one board cell');
    assert.equal(await a.locator('.board-receipt').count(),3);
    assert.equal(await a.locator('#board-count').textContent(),'3','Board count is receipt count, not card count');
    assert.equal(await a.locator('#board-cards h3, #board-cards .agreement-meta, #board-cards [data-export-card]').count(),0);
    await a.click('[data-open-board-receipt="3"]');
    await a.waitForFunction(()=>serverTools.receipt?.id===3);
    const secondItemId=receipts[2].items.find(item=>item.sourceCardId===2).id;
    await a.click('[data-receipt-confirm="'+secondItemId+'"]');
    await b.click('[data-refresh-tools]');
    await b.locator('#receipt-choice option[value="3"]').waitFor({state:'attached'});
    await b.selectOption('#receipt-choice','3');
    await b.locator('[data-receipt-confirm="'+secondItemId+'"]').waitFor();
    await b.click('[data-receipt-confirm="'+secondItemId+'"]');
    await b.waitForFunction(itemId=>serverTools.receipt?.items.find(item=>item.id===itemId)?.status==='CONFIRMED',secondItemId);
    assert.equal(receipts[2].status,'PENDING','One confirmed item does not finalize the whole receipt');
    await a.click('[data-tool-view=chat]');
    await a.click('#settle-agreements');
    await a.waitForFunction(()=>serverTools.receipt?.id===4);
    assert.deepEqual(receipts[3].items.map(item=>item.sourceCardId),[3],'Exclusion is based on each item, not whole-receipt approval');
    await a.evaluate(()=>refreshRoom());
    await a.click('[data-tool-view=chat]');
    await a.locator('.board').screenshot({path:path.join(require('os').tmpdir(),'nunchi-settled-board.png')});
    await a.click('.board-receipt[data-open-board-receipt="1"]');
    await a.waitForFunction(()=>workspaceTool==='receipt'&&serverTools.receipt?.id===1);
    assert.equal(await a.locator('#receipt-choice').inputValue(),'1','Receipt cell opens its own older receipt rather than the latest receipt');
    await a.click("[data-tool-view=todo]");
    await a.fill("#tool-todo-form input", "Server task");
    await a.click("#tool-todo-form button");
    await a.locator("[data-todo-check]").waitFor();
    await a.check("[data-todo-check]");
    await a.waitForFunction(() => serverTools.todos[0]?.done);
    await a.fill("[data-edit-todo] input", "Edited task");
    await a.click("[data-edit-todo] button");
    await a.waitForFunction(() => serverTools.todos[0]?.title === "Edited task");
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
    // Bob is signed in on both pages. Create a second joined room to test fallback.
    await a.click('#create-workspace');
    await a.fill('#workspace-name','Temporary room');
    await a.click('#workspace-form [type=submit]');
    await a.waitForFunction(()=>activeWorkspace()?.name==='Temporary room');
    const temporaryRoom=rooms.find(room=>room.name==='Temporary room');
    failLeave=true;
    await a.click('#leave-room');
    await a.click('#confirm-room-leave');
    await a.locator('#leave-room-dialog .api-inline-error').waitFor();
    await a.waitForFunction(()=>!roomLeaveInFlight);
    assert.equal(await a.evaluate(()=>activeWorkspace()?.name),'Temporary room','Failed DELETE preserves the selected room');
    assert(temporaryRoom.members.some(member=>member.id===2));
    await a.evaluate(()=>{document.querySelector('#confirm-room-leave').click();document.querySelector('#confirm-room-leave').click();});
    await a.waitForFunction(()=>!roomLeaveInFlight&&activeWorkspace()?.id==='1');
    assert.equal(temporaryRoom.members.length,0,'Server membership removed; room itself preserved');
    assert.equal(await a.locator('[data-workspace="'+temporaryRoom.id+'"]').count(),0);
    const contentCounts=[messages.length,cards.length,receipts.length];
    failAfterLeave=true;
    await a.click('#leave-room');
    await a.click('#confirm-room-leave');
    await a.locator('#leave-room-dialog .api-inline-error').waitFor();
    await a.waitForFunction(()=>!roomLeaveInFlight);
    assert.equal(await a.evaluate(()=>channel),'1','Uncertain response does not invent local success');
    await a.click('#confirm-room-leave');
    await a.waitForFunction(()=>!roomLeaveInFlight&&channel===null);
    assert.equal(await a.locator('[data-workspace]').count(),0,'Last room removal shows empty state');
    assert.equal(await a.locator('#message-input').isDisabled(),true);
    assert.equal(await a.locator('#create-card').isDisabled(),true);
    assert.equal(await a.locator('#settle-agreements').isDisabled(),true);
    assert.deepEqual(rooms[0].members.map(member=>member.id),[1],'Only the current user leaves');
    assert.deepEqual([messages.length,cards.length,receipts.length],contentCounts,'Leaving preserves server conversations and agreements');
    await a.evaluate(()=>localStorage.setItem(STORAGE_KEY,JSON.stringify({roomIds:['1'],activeId:'1'})));
    await a.reload();
    await a.waitForFunction(()=>ready);
    assert.equal(await a.locator('[data-workspace]').count(),0,'Stale local room IDs cannot resurrect membership');
    const writesBeforeSync=requests.filter(request=>request.method==='DELETE').length;
    await b.evaluate(()=>testSocket.onmessage({data:'MESSAGE\ndestination:/topic/rooms/1\n\n'+JSON.stringify({type:'MEMBER_LEFT',data:{roomId:1,userId:2}})+'\0'}));
    await b.waitForFunction(()=>channel===null&&appState.workspaces.length===0);
    assert.equal(requests.filter(request=>request.method==='DELETE').length,writesBeforeSync,'Other-tab leave reconciliation is read-only');
    const remaining=await client();
    await remaining.goto(base+'/login.html');
    await remaining.fill('#user-id','1');
    await remaining.click('#login-form button');
    await remaining.waitForURL('**/test.html');
    await remaining.waitForFunction(()=>ready&&channel==='1');
    await remaining.locator('.bubble').first().waitFor();
    assert.equal(await remaining.locator('#member-avatars .avatar').count(),1);
    await remaining.click('[data-tool-view=receipt]');
    await remaining.locator('.meeting-receipt').waitFor();
    assert.equal(await remaining.locator('#receipt-choice option').count(),receipts.length+1,'Remaining member retains receipt history');
    rooms[0].members=[]; // simulate leaving on another device without receiving its event
    await remaining.evaluate(()=>refreshRoom({quiet:true}));
    await remaining.waitForFunction(()=>channel===null&&appState.workspaces.length===0);
    assert.equal(await remaining.locator('#tool-content').textContent(),'','403 fallback clears the old room tool content');
    assert.deepEqual(errors, []);
    console.log(
      "PASS: API contracts, server room list, chat/card/settlement, leave cancel/failure/retry, last-room empty state, cross-tab event and 403 reconciliation, preserved server content, locale and mobile.",
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
