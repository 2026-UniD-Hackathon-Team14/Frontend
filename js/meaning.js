"use strict";
function renderMeaning() {
  if (!pending) return;
  $("#pending-text").textContent = pending.text;
  const intents = new Set();
  $("#meaning-options").innerHTML = pending.expressions
    .map((expression) => {
      const candidates = (expression.candidates || []).filter(
        (c) =>
          ["ACCEPT", "REJECT", "UNDECIDED", "OTHER"].includes(c.intent) && !intents.has(c.intent),
      );
      candidates.forEach((c) => intents.add(c.intent));
      return (
        "<section><p>" +
        esc(expression.phrase) +
        "</p>" +
        candidates
          .map(
            (c) =>
              '<button type="button" class="option" data-meaning="' +
              esc(c.intent) +
              '">' +
              esc(c.label) +
              "</button>",
          )
          .join("") +
        "</section>"
      );
    })
    .join("");
}
function initMeaning() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.classList.contains("close")) button.closest("dialog")?.close();
    if (button.dataset.meaning && pending) {
      if (busy) return;
      busy = true;
      runAction(button, () => pushMessage(pending.text, button.dataset.meaning, false)).finally(
        () => {
          busy = false;
          renderWorkspaces();
        },
      );
    }
  });
  $("#send-original").onclick = (event) => {
    if (busy || !pending) return;
    busy = true;
    runAction(event.currentTarget, () => pushMessage(pending.text, null, true)).finally(() => {
      busy = false;
      renderWorkspaces();
    });
  };
  $("#meaning-dialog").addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  $("#meaning-dialog").addEventListener("close", () => {
    if (!busy) pending = null;
  });
}
