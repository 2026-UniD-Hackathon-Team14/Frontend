// main의 카드 생성 → 채팅 확인 → 전원 확인 시 보드 고정 흐름을 워크스페이스에 연결합니다.
let boardFilter = "전체";
let agreementViewer = currentUser.id;
function agreementCards() {
  return (activeWorkspace()?.cards || []).filter((card) => card.schema === 2);
}
function agreementMembers() {
  return activeWorkspace()?.members || [];
}
function agreementComplete(card) {
  const members = agreementMembers();
  return (
    members.length > 0 &&
    members.every((member) => card.confirmedIds.includes(member.id)) &&
    !(typeof receiptCardDisputed === "function" && receiptCardDisputed(card))
  );
}
function agreementName(id) {
  return agreementMembers().find((member) => member.id === id)?.name || t("unknownMember");
}
function agreementDate(date) {
  return I18n.formatDate(date);
}
function cardTypeLabel(value) {
  return t(
    {
      약속: "promise",
      규칙: "rule",
      공지: "notice",
      PROMISE: "promise",
      RULE: "rule",
      NOTICE: "notice",
    }[value] || "promise",
  );
}
function agreementAvatars(card) {
  return (
    '<div class="agreement-people" aria-label="' +
    esc(t("confirmationStatus")) +
    '">' +
    agreementMembers()
      .map((member, index) => {
        const confirmed = card.confirmedIds.includes(member.id);
        return `<span class="agreement-person ${confirmed ? "is-confirmed" : "is-waiting"} person-${index % 4}" title="${esc(member.name)} · ${esc(t(confirmed ? "confirmedState" : "pendingState"))}"><span>${esc(Array.from(member.name)[0] || "?")}</span>${confirmed ? '<i aria-hidden="true">✓</i>' : ""}</span>`;
      })
      .join("") +
    "</div>"
  );
}
function renderAgreementMessage(reference) {
  const card = agreementCards().find((c) => c.id === reference.id);
  if (!card) return "";
  const agreed = agreementComplete(card),
    mine = card.confirmedIds.includes(agreementViewer),
    members = agreementMembers(),
    waiting = members.filter((m) => !card.confirmedIds.includes(m.id));
  const title = ContentAPI.cardText(card, "title"),
    text = ContentAPI.cardText(card, "text");
  return `<article class="chat-agreement ${agreed ? "is-complete" : ""}" data-card-id="${esc(card.id)}"><div class="agreement-card-heading"><span class="agreement-tag">${esc(t("agreementCard"))} · ${esc(cardTypeLabel(card.type))}</span>${agreed ? '<span class="agreement-success-tag">' + esc(t("allConfirmed")) + "</span>" : '<span class="agreement-byline">' + esc(t("createdBy", { name: card.createdByName, time: card.time })) + "</span>"}</div><h3>${esc(title)}</h3><p class="agreement-body">${esc(text)}</p><div class="agreement-meta"><span>${esc(t("assignedTo", { names: card.assigneeIds.map(agreementName).join(" · ") }))}</span><span>${esc(t("dueOn", { date: agreementDate(card.date) }))}</span></div><div class="agreement-confirmation">${agreementAvatars(card)}<span class="agreement-progress"><b>${esc(t("confirmationCount", { count: members.length - waiting.length, total: members.length }))}</b> · ${esc(agreed ? t("pinned") : t("waitingFor", { names: waiting.map((m) => m.name).join(", ") }))}</span>${agreed ? "" : `<button type="button" class="agreement-confirm ${mine ? "is-checked" : ""}" data-confirm-agreement="${esc(card.id)}" ${mine ? "disabled" : ""}>${esc(t(mine ? "confirmedByMe" : "confirm"))}</button>`}</div></article>${agreed ? '<div class="agreement-pin-notice">✓ ' + esc(t("pinNotice", { title })) + "</div>" : ""}`;
}
function renderAgreementViewer() {
  const members = agreementMembers();
  if (!members.some((member) => member.id === agreementViewer)) agreementViewer = currentUser.id;
  $("#agreement-viewer").innerHTML = members
    .map((member) => `<option value="${esc(member.id)}">${esc(member.name)}</option>`)
    .join("");
  $("#agreement-viewer").value = agreementViewer;
  $("#agreement-viewer").disabled = !members.length;
  $("#create-card").disabled = !activeWorkspace();
}
function renderBoard() {
  if (typeof refreshWorkspaceTools === "function") refreshWorkspaceTools();
  renderAgreementViewer();
  const confirmed = agreementCards().filter(agreementComplete);
  const visible = confirmed.filter((c) => boardFilter === "전체" || c.type === boardFilter);
  $("#board-count").textContent = confirmed.length;
  $("#board-cards").innerHTML = visible.length
    ? [...visible]
        .reverse()
        .map(
          (card) =>
            `<article class="card pinned-agreement ${card.justPinned ? "is-new" : ""}"><div class="agreement-card-heading"><span class="agreement-tag">${esc(cardTypeLabel(card.type))}</span>${card.justPinned ? '<span class="agreement-success-tag">' + esc(t("justPinned")) + "</span>" : ""}</div><h3>${esc(ContentAPI.cardText(card, "title"))}</h3><p>${esc(ContentAPI.cardText(card, "text"))}</p><div class="agreement-meta"><span>${esc(t("assignedTo", { names: card.assigneeIds.map(agreementName).join(" · ") }))}</span><span>${esc(t("dueOn", { date: agreementDate(card.date) }))}</span></div><div class="confirmed">✓ ${esc(t("confirmedCount", { count: agreementMembers().length }))}</div></article>`,
        )
        .join("")
    : '<p class="empty">' + esc(t(confirmed.length ? "emptyCategory" : "boardWaiting")) + "</p>";
  document.querySelectorAll(".filter").forEach((button) => {
    const selected = button.dataset.filter === boardFilter;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}
function initBoard() {
  const dialog = $("#agreement-dialog");
  const form = $("#agreement-form");
  const assignees = () =>
    [...form.querySelectorAll('[name="assignee"]:checked')].map((input) => input.value);
  function preview() {
    const names = assignees().map(agreementName);
    $("#assignee-chips").innerHTML = names
      .map(
        (name) =>
          `<span class="assignee-chip"><span>${esc(Array.from(name)[0])}</span>${esc(name)}</span>`,
      )
      .join("");
    $("#agreement-preview-title").textContent =
      ($("#agreement-title").value.trim() || t("title")) +
      " · " +
      t("assignee") +
      " " +
      (names.join(" · ") || t("unassigned")) +
      " · " +
      ($("#agreement-date").value || t("noDueDate"));
  }
  $("#create-card").addEventListener("click", () => {
    if (!activeWorkspace()) return;
    form.reset();
    $("#assignee-picker").innerHTML = agreementMembers()
      .map(
        (member) =>
          `<label><input type="checkbox" name="assignee" value="${esc(member.id)}" ${member.id === currentUser.id ? "checked" : ""}>${esc(member.name)}</label>`,
      )
      .join("");
    $("#assignee-picker").hidden = true;
    $("#assignee-add").setAttribute("aria-expanded", "false");
    preview();
    dialog.showModal();
  });
  $("#agreement-cancel").addEventListener("click", () => dialog.close());
  $("#assignee-add").addEventListener("click", () => {
    const picker = $("#assignee-picker");
    picker.hidden = !picker.hidden;
    $("#assignee-add").setAttribute("aria-expanded", String(!picker.hidden));
  });
  document.addEventListener("languagechange", preview);
  form.addEventListener("input", preview);
  form.addEventListener("change", preview);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    for (const id of ["#agreement-title", "#agreement-text"]) $(id).value = $(id).value.trim();
    if (!form.reportValidity()) return;
    if (!assignees().length) return toast("chooseAssignee");
    const workspace = activeWorkspace();
    if (!workspace) return;
    const card = {
      schema: 2,
      id: newId("agreement"),
      type: form.querySelector('[name="agreement-type"]:checked').value,
      title: $("#agreement-title").value,
      text: $("#agreement-text").value,
      date: $("#agreement-date").value,
      assigneeIds: assignees(),
      confirmedIds: [],
      createdByName: currentUser.name,
      time: new Date().toLocaleTimeString(I18n.locale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      justPinned: false,
    };
    workspace.cards.push(card);
    workspace.messages.push({ agreement: { id: card.id } });
    saveState();
    renderMessages();
    renderBoard();
    dialog.close();
    toast("cardPosted");
  });
  $("#agreement-viewer").addEventListener("change", (event) => {
    if (!agreementMembers().some((member) => member.id === event.target.value)) return;
    agreementViewer = event.target.value;
    renderMessages();
  });
  document.addEventListener("click", (event) => {
    const confirm = event.target.closest("button[data-confirm-agreement]");
    if (confirm) {
      const card = agreementCards().find((item) => item.id === confirm.dataset.confirmAgreement);
      if (card && typeof receiptCardDisputed === "function" && receiptCardDisputed(card)) {
        toast("tools.blocked");
        return;
      }
      if (
        !card ||
        !agreementMembers().some((member) => member.id === agreementViewer) ||
        card.confirmedIds.includes(agreementViewer)
      )
        return;
      card.confirmedIds.push(agreementViewer);
      const complete = agreementComplete(card);
      if (complete) {
        agreementCards().forEach((item) => (item.justPinned = false));
        card.justPinned = true;
        boardFilter = "전체";
      }
      saveState();
      renderMessages();
      renderBoard();
      if (complete) toast("cardPinned");
      return;
    }
    const filter = event.target.closest("button[data-filter]");
    if (filter) {
      boardFilter = filter.dataset.filter;
      renderBoard();
    }
  });
  renderBoard();
}
