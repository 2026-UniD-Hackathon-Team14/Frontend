// 자료조사 워크스페이스의 메시지만 관리합니다.
const channel = "자료조사";
const chats = { 자료조사: [] };
let pending = "";
let busy = false;
let toastTimer;
