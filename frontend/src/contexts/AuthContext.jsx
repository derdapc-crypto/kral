import React, { createContext, useContext, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=not auth, object=auth
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // /auth/me now returns a freshly-rolled access token; mirror it into
        // localStorage so WebSocket endpoints (which read query-string tokens)
        // never see a stale JWT after the cookie has been rotated.
        const { data } = await api.get("/auth/me");
        if (data && data.token) localStorage.setItem("grid_token", data.token);
        setUser(data);
      } catch {
        // Cookie session may have expired — try to revive via refresh token.
        try {
          const { data } = await api.post("/auth/refresh");
          if (data && data.token) localStorage.setItem("grid_token", data.token);
          const me = await api.get("/auth/me");
          if (me.data && me.data.token) localStorage.setItem("grid_token", me.data.token);
          setUser(me.data);
        } catch {
          localStorage.removeItem("grid_token");
          setUser(false);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      if (data.token) localStorage.setItem("grid_token", data.token);
      setUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: formatApiError(e) };
    }
  };

  const register = async (email, password, name, role = "user", company = "", referral_code = "") => {
    try {
      const { data } = await api.post("/auth/register", { email, password, name, role, company, referral_code });
      if (data.token) localStorage.setItem("grid_token", data.token);
      setUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: formatApiError(e) };
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("grid_token");
    setUser(false);
  };

  const refresh = async () => {
    try {
      const { data } = await api.get("/auth/me");
      if (data && data.token) localStorage.setItem("grid_token", data.token);
      setUser(data);
    } catch {}
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
