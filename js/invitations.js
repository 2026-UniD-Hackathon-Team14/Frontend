// 초대 API 미정: 초대 목록과 수락 과정은 현재 브라우저에서만 시뮬레이션합니다.
function renderInvitations() {
  const workspace = activeWorkspace();
  $("#invite-workspace-name").textContent = workspace.name;
  $("#invitation-list").innerHTML = workspace.invitations.length
    ? workspace.invitations
        .map(
          (invite) => `<article class="invitation-item">
    <div><strong>${esc(invite.name)}</strong><small>${esc(invite.email)}</small><span class="pill">${invite.status === "ACCEPTED" ? "데모 참여 완료" : invite.status === "CANCELLED" ? "취소됨" : "초대 준비 · 미발송"}</span></div>
    ${invite.status === "PENDING" ? `<div class="invitation-actions"><button type="button" class="btn soft" data-accept-invite="${esc(invite.id)}">데모: 참여 수락</button><button type="button" class="btn" data-cancel-invite="${esc(invite.id)}">취소</button></div>` : ""}
  </article>`,
        )
        .join("")
    : '<p class="empty">아직 준비한 초대가 없어요.</p>';
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
    $("#invite-name").setCustomValidity(name ? "" : "이름을 입력해 주세요.");
    if (!$("#invite-form").reportValidity()) return;
    const invite = createInvitation({
      name,
      email: $("#invite-email").value.trim().toLowerCase(),
      language: $("#invite-language").value,
    });
    if (!invite) {
      $("#invite-email").setCustomValidity("이미 초대했거나 참여 중인 이메일이에요.");
      $("#invite-email").reportValidity();
      return;
    }
    $("#invite-form").reset();
    renderInvitations();
    toast("초대를 준비했어요. 실제 이메일은 전송되지 않습니다.");
  };
  document.addEventListener("click", (event) => {
    const accept = event.target.closest("button[data-accept-invite]");
    if (accept && acceptDemoInvitation(accept.dataset.acceptInvite)) {
      renderInvitations();
      renderMembers();
      renderMessages();
      renderBoard();
      toast("로컬 데모에 팀원이 참여했어요.");
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
