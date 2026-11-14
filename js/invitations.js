// 초대 API 미정: 초대 목록과 수락 과정은 현재 브라우저에서만 시뮬레이션합니다.
function renderInvitations() {
  const workspace = activeWorkspace();
  $("#invite-workspace-name").textContent = workspace.name;
  $("#invitation-list").innerHTML = workspace.invitations.length
    ? workspace.invitations
        .map(
          (invite) => `<article class="invitation-item">
    <div><strong>${esc(invite.name)}</strong><small>${esc(invite.email)}</small><span class="pill">${invite.status === "ACCEPTED" ? t("inviteAccepted") : invite.status === "CANCELLED" ? t("inviteCancelled") : t("invitePending")}</span></div>
    ${invite.status === "PENDING" ? `<div class="invitation-actions"><button type="button" class="btn soft" data-accept-invite="${esc(invite.id)}">${esc(t("acceptDemo"))}</button><button type="button" class="btn" data-cancel-invite="${esc(invite.id)}">${esc(t("cancel"))}</button></div>` : ""}
  </article>`,
        )
        .join("")
    : '<p class="empty">' + esc(t("emptyInvitations")) + "</p>";
}
function createInvitation(values) {
  const workspace = activeWorkspace();
  if (
    workspace.invitations.some((i) => i.email === values.email && i.status !== "CANCELLED") ||
    workspace.members.some((m) => m.email === values.email)
  )
    return null;
  const invite = { id: newId("invite"), ...values, status: "PENDING" };
  workspace.invitations.push(invite);
  saveState();
  return invite;
}
function acceptDemoInvitation(id) {
  const workspace = activeWorkspace();
  const invite = workspace.invitations.find((i) => i.id === id);
  if (!invite || invite.status !== "PENDING") return false;
  invite.status = "ACCEPTED";
  workspace.members.push({
    id: newId("member"),
    name: invite.name,
    email: invite.email,
    language: invite.language,
  });
  saveState();
  return true;
}
function initInvitations() {
  $("#invite-friends").onclick = () => {
    $("#invite-form").reset();
    $("#invite-email").setCustomValidity("");
    $("#invite-name").setCustomValidity("");
    renderInvitations();
    $("#invite-dialog").showModal();
  };
  ["#invite-email", "#invite-name"].forEach(
    (id) => ($(id).oninput = () => $(id).setCustomValidity("")),
  );
  $("#invite-form").onsubmit = (event) => {
    event.preventDefault();
    const name = $("#invite-name").value.trim();
    validationMessage($("#invite-name"), name ? "" : "nameRequired");
    if (!$("#invite-form").reportValidity()) return;
    const invite = createInvitation({
      name,
      email: $("#invite-email").value.trim().toLowerCase(),
      language: $("#invite-language").value,
    });
    if (!invite) {
      validationMessage($("#invite-email"), "inviteDuplicate");
      $("#invite-email").reportValidity();
      return;
    }
    $("#invite-form").reset();
    renderInvitations();
    toast("invitePrepared");
  };
  document.addEventListener("click", (event) => {
    const accept = event.target.closest("button[data-accept-invite]");
    if (accept && acceptDemoInvitation(accept.dataset.acceptInvite)) {
      renderInvitations();
      renderMembers();
      renderMessages();
      renderBoard();
      toast("memberJoined");
    }
    const cancel = event.target.closest("button[data-cancel-invite]");
    if (cancel) {
      const invite = activeWorkspace().invitations.find(
        (i) => i.id === cancel.dataset.cancelInvite,
      );
      if (invite?.status === "PENDING") {
        invite.status = "CANCELLED";
        saveState();
        renderInvitations();
      }
    }
  });
}
