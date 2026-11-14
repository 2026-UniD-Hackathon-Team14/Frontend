"use strict";
const currentUser = UserAPI.user || { id: "", name: "", language: I18n.language };
const STORAGE_KEY = "nunchichat.server-index.v1." + currentUser.id;
const appState = { activeId: null, workspaces: [], roomIds: [], receiptIds: {} };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  appState.roomIds = (saved?.roomIds || []).filter((id) => /^\d+$/.test(String(id)));
  appState.activeId = saved?.activeId ? String(saved.activeId) : null;
  appState.receiptIds = saved?.receiptIds || {};
} catch {}
// Room-list API is not available yet. Known IDs are discovery hints, never proof of membership.
function knownRoomIds() {
  const ids = new Set(appState.roomIds.map(String));
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("nunchichat.server-index.v1.")) continue;
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (!Array.isArray(saved?.roomIds)) continue;
        for (const id of saved.roomIds) {
          const value = String(id);
          if (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0)
            ids.add(value);
        }
      } catch {}
    }
  } catch {}
  return [...ids];
}
let channel = appState.activeId;
const chats = {};
let pending = null;
let busy = false;
let toastTimer;
let ready = false;
function activeWorkspace() {
  return appState.workspaces.find((w) => w.id === appState.activeId);
}
function saveState() {
  // Only navigation references are cached. Messages/cards/members are always fetched from the API.
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        roomIds: appState.roomIds,
        activeId: appState.activeId,
        receiptIds: appState.receiptIds,
      }),
    );
  } catch {
    toast("storageFailed");
  }
}
function rememberRoom(id) {
  id = String(id);
  if (!appState.roomIds.includes(id)) appState.roomIds.push(id);
  saveState();
}
function serverRoom(data) {
  return {
    id: String(data.id),
    name: data.name,
    members: (data.members || []).map((m) => ({ ...m, id: String(m.id) })),
    messages: [],
    cards: [],
  };
}
function showError(error) {
  const el = document.querySelector("#api-error");
  el.hidden = false;
  const dialog = document.querySelector("dialog[open]");
  if (dialog) {
    let inline = dialog.querySelector(".api-inline-error");
    if (!inline) {
      inline = document.createElement("p");
      inline.className = "api-inline-error";
      inline.setAttribute("role", "alert");
      dialog.append(inline);
    }
    inline.textContent =
      t(error.message) + (error.serverMessage ? " · " + error.serverMessage : "");
  }
  el.querySelector("span").textContent =
    t(error.message) + (error.serverMessage ? " · " + error.serverMessage : "");
}
const pendingActions = new Set();
async function runAction(button, action) {
  const form = button?.closest("form");
  const key =
    channel +
    ":" +
    (button?.id || JSON.stringify(button?.dataset || {})) +
    ":" +
    (form?.id || JSON.stringify(form?.dataset || {}));
  if (pendingActions.has(key) || button?.dataset.pending === "true") return;
  pendingActions.add(key);
  if (button) {
    button.dataset.pending = "true";
    button.disabled = true;
  }
  try {
    return await action();
  } catch (error) {
    showError(error);
  } finally {
    pendingActions.delete(key);
    if (button) {
      delete button.dataset.pending;
      button.disabled = false;
    }
  }
}
function renderApp() {
  renderWorkspaces();
  renderMessages();
  renderBoard();
  refreshWorkspaceTools();
  document.querySelector("#profile-name").textContent = currentUser.name;
  document.querySelector("#profile-avatar").textContent = Array.from(currentUser.name)[0] || "?";
  document.querySelector("#profile-language").textContent = t("api.profile", {
    id: currentUser.id,
    language: I18n.names[currentUser.language],
  });
  document.querySelector("#viewing-language").textContent = t("viewing", {
    language: I18n.names[I18n.language],
  });
}
let refreshVersion = 0;
const roomReads = new Map();
async function refreshRoom({ quiet = false } = {}) {
  const id = channel,
    lang = I18n.language,
    version = quiet && roomReads.has(id + ":" + lang) ? refreshVersion : ++refreshVersion;
  if (!id || !ready) return;
  const readKey = id + ":" + lang;
  if (quiet && roomReads.has(readKey)) return;
  roomReads.set(readKey, (roomReads.get(readKey) || 0) + 1);
  try {
    const [room, messages, cards] = await Promise.all([
      API.request("/rooms/" + id),
      API.request("/rooms/" + id + "/messages?lang=" + lang),
      API.request("/rooms/" + id + "/cards?lang=" + lang),
    ]);
    if (id !== channel || lang !== I18n.language || version !== refreshVersion) return;
    const workspace = activeWorkspace();
    if (!workspace) return;
    if (!(room.members || []).some((m) => String(m.id) === currentUser.id))
      throw new Error("api.notMember");
    workspace.name = room.name;
    workspace.members = serverRoom(room).members;
    const openIds = new Set(workspace.messages.filter((m) => m.open).map((m) => String(m.id)));
    workspace.messages = messages.map((m) => ({
      ...m,
      senderId: String(m.senderId),
      translatedLanguage: lang,
      open: openIds.has(String(m.id)),
      originalLanguage: workspace.members.find((member) => member.id === String(m.senderId))
        ?.language,
      time: new Intl.DateTimeFormat(I18n.locale, { hour: "2-digit", minute: "2-digit" }).format(
        new Date(m.createdAt),
      ),
    }));
    workspace.cards = cards.map((c) => ({
      ...c,
      schema: 2,
      id: String(c.id),
      text: c.content || "",
      date: c.dueDate || "",
      assigneeIds: c.assignee ? [String(c.assignee.id)] : [],
      confirmedIds: (c.confirmations || []).map((x) => String(x.userId)),
    }));
    workspace.messages = mergeTimeline(id, workspace.messages, workspace.cards);
    chats[id] = workspace.messages;
    renderApp();
    setConnection("api.connected");
  } catch (error) {
    if (id === channel && lang === I18n.language && version === refreshVersion) {
      setConnection("api.disconnected");
      if (!quiet) showError(error);
    }
  } finally {
    const count = roomReads.get(readKey) - 1;
    if (count) roomReads.set(readKey, count);
    else roomReads.delete(readKey);
  }
}
function setConnection(key) {
  const el = document.querySelector("#connection-status");
  el.dataset.i18n = key;
  el.textContent = t(key);
}
