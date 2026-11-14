function selectMeaning(intent, customIntentText = "") {
  // Stable API enum; free text stays unchanged and must be translated by the server.
  pushMessage(pending, intent || null, customIntentText);
  $("#meaning-dialog").close();
  if (customIntentText) toast("customSaved");
}
function initMeaning() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.meaning) selectMeaning(button.dataset.meaning);
    if (button.classList.contains("close")) button.closest("dialog").close();
  });
  $("#send-original").onclick = () => selectMeaning(null);
  $("#custom-meaning").onsubmit = (event) => {
    event.preventDefault();
    const text = $("#custom-text").value.trim();
    if (text) selectMeaning("OTHER", text);
  };
}
