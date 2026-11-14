// main의 카드 생성 → 채팅 확인 → 전원 확인 시 보드 고정 흐름을 워크스페이스에 연결합니다.
let boardFilter = "전체";
let agreementViewer = currentUser.id;
// 보드는 카드별 정보 대신 서버 영수증 ID별로 한 셀만 표시합니다.
async function loadBoardReceipts(roomId, cards, lang) {
  const boardCards = cards.filter(card => card.status === "CONFIRMED");
  if (!boardCards.length) return [];
  const summaries = await API.request("/rooms/" + API.id(roomId) + "/receipts");
  if (!Array.isArray(summaries)) throw new Error("api.invalidResponse");
  const candidates = summaries.filter(summary => (summary.sourceCardIds || []).some(id => boardCards.some(card => String(card.id) === String(id))));
  const groups = [];
  const seen = new Set();
  // 여러 과거 영수증을 조회할 때 한 번에 발생하는 요청 수를 제한합니다.
  for (let index = 0; index < candidates.length; index += 4) {
    const receipts = await Promise.all(candidates.slice(index, index + 4).map(summary => API.request("/receipts/" + API.id(summary.id) + "?lang=" + lang)));
    for (const receipt of receipts) {
      if (String(receipt?.roomId) !== String(roomId) || seen.has(String(receipt.id))) continue;
      const items = (receipt.items || []).filter(item => boardCards.some(card => String(card.id) === String(item.sourceCardId) &&
        (card.version == null || item.sourceCardVersion === card.version)));
      if (!items.length) continue;
      seen.add(String(receipt.id));
      groups.push({
        id: String(API.id(receipt.id)),
        cardIds: [...new Set(items.map(item => String(item.sourceCardId)))],
        disputedCardIds: [...new Set(items.filter(item => item.status === "OBJECTED" || (item.responses || []).some(response => response.type === "OBJECT")).map(item => String(item.sourceCardId)))],
        disputed: items.some(item => item.status === "OBJECTED" || (item.responses || []).some(response => response.type === "OBJECT")),
      });
    }
  }
  return groups;
}
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
function agreementDisputed(card) { return card.receiptStatus === "OBJECTED"; }
function agreementDisputeBadge(card) {
  return agreementDisputed(card) ? '<span class="agreement-dispute-tag">' + esc(t("api.receiptDisputed")) + '</span>' : '';
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
  return `<article class="chat-agreement ${agreed ? "is-complete" : ""} ${agreementDisputed(card) ? "has-dispute" : ""}" data-card-id="${esc(card.id)}"><div class="agreement-card-heading"><span class="agreement-tag">${esc(t("agreementCard"))}</span>${agreementDisputeBadge(card)}${agreed ? '<span class="agreement-success-tag">' + esc(t("allConfirmed")) + "</span>" : '<span class="agreement-byline">' + "" + "</span>"}</div><h3>${esc(title)}</h3><p class="agreement-body">${esc(text)}</p><div class="agreement-meta"><span>${esc(t("assignedTo", { names: card.assigneeIds.map(agreementName).join(" · ") }))}</span><span>${esc(t("dueOn", { date: agreementDate(card.date) }))}</span></div><div class="agreement-confirmation">${agreementAvatars(card)}<span class="agreement-progress"><b>${esc(t("confirmationCount", { count: members.length - waiting.length, total: members.length }))}</b> · ${esc(agreed ? t("pinned") : t("waitingFor", { names: waiting.map((m) => m.name).join(", ") }))}</span>${agreed ? "" : `<button type="button" class="agreement-confirm ${mine ? "is-checked" : ""}" data-confirm-agreement="${esc(card.id)}" ${mine ? "disabled" : ""}>${esc(t(mine ? "confirmedByMe" : "confirm"))}</button>`}</div></article>${agreed ? '<div class="agreement-pin-notice">✓ ' + esc(t("pinNotice", { title })) + "</div>" : ""}`;
}
function renderAgreementViewer() {
  agreementViewer = currentUser.id;
  $("#create-card").disabled = !ready || !activeWorkspace() || roomLeaveInFlight;
}
function renderBoard() {
  renderAgreementViewer();
  const receipts = activeWorkspace()?.boardReceipts || [];
  const groupedCardIds = new Set(receipts.flatMap(receipt => receipt.cardIds || []));
  const ungrouped = agreementCards().filter(card => agreementComplete(card) && !groupedCardIds.has(String(card.id)));
  $("#board-count").textContent = receipts.length + ungrouped.length;
  const standaloneCards = ungrouped.map(card => '<article class="board-unsettled-card" data-unsettled-card="' + esc(card.id) + '"><strong>' + esc(ContentAPI.cardText(card, "title")) + '</strong><span>' + esc(t(card.receiptStatus && card.receiptStatus !== "NOT_CREATED" ? 'api.receiptUnlinked' : 'api.receiptNotCreated')) + '</span></article>').join('');
  $("#board-cards").innerHTML = receipts.length || ungrouped.length
    ? standaloneCards + receipts.map(receipt => '<button type="button" class="board-receipt ' + (receipt.disputed ? 'has-dispute' : '') + '" data-open-board-receipt="' + esc(receipt.id) + '"><span>' + esc(t('api.receiptNumber', {id:receipt.id})) + '</span>' + (receipt.disputed ? '<span class="agreement-dispute-tag">' + esc(t('api.boardDisputed')) + '</span>' : '') + '</button>').join('')
    : '<p class="empty">' + esc(t('api.boardReceiptsEmpty')) + '</p>';
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
