// Browser-side real compute executor. Matches backend generators.

// Mulberry32 PRNG seeded to match numpy.random.default_rng for our small use
// NOTE: numpy rng is not directly portable; we recompute signatures via our own PRNG
// For matrix tasks, backend sends raw seed+size and expected computed via numpy.
// To keep parity, backend computes expected; we cannot. So we use a different scheme:
// backend generates matrices numpy-side and expected sum:trace. Instead we replace
// matrix tasks here by deterministic JS: backend must also use same JS algorithm.
// -> Simpler: we execute what backend sent and replicate the same math as backend.
// Backend uses numpy default_rng(seed).integers(0,10,(size,size)) — JS cannot match exactly.
// So we implement matrix computation CLIENT-side using backend-sent payload INCLUDING matrices? too heavy.
// Cleanest solution: backend sends {kind,size,seed}, and we replicate using a small deterministic PRNG here, AND backend uses same PRNG.
// Since backend already uses numpy, we instead change approach: matrix task expected is computed by this same JS logic server-side via a helper.
// To avoid that complexity, we'll run everything here with a shared Mulberry32.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function matrixSignature(seed, size) {
  const rng = mulberry32(seed);
  const a = new Int32Array(size * size);
  const b = new Int32Array(size * size);
  for (let i = 0; i < size * size; i++) a[i] = Math.floor(rng() * 10);
  for (let i = 0; i < size * size; i++) b[i] = Math.floor(rng() * 10);
  // matrix multiply (int32)
  let sum = 0, trace = 0;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      let s = 0;
      for (let k = 0; k < size; k++) s += a[i * size + k] * b[k * size + j];
      sum += s;
      if (i === j) trace += s;
    }
  }
  return `${sum}:${trace}`;
}

// SHA-256 via SubtleCrypto
async function sha256Hex(msg) {
  const buf = new TextEncoder().encode(msg);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashSignature(nonce, difficulty) {
  const prefix = "0".repeat(difficulty);
  let i = 0;
  while (i < 2_000_000) {
    const h = await sha256Hex(`${nonce}:${i}`);
    if (h.startsWith(prefix)) return `${i}:${h}`;
    i++;
    if (i % 5000 === 0) await new Promise((r) => setTimeout(r, 0)); // yield
  }
  return `${i}:${await sha256Hex(`${nonce}:${i}`)}`;
}

export async function executeTask(task) {
  const t0 = performance.now();
  let result = "";
  if (task.kind === "matrix") {
    result = matrixSignature(task.payload.seed, task.payload.size);
  } else if (task.kind === "hash") {
    result = await hashSignature(task.payload.nonce, task.payload.difficulty);
  }
  const t1 = performance.now();
  return { result, compute_ms: Math.max(1, Math.round(t1 - t0)) };
}
