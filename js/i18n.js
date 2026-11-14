"use strict";
window.I18n = (() => {
  const supported = ["ko", "en", "vi", "de"];
  const names = {
    ko: "한국어",
    en: "English",
    vi: "Tiếng Việt",
    de: "Deutsch",
  };
  const localeTags = { ko: "ko-KR", en: "en-US", vi: "vi-VN", de: "de-DE" };
  const storageKey = "nunchichat.language";
  let language = "ko";
  try {
    const stored = localStorage.getItem(storageKey);
    const user = JSON.parse(localStorage.getItem("nunchichat.server-user.v1"));
    const accountLanguage = user?.id
      ? localStorage.getItem("nunchichat.ui-language." + user.id)
      : null;
    language = user?.id
      ? supported.includes(accountLanguage)
        ? accountLanguage
        : supported.includes(user.language)
          ? user.language
          : "ko"
      : supported.includes(stored)
        ? stored
        : supported.includes(navigator.language?.split("-")[0])
          ? navigator.language.split("-")[0]
          : "ko";
  } catch {}
  function t(key, params = {}) {
    const value =
      window.NunchiLocales[language]?.[key] ??
      window.NunchiLocales.ko?.[key] ??
      key;
    return value.replace(/\{(\w+)\}/g, (match, name) =>
      params[name] == null ? match : String(params[name]),
    );
  }
  function apply(root = document) {
    root
      .querySelectorAll("[data-i18n]")
      .forEach((el) => (el.textContent = t(el.dataset.i18n)));
    for (const attribute of ["placeholder", "title", "aria-label"])
      root
        .querySelectorAll("[data-i18n-" + attribute + "]")
        .forEach((el) =>
          el.setAttribute(
            attribute,
            t(el.getAttribute("data-i18n-" + attribute)),
          ),
        );
    document.documentElement.lang = language;
    document.title = t(
      document.body.dataset.page === "login" ? "pageTitle" : "mainTitle",
    );
    document
      .querySelectorAll("[data-language]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.language === language),
        ),
      );
    document
      .querySelectorAll("[data-language-select]")
      .forEach((select) => (select.value = language));
  }
  function setLanguage(value, { source = "ui" } = {}) {
    if (!supported.includes(value)) return false;
    language = value;
    try {
      localStorage.setItem(storageKey, value);
    } catch {}
    apply();
    document.dispatchEvent(
      new CustomEvent("languagechange", { detail: { language, source } }),
    );
    return true;
  }
  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value + "T12:00:00");
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(localeTags[language], {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "short",
        }).format(date);
  }
  function init() {
    apply();
    document.addEventListener("reset", (event) => {
      event.target
        .querySelectorAll("input,textarea,select")
        .forEach((el) => validationMessage(el, ""));
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-language]");
      if (button) setLanguage(button.dataset.language);
    });
    document.addEventListener("change", (event) => {
      if (event.target.matches("[data-language-select]"))
        setLanguage(event.target.value);
    });
    // Keep native validation messages in the selected UI language.
    document.addEventListener(
      "invalid",
      (event) => {
        const el = event.target;
        if (el.dataset.validationKey)
          el.setCustomValidity(t(el.dataset.validationKey));
        else if (el.validity.valueMissing) el.setCustomValidity(t("required"));
        else if (el.validity.typeMismatch)
          el.setCustomValidity(t("emailInvalid"));
      },
      true,
    );
    document.addEventListener("input", (event) => {
      if (event.target.setCustomValidity) {
        event.target.setCustomValidity("");
        delete event.target.dataset.validationKey;
      }
    });
    document.addEventListener("languagechange", () => {
      document.querySelectorAll("input,textarea,select").forEach((el) => {
        if (el.dataset.validationKey)
          el.setCustomValidity(t(el.dataset.validationKey));
        else el.setCustomValidity("");
      });
    });
  }
  return {
    t,
    apply,
    setLanguage,
    init,
    formatDate,
    supported,
    names,
    get language() {
      return language;
    },
    get locale() {
      return localeTags[language];
    },
  };
})();
const t = (key, params) => I18n.t(key, params);
function validationMessage(element, key) {
  if (key) element.dataset.validationKey = key;
  else delete element.dataset.validationKey;
  element.setCustomValidity(key ? t(key) : "");
}
