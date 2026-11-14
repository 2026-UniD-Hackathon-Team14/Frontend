"use strict";
let workspaceTool = "chat";
let calendarMonth = new Date().toISOString().slice(0, 7);
let toolVersion = 0;
const toolReads = new Set();
const serverTools = {
  events: [],
  todos: [],
  receipts: [],
  receipt: null,
  receiptId: null,
  receiptRoomId: null,
  loading: false,
};
function toolDate(value) {
  return value ? I18n.formatDate(value) : t("noDueDate");
}
function toolFormDrafts() {
  return [...document.querySelectorAll("#tool-content form")].map((form) => ({
    key: form.id || JSON.stringify(form.dataset),
    fields: [...form.elements]
      .filter((el) => el.name)
      .map((el) => ({ name: el.name, value: el.value, checked: el.checked })),
  }));
}
function restoreToolDrafts(drafts) {
  for (const form of document.querySelectorAll("#tool-content form")) {
    const draft = drafts.find(
      (d) => d.key === (form.id || JSON.stringify(form.dataset)),
    );
    if (draft)
      for (const el of form.elements) {
        const field = draft.fields.find((f) => f.name === el.name);
        if (field) {
          el.value = field.value;
          el.checked = field.checked;
        }
      }
  }
}
function refreshWorkspaceTools() {
  const button = $("#settle-agreements");
  button.disabled =
    !ready ||
    !activeWorkspace() ||
    roomLeaveInFlight ||
    button.dataset.pending === "true";
  button.textContent = t("tools.settle");
}
async function showWorkspaceTool(view, { receiptId = null } = {}) {
  if (!["chat", "receipt", "calendar", "todo"].includes(view)) return;
  workspaceTool = view;
  serverTools.requestedReceiptId =
    view === "receipt" && receiptId != null ? String(receiptId) : null;
  toolVersion++;
  $("#chat-view").hidden = view !== "chat";
  $("#tool-view").hidden = view === "chat";
  document.querySelectorAll("[data-tool-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.toolView === view);
    b.setAttribute("aria-pressed", String(b.dataset.toolView === view));
  });
  $("#sidebar").classList.remove("open");
  $("#menu").setAttribute("aria-expanded", "false");
  if (view === "chat") return;
  serverTools.events = [];
  serverTools.todos = [];
  serverTools.receipt = null;
  serverTools.receipts = [];
  serverTools.loading = true;
  renderWorkspaceTool();
  await loadWorkspaceTool();
}
async function loadWorkspaceTool({ quiet = false } = {}) {
  const readKey =
    workspaceTool +
    ":" +
    channel +
    ":" +
    I18n.language +
    ":" +
    serverTools.receiptId;
  if (quiet && toolReads.has(readKey)) return;
  const version = ++toolVersion,
    view = workspaceTool,
    roomId = channel,
    lang = I18n.language;
  if (view === "chat") return;
  toolReads.add(readKey);
  try {
    let data, receipts, selectedReceiptId;
    if (view === "todo") data = await API.request("/todos");
    else if (!roomId) {
      serverTools.loading = false;
      renderWorkspaceTool();
      return;
    } else if (view === "calendar")
      data = await API.request(
        "/rooms/" + roomId + "/calendar-events?lang=" + lang,
      );
    else {
      receipts = await API.request("/rooms/" + API.id(roomId) + "/receipts");
      if (!Array.isArray(receipts)) throw new Error("api.invalidResponse");
      const preferredId =
        serverTools.requestedReceiptId ||
        (serverTools.receiptRoomId === roomId
          ? String(serverTools.receiptId)
          : null);
      if (
        serverTools.requestedReceiptId &&
        !receipts.some((receipt) => String(receipt.id) === preferredId)
      )
        throw new Error("api.receiptUnavailable");
      selectedReceiptId =
        receipts.find((receipt) => String(receipt.id) === preferredId)?.id ??
        receipts[0]?.id ??
        null;
      data = selectedReceiptId
        ? await API.request(
            "/receipts/" + API.id(selectedReceiptId) + "?lang=" + lang,
          )
        : null;
      if (data?.roomId != null && String(data.roomId) !== roomId)
        throw new Error("api.receiptRoomMismatch");
    }
    if (
      version !== toolVersion ||
      roomId !== channel ||
      lang !== I18n.language ||
      view !== workspaceTool
    )
      return;
    if (view === "todo") serverTools.todos = data;
    if (view === "calendar") serverTools.events = data;
    if (view === "receipt") {
      serverTools.receipt = data;
      serverTools.receipts = receipts;
      serverTools.receiptId =
        selectedReceiptId == null ? null : String(selectedReceiptId);
      serverTools.receiptRoomId = roomId;
      appState.receiptIds[roomId] = receipts.map((receipt) =>
        String(receipt.id),
      );
      saveState();
    }
    const drafts = toolFormDrafts();
    serverTools.loading = false;
    renderWorkspaceTool();
    restoreToolDrafts(drafts);
  } catch (error) {
    if (version === toolVersion) {
      serverTools.loading = false;
      renderWorkspaceTool();
      if (!quiet) showError(error);
    }
  } finally {
    toolReads.delete(readKey);
  }
}
function renderWorkspaceTool() {
  if (workspaceTool === "chat") return;
  const root = $("#tool-content");
  root.innerHTML =
    '<header class="tools-heading"><div><button type="button" class="link" data-tool-view="chat">' +
    esc(t("tools.back")) +
    "</button><h2>" +
    esc(t("tools." + workspaceTool)) +
    "</h2><p>" +
    esc(activeWorkspace()?.name || "") +
    '</p></div><button type="button" class="btn" data-refresh-tools>' +
    esc(t("api.refresh")) +
    "</button></header>";
  if (serverTools.loading) {
    root.innerHTML += '<p class="empty">' + esc(t("api.loading")) + "</p>";
    return;
  }
  if (!activeWorkspace() && workspaceTool !== "todo") {
    root.innerHTML +=
      '<p class="empty">' + esc(t("tools.selectWorkspace")) + "</p>";
    return;
  }
  root.innerHTML += {
    receipt: renderReceiptTool,
    calendar: renderCalendarTool,
    todo: renderTodoTool,
  }[workspaceTool]();
}
function renderReceiptTool() {
  const receipt = serverTools.receipt,
    summaries = serverTools.receipts;
  const controls =
    '<div class="tools-toolbar"><label>' +
    esc(t("tools.history")) +
    '<select id="receipt-choice"><option value="">—</option>' +
    summaries
      .map(
        (summary) =>
          '<option value="' +
          esc(summary.id) +
          '" ' +
          (String(receipt?.id) === String(summary.id) ? "selected" : "") +
          ">#" +
          esc(summary.id) +
          " · " +
          esc(t("api.status." + summary.status)) +
          " · " +
          esc(
            t("api.receiptProgress", {
              confirmed: summary.confirmedItemCount,
              total: summary.itemCount,
            }),
          ) +
          "</option>",
      )
      .join("") +
    '</select></label><form id="receipt-open-form"><label>' +
    esc(t("api.receiptId")) +
    '<input name="receiptId" required inputmode="numeric" pattern="[0-9]+"></label><button class="btn" type="submit">' +
    esc(t("api.open")) +
    "</button></form></div>";
  if (!receipt)
    return controls + '<p class="empty">' + esc(t("api.receiptEmpty")) + "</p>";
  return (
    controls +
    '<article class="meeting-receipt"><h3>' +
    esc(t("tools.receipt")) +
    " #" +
    esc(receipt.id) +
    "</h3><p>" +
    esc((receipt.participants || []).map((m) => m.name).join(" · ")) +
    "</p>" +
    (receipt.items || [])
      .map((item) => {
        const responses = item.responses || [],
          mine = responses.find((x) => String(x.userId) === currentUser.id);
        const disputed =
          item.status === "OBJECTED" ||
          responses.some((response) => response.type === "OBJECT");
        return (
          '<section class="receipt-item' +
          (disputed ? " has-dispute" : "") +
          '" data-receipt-item="' +
          esc(item.id) +
          '"><h4>' +
          esc(item.title || item.what) +
          "</h4>" +
          (item.title
            ? '<p class="receipt-item-content">' + esc(item.what || "") + "</p>"
            : "") +
          (item.sourceCardId != null
            ? '<p class="tool-muted">' +
              esc(t("api.sourceCard", { id: item.sourceCardId })) +
              "</p>"
            : "") +
          "<p>" +
          esc(item.assignee?.name || t("unassigned")) +
          " · " +
          esc(item.displayDate || toolDate(item.dueDate)) +
          '</p><span class="receipt-state">' +
          esc(t("api.status." + item.status)) +
          '</span><div class="receipt-item-actions"><button type="button" class="btn" data-export-item="' +
          esc(item.id) +
          '" ' +
          (item.status === "CONFIRMED" && item.dueDate ? "" : "disabled") +
          ">" +
          esc(t("api.addCalendar")) +
          "</button></div>" +
          "</section>"
        );
      })
      .join("") +
    '<div class="receipt-stamp ' +
    (receipt.status === "CONFIRMED" ? "is-final" : "") +
    '">' +
    esc(t(receipt.status === "CONFIRMED" ? "tools.final" : "tools.pending")) +
    "</div></article>"
  );
}
function renderCalendarTool() {
  const [year, month] = calendarMonth.split("-").map(Number),
    first = new Date(Date.UTC(year, month - 1, 1)),
    offset = first.getUTCDay(),
    days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return (
    '<div class="tools-toolbar"><div class="month-controls"><button class="btn" data-month-step="-1" aria-label="' +
    esc(t("tools.previousMonth")) +
    '">‹</button><h3>' +
    esc(
      new Intl.DateTimeFormat(I18n.locale, {
        year: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(first),
    ) +
    '</h3><button class="btn" data-month-step="1" aria-label="' +
    esc(t("tools.nextMonth")) +
    '">›</button><button class="btn" data-month-today>' +
    esc(t("tools.today")) +
    '</button></div></div><div class="calendar-scroll"><div class="tools-calendar"><div class="calendar-week">' +
    Array.from(
      { length: 7 },
      (_, i) =>
        "<span>" +
        esc(
          new Intl.DateTimeFormat(I18n.locale, {
            weekday: "short",
            timeZone: "UTC",
          }).format(new Date(Date.UTC(2026, 10, 15 + i))),
        ) +
        "</span>",
    ).join("") +
    '</div><div class="calendar-days">' +
    Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
      const day = i - offset + 1;
      if (day < 1 || day > days)
        return '<div class="calendar-day outside"></div>';
      const date = calendarMonth + "-" + String(day).padStart(2, "0");
      return (
        '<div class="calendar-day"><span>' +
        day +
        "</span>" +
        serverTools.events
          .filter((e) => e.date === date)
          .map((e) => '<div class="calendar-event">' + esc(e.title) + "</div>")
          .join("") +
        "</div>"
      );
    }).join("") +
    "</div></div></div>"
  );
}
function renderTodoTool() {
  return (
    '<div class="tools-columns"><section class="tool-surface"><h3>' +
    esc(t("tools.tasksFor", { name: currentUser.name })) +
    "</h3>" +
    serverTools.todos
      .map(
        (todo) =>
          '<article class="tool-todo ' +
          (todo.done ? "is-done" : "") +
          '"><input type="checkbox" data-todo-check="' +
          esc(todo.id) +
          '" ' +
          (todo.done ? "checked" : "") +
          ' aria-label="' +
          esc(todo.title) +
          '"><form data-edit-todo="' +
          esc(todo.id) +
          '"><input name="title" required maxlength="120" value="' +
          esc(todo.title) +
          '" aria-label="' +
          esc(t("title")) +
          '"><button class="btn" type="submit">' +
          esc(t("api.save")) +
          '</button></form><button type="button" class="link" data-delete-todo="' +
          esc(todo.id) +
          '">' +
          esc(t("tools.delete")) +
          "</button></article>",
      )
      .join("") +
    (serverTools.todos.length
      ? ""
      : '<p class="empty">' + esc(t("tools.emptyTodo")) + "</p>") +
    '</section><form class="tool-surface" id="tool-todo-form"><h3>' +
    esc(t("tools.addTodo")) +
    '</h3><label class="field">' +
    esc(t("tools.task")) +
    '<input name="title" required maxlength="120"></label><button type="submit" class="btn primary">' +
    esc(t("tools.add")) +
    "</button></form></div>"
  );
}
function rememberReceipt(roomId, id) {
  const ids = (appState.receiptIds[roomId] ||= []);
  if (!ids.includes(String(id))) ids.push(String(id));
  saveState();
}
async function settleAgreements(button) {
  if (!ready || !activeWorkspace() || busy || pending) return;
  const roomId = channel;
  await runAction(button, async () => {
    if (!window.NUNCHI_API_CONFIG.agreementReviewV2)
      throw new Error("review.unavailable");
    // The server now excludes rejected cards and cards already linked to receipts.
    if (channel !== roomId || roomLeaveInFlight) return;
    let result;
    try {
      // 대상 선정·중복 방지·이미 승인된 항목 제외는 서버가 최종 판단합니다.
      result = await API.request("/rooms/" + API.id(roomId) + "/receipts", {
        method: "POST",
      });
    } catch (error) {
      if (error.code === "NO_ELIGIBLE_CARDS") {
        toast("api.noEligibleCards");
        if (channel === roomId) await refreshRoom();
        return;
      }
      throw error;
    }
    const id = String(API.id(result?.receiptId));
    if (String(result.roomId) !== roomId)
      throw new Error("api.receiptRoomMismatch");
    rememberReceipt(roomId, id);
    if (channel !== roomId) return;
    serverTools.receiptId = id;
    serverTools.receiptRoomId = roomId;
    await showWorkspaceTool("receipt", { receiptId: id });
    if (result.status !== "CONFIRMED") {
      showError(new Error("review.notFinal"));
      return;
    }
    if (channel === roomId)
      toast(result.created ? "api.settlementCreated" : "api.settlementReused");
  });
}
function initWorkspaceTools() {
  $("#settle-agreements").onclick = (event) =>
    settleAgreements(event.currentTarget);
  document.addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (!b) return;
    if (b.dataset.openBoardReceipt) {
      const roomId = channel;
      runAction(b, async () => {
        const receipt = activeWorkspace()?.boardReceipts?.find(
          (receipt) => receipt.id === b.dataset.openBoardReceipt,
        );
        if (!receipt || !roomId) return;
        serverTools.receiptId = String(API.id(b.dataset.openBoardReceipt));
        serverTools.receiptRoomId = roomId;
        await showWorkspaceTool("receipt", {
          receiptId: b.dataset.openBoardReceipt,
        });
      });
      return;
    }
    if (b.dataset.toolView) {
      showWorkspaceTool(b.dataset.toolView);
      return;
    }
    if (b.hasAttribute("data-refresh-tools")) {
      loadWorkspaceTool();
      return;
    }
    if (b.dataset.exportItem || b.dataset.exportCard)
      runAction(b, async () => {
        const data = await API.request(
          "/rooms/" + channel + "/calendar-events",
          {
            method: "POST",
            body: {
              sourceType: b.dataset.exportItem ? "RECEIPT_ITEM" : "CARD",
              sourceId: API.id(b.dataset.exportItem || b.dataset.exportCard),
            },
          },
        );
        calendarMonth = data.date.slice(0, 7);
        await showWorkspaceTool("calendar");
      });
    if (b.dataset.deleteTodo)
      runAction(b, async () => {
        await API.request("/todos/" + API.id(b.dataset.deleteTodo), {
          method: "DELETE",
        });
        await loadWorkspaceTool();
      });
    if (b.hasAttribute("data-month-step")) {
      const [y, m] = calendarMonth.split("-").map(Number);
      calendarMonth = new Date(
        Date.UTC(y, m - 1 + Number(b.dataset.monthStep), 1),
      )
        .toISOString()
        .slice(0, 7);
      renderWorkspaceTool();
    }
    if (b.hasAttribute("data-month-today")) {
      calendarMonth = new Date().toISOString().slice(0, 7);
      renderWorkspaceTool();
    }
  });
  document.addEventListener("change", (event) => {
    const input = event.target;
    if (input.dataset.todoCheck) {
      const done = input.checked;
      runAction(input, async () => {
        try {
          await API.request("/todos/" + API.id(input.dataset.todoCheck), {
            method: "PATCH",
            body: { done },
          });
        } catch (error) {
          input.checked = !done;
          throw error;
        }
        await loadWorkspaceTool();
      });
    }
    if (input.id === "receipt-choice") {
      serverTools.requestedReceiptId = null;
      serverTools.receiptId = input.value;
      loadWorkspaceTool();
    }
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!form.closest("#tool-content")) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    runAction(form.querySelector("[type=submit]"), async () => {
      if (form.id === "receipt-open-form") {
        const id = API.id(values.get("receiptId"));
        const receipt = await API.request("/receipts/" + id + API.query());
        if (receipt?.roomId != null && String(receipt.roomId) !== channel)
          throw new Error("api.receiptRoomMismatch");
        rememberReceipt(channel, id);
        serverTools.receiptId = String(id);
        serverTools.receiptRoomId = channel;
      }
      if (form.id === "tool-todo-form" || form.dataset.editTodo) {
        const title = String(values.get("title") || "").trim();
        if (!title) return;
        await API.request(
          "/todos" +
            (form.dataset.editTodo ? "/" + API.id(form.dataset.editTodo) : ""),
          { method: form.dataset.editTodo ? "PATCH" : "POST", body: { title } },
        );
      }
      form.reset();
      await loadWorkspaceTool();
    });
  });
}
