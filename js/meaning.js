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
    if (start >= 0 && end > start && end <= pending.text.length)
      ranges.push({ start, end });
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
  pending.selections ||= [];
  $("#meaning-options").innerHTML = pending.expressions
    .map((expression, index) => {
      const selected = pending.selections[index];
      const candidates = (expression.candidates || []).filter((c) =>
        ["ACCEPT", "REJECT", "UNDECIDED", "OTHER"].includes(c.intent),
      );
      return `<section><p>${index + 1}. ${esc(expression.phrase)}</p>${candidates
        .map(
          (candidate, ci) =>
            `<button type="button" class="option" data-expression="${index}" data-candidate="${ci}" data-meaning="${esc(candidate.intent)}" aria-pressed="${selected?.candidateIndex === ci}"><span class="meaning-number">${ci + 1}</span><span class="meaning-option-label">${esc(candidate.label)}</span><span class="meaning-option-action">${esc(t(selected?.candidateIndex === ci ? "multi.selected" : "multi.select"))}</span></button>`,
        )
        .join("")}
      ${selected?.intent === "OTHER" ? `<label class="meaning-custom-input">${esc(t("multi.custom"))}<textarea data-custom-expression="${index}" maxlength="1000" placeholder="${esc(t("multi.placeholder"))}">${esc(selected.customText || "")}</textarea></label>` : ""}</section>`;
    })
    .join("");
  updateMeaningSend();
}
function meaningComplete() {
  return (
    pending &&
    pending.expressions.every((expression, index) => {
      const selected = pending.selections?.[index];
      return (
        selected && (selected.intent !== "OTHER" || selected.customText?.trim())
      );
    })
  );
}
function meaningPayload() {
  if (!meaningComplete()) return null;
  if (!pending.analysisId) throw new Error("api.invalidResponse");
  return {
    text: pending.text,
    analysisId: pending.analysisId,
    intentSelections: pending.expressions.map((expression, index) => {
      const choice = pending.selections[index];
      if (!expression.expressionId || !choice.candidateId)
        throw new Error("api.invalidResponse");
      return {
        expressionId: expression.expressionId,
        candidateId: choice.candidateId,
        customText: choice.intent === "OTHER" ? choice.customText.trim() : null,
      };
    }),
  };
}
function updateMeaningSend() {
  const complete = meaningComplete();
  $("#send-meanings").disabled = busy || !complete;
  const count =
    pending?.expressions.filter((expression, index) => {
      const choice = pending.selections?.[index];
      return choice && (choice.intent !== "OTHER" || choice.customText?.trim());
    }).length || 0;
  $("#meaning-progress").textContent = t("multi.progress", {
    count,
    total: pending?.expressions.length || 0,
  });
  $("#meaning-preview").hidden = !complete;
  $("#meaning-preview-text").textContent = complete
    ? pending.expressions
        .map((expression, index) => {
          const choice = pending.selections[index];
          return `${expression.phrase}: ${choice.intent === "OTHER" ? choice.customText.trim() : choice.label}`;
        })
        .join("\n")
    : "";
  if (pending?.analysisInvalid) $("#send-meanings").disabled = true;
}

function openMeaningSheet() {
  renderMeaning();
  $("#meaning-error").hidden = true;
  $("#reanalyze-meaning").hidden = true;
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
  if (!original && !meaningComplete()) return;
  if (busy || !pending) return;
  const draft = pending;
  busy = true;
  const controls = [
    ...$("#meaning-dialog").querySelectorAll("button, textarea"),
  ];
  controls.forEach((el) => (el.disabled = true));
  $("#meaning-error").hidden = true;
  try {
    const payload = original
      ? { text: draft.text, intent: null }
      : meaningPayload();
    await pushMessage(
      payload.text,
      null,
      original,
      draft.text,
      original ? {} : payload,
    );
  } catch (error) {
    if (["ANALYSIS_EXPIRED", "ANALYSIS_TEXT_MISMATCH"].includes(error.code)) {
      draft.analysisInvalid = true;
      $("#reanalyze-meaning").hidden = false;
    }
    $("#meaning-error").textContent =
      t(error.message) +
      (error.serverMessage ? " · " + error.serverMessage : "");
    $("#meaning-error").hidden = false;
    button.focus();
  } finally {
    busy = false;
    controls.forEach((el) => (el.disabled = false));
    if (pending) updateMeaningSend();
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
    if (b.dataset.meaning && pending && !busy) {
      const index = Number(b.dataset.expression);
      const candidates = pending.expressions[index].candidates.filter((c) =>
        ["ACCEPT", "REJECT", "UNDECIDED", "OTHER"].includes(c.intent),
      );
      const candidateIndex = Number(b.dataset.candidate),
        choice = candidates[candidateIndex];
      const customText = pending.selections[index]?.customText || "";
      pending.selections[index] = { ...choice, candidateIndex, customText };
      renderMeaning();
      const focus =
        choice.intent === "OTHER"
          ? `[data-custom-expression="${index}"]`
          : `[data-expression="${index}"][data-candidate="${candidateIndex}"]`;
      sheet.querySelector(focus)?.focus({ preventScroll: true });
    }
  });
  sheet.addEventListener("input", (event) => {
    if (!pending || busy || !event.target.matches("[data-custom-expression]"))
      return;
    pending.selections[
      Number(event.target.dataset.customExpression)
    ].customText = event.target.value;
    updateMeaningSend();
  });
  $("#send-meanings").onclick = (event) =>
    submitMeaning(event.currentTarget, null, false);
  $("#reanalyze-meaning").onclick = () => {
    if (busy) return;
    pending = null;
    closeMeaningSheet();
    sendMessage();
  };
  $("#close-meaning").onclick = () => {
    if (busy) return;
    pending = null;
    closeMeaningSheet();
  };
  $("#send-original").onclick = (event) =>
    submitMeaning(event.currentTarget, null, true);
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
      if (busy)
        sheet
          .querySelectorAll("button, textarea")
          .forEach((b) => (b.disabled = true));
    }
  });
}
