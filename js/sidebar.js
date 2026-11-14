// 워크스페이스 목록, 생성, 선택, 모바일 메뉴
function renderWorkspaces() {
  $("#workspace-list").innerHTML = appState.workspaces
    .map(
      (w) => `
    <button class="nav-btn ${w.id === channel ? "active" : ""}" data-workspace="${esc(w.id)}" ${w.id === channel ? 'aria-current="page"' : ""}>
      <span class="nav-icon">#</span><span class="workspace-name">${esc(w.name)}</span>
    </button>`,
    )
    .join("");
  const workspace = activeWorkspace();
  const hasWorkspace = Boolean(workspace);
  $("#leave-workspace").disabled = !hasWorkspace;
  $("#invite-friends").disabled = !hasWorkspace;
  $("#message-input").disabled = !hasWorkspace;
  $("#send").disabled = !hasWorkspace;
  $("#message-input").placeholder = hasWorkspace
    ? "어떤 생각이든 편하게 나눠 보세요."
    : "먼저 워크스페이스를 만들어 주세요.";
  $("#room-title").textContent = hasWorkspace ? "# " + workspace.name : "워크스페이스 없음";
  $("#breadcrumb").textContent = workspace
    ? "내 워크스페이스 / " + workspace.name
    : "내 워크스페이스";
  $("#page-title").textContent = workspace?.name || "새로운 대화를 시작해 보세요";
  renderMembers();
}
function renderMembers() {
  const workspace = activeWorkspace();
  if (!workspace) {
    $("#member-count").textContent = "팀원 0명";
    $("#member-avatars").innerHTML = "";
    $("#member-avatars").setAttribute("aria-label", "팀원 없음");
    $("#translation-hint").textContent = "WORKSPACE 옆 + 버튼으로 새 공간을 만들 수 있어요.";
    return;
  }
  $("#member-count").textContent = "팀원 " + workspace.members.length + "명";
  $("#member-avatars").innerHTML = workspace.members
    .map(
      (m) =>
        `<span class="avatar ${m.id === currentUser.id ? "me" : ""}" title="${esc(m.name)}">${esc(Array.from(m.name)[0] || "?")}</span>`,
    )
    .join("");
  $("#member-avatars").setAttribute(
    "aria-label",
    "팀원: " + workspace.members.map((m) => m.name).join(", "),
  );
  $("#translation-hint").textContent =
    "로컬 데모 · 팀원 언어: " +
    [
      ...new Set(
        workspace.members.map(
          (m) =>
            ({ ko: "한국어", en: "English", vi: "Tiếng Việt", de: "Deutsch" })[m.language] ||
            m.language,
        ),
      ),
    ].join(" · ");
}
function selectWorkspace(id) {
  if (busy) {
    toast("메시지 처리가 끝난 뒤 이동해 주세요.");
    return;
  }
  if (!appState.workspaces.some((w) => w.id === id)) return;
  appState.activeId = id;
  channel = id;
  pending = "";
  agreementViewer = currentUser.id;
  $("#message-input").value = "";
  boardFilter = "전체";
  renderWorkspaces();
  renderMessages();
  renderBoard();
  $("#sidebar").classList.remove("open");
  $("#menu").setAttribute("aria-expanded", "false");
  saveState();
}
function createWorkspace(name, description) {
  const workspace = {
    id: newId("workspace"),
    name,
    description,
    members: [{ ...currentUser }],
    messages: [],
    cards: [],
    invitations: [],
  };
  appState.workspaces.push(workspace);
  chats[workspace.id] = workspace.messages;
  selectWorkspace(workspace.id);
  return workspace;
}
function initSidebar() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-workspace]");
    if (button) selectWorkspace(button.dataset.workspace);
  });
  $("#menu").onclick = () => {
    const open = $("#sidebar").classList.toggle("open");
    $("#menu").setAttribute("aria-expanded", String(open));
  };
  $("#create-workspace").onclick = () => {
    if (busy) return toast("메시지 처리가 끝난 뒤 다시 시도해 주세요.");
    $("#workspace-form").reset();
    $("#workspace-name").setCustomValidity("");
    $("#workspace-dialog").showModal();
  };
  $("#workspace-name").oninput = () => $("#workspace-name").setCustomValidity("");
  $("#workspace-form").onsubmit = (event) => {
    event.preventDefault();
    const input = $("#workspace-name");
    const name = input.value.trim();
    input.setCustomValidity(
      !name
        ? "워크스페이스 이름을 입력해 주세요."
        : appState.workspaces.some((w) => w.name.toLocaleLowerCase() === name.toLocaleLowerCase())
          ? "이미 같은 이름의 워크스페이스가 있어요."
          : "",
    );
    if (!$("#workspace-form").reportValidity()) return;
    createWorkspace(name, $("#workspace-summary").value.trim());
    $("#workspace-dialog").close();
    toast("새 워크스페이스로 이동했어요.");
  };
  renderWorkspaces();
}
