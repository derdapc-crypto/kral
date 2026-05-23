import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// v1.8.1 — Bearer-only auth.  Cookies + CORS preflight caused browsers to
// silently abort the OPTIONS round-trip with "Network Error" even when curl
// returned a perfect 200 (because the preflight must echo a specific Origin
// when credentials are sent, and any caching layer breaks it).  We now use
// pure Bearer tokens, drop withCredentials, and skip the 401 interceptor —
// keeping the simplest possible request path.
export const api = axios.create({
  baseURL: API,
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  const tok = localStorage.getItem("grid_token");
  if (tok) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${tok}`;
  }
  return config;
});

export function formatApiError(err) {
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || "Something went wrong";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(", ");
  return typeof d === "object" ? d.msg || JSON.stringify(d) : String(d);
}
