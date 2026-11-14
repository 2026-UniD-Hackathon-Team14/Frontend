// 나가기는 현재 브라우저에 저장된 워크스페이스에만 적용합니다.
let leavingWorkspaceId = null;

function leaveWorkspace(id) {
  if (busy || !appState.workspaces.some((workspace) => workspace.id === id)) return false;
  appState.workspaces = appState.workspaces.filter((workspace) => workspace.id !== id);
  delete chats[id];
  appState.activeId = appState.workspaces[0]?.id || null;
  channel = appState.activeId;
  pending = "";
  boardFilter = "전체";
  $("#message-input").value = "";
  renderWorkspaces();
  renderMessages();
  renderBoard();
  saveState();
  return true;
}

function initWorkspaceLeave() {
  $("#leave-workspace").onclick = () => {
    if (busy) return toast("메시지 처리가 끝난 뒤 다시 시도해 주세요.");
    const workspace = activeWorkspace();
    if (!workspace) return;
    leavingWorkspaceId = workspace.id;
    $("#leave-workspace-name").textContent = workspace.name;
    $("#leave-dialog").showModal();
  };
  $("#confirm-leave").onclick = () => {
    if (leaveWorkspace(leavingWorkspaceId)) {
      $("#leave-dialog").close();
      leavingWorkspaceId = null;
      toast("워크스페이스에서 나왔어요.");
    }
  };
}
