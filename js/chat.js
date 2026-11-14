function renderMessages() {
  const el = $("#messages");
  el.innerHTML =
    '<div class="date-divider">자료조사</div>' +
    chats[channel]
      .map((m, i) => {
        if (m.agreement) return renderAgreementMessage(m.agreement);
        return `<div class="message ${m.name === "민준" ? "mine" : ""}"><span class="avatar ${m.name === "Lena" ? "lena" : m.name === "Linh" ? "linh" : m.name === "민준" ? "me" : ""}">${esc(m.initial)}</span><div class="message-body"><div class="who">${esc(m.name)}<span class="lang">${esc(m.lang)}</span><span class="time">${esc(m.time)}</span></div><div class="bubble">${esc(m.text)}</div>${m.meaning ? '<div class="meaning">✓ 전달할 뜻: ' + esc(m.meaning) + "</div>" : ""}${m.translation ? '<div class="original">English · 예시 수신 화면<br>' + esc(m.translation) + "</div>" : ""}${m.original ? `<div class="original" ${m.open ? "" : "hidden"}>원문 · ${esc(m.lang)}<br>${esc(m.original)}</div><button class="link" data-original="${i}">${m.open ? "원문 숨기기 ▴" : "원문 보기 ▾"}</button>` : ""}</div></div>`;
      })
      .join("");
  if (!chats[channel].length)
    el.innerHTML += '<div class="empty">아직 대화가 없어요. 첫 메시지를 남겨 보세요.</div>';
  el.scrollTop = el.scrollHeight;
}
function pushMessage(text, meaning = "", translation = "") {
  chats[channel].push({
    name: "민준",
    initial: "민",
    lang: "한국어",
    time: new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    text,
    meaning,
    translation,
  });
  $("#message-input").value = "";
  renderMessages();
}
async function sendMessage() {
  if (busy) return;
  const text = $("#message-input").value.trim();
  if (!text) return;
  busy = true;
  $("#send").disabled = true;
  $("#send").textContent = "뜻 확인 중…";
  await new Promise((r) => setTimeout(r, 450));
  if (text.includes("생각해볼게요")) {
    pending = text;
    $("#pending-text").textContent = text;
    $("#meaning-dialog").showModal();
  } else {
    pushMessage(text);
    toast("메시지를 추가했어요. 실제 번역·전송은 연결되지 않은 데모예요.");
  }
  busy = false;
  $("#send").disabled = false;
  $("#send").textContent = "보내기 ↑";
}

// 입력, 전송, 원문 보기 이벤트
function initChat() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-original]");
    if (!button) return;
    const message = chats[channel][Number(button.dataset.original)];
    message.open = !message.open;
    renderMessages();
  });
  $("#message-form").addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });
  $("#message-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });
  $("#sample").onclick = () => {
    $("#message-input").value = "그 부분은 일단 생각해볼게요";
    $("#message-input").focus();
  };
  renderMessages();
}
