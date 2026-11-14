// 로컬 저장 어댑터. 서버 연동 시 이 계층을 API 호출로 교체합니다.
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
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (
      saved?.version === 1 &&
      Array.isArray(saved.workspaces) &&
      saved.workspaces.every(
        (w) =>
          typeof w.id === "string" &&
          typeof w.name === "string" &&
          [w.members, w.messages, w.cards, w.invitations].every(Array.isArray) &&
          w.members.some((m) => m.id === currentUser.id),
      )
    ) {
      if (!saved.workspaces.some((w) => w.id === saved.activeId))
        saved.activeId = saved.workspaces[0]?.id || null;
      return saved;
    }
  } catch {
    /* 저장소 접근 불가 또는 손상된 데이터일 때 기본 화면으로 시작합니다. */
  }
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    return true;
  } catch {
    toast("브라우저에 저장하지 못했어요. 이번 화면에서만 유지됩니다.");
    return false;
  }
}
