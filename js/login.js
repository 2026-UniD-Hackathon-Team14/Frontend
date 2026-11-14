"use strict";
I18n.init();
const form = document.getElementById("login-form"),
  signup = document.getElementById("signup-dialog");
const stored = UserAPI.user;
if (stored) document.getElementById("user-id").value = stored.id;
async function submit(button, errorElement, action) {
  if (button.disabled) return;
  button.disabled = true;
  errorElement.hidden = true;
  try {
    await action();
    location.assign("./test.html");
  } catch (error) {
    errorElement.textContent =
      t(error.message) +
      (error.serverMessage ? " · " + error.serverMessage : "");
    errorElement.hidden = false;
  } finally {
    button.disabled = false;
  }
}
form.onsubmit = (event) => {
  event.preventDefault();
  if (form.reportValidity())
    submit(
      form.querySelector("button"),
      document.getElementById("form-status"),
      () =>
        UserAPI.loadUser(document.getElementById("user-id").value, {
          resetLanguage: true,
        }),
    );
};
document.getElementById("open-signup").onclick = () => {
  document.getElementById("signup-form").reset();
  document.getElementById("signup-language").value = I18n.language;
  document.getElementById("signup-error").hidden = true;
  signup.showModal();
};
document.getElementById("close-signup").onclick = () => {
  if (!document.getElementById("signup-submit").disabled) signup.close();
};
signup.addEventListener("cancel", (event) => {
  if (document.getElementById("signup-submit").disabled) event.preventDefault();
});
document.getElementById("signup-form").onsubmit = (event) => {
  event.preventDefault();
  const name = document.getElementById("signup-name");
  validationMessage(name, name.value.trim() ? "" : "nameRequired");
  if (!event.target.reportValidity()) return;
  submit(
    document.getElementById("signup-submit"),
    document.getElementById("signup-error"),
    () =>
      UserAPI.register({
        name: name.value,
        language: document.getElementById("signup-language").value,
      }),
  );
};
