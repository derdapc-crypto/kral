import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Fallback: also attach bearer token from localStorage (covers SameSite=None edge cases)
api.interceptors.request.use((config) => {
  const tok = localStorage.getItem("grid_token");
  if (tok) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${tok}`;
  }
  return config;
});

// v1.8.0 — Auto-logout on 401 (stale JWT after backend restart / secret rotation).
// Without this, users whose token was issued before the JWT secret was stabilised
// see an endless "Network Error / 401" spinner and must manually clear cache.
// Now: any 401 from a protected route triggers a clean local-state wipe and
// redirect to /login so the next request gets a fresh token.
//
// CRITICAL: skip auth bootstrap endpoints (/auth/me, /auth/refresh, /auth/logout,
// /auth/login, /auth/register) because:
//   - AuthContext calls /auth/me on every page load; a guest correctly returns 401.
//     If the interceptor reacts to that, every page load triggers a redirect loop
//     that the browser reports as "Network Error".
//   - /auth/refresh failing is normal for new visitors.
//   - /auth/login 401 = wrong password, must surface to UI not redirect.
let _redirectingTo401 = false;
const AUTH_BOOTSTRAP_PATHS = ["/auth/me", "/auth/refresh", "/auth/logout", "/auth/login", "/auth/register"];
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url    = (error?.config?.url || "").toLowerCase();
    const isBootstrap = AUTH_BOOTSTRAP_PATHS.some((p) => url.includes(p));
    if (status === 401 && !isBootstrap && !_redirectingTo401) {
      // Only redirect if user is on a *protected* page. Don't fire from
      // public pages (landing, login, register, tokenomics) where guest
      // 401s are expected and shouldn't force a navigation.
      const path = (window.location.pathname || "").toLowerCase();
      const publicRoutes = ["/", "/login", "/register", "/token", "/tokenomics", "/mobile", "/genesis"];
      const isPublic = publicRoutes.includes(path) || publicRoutes.some((p) => p !== "/" && path.startsWith(p));
      if (!isPublic) {
        _redirectingTo401 = true;
        try {
          localStorage.removeItem("grid_token");
          localStorage.removeItem("grid_user");
          sessionStorage.clear();
        } catch {}
        const next = window.location.pathname + window.location.search;
        const target = `/login?next=${encodeURIComponent(next)}`;
        setTimeout(() => { window.location.replace(target); }, 50);
      }
    }
    return Promise.reject(error);
  }
);

export function formatApiError(err) {
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || "Something went wrong";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(", ");
  return typeof d === "object" ? d.msg || JSON.stringify(d) : String(d);
}
