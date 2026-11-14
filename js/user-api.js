"use strict";
// Explicit opt-in: window.NUNCHI_API_CONFIG = { mode: 'api', baseUrl: '/api' } before this file.
window.UserAPI = (() => {
  let config = { mode: "mock", baseUrl: "/api", ...window.NUNCHI_API_CONFIG };
  let user = null;
  try {
    const saved = JSON.parse(localStorage.getItem("nunchichat.user"));
    if (
      saved &&
      saved.id != null &&
      typeof saved.name === "string" &&
      I18n.supported.includes(saved.language)
    )
      user = saved;
  } catch {}
  function persist() {
    try {
      if (user) localStorage.setItem("nunchichat.user", JSON.stringify(user));
    } catch {}
  }
  function applyUser(response) {
    if (response?.success === false) throw new Error("apiError");
    const data = response?.data ?? response;
    if (
      data?.id == null ||
      typeof data.name !== "string" ||
      !I18n.supported.includes(data.language)
    )
      throw new Error("apiError");
    user = { id: String(data.id), name: data.name, language: data.language };
    persist();
    I18n.setLanguage(user.language, { source: "user" });
    document.dispatchEvent(new CustomEvent("userchange", { detail: { user: { ...user } } }));
    return { ...user };
  }
  async function request(uri, options = {}) {
    const response = await fetch(config.baseUrl.replace(/\/$/, "") + uri, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(user ? { "X-User-Id": user.id } : {}),
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error("apiError");
    const result = await response.json();
    if (!result.success) throw new Error("apiError");
    return result;
  }
  function registrationPayload({ name, language }) {
    if (typeof name !== "string" || !name.trim()) throw new Error("nameRequired");
    if (!I18n.supported.includes(language)) throw new Error("unsupportedLanguage");
    return { name: name.trim(), language };
  }
  async function register(values) {
    const payload = registrationPayload(values);
    const response =
      config.mode === "api"
        ? await request("/users", { method: "POST", body: JSON.stringify(payload) })
        : {
            success: true,
            data: { id: "local-" + (globalThis.crypto?.randomUUID?.() || Date.now()), ...payload },
            error: null,
          };
    return applyUser(response);
  }
  async function loadUser(id) {
    if (config.mode === "api")
      return applyUser(
        await request("/users/" + encodeURIComponent(id), { headers: { "X-User-Id": String(id) } }),
      );
    if (user && user.id === String(id)) return applyUser(user);
    throw new Error("apiError");
  }
  document.addEventListener("languagechange", (event) => {
    if (user && event.detail.source !== "user") {
      user.language = event.detail.language;
      persist();
    }
  });
  return {
    register,
    loadUser,
    applyUser,
    registrationPayload,
    configure(options) {
      config = { ...config, ...options };
    },
    get mode() {
      return config.mode;
    },
    get user() {
      return user ? { ...user } : null;
    },
  };
})();
// No frontend machine translation. Only use translations returned by the server.
window.ContentAPI = {
  messageText(message) {
    return (
      message.translations?.[I18n.language] ??
      (message.translatedLanguage === I18n.language ? message.translatedText : null) ??
      message.originalText ??
      message.text ??
      ""
    );
  },
  cardText(card, field) {
    return (
      card.translations?.[I18n.language]?.[field] ??
      (card.translatedLanguage === I18n.language
        ? card["translated" + field[0].toUpperCase() + field.slice(1)]
        : null) ??
      card[field] ??
      ""
    );
  },
  languageQuery() {
    return "lang=" + encodeURIComponent(I18n.language);
  },
  messageList(items, language) {
    return items.map((item) => ({ ...item, translatedLanguage: language }));
  },
  cardList(items, language) {
    return items.map((item) => ({ ...item, translatedLanguage: language }));
  },
};
