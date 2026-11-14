// 자료조사 워크스페이스와 모바일 사이드바
function initSidebar() {
  document.addEventListener("click", (event) => {
    if (!event.target.closest("button[data-channel]")) return;
    $("#sidebar").classList.remove("open");
    $("#menu").setAttribute("aria-expanded", "false");
  });
  $("#menu").onclick = () => {
    const open = $("#sidebar").classList.toggle("open");
    $("#menu").setAttribute("aria-expanded", String(open));
  };
}
