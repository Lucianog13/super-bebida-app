// Autenticación de administradores (Supabase Auth) — sin SDK, con fetch.
// login() obtiene el JWT del usuario; token() lo devuelve fresco (con refresh).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Auth = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const SESSION_KEY = "sb_session";

  function cfg() {
    return window.APP_CONFIG;
  }

  function saveSession(data) {
    data._expira = Date.now() + (data.expires_in || 3600) * 1000;
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  async function login(email, password) {
    const c = cfg();
    let res;
    try {
      res = await fetch(`${c.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: c.supabaseKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return { ok: false, error: "Sin conexión. Probá de nuevo." };
    }
    if (!res.ok) {
      let err = null;
      try {
        err = (await res.json()).msg;
      } catch {}
      return { ok: false, error: err || "Usuario o contraseña incorrectos" };
    }
    const data = await res.json();
    saveSession(data);
    return { ok: true, email: (data.user && data.user.email) || email };
  }

  async function token() {
    const s = getSession();
    if (!s) return null;
    if (Date.now() < (s._expira || 0) - 60 * 1000) return s.access_token;
    const c = cfg();
    let res;
    try {
      res = await fetch(`${c.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: c.supabaseKey, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
    } catch {
      return null;
    }
    if (!res.ok) {
      logout();
      return null;
    }
    const data = await res.json();
    saveSession(data);
    return data.access_token;
  }

  function email() {
    const s = getSession();
    return s && s.user ? s.user.email : null;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  return { login, logout, token, getSession, email };
});
