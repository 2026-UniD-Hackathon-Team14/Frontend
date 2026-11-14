// main의 카드 생성 → 채팅 확인 → 전원 확인 시 보드 고정 흐름을 워크스페이스에 연결합니다.
let boardFilter = "전체";
let agreementViewer = currentUser.id;
// 보드는 카드별 정보 대신 서버 영수증 ID별로 한 셀만 표시합니다.
async function loadBoardReceipts(roomId, cards, lang) {
  const boardCards = cards.filter((card) => card.status === "CONFIRMED");
  if (!boardCards.length) return [];
  const summaries = await API.request("/rooms/" + API.id(roomId) + "/receipts");
  if (!Array.isArray(summaries)) throw new Error("api.invalidResponse");
  const candidates = summaries.filter((summary) =>
    (summary.sourceCardIds || []).some((id) =>
      boardCards.some((card) => String(card.id) === String(id)),
    ),
  );
  const groups = [];
  const seen = new Set();
  // 여러 과거 영수증을 조회할 때 한 번에 발생하는 요청 수를 제한합니다.
  for (let index = 0; index < candidates.length; index += 4) {
    const receipts = await Promise.all(
      candidates
        .slice(index, index + 4)
        .map((summary) =>
          API.request("/receipts/" + API.id(summary.id) + "?lang=" + lang),
        ),
    );
    for (const receipt of receipts) {
      if (
        String(receipt?.roomId) !== String(roomId) ||
        seen.has(String(receipt.id))
      )
        continue;
      const items = (receipt.items || []).filter((item) =>
        boardCards.some(
          (card) =>
            String(card.id) === String(item.sourceCardId) &&
            (card.version == null || item.sourceCardVersion === card.version),
        ),
      );
      if (!items.length) continue;
      seen.add(String(receipt.id));
      groups.push({
        id: String(API.id(receipt.id)),
        status: receipt.status,
        cardIds: [...new Set(items.map((item) => String(item.sourceCardId)))],
        disputedCardIds: [
          ...new Set(
            items
              .filter(
                (item) =>
                  item.status === "OBJECTED" ||
                  (item.responses || []).some(
                    (response) => response.type === "OBJECT",
                  ),
              )
              .map((item) => String(item.sourceCardId)),
          ),
        ],
        disputed: items.some(
          (item) =>
            item.status === "OBJECTED" ||
            (item.responses || []).some(
              (response) => response.type === "OBJECT",
            ),
        ),
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
  return (
    agreementMembers().find((member) => member.id === id)?.name ||
    t("unknownMember")
  );
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
function agreementDisputed(card) {
  return card.status === "REJECTED";
}
function agreementDisputeBadge(card) {
  return agreementDisputed(card)
    ? '<span class="agreement-dispute-tag">' +
        esc(t("review.rejected")) +
        "</span>"
    : "";
}
function renderAgreementMessage(reference) {
  const card = agreementCards().find((c) => c.id === reference.id);
  if (!card) return "";
  if (agreementDisputed(card)) return renderRejectedAgreement(card);
  const agreed = agreementComplete(card),
    mine = card.confirmedIds.includes(agreementViewer),
    members = agreementMembers(),
    waiting = members.filter((m) => !card.confirmedIds.includes(m.id));
  const title = ContentAPI.cardText(card, "title"),
    text = ContentAPI.cardText(card, "text");
  return `<article class="chat-agreement ${agreed ? "is-complete" : ""} ${agreementDisputed(card) ? "has-dispute" : ""}" data-card-id="${esc(card.id)}"><div class="agreement-card-heading"><span class="agreement-tag">${esc(t("agreementCard"))}</span>${agreementDisputeBadge(card)}${agreed ? '<span class="agreement-success-tag">' + esc(t("allConfirmed")) + "</span>" : '<span class="agreement-byline">' + "" + "</span>"}</div><h3>${esc(title)}</h3><p class="agreement-body">${esc(text)}</p><div class="agreement-meta"><span>${esc(t("assignedTo", { names: card.assigneeIds.map(agreementName).join(" · ") }))}</span><span>${esc(t("dueOn", { date: agreementDate(card.date) }))}</span></div><div class="agreement-confirmation">${agreementAvatars(card)}<span class="agreement-progress"><b>${esc(t("confirmationCount", { count: members.length - waiting.length, total: members.length }))}</b> · ${esc(agreed ? t("pinned") : t("waitingFor", { names: waiting.map((m) => m.name).join(", ") }))}</span>${agreed ? "" : `<button type="button" class="agreement-confirm ${mine ? "is-checked" : ""}" data-confirm-agreement="${esc(card.id)}" ${mine ? "disabled" : ""}>${esc(t(mine ? "confirmedByMe" : "confirm")).replaceAll("\u2713", '<span class="confirmation-check" aria-hidden="true">&#10003;</span>')}</button><button type="button" class="btn agreement-object" data-object-agreement="${esc(card.id)}" aria-expanded="${Boolean(cardObjectionDrafts.get(objectionKey(card.id)))}">${esc(t("review.object"))}</button>`}</div>${renderCardObjectionForm(card)}</article>${agreed ? '<div class="agreement-pin-notice">✓ ' + esc(t("pinNotice", { title })) + "</div>" : ""}`;
}

const cardObjectionDrafts = new Map();
const cardObjectionWrites = new Set();
function objectionKey(id) {
  return channel + ":" + id;
}
function renderCardObjectionForm(card) {
  const draft = cardObjectionDrafts.get(objectionKey(card.id));
  if (!draft || card.status !== "PENDING") return "";
  return `<form class="card-objection-form" data-card-objection="${esc(card.id)}">
    <label>${esc(t("review.reason"))}<textarea name="comment" required maxlength="1000" placeholder="${esc(t("review.placeholder"))}">${esc(draft.comment)}</textarea></label>
    <p>${esc(t("review.warning"))}</p><div><button type="button" class="btn" data-cancel-objection="${esc(card.id)}">${esc(t("cancel"))}</button>
    <button type="submit" class="btn agreement-object" ${cardObjectionWrites.has(objectionKey(card.id)) ? "disabled" : ""}>${esc(t("review.submit"))}</button></div></form>`;
}
function renderRejectedAgreement(card) {
  const objection = card.objection || {};
  return `<article class="chat-agreement is-rejected" data-card-id="${esc(card.id)}">
    <svg class="card-rejection-cross" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M2 2 L98 98 M98 2 L2 98"/></svg>
    <span class="agreement-tag">${esc(t("agreementCard"))}</span><h3>${esc(card.title)}</h3><p class="agreement-body">${esc(card.text)}</p>
    <div class="card-rejection-notice" role="status"><strong>${esc(t("review.rejected"))}</strong><p>${esc(t("review.recreate"))}</p>
    ${objection.comment ? `<blockquote><b>${esc(agreementName(String(objection.userId)))}</b><p>${esc(objection.comment)}</p></blockquote>` : ""}</div></article>`;
}
async function submitCardObjection(id, comment) {
  const roomId = channel,
    key = objectionKey(id);
  if (!comment.trim() || cardObjectionWrites.has(key)) return;
  const card = agreementCards().find((card) => card.id === String(id));
  if (!card || card.status !== "PENDING") throw new Error("review.closed");
  if (!window.NUNCHI_API_CONFIG.agreementReviewV2)
    throw new Error("review.unavailable");
  cardObjectionWrites.add(key);
  try {
    const result = await API.request("/cards/" + API.id(id) + "/objections", {
      method: "POST",
      body: { comment: comment.trim() },
    });
    if (String(result?.id) !== String(id) || result.status !== "REJECTED")
      throw new Error("api.invalidResponse");
    cardObjectionDrafts.delete(key);
    if (channel === roomId) await refreshRoom();
  } finally {
    cardObjectionWrites.delete(key);
  }
}
function renderAgreementViewer() {
  agreementViewer = currentUser.id;
  $("#create-card").disabled =
    !ready || !activeWorkspace() || roomLeaveInFlight;
}
function renderBoard() {
  renderAgreementViewer();
  const receipts = activeWorkspace()?.boardReceipts || [];
  const groupedCardIds = new Set(
    receipts.flatMap((receipt) => receipt.cardIds || []),
  );
  const ungrouped = agreementCards().filter(
    (card) => agreementComplete(card) && !groupedCardIds.has(String(card.id)),
  );
  $("#board-count").textContent = receipts.length + ungrouped.length;
  const standaloneCards = ungrouped
    .map(
      (card) =>
        '<article class="board-unsettled-card" data-unsettled-card="' +
        esc(card.id) +
        '"><strong>' +
        esc(ContentAPI.cardText(card, "title")) +
        "</strong>" +
        (ContentAPI.cardText(card, "text") ? '<p class="board-card-content">' + esc(ContentAPI.cardText(card, "text")) + '</p>' : '') +
        '<span class="board-card-due">' +
        esc(card.date ? t("dueOn", { date: agreementDate(card.date) }) : t("noDueDate")) +
        "</span></article>",
    )
    .join("");
  $("#board-cards").innerHTML =
    receipts.length || ungrouped.length
      ? standaloneCards +
        receipts
          .map(
            (receipt) =>
              '<button type="button" class="board-receipt ' +
              (receipt.status === "CONFIRMED" ? "is-final" : "") +
              '" data-open-board-receipt="' +
              esc(receipt.id) +
              '"><span>' +
              esc(t("api.receiptNumber", { id: receipt.id })) +
              "</span>" +
              (receipt.disputed
                ? '<span class="agreement-dispute-tag">' +
                  esc(t("api.boardDisputed")) +
                  "</span>"
                : "") +
              "</button>",
          )
          .join("")
      : '<p class="empty">' + esc(t("api.boardReceiptsEmpty")) + "</p>";
}

function initBoard() {
  document.addEventListener("input", (event) => {
    const form = event.target.closest("[data-card-objection]");
    if (form)
      cardObjectionDrafts.set(objectionKey(form.dataset.cardObjection), {
        comment: form.elements.comment.value,
      });
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest(
      "[data-object-agreement], [data-cancel-objection]",
    );
    if (!button) return;
    const id = button.dataset.objectAgreement || button.dataset.cancelObjection;
    const key = objectionKey(id);
    if (cardObjectionWrites.has(key)) return;
    if (button.dataset.cancelObjection) cardObjectionDrafts.delete(key);
    else
      cardObjectionDrafts.set(
        key,
        cardObjectionDrafts.get(key) || { comment: "" },
      );
    const article = button.closest("[data-card-id]");
    article.outerHTML = renderAgreementMessage({ id });
    document
      .querySelector('[data-card-objection="' + id + '"] textarea')
      ?.focus();
  });
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-card-objection]");
    if (!form) return;
    event.preventDefault();
    const comment = form.elements.comment.value.trim();
    if (!comment || !form.reportValidity()) return;
    runAction(form.querySelector('[type="submit"]'), () =>
      submitCardObjection(form.dataset.cardObjection, comment),
    );
  });
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
      .map(
        (m) => '<option value="' + esc(m.id) + '">' + esc(m.name) + "</option>",
      )
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
        await API.request(
          "/cards/" + API.id(button.dataset.confirmAgreement) + "/confirm",
          {
            method: "POST",
          },
        );
        await refreshRoom();
      });
  });
}
