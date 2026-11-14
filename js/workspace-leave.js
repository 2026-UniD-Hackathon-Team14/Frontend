"use strict";
// Waiting for a server membership-removal endpoint. Never remove only the local room index.
function initRoomLeave() {
  document.querySelector("#leave-room").onclick = () => {
    const room = activeWorkspace();
    if (!ready || !room) return;
    document.querySelector("#leave-room-name").textContent = room.name;
    document.querySelector("#leave-room-dialog").showModal();
  };
}
