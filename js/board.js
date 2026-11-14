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
  return card.status === "CONFIRMED";
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
  return `<article class="chat-agreement ${agreed ? "is-complete" : ""}" data-card-id="${esc(card.id)}"><div class="agreement-card-heading"><span class="agreement-tag">${esc(t("agreementCard"))}</span>${agreed ? '<span class="agreement-success-tag">' + esc(t("allConfirmed")) + "</span>" : '<span class="agreement-byline">' + "" + "</span>"}</div><h3>${esc(title)}</h3><p class="agreement-body">${esc(text)}</p><div class="agreement-meta"><span>${esc(t("assignedTo", { names: card.assigneeIds.map(agreementName).join(" · ") }))}</span><span>${esc(t("dueOn", { date: agreementDate(card.date) }))}</span></div><div class="agreement-confirmation">${agreementAvatars(card)}<span class="agreement-progress"><b>${esc(t("confirmationCount", { count: members.length - waiting.length, total: members.length }))}</b> · ${esc(agreed ? t("pinned") : t("waitingFor", { names: waiting.map((m) => m.name).join(", ") }))}</span>${agreed ? "" : `<button type="button" class="agreement-confirm ${mine ? "is-checked" : ""}" data-confirm-agreement="${esc(card.id)}" ${mine ? "disabled" : ""}>${esc(t(mine ? "confirmedByMe" : "confirm"))}</button>`}</div></article>${agreed ? '<div class="agreement-pin-notice">✓ ' + esc(t("pinNotice", { title })) + "</div>" : ""}`;
}
function renderAgreementViewer() {
  agreementViewer = currentUser.id;
  $("#create-card").disabled = !ready || !activeWorkspace();
}
function renderBoard() {
  renderAgreementViewer();
  const confirmed = agreementCards().filter(agreementComplete);
  const visible = confirmed.filter((c) => boardFilter === "전체" || c.type === boardFilter);
  $("#board-count").textContent = confirmed.length;
  $("#board-cards").innerHTML = visible.length
    ? [...visible]
        .reverse()
        .map(
          (card) =>
            `<article class="card pinned-agreement ${card.justPinned ? "is-new" : ""}"><div class="agreement-card-heading"><span class="agreement-tag">${esc(t("agreementCard"))}</span>${card.justPinned ? '<span class="agreement-success-tag">' + esc(t("justPinned")) + "</span>" : ""}</div><h3>${esc(ContentAPI.cardText(card, "title"))}</h3><p>${esc(ContentAPI.cardText(card, "text"))}</p><div class="agreement-meta"><span>${esc(t("assignedTo", { names: card.assigneeIds.map(agreementName).join(" · ") }))}</span><span>${esc(t("dueOn", { date: agreementDate(card.date) }))}</span></div><div class="confirmed">✓ ${esc(t("allConfirmed"))}</div><button type="button" class="btn" data-export-card="${esc(card.id)}" ${card.date ? "" : "disabled"}>${esc(t("api.addCalendar"))}</button></article>`,
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
  const dialog = $("#agreement-dialog"),
    form = $("#agreement-form");
  function preview() {
    $("#agreement-preview-title").textContent =
      ($("#agreement-title").value.trim() || t("title")) +
      " · " +
      t("assignee") +
      " " +
      agreementName($("#agreement-assignee").value) +
      " · " +
      ($("#agreement-date").value || t("noDueDate"));
  }
  $("#create-card").onclick = () => {
    if (!activeWorkspace()) return;
    form.reset();
    $("#agreement-assignee").innerHTML = agreementMembers()
      .map((m) => '<option value="' + esc(m.id) + '">' + esc(m.name) + "</option>")
      .join("");
    $("#agreement-assignee").value = currentUser.id;
    preview();
    dialog.showModal();
  };
  form.addEventListener("input", preview);
  document.addEventListener("languagechange", preview);
  $("#agreement-cancel").onclick = () => dialog.close();
  form.onsubmit = (event) => {
    event.preventDefault();
    const title = $("#agreement-title").value.trim();
    if (!title || !form.reportValidity()) return;
    const roomId = channel;
    runAction(form.querySelector("[type=submit]"), async () => {
      const createdCard = await API.request("/rooms/" + roomId + "/cards", {
        method: "POST",
        body: {
          title,
          content: $("#agreement-text").value.trim(),
          assigneeId: API.id($("#agreement-assignee").value),
          dueDate: $("#agreement-date").value || null,
        },
      });
      rememberTimelineCard(roomId, createdCard.id);
      dialog.close();
      await refreshRoom();
    });
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-confirm-agreement]");
    if (button)
      runAction(button, async () => {
        await API.request("/cards/" + API.id(button.dataset.confirmAgreement) + "/confirm", {
          method: "POST",
        });
        await refreshRoom();
      });
  });
}
