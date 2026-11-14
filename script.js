"use strict";
I18n.init();
initSidebar();
initBoard();
initMeaning();
initChat();
initInvitations();
initWorkspaceLeave();
function renderLanguageUI() {
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
