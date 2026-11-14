"use strict";
I18n.init();
initSidebar();
initBoard();
initMeaning();
initChat();
initInvitations();
initWorkspaceLeave();
initWorkspaceTools();
function renderLanguageUI() {
  const toolDrafts = [...document.querySelectorAll("#tool-content form")].map((form) => ({
    key: form.id || JSON.stringify(form.dataset),
    fields: [...form.querySelectorAll("input,textarea,select")].map((el) => ({
      name: el.name,
      value: el.value,
      checked: el.checked,
    })),
  }));
  currentUser.language = I18n.language;
  for (const workspace of appState.workspaces) {
    const me = workspace.members.find((m) => m.id === currentUser.id);
    if (me) {
      me.language = currentUser.language;
      me.name = currentUser.name;
    }
  }
  $("#profile-name").textContent = currentUser.name;
  $("#profile-avatar").textContent = Array.from(currentUser.name)[0] || "?";
  $("#profile-language").textContent = t("profileStatus", { language: I18n.names[I18n.language] });
  $("#viewing-language").textContent = t("viewing", { language: I18n.names[I18n.language] });
  const draft = $("#message-input").value;
  renderWorkspaces();
  renderMessages();
  renderBoard();
  $("#message-input").value = draft;
  if (busy) {
    $("#send").disabled = true;
    $("#send").textContent = t("checking");
  }
  if (activeWorkspace()) renderInvitations();
  for (const form of document.querySelectorAll("#tool-content form")) {
    const draft = toolDrafts.find((item) => item.key === (form.id || JSON.stringify(form.dataset)));
    if (draft)
      for (const el of form.querySelectorAll("input,textarea,select")) {
        const field = draft.fields.find((item) => item.name === el.name);
        if (field) {
          el.value = field.value;
          el.checked = field.checked;
        }
      }
  }
  saveState();
}
document.addEventListener("languagechange", renderLanguageUI);
document.addEventListener("userchange", (event) => {
  if (String(event.detail.user.id) !== currentUser.id) {
    location.reload();
    return;
  }
  Object.assign(currentUser, event.detail.user);
  renderLanguageUI();
});
renderLanguageUI();
