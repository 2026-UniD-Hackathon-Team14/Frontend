// Keep a retry key for each unchanged request. Do not retry writes automatically.
const messageRequestKeys = new Map();
function renderMessageMeanings(message, mine, sender) {
  if (message.sendOriginal) return "";
  const selections = message.intentSelections || [];
  return selections
    .map((choice) => {
      const meaning =
        choice.displayMeanings?.[I18n.language] ||
        choice.displayMeaning ||
        choice.customText ||
        choice.label ||
        "";
      return (
        '<div class="meaning-confirmation"><span aria-hidden="true">&#10003;</span><div><small>' +
        esc(choice.phrase || "") +
        "</small><br>" +
        esc(
          t(mine ? "sheet.sentIntent" : "sheet.receivedIntent", {
            name: sender,
            meaning,
          }),
        ) +
        "</div></div>"
      );
    })
    .join("");
}
function renderMessages() {
  const el = $("#messages");
  if (!activeWorkspace()) {
    el.innerHTML =
      '<div class="empty">' + esc(t("noWorkspaceMessage")) + "</div>";
    return;
  }
  const draftForm = el.querySelector("[data-card-objection]:focus-within");
  const focusedCard = draftForm?.dataset.cardObjection;
  const selection = draftForm
    ? [
        draftForm.elements.comment.selectionStart,
        draftForm.elements.comment.selectionEnd,
      ]
    : null;
  const scrollTop = el.scrollTop;
  el.innerHTML =
    '<div class="date-divider">' +
    esc(activeWorkspace().name) +
    "</div>" +
    chats[channel]
      .map((m, i) => {
        if (m.agreement) return renderAgreementMessage(m.agreement);
        const original = m.originalText ?? m.text ?? "";
        const mine = String(m.senderId) === currentUser.id;
        const display = mine ? original : ContentAPI.messageText(m);
        const hasTranslation = display !== original;
        const lang = m.originalLanguage || m.language || "ko";
        const intent =
          !m.sendOriginal &&
          !m.intentSelections?.length &&
          ["ACCEPT", "REJECT", "UNDECIDED", "OTHER"].includes(m.selectedIntent)
            ? t("intent." + m.selectedIntent)
            : "";
        const sender = m.senderName || m.name || "";
        return `<div class="message ${mine ? "mine" : ""} ${intent || (!m.sendOriginal && m.intentSelections?.length) ? "intent-confirmed" : ""}"><span class="avatar ${mine ? "me" : ""}">${esc(m.initial || Array.from(m.senderName || m.name || "?")[0])}</span><div class="message-body"><div class="who">${esc(m.senderName || m.name)}<span class="lang">${esc(I18n.names[lang] || lang)}</span><span class="time">${esc(m.time || "")}</span></div><div class="bubble">${esc(display)}</div>${intent ? '<div class="meaning-confirmation"><span aria-hidden="true">✓</span>' + esc(t(mine ? "sheet.sentIntent" : "sheet.receivedIntent", { name: sender, meaning: intent })) + "</div>" : ""}${renderMessageMeanings(m, mine, sender)}${m.customIntentText ? '<div class="original">' + esc(m.customIntentText) + "</div>" : ""}${hasTranslation ? `<div class="original" ${m.open ? "" : "hidden"}><strong>${esc(t("original"))} · ${esc(I18n.names[lang] || lang)}</strong>${esc(original)}</div><button type="button" class="link" data-original="${i}" aria-expanded="${Boolean(m.open)}">${esc(t(m.open ? "hideOriginal" : "showOriginal"))}</button>` : ""}</div></div>`;
      })
      .join("");
  if (!chats[channel].length)
    el.innerHTML += '<div class="empty">' + esc(t("emptyChat")) + "</div>";
  if (focusedCard) {
    const input = el.querySelector(
      '[data-card-objection="' + focusedCard + '"] textarea',
    );
    input?.focus({ preventScroll: true });
    if (input && selection) input.setSelectionRange(...selection);
    el.scrollTop = scrollTop;
  } else el.scrollTop = el.scrollHeight;
}

async function pushMessage(
  text,
  selectedIntent = null,
  sendOriginal = false,
  sourceText = text,
  meaning = {},
) {
  const roomId = pending?.roomId || channel;
  const body = { text, sendOriginal, ...meaning };
  const signature = JSON.stringify([currentUser.id, roomId, body]);
  if (!messageRequestKeys.has(signature))
    messageRequestKeys.set(signature, crypto.randomUUID());
  body.clientMessageId = messageRequestKeys.get(signature);
  await API.request("/rooms/" + roomId + "/messages", { method: "POST", body });
  messageRequestKeys.delete(signature);
  // Clear only the submitted draft, never a new draft typed while the request was pending.
  if (channel === roomId && $("#message-input").value.trim() === sourceText)
    $("#message-input").value = "";
  pending = null;
  closeMeaningSheet();
  await refreshRoom();
}
async function sendMessage() {
  if (busy || pending || !ready || !activeWorkspace()) return;
  const text = $("#message-input").value.trim(),
    roomId = channel;
  if (!text) return;
  busy = true;
  $("#send").disabled = true;
  $("#send").textContent = t("checking");
  try {
    const analysis = await API.request(
      "/rooms/" + roomId + "/messages/analyze",
      {
        method: "POST",
        body: { text },
      },
    );
    if (channel !== roomId || !activeWorkspace()) return;
    if (analysis.ambiguous && analysis.expressions?.length) {
      if (
        !analysis.analysisId ||
        analysis.expressions.some(
          (expression) =>
            !expression.expressionId ||
            !expression.candidates?.length ||
            expression.candidates.some((candidate) => !candidate.candidateId),
        )
      )
        throw new Error("api.invalidResponse");
      pending = {
        text,
        roomId,
        analysisId: analysis.analysisId,
        expiresAt: analysis.expiresAt,
        expressions: analysis.expressions,
      };
      renderMeaning();
      openMeaningSheet();
    } else await pushMessage(text, null, false);
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    $("#send").disabled = !activeWorkspace() || Boolean(pending);
    $("#send").textContent = t("send");
  }
}
function initChat() {
  document.addEventListener("click", (event) => {
    const b = event.target.closest("[data-original]");
    if (b) {
      const message = chats[channel]?.[Number(b.dataset.original)];
      if (message) {
        message.open = !message.open;
        renderMessages();
      }
    }
  });
  $("#message-form").onsubmit = (event) => {
    event.preventDefault();
    sendMessage();
  };
  $("#message-input").onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  };
}
