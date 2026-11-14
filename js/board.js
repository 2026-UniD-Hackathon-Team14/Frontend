// 빈 합의 보드의 필터 선택만 관리합니다. 카드 생성 기능은 아직 없습니다.
function initBoard() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    document.querySelectorAll(".filter").forEach((filterButton) => {
      const selected = filterButton === button;
      filterButton.classList.toggle("active", selected);
      filterButton.setAttribute("aria-pressed", String(selected));
    });
  });
}
