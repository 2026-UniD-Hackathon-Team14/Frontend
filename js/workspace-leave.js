"use strict";
let leavingTarget = null;
let reconcilingMembership = false;

// 서버 탈퇴 성공 후에만 이 사용자의 화면 참조를 정리합니다. 서버 콘텐츠는 삭제하지 않습니다.
function forgetJoinedRoom(roomId) {
  appState.workspaces = appState.workspaces.filter(room => room.id !== roomId);
  appState.roomIds = appState.roomIds.filter(id => String(id) !== roomId);
  delete appState.receiptIds[roomId];
  delete chats[roomId];
  if (channel === roomId) {
    RoomSync.stop();
    refreshVersion++;
    toolVersion++;
    channel = appState.activeId = null;
    pending = null;
    $("#message-input").value = "";
    serverTools.receipt = null;
    serverTools.receipts = [];
    serverTools.receiptId = null;
    serverTools.receiptRoomId = null;
    serverTools.events = [];
    serverTools.loading = false;
    for (const id of ["#meaning-dialog", "#agreement-dialog", "#invite-dialog", "#leave-room-dialog"])
      if ($(id)?.open) $(id).close();
    showWorkspaceTool("chat");
    $("#tool-content").innerHTML = "";
  }
  saveState();
}
async function showRemainingRoom() {
  const next = appState.workspaces.find(room => room.id === channel) || appState.workspaces[0];
  if (next) await selectWorkspace(next.id);
  else {
    channel = appState.activeId = null;
    renderApp();
    setConnection("api.connected");
  }
}
async function reconcileRoomMembership() {
  if (roomLeaveInFlight || reconcilingMembership) return false;
  reconcilingMembership = true;
  const previous = channel;
  try {
    await loadJoinedRooms();
    if (previous && channel === previous && !appState.workspaces.some(room => room.id === previous)) {
      forgetJoinedRoom(previous);
      await showRemainingRoom();
      toast("roomLeave.removedElsewhere");
      return true;
    }
    renderWorkspaces();
    return false;
  } catch (error) {
    showError(error);
    return false;
  } finally {
    reconcilingMembership = false;
  }
}
function initRoomLeave() {
  const dialog = $("#leave-room-dialog");
  const confirm = $("#confirm-room-leave");
  $("#leave-room").onclick = () => {
    if (!ready || !activeWorkspace() || roomLeaveInFlight) return;
    if (busy || pending) return toast("busyRetry");
    leavingTarget = channel;
    $("#leave-room-name").textContent = activeWorkspace().name;
    dialog.querySelectorAll(".api-inline-error").forEach(element => element.remove());
    dialog.showModal();
  };
  confirm.onclick = () => {
    if (!leavingTarget || leavingTarget !== channel || roomLeaveInFlight || busy || pending) return;
    const roomId = leavingTarget;
    runAction(confirm, async () => {
      roomLeaveInFlight = true;
      dialog.setAttribute("aria-busy", "true");
      dialog.querySelectorAll(".close").forEach(button => { button.disabled = true; });
      renderApp();
      let removed = false;
      try {
        const result = await API.request("/rooms/" + API.id(roomId) + "/members/me", { method: "DELETE" });
        if (String(result?.roomId) !== roomId || String(result?.userId) !== currentUser.id)
          throw new Error("api.invalidResponse");
        removed = true;
        forgetJoinedRoom(roomId);
        leavingTarget = null;
        try { await loadJoinedRooms(); }
        catch (error) { showError(error); }
        // 성공 응답 뒤에는 지연된 조회 결과로 탈퇴한 방이 복원되지 않게 합니다.
        forgetJoinedRoom(roomId);
      } finally {
        roomLeaveInFlight = false;
        dialog.setAttribute("aria-busy", "false");
        dialog.querySelectorAll(".close").forEach(button => { button.disabled = false; });
        renderApp();
      }
      if (removed) {
        await showRemainingRoom();
        toast("roomLeave.success");
      }
    });
  };
  dialog.addEventListener("cancel", event => { if (roomLeaveInFlight) event.preventDefault(); });
  dialog.addEventListener("close", () => { if (!roomLeaveInFlight) leavingTarget = null; });
}
