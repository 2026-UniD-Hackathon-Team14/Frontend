// 페이지를 열어 둔 동안만 데이터를 유지합니다.
const STORAGE_KEY = "nunchichat.workspaces.v1";
const currentUser = { id: "me", name: "민준", language: "ko" };
function newId(prefix) {
  return (
    prefix +
    "-" +
    (globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + Math.random().toString(36).slice(2))
  );
}
function defaultState() {
  return {
    version: 1,
    activeId: "research",
    workspaces: [
      {
        id: "research",
        name: "자료조사",
        description: "경영정보시스템 팀 프로젝트",
        members: [
          currentUser,
          { id: "lena", name: "Lena", language: "en" },
          { id: "seoyeon", name: "서연", language: "ko" },
          { id: "linh", name: "Linh", language: "vi" },
        ],
        messages: [],
        cards: [],
        invitations: [],
      },
    ],
  };
}
function loadState() {
  // 이전 버전이 저장한 워크스페이스 기록도 더 이상 사용하지 않습니다.
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  return defaultState();
}
const appState = loadState();
let channel = appState.activeId;
const chats = Object.fromEntries(appState.workspaces.map((w) => [w.id, w.messages]));
let pending = "";
let busy = false;
let toastTimer;
function activeWorkspace() {
  return appState.workspaces.find((w) => w.id === appState.activeId);
}
function saveState() {
  // 기존 기능의 호출 지점은 유지하되 브라우저 저장소에는 쓰지 않습니다.
  return true;
}
