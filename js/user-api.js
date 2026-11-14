"use strict";
window.API = (() => {
  const config = window.NUNCHI_API_CONFIG;
  async function request(
    path,
    { method = "GET", body, userId = UserAPI.user?.id, signal } = {},
  ) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 60000);
    try {
      const headers = { Accept: "application/json" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (userId) headers["X-User-Id"] = String(userId);
      const response = await fetch(config.baseUrl.replace(/\/$/, "") + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let result;
      try {
        result = text ? JSON.parse(text) : null;
      } catch {
        throw Object.assign(new Error("api.invalidResponse"), {
          status: response.status,
        });
      }
      if (!response.ok || result?.success === false) {
        throw Object.assign(new Error("api.requestFailed"), {
          status: response.status,
          code: result?.error?.code,
          serverMessage: result?.error?.message,
        });
      }
      if (response.status === 204) return null;
      if (result?.success !== true) throw new Error("api.invalidResponse");
      return result.data;
    } catch (error) {
      if (error.name === "AbortError")
        throw new Error(method === "GET" ? "api.timeout" : "api.uncertain");
      if (error instanceof TypeError) throw new Error("api.network");
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
  function id(value) {
    const number = Number(value);
    if (
      !/^\d+$/.test(String(value).trim()) ||
      !Number.isSafeInteger(number) ||
      number < 1
    )
      throw new Error("api.invalidId");
    return number;
  }
  return {
    request,
    id,
    query: () => "?lang=" + encodeURIComponent(I18n.language),
  };
})();
window.UserAPI = (() => {
  const key = "nunchichat.server-user.v1";
  let user = null;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved?.id && I18n.supported.includes(saved.language)) {
      API.id(saved.id);
      user = saved;
    }
  } catch {}
  function applyUser(response, { resetLanguage = false } = {}) {
    const data = response?.data ?? response;
    API.id(data?.id);
    if (
      typeof data.name !== "string" ||
      !I18n.supported.includes(data.language)
    )
      throw new Error("api.invalidResponse");
    user = { id: String(data.id), name: data.name, language: data.language };
    try {
      localStorage.setItem(key, JSON.stringify(user));
    } catch {}
    let language = user.language;
    try {
      const saved = localStorage.getItem("nunchichat.ui-language." + user.id);
      if (resetLanguage)
        localStorage.removeItem("nunchichat.ui-language." + user.id);
      else if (I18n.supported.includes(saved)) language = saved;
    } catch {}
    I18n.setLanguage(language, { source: "user" });
    document.dispatchEvent(
      new CustomEvent("userchange", { detail: { user: { ...user } } }),
    );
    return { ...user };
  }
  async function register({ name, language }) {
    if (!name?.trim()) throw new Error("nameRequired");
    if (!I18n.supported.includes(language))
      throw new Error("unsupportedLanguage");
    return applyUser(
      await API.request("/users", {
        method: "POST",
        userId: null,
        body: { name: name.trim(), language },
      }),
      { resetLanguage: true },
    );
  }
  async function loadUser(id, options) {
    return applyUser(
      await API.request("/users/" + API.id(id), { userId: null }),
      options,
    );
  }
  function logout() {
    user = null;
    try {
      localStorage.removeItem(key);
    } catch {}
    location.assign("./login.html");
  }
  document.addEventListener("languagechange", (event) => {
    if (
      user &&
      document.body.dataset.page === "main" &&
      event.detail.source === "ui"
    )
      try {
        localStorage.setItem(
          "nunchichat.ui-language." + user.id,
          event.detail.language,
        );
      } catch {}
  });
  return {
    register,
    loadUser,
    applyUser,
    logout,
    get user() {
      return user ? { ...user } : null;
    },
  };
})();
window.ContentAPI = {
  messageText(message) {
    return (
      message.translations?.[I18n.language] ??
      (message.translatedLanguage === I18n.language
        ? message.translatedText
        : null) ??
      message.originalText ??
      ""
    );
  },
  cardText(card, field) {
    return card[field] ?? "";
  },
};
