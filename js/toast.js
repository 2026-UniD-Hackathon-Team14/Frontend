let activeToast = null;
function toast(key, params = {}) {
  activeToast = { key, params };
  $("#toast").textContent = t(key, params);
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
    activeToast = null;
  }, 3200);
}
document.addEventListener("languagechange", () => {
  if (activeToast) $("#toast").textContent = t(activeToast.key, activeToast.params);
});
