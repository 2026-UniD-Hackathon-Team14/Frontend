"use strict";
function renderInvitations() {
  const workspace = activeWorkspace();
  if (!workspace) return;
  $("#invite-workspace-name").textContent = workspace.name;
  $("#invite-room-id").textContent = workspace.id;
  $("#invitation-list").innerHTML = workspace.members
    .map((m) => "<p>" + esc(m.name) + " · ID " + esc(m.id) + "</p>")
    .join("");
}
function initInvitations() {
  $("#invite-friends").onclick = () => {
    $("#invite-form").reset();
    renderInvitations();
    $("#invite-dialog").showModal();
  };
  $("#invite-form").onsubmit = (event) => {
    event.preventDefault();
    const roomId = channel;
    runAction(event.target.querySelector("[type=submit]"), async () => {
      await API.request("/rooms/" + roomId + "/members", {
        method: "POST",
        body: { userId: API.id($("#invite-user-id").value) },
      });
      $("#invite-form").reset();
      await refreshRoom();
      renderInvitations();
      toast("api.memberAdded");
    });
  };
}
