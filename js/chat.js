function renderMessages() {
  const el = $("#messages");
  if (!activeWorkspace()) {
    el.innerHTML = '<div class="empty">' + esc(t("noWorkspaceMessage")) + "</div>";
    return;
  }
  el.innerHTML =
    '<div class="date-divider">' +
    esc(activeWorkspace().name) +
    "</div>" +
    chats[channel]
      .map((m, i) => {
        if (m.agreement) return renderAgreementMessage(m.agreement);
        const original = m.originalText ?? m.text ?? "";
        const display = ContentAPI.messageText(m);
        const hasTranslation = display !== original;
        const lang = m.originalLanguage || m.language || "ko";
        const mine = m.senderId
          ? String(m.senderId) === currentUser.id
          : m.name === currentUser.name;
        const intent = m.selectedIntent ? t("intent." + m.selectedIntent) : m.meaning || "";
        return `<div class="message ${mine ? "mine" : ""}"><span class="avatar ${mine ? "me" : ""}">${esc(m.initial || Array.from(m.senderName || m.name || "?")[0])}</span><div class="message-body"><div class="who">${esc(m.senderName || m.name)}<span class="lang">${esc(I18n.names[lang] || lang)}</span><span class="time">${esc(m.time || "")}</span></div><div class="bubble">${esc(display)}</div>${intent ? '<div class="meaning">✓ ' + esc(t("intentLabel", { meaning: intent })) + "</div>" : ""}${m.customIntentText ? '<div class="original">' + esc(m.customIntentText) + "</div>" : ""}${hasTranslation ? `<div class="original" ${m.open ? "" : "hidden"}>${esc(t("original"))}<br>${esc(original)}</div><button class="link" data-original="${i}">${esc(t(m.open ? "hideOriginal" : "showOriginal"))}</button>` : ""}</div></div>`;
      })
      .join("");
  if (!chats[channel].length)
    el.innerHTML += '<div class="empty">' + esc(t("emptyChat")) + "</div>";
  el.scrollTop = el.scrollHeight;
}
function pushMessage(text, selectedIntent = null, customIntentText = "") {
  if (!activeWorkspace()) return;
  chats[channel].push({
    senderId: currentUser.id,
    name: currentUser.name,
    initial: Array.from(currentUser.name)[0],
    originalLanguage: currentUser.language,
    originalText: text,
    text,
    selectedIntent,
    customIntentText,
    time: new Date().toLocaleTimeString(I18n.locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  });
  saveState();
  $("#message-input").value = "";
  renderMessages();
}
async function sendMessage() {
  if (busy || !activeWorkspace()) return;
  const text = $("#message-input").value.trim();
  if (!text) return;
  busy = true;
  $("#send").disabled = true;
  $("#send").textContent = t("checking");
  await new Promise((resolve) => setTimeout(resolve, 450));
  // Demo analysis only; production uses POST /rooms/{roomId}/messages/analyze.
  if (text.includes("생각해볼게요")) {
    pending = text;
    $("#pending-text").textContent = text;
    $("#meaning-dialog").showModal();
  } else {
    pushMessage(text);
    toast("messageAdded");
  }
  busy = false;
  $("#send").disabled = false;
  $("#send").textContent = t("send");
}
function initChat() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-original]");
    if (!button) return;
    const m = chats[channel][Number(button.dataset.original)];
    m.open = !m.open;
    renderMessages();
  });
  $("#message-form").addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });
  $("#message-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });
  renderMessages();
}
