"use strict";

// ZIP 08~12 화면의 로컬 기능. 기존 채팅·카드 데이터와 같은 공간에 저장합니다.
let workspaceTool = "chat";
let toolLanguage = "ko";
let calendarMonth = seoulDate().slice(0, 7);
const toolTitles = { receipt: "합의 영수증", calendar: "공용 캘린더", todo: "개인 투두", notice: "공지 해석", questions: "교수님께 물을 질문", receiver: "수신 화면 미리보기" };

function seoulDate() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = type => parts.find(part => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function workspaceTools(workspace = activeWorkspace()) {
  if (!workspace) return null;
  if (!workspace.tools) workspace.tools = {};
  for (const key of ["receipts", "events", "todos", "questions", "noticeChecks"]) {
    if (!Array.isArray(workspace.tools[key])) workspace.tools[key] = [];
  }
  return workspace.tools;
}
function validToolDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
function toolDate(date) {
  if (!validToolDate(date)) return "미정";
  return new Intl.DateTimeFormat({ ko: "ko-KR", en: "en-US", vi: "vi-VN" }[toolLanguage], {
    year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul",
  }).format(new Date(date + "T00:00:00Z"));
}
function memberOptions(selected) {
  return agreementMembers().map(member => `<option value="${esc(member.id)}" ${member.id === selected ? "selected" : ""}>${esc(member.name)}</option>`).join("");
}
function cardSignature(card) {
  return JSON.stringify([card.title, card.text, card.date, card.assigneeIds]);
}
function receiptCurrentItem(item) {
  if (!item.cardId) return true;
  const card = agreementCards().find(card => card.id === item.cardId);
  return Boolean(card && cardSignature(card) === item.signature);
}
function receiptItemComplete(item) {
  const members = agreementMembers();
  const card = item.cardId && agreementCards().find(card => card.id === item.cardId);
  if (card && receiptCardDisputed(card)) return false;
  return receiptCurrentItem(item) && members.length > 0 && !item.disputes.some(dispute => !dispute.resolved) &&
    members.every(member => item.confirmedIds.includes(member.id));
}
function receiptCardDisputed(card) {
  return Boolean(workspaceTools()?.receipts.some(receipt => receipt.items.some(item =>
    item.cardId === card.id && item.signature === cardSignature(card) && item.disputes.some(dispute => !dispute.resolved))));
}
function receiptComplete(receipt) {
  return receipt.items.length > 0 && receipt.items.every(receiptItemComplete);
}
function activeReceipt() {
  const tools = workspaceTools();
  return tools?.receipts.find(receipt => receipt.id === tools.activeReceiptId) || tools?.receipts[tools.receipts.length - 1];
}
function createMeetingReceipt() {
  const tools = workspaceTools();
  if (!tools) return null;
  // 같은 내용으로 이미 영수증 전원 승인을 받은 카드는 다시 심사하지 않습니다.
  const pendingCards = agreementCards().filter(agreementComplete).filter(card => !tools.receipts.some(receipt =>
    receipt.items.some(item => item.cardId === card.id && item.signature === cardSignature(card) && receiptItemComplete(item))));
  const items = pendingCards.map(card => ({
    id: newId("item"), cardId: card.id, signature: cardSignature(card), title: card.title,
    text: card.text, date: card.date, assigneeIds: [...card.assigneeIds], hold: false,
    confirmedIds: [], disputes: [], history: [],
  }));
  if (!items.length) { toast("합의 보드에 새로 승인할 카드가 없어요. 채팅에서 팀원 모두의 확인을 먼저 받아 주세요."); return null; }
  const receipt = { id: newId("receipt"), date: seoulDate(), createdAt: new Date().toISOString(), items };
  tools.receipts.push(receipt);
  tools.activeReceiptId = receipt.id;
  saveState();
  return receipt;
}
function confirmReceiptItem(receipt, itemId, memberId) {
  const item = receipt?.items.find(item => item.id === itemId);
  if (!item || !receiptCurrentItem(item) || item.disputes.some(dispute => !dispute.resolved) ||
      !agreementMembers().some(member => member.id === memberId) || item.confirmedIds.includes(memberId)) return false;
  item.confirmedIds.push(memberId);
  if (receiptItemComplete(item) && item.cardId) {
    const card = agreementCards().find(card => card.id === item.cardId);
    card.confirmedIds = agreementMembers().map(member => member.id);
    card.justPinned = true;
  }
  saveState();
  return true;
}
function disputeReceiptItem(receipt, itemId, memberId, reason) {
  const item = receipt?.items.find(item => item.id === itemId);
  if (!item || !receiptCurrentItem(item) || !reason.trim() || !agreementMembers().some(member => member.id === memberId)) return false;
  item.confirmedIds = item.confirmedIds.filter(id => id !== memberId);
  item.disputes.push({ memberId, reason: reason.trim().slice(0, 300), resolved: false });
  const card = agreementCards().find(card => card.id === item.cardId);
  if (card) card.confirmedIds = card.confirmedIds.filter(id => id !== memberId);
  saveState();
  return true;
}
function reviseReceiptItem(receipt, itemId, date) {
  const item = receipt?.items.find(item => item.id === itemId);
  if (!item || (date && !validToolDate(date)) || (!item.hold && !date)) return false;
  item.history.push({ date: item.date, revisedAt: new Date().toISOString() });
  item.date = date;
  item.confirmedIds = [];
  item.disputes.forEach(dispute => { dispute.resolved = true; });
  const card = agreementCards().find(card => card.id === item.cardId);
  if (card) {
    card.date = date;
    card.confirmedIds = [];
    card.justPinned = false;
    item.title = card.title;
    item.text = card.text;
    item.assigneeIds = [...card.assigneeIds];
    item.signature = cardSignature(card);
  }
  // 날짜 수정 전의 일정·투두가 계속 확정 상태로 남지 않도록 제거합니다.
  const tools = workspaceTools();
  tools.events = tools.events.filter(event => event.sourceKey !== item.cardId && event.sourceKey !== item.id);
  tools.todos = tools.todos.filter(todo => todo.sourceKey !== item.cardId && todo.sourceKey !== item.id);
  saveState();
  return true;
}
function exportReceiptToCalendar(receipt) {
  if (!receipt || !receiptComplete(receipt)) return false;
  const tools = workspaceTools();
  for (const item of receipt.items.filter(item => !item.hold && validToolDate(item.date))) {
    const sourceKey = item.cardId || item.id;
    const entry = { sourceKey, receiptId: receipt.id, itemId: item.id, title: item.title, text: item.text, date: item.date, assigneeIds: [...item.assigneeIds] };
    const event = tools.events.find(event => event.sourceKey === sourceKey);
    if (event) Object.assign(event, entry); else tools.events.push({ id: newId("event"), ...entry });
    for (const memberId of item.assigneeIds) {
      const todo = tools.todos.find(todo => todo.sourceKey === sourceKey && todo.memberId === memberId);
      if (todo) Object.assign(todo, entry); else tools.todos.push({ id: newId("todo"), memberId, done: false, ...entry });
    }
  }
  saveState();
  return true;
}
function eventIsCurrent(event) {
  const receipt = workspaceTools().receipts.find(receipt => receipt.id === event.receiptId);
  const item = receipt?.items.find(item => item.id === event.itemId);
  return Boolean(item && !item.hold && receiptItemComplete(item) && item.date === event.date);
}

function showWorkspaceTool(view) {
  if (view !== "chat" && !toolTitles[view]) return;
  workspaceTool = view;
  $("#chat-view").hidden = view !== "chat";
  $("#tool-view").hidden = view === "chat";
  document.querySelectorAll("[data-tool-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.toolView === view);
    button.setAttribute("aria-pressed", String(button.dataset.toolView === view));
  });
  $("#sidebar").classList.remove("open");
  $("#menu").setAttribute("aria-expanded", "false");
  renderWorkspaceTool();
}
function refreshWorkspaceTools() {
  const button = $("#end-meeting");
  if (button) button.disabled = !activeWorkspace();
  if ($("#tool-content") && workspaceTool !== "chat") renderWorkspaceTool();
}
function renderWorkspaceTool() {
  if (workspaceTool === "chat") return;
  const root = $("#tool-content");
  const workspace = activeWorkspace();
  if (!workspace) { root.innerHTML = '<p class="empty">워크스페이스를 먼저 선택하거나 만들어 주세요.</p>'; return; }
  const headings = `<header class="tools-heading"><div><button type="button" class="link" data-tool-view="chat">← 채팅으로 돌아가기</button><h2>${toolTitles[workspaceTool]}</h2><p>${esc(workspace.name)}</p></div><label>데모 확인자<select id="tool-member">${memberOptions(agreementViewer)}</select></label></header>`;
  root.innerHTML = headings + ({ receipt: renderReceiptTool, calendar: renderCalendarTool, todo: renderTodoTool, notice: renderNoticeTool, questions: renderQuestionsTool, receiver: renderReceiverTool }[workspaceTool])();
}
function renderReceiverTool() {
  const workspace = activeWorkspace();
  const recipient = agreementMembers().find(member => member.id === agreementViewer);
  const languages = { ko: "한국어", en: "English", vi: "Tiếng Việt", de: "Deutsch" };
  function messageCell(message, receiving) {
      if (message.agreement) {
        const previousViewer = agreementViewer;
        if (!receiving) agreementViewer = currentUser.id;
        const markup = renderAgreementMessage(message.agreement);
        agreementViewer = previousViewer;
        // 확인 버튼은 수신자 패널 하나에서만 제공해 중복된 조작을 피합니다.
        return receiving ? markup : markup.replace(/<button\b[^>]*data-confirm-agreement[^>]*>.*?<\/button>/g, "");
      }
      const englishExample = receiving && recipient?.language === "en" && message.translation;
      return `<article class="receiver-message"><b>${esc(message.name)}</b><span>${esc(message.time)}</span><p>${esc(englishExample || message.text)}</p>${message.meaning ? `<small>발신자가 확인한 뜻 · ${esc(message.meaning)}</small>` : ""}${receiving ? `<details><summary>원문 보기</summary><p>${esc(message.text)}</p></details>` : ""}</article>`;
  }
  const senderLabel = `${currentUser.name} · 발신 화면`;
  const receiverLabel = `${recipient?.name || "팀원"} · ${languages[recipient?.language] || "원문"} 수신 화면`;
  const rows = workspace.messages.map(message => `<div class="receiver-row"><section class="receiver-cell" aria-label="${esc(senderLabel)}" data-pane-label="${esc(senderLabel)}">${messageCell(message, false)}</section><section class="receiver-cell" aria-label="${esc(receiverLabel)}" data-pane-label="${esc(receiverLabel)}">${messageCell(message, true)}</section></div>`).join("");
  return `<p class="tool-muted">로컬 수신 화면 체험입니다. 미리 준비된 영어 의미 예시 외에는 원문을 표시하며, 실제 번역·전송은 하지 않습니다.</p><div class="receiver-split"><header class="receiver-pane-header">${esc(senderLabel)}</header><header class="receiver-pane-header">${esc(receiverLabel)}</header>${rows || '<div class="receiver-empty"><p class="empty">채팅에 메시지나 합의 카드를 올려 보세요.</p></div>'}</div>`;
}
const receiptLabels = {
  ko: { title: "합의 영수증", items: "확인할 항목", what: "무엇을", who: "누가", due: "언제까지", confirm: "확인", confirmed: "확인함 ✓", dispute: "이의 제기", final: "확정", pending: "아직 확정 전", hold: "보류" },
  en: { title: "Agreement receipt", items: "Items to review", what: "What", who: "Who", due: "Due", confirm: "Confirm", confirmed: "Confirmed ✓", dispute: "Dispute", final: "FINAL", pending: "NOT FINAL YET", hold: "On hold" },
  vi: { title: "Biên nhận thỏa thuận", items: "Mục cần xác nhận", what: "Nội dung", who: "Người phụ trách", due: "Hạn chót", confirm: "Xác nhận", confirmed: "Đã xác nhận ✓", dispute: "Phản đối", final: "ĐÃ CHỐT", pending: "CHƯA CHỐT", hold: "Tạm hoãn" },
};
function renderReceiptTool() {
  const tools = workspaceTools();
  const receipt = activeReceipt();
  if (!receipt) return '<div class="tools-empty"><h3>회의에서 정한 내용을 한 번 더 확인해요.</h3><p>팀원 모두가 확인해 합의 보드에 고정된 카드만 영수증에 담아요.</p><button type="button" class="btn primary" data-new-receipt>회의 결산 만들기</button></div>';
  const labels = receiptLabels[toolLanguage];
  const done = receipt.items.filter(receiptItemComplete).length;
  const disputed = receipt.items.filter(item => item.disputes.some(dispute => !dispute.resolved)).length;
  return `<div class="tools-toolbar"><label>회의 기록<select id="receipt-choice">${[...tools.receipts].reverse().map(item => `<option value="${esc(item.id)}" ${item.id === receipt.id ? "selected" : ""}>${esc(item.date)} · ${esc(item.id.slice(-6))}</option>`).join("")}</select></label><button class="btn" type="button" data-new-receipt>새 회의 결산</button></div>
    <article class="meeting-receipt"><div class="receipt-overline">AGREEMENT RECEIPT <span>No. ${esc(receipt.id.slice(-6))}</span></div><h3>${labels.title}</h3><label class="receipt-language">표시 언어<select id="receipt-language"><option value="ko" ${toolLanguage === "ko" ? "selected" : ""}>한국어</option><option value="en" ${toolLanguage === "en" ? "selected" : ""}>English</option><option value="vi" ${toolLanguage === "vi" ? "selected" : ""}>Tiếng Việt</option></select></label><p class="tool-muted">항목명·날짜 표시만 전환됩니다. 작성한 내용은 원문입니다.</p>
    <dl class="receipt-facts"><dt>회의 날짜</dt><dd>${esc(toolDate(receipt.date))}</dd><dt>참여자</dt><dd>${agreementMembers().map(member => esc(member.name)).join(" · ")}</dd></dl><h4>${labels.items} · ${receipt.items.length}</h4>
    ${receipt.items.map((item, index) => {
      const open = item.disputes.filter(dispute => !dispute.resolved);
      const complete = receiptItemComplete(item);
      const outdated = !receiptCurrentItem(item);
      return `<section class="receipt-item ${open.length ? "has-dispute" : ""}"><div class="receipt-item-title"><span class="receipt-number">${String(index + 1).padStart(2, "0")}</span><h4>${esc(item.title)}</h4>${item.hold ? `<span class="agreement-tag">${labels.hold}</span>` : ""}<span class="receipt-state">${complete ? "전원 확인 ✓" : outdated ? "원본 변경됨" : "확인 대기"}</span></div>
      <dl class="receipt-facts"><dt>${labels.what}</dt><dd>${esc(item.text)}</dd><dt>${labels.who}</dt><dd>${item.assigneeIds.map(id => esc(agreementName(id))).join(" · ")}</dd><dt>${labels.due}</dt><dd>${item.date ? esc(toolDate(item.date)) : "다음 회의에서 결정"}</dd></dl>
      <div class="receipt-item-actions"><span>${item.confirmedIds.filter(id => agreementMembers().some(member => member.id === id)).length}/${agreementMembers().length}명 확인</span><button type="button" class="btn primary" data-receipt-confirm="${esc(item.id)}" ${outdated || open.length || item.confirmedIds.includes(agreementViewer) ? "disabled" : ""}>${item.confirmedIds.includes(agreementViewer) ? labels.confirmed : labels.confirm}</button></div>
      <details><summary>${labels.dispute}</summary><form data-dispute-item="${esc(item.id)}"><label class="field">다르게 이해한 내용<textarea name="reason" rows="2" required maxlength="300"></textarea></label><button class="btn" type="submit">이의 남기기</button></form></details>
      ${item.disputes.map(dispute => `<p class="receipt-dispute"><b>${esc(agreementName(dispute.memberId))}</b> ${esc(dispute.reason)} ${dispute.resolved ? "· 재확인 요청됨" : "· 이의 있음"}</p>`).join("")}
      <details ${open.length || outdated ? "open" : ""}><summary>날짜 정규화 · 수정 · 다시 확인 요청</summary><p class="tool-muted">월 이름과 요일까지 표시해 날짜 순서의 오해를 줄여요. 수정 후에는 기존 동의가 초기화됩니다.</p><form class="receipt-revision" data-revise-item="${esc(item.id)}"><label class="field">마감일<input name="date" type="date" value="${esc(item.date)}" ${item.hold ? "" : "required"}></label><button class="btn" type="submit">이 날짜로 다시 확인 요청</button></form>${item.history.length ? `<p class="tool-muted">이전 마감: ${esc(item.history[item.history.length - 1].date || "미정")} → ${esc(item.date || "미정")}</p>` : ""}</details></section>`;
    }).join("")}
    <footer class="receipt-total"><div><p>전원 확인 <b>${done} / ${receipt.items.length}</b></p><p>이의 <b>${disputed}</b></p></div><div class="receipt-stamp ${receiptComplete(receipt) ? "is-final" : ""}"><b>${receiptComplete(receipt) ? labels.final : labels.pending}</b><small>${esc(receipt.date)}</small></div></footer><button class="btn primary receipt-export" type="button" data-export-receipt ${receiptComplete(receipt) ? "" : "disabled"}>확정 항목 공용 캘린더·개인 투두에 등록</button></article>`;
}

function renderCalendarTool() {
  const tools = workspaceTools();
  const [year, month] = calendarMonth.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = first.getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Math.ceil((offset + days) / 7) * 7;
  const events = tools.events.filter(eventIsCurrent);
  return `<div class="tools-toolbar"><div class="month-controls"><button type="button" class="btn" data-month-step="-1" aria-label="이전 달">‹</button><h3>${year}년 ${month}월</h3><button type="button" class="btn" data-month-step="1" aria-label="다음 달">›</button><button type="button" class="btn" data-month-today>오늘</button></div><span class="tool-muted">확정 영수증에서 등록한 일정 ${events.length}개</span></div><div class="calendar-scroll"><div class="tools-calendar"><div class="calendar-week">${["일", "월", "화", "수", "목", "금", "토"].map(day => `<span>${day}</span>`).join("")}</div><div class="calendar-days">${Array.from({ length: cells }, (_, index) => {
    const day = index - offset + 1;
    if (day < 1 || day > days) return '<div class="calendar-day outside"></div>';
    const date = calendarMonth + "-" + String(day).padStart(2, "0");
    return `<div class="calendar-day ${date === seoulDate() ? "is-today" : ""}"><span>${day}</span>${events.filter(event => event.date === date).map(event => `<button type="button" class="calendar-event" data-open-receipt="${esc(event.receiptId)}" title="${esc(event.text)}">${esc(event.title)}<small>${event.assigneeIds.map(id => esc(agreementName(id))).join(" · ")}</small></button>`).join("")}</div>`;
  }).join("")}</div></div></div><p class="tool-muted">일정의 원본 영수증에 이의가 남거나 날짜가 바뀌면 기존 일정은 숨겨집니다. 재확인 후 다시 등록해 주세요.</p>`;
}
function renderTodoTool() {
  const todos = workspaceTools().todos.filter(todo => todo.memberId === agreementViewer && (!todo.sourceKey || eventIsCurrent(todo)));
  return `<div class="tools-columns"><section class="tool-surface"><h3>${esc(agreementName(agreementViewer))}의 할 일</h3><p class="tool-muted">내게 배정된 확정 항목과 직접 추가한 일을 모아요.</p>${todos.length ? todos.map(todo => `<label class="tool-todo ${todo.done ? "is-done" : ""}"><input type="checkbox" data-todo-check="${esc(todo.id)}" ${todo.done ? "checked" : ""}><span><b>${esc(todo.title)}</b><small>${todo.date ? esc(toolDate(todo.date)) : "마감 없음"}</small>${todo.sourceKey ? '<small>합의 영수증에서 등록됨</small>' : ""}</span><button type="button" class="link" data-delete-todo="${esc(todo.id)}" aria-label="${esc(todo.title)} 삭제">삭제</button></label>`).join("") : '<p class="empty">아직 할 일이 없어요.</p>'}</section><form class="tool-surface" id="tool-todo-form"><h3>할 일 추가</h3><label class="field">할 일<input name="title" required maxlength="120"></label><label class="field">마감일 · 선택<input name="date" type="date"></label><button type="submit" class="btn primary">추가하기</button></form></div>`;
}

const noticeExpressions = [
  { phrase: "가급적", translation: "if possible", explanation: "선택처럼 들려도 수업에서는 되도록 지켜 달라는 요청일 수 있어요. 실제 필수 여부는 교수님께 확인하세요.", question: "‘가급적’으로 안내한 제출 형식은 반드시 지켜야 하나요?" },
  { phrase: "내외", translation: "around", explanation: "정확한 허용 범위가 정해진 표현은 아니에요. 표지·참고문헌 포함 여부도 함께 확인하세요.", question: "분량의 허용 범위와 표지·참고문헌 포함 여부를 알려주실 수 있나요?" },
  { phrase: "자유롭게", translation: "freely", explanation: "형식의 자유와 필수 조건은 구분해야 해요. 같은 문장의 다른 조건을 함께 읽어 보세요.", question: "자유롭게 정할 수 있는 부분과 반드시 지켜야 하는 조건은 무엇인가요?" },
];
function analyzeNotice(text) { return noticeExpressions.filter(expression => text.includes(expression.phrase)); }
function highlightNotice(text) {
  return esc(text).replace(/가급적|내외|자유롭게/g, phrase => `<mark>${phrase}</mark>`);
}
function renderNoticeTool() {
  const tools = workspaceTools();
  const text = tools.noticeText || "";
  const found = analyzeNotice(text);
  return `<form class="tool-surface notice-input" id="tool-notice-form"><label class="field">강의 공지 원문<textarea name="notice" rows="5" required maxlength="10000" placeholder="확인할 강의 공지를 붙여 넣어 주세요.">${esc(text)}</textarea></label><button type="submit" class="btn primary">표현 확인하기</button><span class="tool-muted">예시 표현 3종을 찾는 도구입니다. AI 번역은 연결되어 있지 않습니다.</span></form>${text ? `<div class="tools-columns notice-columns"><section class="tool-surface"><h3>원문 · 한국어</h3><div class="notice-document">${highlightNotice(text)}</div><h4>표현별 영어 대응</h4><p class="tool-muted">문장 전체를 번역한 결과가 아닙니다.</p>${found.map(expression => `<p>${esc(expression.phrase)} → ${esc(expression.translation)}</p>`).join("")}</section><aside class="tool-surface"><h3>확인할 표현 ${found.length}개</h3>${found.length ? found.map(expression => `<article class="notice-expression"><h4>${esc(expression.phrase)} <small>→ ${esc(expression.translation)}</small></h4><p>${esc(expression.explanation)}</p><label><input type="checkbox" data-notice-check="${esc(expression.phrase)}" ${tools.noticeChecks.includes(expression.phrase) ? "checked" : ""}> 내용을 확인했어요</label><button type="button" class="btn" data-save-question="${esc(expression.phrase)}">교수님께 확인할 질문으로 저장</button></article>`).join("") : '<p class="empty">지정된 예시 표현이 없어요. 모호한 표현이 전혀 없다는 의미는 아닙니다.</p>'}<button type="button" class="btn" data-share-notice>팀 채팅에 공유</button></aside></div>` : ""}`;
}
function renderQuestionsTool() {
  const questions = workspaceTools().questions;
  return `<div class="tools-columns"><section class="tool-surface"><h3>저장한 질문 ${questions.length}개</h3>${questions.map(question => `<article class="saved-question"><p>${esc(question.text)}</p><button type="button" class="link" data-delete-question="${esc(question.id)}">삭제</button></article>`).join("") || '<p class="empty">공지 해석에서 확인할 질문을 저장해 보세요.</p>'}<form id="tool-question-form"><label class="field">질문 직접 추가<input name="question" required maxlength="500"></label><button type="submit" class="btn">저장</button></form></section><section class="tool-surface"><h3>교수님께 보낼 메일 초안</h3><p class="tool-muted">내용을 검토한 뒤 직접 보내 주세요. 이 화면에서는 메일을 발송하지 않습니다.</p><textarea id="question-email" rows="14" readonly>${esc(questions.length ? `교수님 안녕하세요.
${activeWorkspace().name} 팀입니다.
공지와 관련해 다음 내용을 확인하고 싶습니다.

${questions.map((question, index) => `${index + 1}. ${question.text}`).join(String.fromCharCode(10))}

확인해 주셔서 감사합니다.` : "질문을 저장하면 초안이 표시됩니다.")}</textarea><button type="button" class="btn" data-copy-questions ${questions.length ? "" : "disabled"}>초안 복사</button><p id="question-copy-status" role="status"></p></section></div>`;
}

function initWorkspaceTools() {
  appState.workspaces.forEach(workspaceTools);
  $("#end-meeting").addEventListener("click", () => { if (createMeetingReceipt()) showWorkspaceTool("receipt"); });
  document.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.toolView) return showWorkspaceTool(button.dataset.toolView);
    // 폼 제출 전에 화면을 다시 그리면 입력값과 submit 이벤트가 사라집니다.
    if (!button.closest("#tool-view") || button.type === "submit") return;
    if (!activeWorkspace()) return;
    const tools = workspaceTools();
    const receipt = activeReceipt();
    if (button.hasAttribute("data-new-receipt")) { if (createMeetingReceipt()) showWorkspaceTool("receipt"); return; }
    if (button.dataset.receiptConfirm) {
      if (confirmReceiptItem(receipt, button.dataset.receiptConfirm, agreementViewer)) { renderMessages(); renderBoard(); }
    }
    if (button.hasAttribute("data-export-receipt")) {
      if (exportReceiptToCalendar(receipt)) {
        const dated = receipt.items.find(item => !item.hold && validToolDate(item.date));
        if (dated) calendarMonth = dated.date.slice(0, 7);
        showWorkspaceTool("calendar");
        toast("확정 항목을 캘린더와 담당자의 투두에 등록했어요.");
      }
      return;
    }
    if (button.dataset.openReceipt) { tools.activeReceiptId = button.dataset.openReceipt; showWorkspaceTool("receipt"); return; }
    if (button.hasAttribute("data-month-step")) {
      const [year, month] = calendarMonth.split("-").map(Number);
      const next = new Date(Date.UTC(year, month - 1 + Number(button.dataset.monthStep), 1));
      calendarMonth = next.toISOString().slice(0, 7);
    }
    if (button.hasAttribute("data-month-today")) calendarMonth = seoulDate().slice(0, 7);
    if (button.dataset.deleteTodo) tools.todos = tools.todos.filter(todo => todo.id !== button.dataset.deleteTodo);
    if (button.dataset.saveQuestion) {
      const expression = noticeExpressions.find(expression => expression.phrase === button.dataset.saveQuestion);
      if (expression && !tools.questions.some(question => question.text === expression.question)) tools.questions.push({ id: newId("question"), text: expression.question });
      toast("교수님께 확인할 질문에 저장했어요.");
    }
    if (button.dataset.deleteQuestion) tools.questions = tools.questions.filter(question => question.id !== button.dataset.deleteQuestion);
    if (button.hasAttribute("data-share-notice") && tools.noticeText) {
      pushMessage(`[강의 공지 확인]
${tools.noticeText}
확인할 표현: ${analyzeNotice(tools.noticeText).map(expression => expression.phrase).join(", ")}`);
      showWorkspaceTool("chat");
    }
    if (button.hasAttribute("data-copy-questions")) {
      try { await navigator.clipboard.writeText($("#question-email").value); toast("메일 초안을 복사했어요."); }
      catch { $("#question-email").select(); $("#question-copy-status").textContent = "자동 복사가 제한되어 있어요. 선택된 초안을 직접 복사해 주세요."; }
      return;
    }
    saveState();
    renderWorkspaceTool();
  });
  document.addEventListener("change", event => {
    const input = event.target;
    if (!activeWorkspace()) return;
    const tools = workspaceTools();
    let handled = false;
    if (input.id === "tool-member" && agreementMembers().some(member => member.id === input.value)) {
      agreementViewer = input.value;
      renderMessages(); renderBoard();
      handled = true;
    }
    if (input.id === "receipt-language" && receiptLabels[input.value]) { toolLanguage = input.value; handled = true; }
    if (input.id === "receipt-choice") { tools.activeReceiptId = input.value; handled = true; }
    if (input.dataset.todoCheck) {
      const todo = tools.todos.find(todo => todo.id === input.dataset.todoCheck && todo.memberId === agreementViewer);
      if (todo) todo.done = input.checked;
      handled = true;
    }
    if (input.dataset.noticeCheck) {
      tools.noticeChecks = tools.noticeChecks.filter(phrase => phrase !== input.dataset.noticeCheck);
      if (input.checked) tools.noticeChecks.push(input.dataset.noticeCheck);
      handled = true;
    }
    if (handled) { saveState(); renderWorkspaceTool(); }
  });
  document.addEventListener("submit", event => {
    const form = event.target;
    if (!form.closest("#tool-view")) return;
    event.preventDefault();
    if (!form.reportValidity() || !activeWorkspace()) return;
    const values = new FormData(form);
    const tools = workspaceTools();
    if (form.dataset.disputeItem) disputeReceiptItem(activeReceipt(), form.dataset.disputeItem, agreementViewer, String(values.get("reason") || ""));
    if (form.dataset.reviseItem) {
      if (!reviseReceiptItem(activeReceipt(), form.dataset.reviseItem, String(values.get("date") || ""))) return toast("올바른 날짜를 입력해 주세요.");
      toast("내용을 수정했어요. 모든 팀원이 다시 확인해야 해요.");
    }
    if (form.id === "tool-todo-form") {
      const title = String(values.get("title") || "").trim();
      if (!title) return;
      const date = String(values.get("date") || "");
      if (date && !validToolDate(date)) return;
      tools.todos.push({ id: newId("todo"), title, date, memberId: agreementViewer, done: false });
    }
    if (form.id === "tool-notice-form") {
      const text = String(values.get("notice") || "").trim();
      if (!text) return;
      if (text !== tools.noticeText) tools.noticeChecks = [];
      tools.noticeText = text;
    }
    if (form.id === "tool-question-form") {
      const text = String(values.get("question") || "").trim();
      if (!text) return;
      tools.questions.push({ id: newId("question"), text });
    }
    saveState(); renderMessages(); renderBoard(); renderWorkspaceTool();
  });
  refreshWorkspaceTools();
}
