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
let _redirectingTo401 = false;
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url    = (error?.config?.url || "").toLowerCase();
    // Ignore 401 on the login endpoint itself (that's a normal "wrong password" error).
    const isAuthLogin = url.includes("/auth/login");
    if (status === 401 && !isAuthLogin && !_redirectingTo401) {
      _redirectingTo401 = true;
      try {
        // Wipe every auth-related artefact so the next page load is a clean slate.
        localStorage.removeItem("grid_token");
        localStorage.removeItem("grid_user");
        localStorage.removeItem("sanctara_token");
        localStorage.removeItem("sanctara_user");
        sessionStorage.clear();
        // Best-effort cookie clear (only works for non-HttpOnly cookies).
        document.cookie.split(";").forEach((c) => {
          const name = c.split("=")[0].trim();
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        });
      } catch {}
      // Hard redirect (not react-router) so all in-memory React state is dropped.
      const next = window.location.pathname + window.location.search;
      const target = next && next !== "/login" && next !== "/"
        ? `/login?next=${encodeURIComponent(next)}`
        : "/login";
      // Tiny delay so any in-flight UI can render the spinner-stop before nav.
      setTimeout(() => { window.location.replace(target); }, 50);
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
