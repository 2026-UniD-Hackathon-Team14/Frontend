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
  $("#create-workspace").disabled = !ready;
  const workspace = activeWorkspace();
  const hasWorkspace = Boolean(workspace) && ready;

  $("#invite-friends").disabled = !hasWorkspace;
  $("#leave-room").disabled = !hasWorkspace;
  $("#message-input").disabled = !hasWorkspace;
  $("#send").disabled = !hasWorkspace || busy || Boolean(pending);
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
    ? t("api.memberLanguages", {
        languages: [...new Set(members.map((m) => I18n.names[m.language] || m.language))].join(
          " · ",
        ),
      })
    : t("createHint");
}

async function openRoom(id, { join = false } = {}) {
  id = String(API.id(id));
  let data = await API.request("/rooms/" + id);
  if (!(data.members || []).some((m) => String(m.id) === currentUser.id)) {
    if (!join) throw new Error("api.notMember");
    await API.request("/rooms/" + id + "/members", {
      method: "POST",
      body: { userId: API.id(currentUser.id) },
    });
    data = await API.request("/rooms/" + id);
  }
  if (!appState.workspaces.some((w) => w.id === id)) appState.workspaces.push(serverRoom(data));
  rememberRoom(id);
  await selectWorkspace(id);
}
async function selectWorkspace(id) {
  if (busy || pending) {
    toast("busyMove");
    return;
  }
  if (!appState.workspaces.some((w) => w.id === id)) return;
  appState.activeId = channel = id;
  chats[id] = activeWorkspace().messages;
  $("#message-input").value = "";
  boardFilter = "전체";
  showWorkspaceTool("chat");
  $("#sidebar").classList.remove("open");
  $("#menu").setAttribute("aria-expanded", "false");
  saveState();
  renderApp();
  RoomSync.connect(id);
  await refreshRoom();
}
function initSidebar() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-workspace]");
    if (button) runAction(button, () => selectWorkspace(button.dataset.workspace));
  });
  $("#menu").onclick = () =>
    $("#menu").setAttribute("aria-expanded", String($("#sidebar").classList.toggle("open")));
  $("#create-workspace").onclick = () => {
    if (busy || pending) return toast("busyRetry");
    if (!$("#workspace-form").dataset.createdRoom) $("#workspace-form").reset();
    $("#join-room-form").reset();
    $("#workspace-dialog").showModal();
  };
  $("#workspace-form").onsubmit = (event) => {
    event.preventDefault();
    const form = event.target,
      name = $("#workspace-name").value.trim();
    if (!name || !form.reportValidity()) return;
    runAction(form.querySelector("[type=submit]"), async () => {
      // Preserve a successfully created room ID if adding its creator fails, so retry cannot create duplicate rooms.
      let id = form.dataset.createdRoom;
      if (!id) {
        const room = await API.request("/rooms", { method: "POST", body: { name } });
        id = String(room.id);
        form.dataset.createdRoom = id;
        rememberRoom(id);
      }
      await openRoom(id, { join: true });
      delete form.dataset.createdRoom;
      $("#workspace-dialog").close();
      toast("workspaceCreated");
    });
  };
  $("#join-room-form").onsubmit = (event) => {
    event.preventDefault();
    runAction(event.target.querySelector("[type=submit]"), async () => {
      await openRoom($("#join-room-id").value, { join: true });
      $("#workspace-dialog").close();
    });
  };
}
