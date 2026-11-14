"use strict";
I18n.init();
const form = document.getElementById("login-form"),
  emailInput = document.getElementById("email"),
  passwordInput = document.getElementById("password"),
  passwordToggle = document.getElementById("password-toggle"),
  rememberEmail = document.getElementById("remember-email");
const savedEmailKey = "bora.rememberedEmail";
function setFieldError(input, key) {
  const el = document.getElementById(input.id + "-error");
  el.dataset.i18n = key || "";
  el.textContent = key ? t(key) : "";
  el.hidden = !key;
  input.setAttribute("aria-invalid", String(Boolean(key)));
}
function validateEmail() {
  const key = !emailInput.value.trim()
    ? "emailRequired"
    : emailInput.validity.typeMismatch
      ? "emailInvalid"
      : "";
  setFieldError(emailInput, key);
  return !key;
}
function validatePassword() {
  const key = passwordInput.value ? "" : "passwordRequired";
  setFieldError(passwordInput, key);
  return !key;
}
function updatePasswordLabel() {
  passwordToggle.setAttribute(
    "aria-label",
    t(passwordInput.type === "password" ? "showPassword" : "hidePassword"),
  );
}
passwordToggle.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  passwordToggle.setAttribute("aria-pressed", String(show));
  updatePasswordLabel();
});
emailInput.addEventListener("input", () => {
  if (emailInput.getAttribute("aria-invalid") === "true") validateEmail();
});
passwordInput.addEventListener("input", () => {
  if (passwordInput.getAttribute("aria-invalid") === "true") validatePassword();
});
try {
  const saved = localStorage.getItem(savedEmailKey);
  if (saved) {
    emailInput.value = saved;
    rememberEmail.checked = true;
  }
} catch {}
rememberEmail.addEventListener("change", () => {
  if (!rememberEmail.checked) {
    try {
      localStorage.removeItem(savedEmailKey);
    } catch {}
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  emailInput.value = emailInput.value.trim();
  const emailValid = validateEmail(),
    passwordValid = validatePassword();
  if (!emailValid || !passwordValid) {
    (!emailValid ? emailInput : passwordInput).focus();
    return;
  }
  try {
    if (rememberEmail.checked) localStorage.setItem(savedEmailKey, emailInput.value);
    else localStorage.removeItem(savedEmailKey);
  } catch {}
  location.assign("./test.html");
});
const signupDialog = document.getElementById("signup-dialog"),
  signupForm = document.getElementById("signup-form"),
  signupName = document.getElementById("signup-name"),
  signupLanguage = document.getElementById("signup-language"),
  signupError = document.getElementById("signup-error"),
  signupSubmit = document.getElementById("signup-submit");
let signupBusy = false;
document.getElementById("open-signup").onclick = () => {
  signupForm.reset();
  signupLanguage.value = I18n.language;
  signupError.hidden = true;
  signupError.dataset.i18n = "";
  document.getElementById("signup-mode").hidden = UserAPI.mode !== "mock";
  signupDialog.showModal();
};
document.getElementById("close-signup").onclick = () => {
  if (!signupBusy) signupDialog.close();
};
signupDialog.addEventListener("cancel", (event) => {
  if (signupBusy) event.preventDefault();
});
signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (signupBusy) return;
  signupError.hidden = true;
  signupError.dataset.i18n = "";
  validationMessage(signupName, signupName.value.trim() ? "" : "nameRequired");
  if (!signupForm.reportValidity()) return;
  signupBusy = true;
  signupSubmit.disabled = true;
  signupSubmit.textContent = t("signupBusy");
  try {
    await UserAPI.register({ name: signupName.value, language: signupLanguage.value });
    location.assign("./test.html");
  } catch (error) {
    const key = ["nameRequired", "unsupportedLanguage"].includes(error.message)
      ? error.message
      : "apiError";
    signupError.dataset.i18n = key;
    signupError.textContent = t(key);
    signupError.hidden = false;
  } finally {
    signupBusy = false;
    signupSubmit.disabled = false;
    signupSubmit.textContent = t("createUser");
  }
});
document.addEventListener("languagechange", () => {
  updatePasswordLabel();
  if (signupBusy) signupSubmit.textContent = t("signupBusy");
});
updatePasswordLabel();
