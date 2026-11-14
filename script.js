"use strict";
I18n.init();
if (!currentUser.id) location.replace("./login.html");
else {
  initSidebar();
  initBoard();
  initMeaning();
  initChat();
  initInvitations();
  initWorkspaceTools();
  initRoomLeave();
  $("#logout").onclick = () => {
    RoomSync.stop();
    UserAPI.logout();
  };
  $("#retry-api").onclick = () => {
    if (!ready) location.reload();
    else {
      refreshRoom();
      if (workspaceTool !== "chat") loadWorkspaceTool();
    }
  };
  $("#dismiss-error").onclick = () => ($("#api-error").hidden = true);
  document.addEventListener("languagechange", () => {
    if (!ready) return;
    const drafts = toolFormDrafts();
    renderApp();
    renderWorkspaceTool();
    restoreToolDrafts(drafts);
    refreshRoom();
    if (workspaceTool !== "chat") loadWorkspaceTool();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ready) {
      refreshRoom({ quiet: true });
      if (workspaceTool !== "chat") loadWorkspaceTool({ quiet: true });
    }
  });
  renderApp();
  (async () => {
    try {
      Object.assign(currentUser, await UserAPI.loadUser(currentUser.id));
      await loadJoinedRooms();
      ready = true;
      const selected =
        appState.workspaces.find((w) => w.id === appState.activeId) || appState.workspaces[0];
      if (selected) await selectWorkspace(selected.id);
      else {
        appState.activeId = channel = null;
        renderApp();
        setConnection("api.connected");
      }
    } catch (error) {
      showError(error);
      if (error.status === 404 || error.status === 401) UserAPI.logout();
    }
  })();
}
