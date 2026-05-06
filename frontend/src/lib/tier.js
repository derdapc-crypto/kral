// Device tier detection — returns "flagship" | "mid" | "budget"
// Combines navigator hints (deviceMemory, hardwareConcurrency) with UA heuristics.
export function detectDeviceTier() {
  const mem = Number(navigator.deviceMemory) || 0;          // GB (Chrome only)
  const cores = Number(navigator.hardwareConcurrency) || 0; // logical cores
  const ua = navigator.userAgent || "";

  // UA heuristics – flagship lineage
  const flagshipUA = /(iPhone1[5-9]|iPhone2\d|iPad Pro|SM-S9\d|SM-S2[2-9]|Pixel\s?[7-9]|Pixel\s?1[0-9])/i.test(ua);
  if (flagshipUA) return "flagship";

  // Quantitative
  if (mem >= 6 || cores >= 8) return "flagship";
  if (mem >= 4 || cores >= 6) return "mid";
  if (mem > 0 || cores > 0)   return "budget";

  // No hints (Safari) – default by platform: iPhone => mid, else mid
  return /iPhone|iPad/.test(ua) ? "mid" : "mid";
}

export const TIER_LABEL = {
  flagship: "Flagship",
  mid: "Mid-Tier",
  budget: "Budget",
};

export const TIER_COLOR = {
  flagship: "from-[#F2C94C] to-[#B8860B]",
  mid: "from-[#D4AF37]/80 to-[#8a6c1d]",
  budget: "from-white/30 to-white/10",
};
