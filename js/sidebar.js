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
  $("#message-input").placeholder = hasWorkspace ? t("messagePlaceholder") : t("createFirst");
  $("#room-title").textContent = hasWorkspace ? "# " + workspace.name : t("noWorkspace");
  $("#breadcrumb").textContent = workspace
    ? t("myWorkspaces") + " / " + workspace.name
    : t("myWorkspaces");
  $("#page-title").textContent = workspace?.name || t("startConversation");
  renderMembers();
}
function renderMembers() {
  const workspace = activeWorkspace();
  const members = workspace?.members || [];
  $("#member-count").textContent = t("memberCount", { count: members.length });
  $("#member-avatars").innerHTML = members
    .map(
      (m) =>
        `<span class="avatar ${m.id === currentUser.id ? "me" : ""}" title="${esc(m.name)}">${esc(Array.from(m.name)[0] || "?")}</span>`,
    )
    .join("");
  $("#member-avatars").setAttribute(
    "aria-label",
    members.length
      ? t("membersLabel", { names: members.map((m) => m.name).join(", ") })
      : t("noMembers"),
  );
  $("#translation-hint").textContent = workspace
    ? t("languageHint", {
        languages: [...new Set(members.map((m) => I18n.names[m.language] || m.language))].join(
          " · ",
        ),
      })
    : t("createHint");
}
function selectWorkspace(id) {
  if (busy) {
    toast("busyMove");
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
    if (busy) return toast("busyRetry");
    $("#workspace-form").reset();
    $("#workspace-name").setCustomValidity("");
    $("#workspace-dialog").showModal();
  };
  $("#workspace-name").oninput = () => $("#workspace-name").setCustomValidity("");
  $("#workspace-form").onsubmit = (event) => {
    event.preventDefault();
    const input = $("#workspace-name");
    const name = input.value.trim();
    validationMessage(
      input,
      !name
        ? "workspaceRequired"
        : appState.workspaces.some((w) => w.name.toLocaleLowerCase() === name.toLocaleLowerCase())
          ? "workspaceDuplicate"
          : "",
    );
    if (!$("#workspace-form").reportValidity()) return;
    createWorkspace(name, $("#workspace-summary").value.trim());
    $("#workspace-dialog").close();
    toast("workspaceCreated");
  };
  renderWorkspaces();
}
