"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const project = process.cwd();
const storage = new Map();
function app() {
  const elements = new Map();
  const handlers = {};
  function element(selector) {
    if (!elements.has(selector))
      elements.set(selector, {
        id: selector.slice(1),
        value: "",
        innerHTML: "",
        textContent: "",
        hidden: false,
        dataset: {},
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(type, handler) {
          this[type] = handler;
        },
        setAttribute() {},
        setCustomValidity() {},
        reset() {},
        reportValidity() {
          return true;
        },
        querySelectorAll() {
          return [];
        },
        querySelector() {
          return { value: "약속" };
        },
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      });
    return elements.get(selector);
  }
  const document = {
    querySelector: element,
    querySelectorAll() {
      return [];
    },
    addEventListener(type, handler) {
      (handlers[type] ||= []).push(handler);
    },
  };
  const context = vm.createContext({
    console,
    Intl,
    Date,
    document,
    UserAPI: { user: null },
    I18n: {
      supported: ["ko", "en", "vi", "de"],
      language: "ko",
      locale: "ko-KR",
      names: { ko: "한국어" },
      init() {},
      apply() {},
      formatDate: (value) => value,
    },
    ContentAPI: {
      cardText: (card, field) => card[field],
      messageText: (message) => message.originalText || message.text,
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    localStorage: {
      getItem(key) {
        return storage.get(key) || null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    FormData: class {
      constructor(form) {
        this.values = form.values;
      }
      get(name) {
        return this.values[name];
      }
    },
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(project, "js/locales/ko.js"), "utf8"), context);
  context.t = (key, params = {}) =>
    (context.NunchiLocales.ko[key] || key).replace(/\{(\w+)\}/g, (_, name) =>
      String(params[name] ?? "{" + name + "}"),
    );
  const html = fs.readFileSync(path.join(project, "test.html"), "utf8");
  for (const match of html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)) {
    if (match[1].startsWith("js/locales/") || ["js/i18n.js", "js/user-api.js"].includes(match[1]))
      continue;
    vm.runInContext(fs.readFileSync(path.join(project, match[1]), "utf8"), context, {
      filename: match[1],
    });
  }
  const run = (source) => vm.runInContext(source, context);
  return { run, element, handlers };
}

const first = app();
const run = first.run;
assert.equal(run("workspaceTool"), "chat", "기본 진입 화면은 기존 채팅이어야 함");
assert.equal(first.element("#chat-view").hidden, false);
assert.equal(run("activeWorkspace().messages.length"), 0, "샘플 대화를 자동 삽입하지 않음");
run(`activeWorkspace().cards.push({schema:2,id:'card-1',type:'약속',title:'자료조사',text:'초안 정리',date:'2026-12-04',assigneeIds:['me','lena'],confirmedIds:[],createdByName:'민준',time:'20:22'});
activeWorkspace().messages.push({agreement:{id:'card-1'}});
activeWorkspace().messages.push({name:'민준',text:'인터뷰는 생각해볼게요',meaning:'아직 결정하지 않았어요'});
`);
assert.equal(
  run("createMeetingReceipt()"),
  null,
  "채팅에 올리기만 한 카드는 영수증에 포함하지 않음",
);
run("agreementCards()[0].confirmedIds = ['me'];");
assert.equal(run("createMeetingReceipt()"), null, "일부 확인만 받은 카드도 제외");
run(
  "agreementCards()[0].confirmedIds = agreementMembers().map(member => member.id); globalThis.receipt = createMeetingReceipt();",
);
assert.equal(run("receipt.items.length"), 1, "보드의 카드만 포함하고 보류 메시지는 제외");
assert.equal(run("receiptComplete(receipt)"), false);
assert.equal(run("exportReceiptToCalendar(receipt)"), false, "미확정 영수증은 등록 금지");
run("globalThis.item = receipt.items[0];");
assert.equal(run("confirmReceiptItem(receipt, item.id, 'not-a-member')"), false);
for (const member of ["me", "lena", "seoyeon", "linh"]) {
  assert.equal(run(`confirmReceiptItem(receipt,item.id,${JSON.stringify(member)})`), true);
}
assert.equal(run("confirmReceiptItem(receipt,item.id,'me')"), false, "중복 확인 차단");
assert.equal(run("receiptComplete(receipt)"), true);
assert.equal(run("agreementComplete(agreementCards()[0])"), true);
run("exportReceiptToCalendar(receipt); exportReceiptToCalendar(receipt);");
assert.equal(
  run("workspaceTools().events.length"),
  1,
  "반복 등록과 보류 항목으로 일정이 중복 생성되지 않음",
);
assert.equal(run("workspaceTools().todos.length"), 2, "담당자 각각에게 한 번씩 배정");
assert.equal(run("disputeReceiptItem(receipt,item.id,'lena','4월 3일로 이해했어요')"), true);
assert.equal(run("receiptComplete(receipt)"), false);
assert.equal(
  run("agreementComplete(agreementCards()[0])"),
  false,
  "이의가 남은 카드는 보드에서 확정으로 표시하지 않음",
);
assert.equal(run("eventIsCurrent(workspaceTools().events[0])"), false);
assert.equal(
  run("confirmReceiptItem(receipt,item.id,'lena')"),
  false,
  "이의 해결 요청 전에 재확인 차단",
);
assert.equal(run("reviseReceiptItem(receipt,item.id,'2026-02-30')"), false);
assert.equal(run("reviseReceiptItem(receipt,item.id,'2026-12-05')"), true);
assert.equal(run("workspaceTools().events.length"), 0);
assert.equal(run("workspaceTools().todos.length"), 0);
assert.equal(run("item.confirmedIds.length"), 0);
assert.equal(run("agreementCards()[0].confirmedIds.length"), 0);
assert.equal(run("item.disputes[0].resolved"), true);
for (const member of ["me", "lena", "seoyeon", "linh"])
  run(`confirmReceiptItem(receipt,item.id,${JSON.stringify(member)})`);
assert.equal(run("receiptComplete(receipt)"), true);
run("exportReceiptToCalendar(receipt); calendarMonth='2026-12';");
assert(run("renderCalendarTool()").includes("자료조사"));
assert(run("renderReceiptTool()").includes("is-final"));
run("activeWorkspace().members.push({id:'new-member',name:'새 팀원',language:'ko'});");
assert.equal(run("receiptComplete(receipt)"), false, "새 팀원도 확인해야 전원 확정");
assert.equal(run("eventIsCurrent(workspaceTools().events[0])"), false);
run("confirmReceiptItem(receipt,item.id,'new-member');");
assert.equal(run("receiptComplete(receipt)"), true);
assert.equal(run("analyzeNotice('가급적 10장 내외, 형식은 자유롭게').length"), 3);
assert.equal(run("analyzeNotice('일반 안내').length"), 0);
assert(!run("highlightNotice('<script>alert(1)</script> 가급적')").includes("<script>"));
run("workspaceTools().questions.push({id:'q',text:'분량을 확인하고 싶습니다.'});");
assert(run("renderQuestionsTool()").includes("\n"), "메일 초안에는 실제 줄바꿈이 있어야 함");
run("showWorkspaceTool('receipt');");
assert.equal(first.element("#chat-view").hidden, true);
assert.equal(first.element("#tool-view").hidden, false);
run("showWorkspaceTool('chat');");
assert.equal(first.element("#chat-view").hidden, false);
run("saveState();");
const reloaded = app();
assert.equal(reloaded.run("workspaceTools().receipts.length"), 1, "새로고침 후 영수증 보존");
assert.equal(reloaded.run("workspaceTools().events.length"), 1);
assert.equal(reloaded.run("activeWorkspace().messages.length"), 2);
assert.equal(reloaded.run("agreementCards().length"), 1);
reloaded.run("createWorkspace('다른 공간','');");
assert.equal(reloaded.run("workspaceTools().receipts.length"), 0, "워크스페이스 데이터 격리");
assert.equal(reloaded.run("workspaceTool"), "chat");

// 생성한 입력 폼의 submit 버튼 클릭이 submit 전에 화면을 교체하지 않는지 확인합니다.
run("showWorkspaceTool('todo');");
const before = first.element("#tool-content").innerHTML;
const submitButton = {
  type: "submit",
  dataset: {},
  classList: {
    contains() {
      return false;
    },
  },
  closest(selector) {
    return selector === "#tool-view" ? {} : null;
  },
};
const target = {
  closest(selector) {
    return selector === "button" ? submitButton : null;
  },
};
for (const handler of first.handlers.click) handler({ target });
assert.equal(first.element("#tool-content").innerHTML, before);
for (const handler of first.handlers.change)
  handler({
    target: {
      id: "",
      dataset: {},
      value: "작성 중인 텍스트",
      closest() {
        return {};
      },
    },
  });
assert.equal(
  first.element("#tool-content").innerHTML,
  before,
  "일반 입력의 blur/change가 작성 중인 폼을 지우지 않아야 함",
);

// 실제 submit 이벤트가 새 투두를 만들고 공백 입력은 무시하는지 확인합니다.
function submitTodo(title) {
  const form = {
    id: "tool-todo-form",
    dataset: {},
    values: { title, date: "" },
    closest() {
      return {};
    },
    reportValidity() {
      return true;
    },
  };
  for (const handler of first.handlers.submit) handler({ target: form, preventDefault() {} });
}
const initialTodos = run("workspaceTools().todos.length");
submitTodo("발표 리허설 준비");
submitTodo("   ");
assert.equal(run("workspaceTools().todos.length"), initialTodos + 1);
assert(run("renderTodoTool()").includes("발표 리허설 준비"));

const html = fs.readFileSync(path.join(project, "test.html"), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "중복 HTML ID 없음");
assert(
  html.includes('id="agreement-title" required maxlength="80"'),
  "카드 제목은 자동 입력하지 않음",
);
// 개별 카드가 승인되면 다른 항목의 승인 여부와 무관하게 새 영수증에서 제외합니다.
storage.clear();
const approval = app();
approval.run(`activeWorkspace().cards.push(...['a','b'].map(id => ({schema:2,id,type:'약속',title:id,text:'내용',date:'2026-12-04',assigneeIds:['me'],confirmedIds:agreementMembers().map(member => member.id),createdByName:'민준',time:'20:22'})));
globalThis.originalReceipt = createMeetingReceipt();
globalThis.approvedItem = originalReceipt.items.find(item => item.cardId === 'a');
agreementMembers().forEach(member => confirmReceiptItem(originalReceipt,approvedItem.id,member.id));
saveState();`);
const approvalReloaded = approval;
assert.equal(
  approvalReloaded.run("createMeetingReceipt().items.map(item => item.cardId).join(',')"),
  "b",
  "같은 페이지에서 승인 카드 제외 적용",
);
assert.equal(
  approvalReloaded.run("workspaceTools().receipts[0].items.length"),
  2,
  "기존 영수증 승인 기록은 보존",
);
approvalReloaded.run(
  `globalThis.currentReceipt = activeReceipt(); agreementMembers().forEach(member => confirmReceiptItem(currentReceipt,currentReceipt.items[0].id,member.id));`,
);
assert.equal(
  approvalReloaded.run("createMeetingReceipt()"),
  null,
  "모두 승인된 상태에서는 빈 영수증을 만들지 않음",
);
assert.equal(approvalReloaded.run("workspaceTools().receipts.length"), 2);
approvalReloaded.run("agreementCards().find(card => card.id === 'a').date = '2026-12-05';");
assert.equal(
  approvalReloaded.run("createMeetingReceipt().items.map(item => item.cardId).join(',')"),
  "a",
  "마감일이 바뀌면 재승인 대상",
);
storage.set(
  "nunchichat.workspaces.v1",
  JSON.stringify({
    version: 1,
    activeId: "old",
    workspaces: [
      {
        id: "old",
        name: "이전 기록",
        members: [{ id: "me", name: "민준" }],
        messages: [{ text: "이전 대화" }],
        cards: [],
        invitations: [],
      },
    ],
  }),
);
const fresh = app();
assert.equal(fresh.run("activeWorkspace().id"), "old", "이전 저장 데이터를 유지함");
assert.equal(storage.has("nunchichat.workspaces.v1"), true, "기존 저장 기록 보존");
fresh.run("saveState()");
assert.equal(storage.size, 1, "대화 상태를 브라우저에 저장함");
console.log(
  "PASS: receipts, objections, date revision, refresh persistence and legacy preservation, calendar/todo, notices, forms; approved-card exclusion, no empty receipts, changed-card reapproval",
);
