function selectMeaning(meaning) {
  const translation =
    meaning === "아직 결정하지 않았어요"
      ? "I haven't decided on that part yet — I'll think it over."
      : meaning === "정중하게 거절하는 뜻이에요"
        ? "I don't think I can take that part on, sorry."
        : "";
  pushMessage(pending, meaning, translation);
  $("#meaning-dialog").close();
  if (meaning && !translation)
    toast("직접 입력한 뜻을 저장했어요. 실제 번역은 API 연결이 필요해요.");
}

// 의미 선택과 모달 이벤트
function initMeaning() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.meaning) selectMeaning(button.dataset.meaning);
    if (button.classList.contains("close")) button.closest("dialog").close();
  });
  $("#send-original").onclick = () => selectMeaning("");
  $("#custom-meaning").onsubmit = (event) => {
    event.preventDefault();
    const meaning = $("#custom-text").value.trim();
    if (meaning) selectMeaning(meaning);
  };
}
