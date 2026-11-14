"use strict";
function initCalendarPreview() {
  if (document.getElementById("calendar-preview")) return;
  const popup = document.createElement("aside");
  popup.id = "calendar-preview";
  popup.className = "calendar-preview";
  popup.setAttribute("role", "tooltip");
  popup.hidden = true;
  document.body.append(popup);
  let active = null, timer, generation = 0;
  let pointer = null, dismissed = null;
  const cache = new Map();
  function close() {
    clearTimeout(timer);
    active?.button.removeAttribute("aria-describedby");
    active = null;
    generation++;
    popup.hidden = true;
  }
  function position() {
    if (!active) return;
    const rect = active.button.getBoundingClientRect();
    const width = popup.offsetWidth, height = popup.offsetHeight;
    popup.style.left = Math.max(12, Math.min(rect.left, innerWidth - width - 12)) + "px";
    const below = rect.bottom + 8;
    popup.style.top = Math.max(12, below + height < innerHeight - 12 ? below : rect.top - height - 8) + "px";
  }
  async function details(event, roomId, lang) {
    if (event.sourceType === "CARD") {
      const cards = await API.request("/rooms/" + API.id(roomId) + "/cards?lang=" + lang);
      return cards.find(card => String(card.id) === String(event.sourceId));
    }
    if (event.sourceType === "RECEIPT_ITEM") {
      const receipts = await API.request("/rooms/" + API.id(roomId) + "/receipts");
      for (let i = 0; i < receipts.length; i += 4) {
        const batch = await Promise.all(receipts.slice(i, i + 4).map(receipt =>
          API.request("/receipts/" + API.id(receipt.id) + "?lang=" + lang)));
        for (const receipt of batch) {
          const item = receipt.items?.find(item => String(item.id) === String(event.sourceId));
          if (item) return { ...item, content: item.what };
        }
      }
    }
    return null;
  }
  async function open(button) {
    clearTimeout(timer);
    if (active?.button === button) return;
    close();
    const event = serverTools.events.find(event => String(event.id) === button.dataset.eventPreview);
    if (!event || workspaceTool !== "calendar") return;
    const roomId = channel, lang = I18n.language, token = generation;
    active = { button, id: button.dataset.eventPreview, roomId, lang };
    button.setAttribute("aria-describedby", popup.id);
    popup.innerHTML = "<strong>" + esc(event.title) + "</strong><p>" + esc(t("api.loading")) + "</p>";
    popup.hidden = false;
    position();
    try {
      const key = [roomId, lang, event.sourceType, event.sourceId].join(":");
      let entry = cache.get(key);
      if (!entry || Date.now() - entry.time > 30000) {
        entry = { time: Date.now(), promise: details(event, roomId, lang) };
        cache.set(key, entry);
        entry.promise.catch(() => cache.delete(key));
      }
      const card = await entry.promise;
      if (!active || token !== generation || channel !== roomId || I18n.language !== lang) return;
      popup.innerHTML = '<strong>' + esc(card?.title || event.title) + '</strong><p class="calendar-preview-content">' +
        esc(card ? card.content || "" : t("api.receiptUnavailable")) + '</p>' +
        (card ? '<div>' + esc(t("assignedTo", { names: card.assignee?.name || t("unassigned") })) + '</div>' : '') +
        '<div>' + esc(t("dueOn", { date: toolDate(card?.dueDate || event.date) })) + '</div>';
      position();
    } catch (error) {
      if (active && token === generation) { popup.textContent = t(error.message); position(); }
    }
  }
  function leave() { close(); }
  // Also handle an already-hovered replacement button after a calendar refresh.
  document.addEventListener("mousemove", event => {
    pointer = { x: event.clientX, y: event.clientY };
    const button = event.target.closest?.("[data-event-preview]");
    if (button && button !== dismissed) open(button);
    else if (!button) { dismissed = null; if (active && !popup.contains(event.target)) leave(); }
  });
  document.addEventListener("pointerover", event => {
    pointer = { x: event.clientX, y: event.clientY };
    const button = event.target.closest("[data-event-preview]");
    if (button && button !== dismissed) open(button);
  });
  document.addEventListener("pointerout", event => {
    const button = event.target.closest("[data-event-preview]");
    if (button?.isConnected && !button.contains(event.relatedTarget) && !popup.contains(event.relatedTarget)) leave();
  });
  popup.addEventListener("pointerenter", () => clearTimeout(timer));
  popup.addEventListener("pointerleave", event => {
    if (!active?.button.contains(event.relatedTarget)) leave();
  });
  document.addEventListener("focusin", event => {
    const button = event.target.closest("[data-event-preview]");
    if (button) open(button);
    else if (!popup.contains(event.target)) close();
  });
  document.addEventListener("focusout", event => { if (event.target.isConnected && event.target.closest("[data-event-preview]")) leave(); });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-event-preview]");
    if (button) open(button);
    else if (!popup.contains(event.target)) close();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") { dismissed = active?.button; close(); } });
  document.addEventListener("languagechange", close);
  window.addEventListener("resize", close);
  document.addEventListener("scroll", event => {
    if (!active || popup.contains(event.target)) return;
    const rect = active.button.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) close();
    else position();
  }, true);
  // Polling rebuilds the calendar; retain the preview for the same event.
  new MutationObserver(() => {
    if (!active) return;
    if (workspaceTool !== "calendar" || channel !== active.roomId || I18n.language !== active.lang) return close();
    if (!active.button.isConnected) {
      const button = [...document.querySelectorAll('[data-event-preview]')].find(button => button.dataset.eventPreview === active.id);
      if (!button) return close();
      clearTimeout(timer);
      active.button = button;
      button.setAttribute("aria-describedby", popup.id);
      position();
    }
  }).observe(document.querySelector("#tool-content"), { childList: true, subtree: true });
}
