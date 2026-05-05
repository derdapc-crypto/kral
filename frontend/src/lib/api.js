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

export function formatApiError(err) {
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || "Something went wrong";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(", ");
  return typeof d === "object" ? d.msg || JSON.stringify(d) : String(d);
}
