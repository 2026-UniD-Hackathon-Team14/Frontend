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

async function pushMessage(text, selectedIntent = null, sendOriginal = false) {
  const roomId = pending?.roomId || channel;
  await API.request("/rooms/" + roomId + "/messages", {
    method: "POST",
    body: { text, selectedIntent, sendOriginal },
  });
  // Clear only the submitted draft, never a new draft typed while the request was pending.
  if (channel === roomId && $("#message-input").value.trim() === text)
    $("#message-input").value = "";
  pending = null;
  $("#meaning-dialog").close();
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
    const analysis = await API.request("/rooms/" + roomId + "/messages/analyze", {
      method: "POST",
      body: { text },
    });
    if (analysis.ambiguous && analysis.expressions?.length) {
      pending = { text, roomId, expressions: analysis.expressions };
      renderMeaning();
      $("#meaning-dialog").showModal();
    } else await pushMessage(text, null, false);
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    $("#send").disabled = !activeWorkspace();
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
