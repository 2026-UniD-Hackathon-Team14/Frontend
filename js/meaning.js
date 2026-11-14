"use strict";
function renderMeaning() {
  if (!pending) return;
  const ranges = [];
  for (const expression of pending.expressions) {
    let start = expression.start,
      end = expression.end;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      pending.text.slice(start, end) !== expression.phrase
    ) {
      start = pending.text.indexOf(expression.phrase);
      end = start + (expression.phrase || "").length;
    }
    if (start >= 0 && end > start && end <= pending.text.length) ranges.push({ start, end });
  }
  ranges.sort((a, b) => a.start - b.start);
  let cursor = 0,
    quote = "";
  for (const range of ranges) {
    if (range.start < cursor) continue;
    quote +=
      esc(pending.text.slice(cursor, range.start)) +
      "<mark>" +
      esc(pending.text.slice(range.start, range.end)) +
      "</mark>";
    cursor = range.end;
  }
  $("#pending-text").innerHTML = quote + esc(pending.text.slice(cursor));
  let count = 0;
  $("#meaning-options").innerHTML = pending.expressions
    .map((expression) => {
      const candidates = (expression.candidates || []).filter((c) =>
        ["ACCEPT", "REJECT", "UNDECIDED", "OTHER"].includes(c.intent),
      );
      return (
        "<section><p>" +
        esc(expression.phrase) +
        "</p>" +
        candidates
          .map(
            (c) =>
              '<button type="button" class="option" data-meaning="' +
              esc(c.intent) +
              '"><span class="meaning-number" aria-hidden="true">' +
              ++count +
              '</span><span class="meaning-option-label">' +
              esc(c.label) +
              '</span><span class="meaning-option-action">' +
              esc(t("sheet.sendIntent")) +
              " →</span></button>",
          )
          .join("") +
        "</section>"
      );
    })
    .join("");
}
function openMeaningSheet() {
  renderMeaning();
  $("#meaning-error").hidden = true;
  $("#meaning-dialog").show();
  $("#message-input").readOnly = true;
  $("#meaning-dialog")
    .querySelector("[data-meaning],#send-original")
    ?.focus({ preventScroll: true });
}
function closeMeaningSheet() {
  $("#meaning-dialog").close();
  $("#message-input").readOnly = false;
  $("#message-input").focus({ preventScroll: true });
  renderWorkspaces();
}
async function submitMeaning(button, intent, original) {
  if (busy || !pending) return;
  const draft = pending;
  busy = true;
  const controls = [...$("#meaning-dialog").querySelectorAll("button")];
  controls.forEach((el) => (el.disabled = true));
  $("#meaning-error").hidden = true;
  try {
    await pushMessage(draft.text, intent, original);
  } catch (error) {
    $("#meaning-error").textContent =
      t(error.message) + (error.serverMessage ? " · " + error.serverMessage : "");
    $("#meaning-error").hidden = false;
    button.focus();
  } finally {
    busy = false;
    controls.forEach((el) => (el.disabled = false));
    renderWorkspaces();
  }
}
function initMeaning() {
  const sheet = $("#meaning-dialog");
  const resize = new ResizeObserver(() => {
    $(".content").style.setProperty(
      "--composer-height",
      $("#message-form").getBoundingClientRect().height + "px",
    );
  });
  resize.observe($("#message-form"));
  document.addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (!b) return;
    if (b.classList.contains("close")) b.closest("dialog")?.close();
    if (b.dataset.meaning) submitMeaning(b, b.dataset.meaning, false);
  });
  $("#close-meaning").onclick = () => {
    if (busy) return;
    pending = null;
    closeMeaningSheet();
  };
  $("#send-original").onclick = (event) => submitMeaning(event.currentTarget, null, true);
  sheet.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!busy) {
        pending = null;
        closeMeaningSheet();
      }
    }
  });
  sheet.addEventListener("close", () => {
    $("#message-input").readOnly = false;
    if (!busy) pending = null;
  });
  document.addEventListener("languagechange", () => {
    if (pending) {
      renderMeaning();
      if (busy) sheet.querySelectorAll("button").forEach((b) => (b.disabled = true));
    }
  });
}
