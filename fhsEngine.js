/**
 * Filtered Historical Simulation (FHS) — JS port of workflow/pipeline/fhs.py, operating on the 11
 * series already frozen in marketdata/market_pack.json instead of the full per-instrument panel:
 * FinMind's holdings only ever resolve to those 11 series (stock/crypto-alt already enter as the
 * same equal-weight baskets fhs.py itself would use), so nothing is lost by working at that level.
 *
 * Method (unchanged from fhs.py — see its own docstring for the full rationale):
 *   1. standardise each series' weekly return by its own EWMA volatility (removes vol clustering)
 *   2. block-bootstrap the standardised shocks from the last W weeks (keeps cross-correlation + fat tails)
 *   3. rescale each simulated path by the CURRENT (as-of) volatility and combine with portfolio weights
 *   4. read quantiles off the simulated distribution of cumulative portfolio return / drawdown / vs-USD
 *
 * The random block-bootstrap draws are NOT bit-for-bit identical to numpy's PCG64 (a different PRNG is
 * used — see makeRng below) — this is a Monte Carlo estimate, not a deterministic formula, so exact
 * reproduction of one specific run was never the target; what's verified is the deterministic math
 * (EWMA sigma, standardisation, cumulative-return/drawdown construction) against Python bit-for-bit,
 * and that the simulated distribution is statistically stable at the configured sample size S.
 */

const TAUS = [0.1, 0.5, 0.9];
const HS = [26, 52];

function ewmaMeanAdjustTrue(x, alpha) {
  // Reproduces pandas' `.ewm(alpha=alpha).mean()` with the (default) adjust=True weighting exactly:
  // y_t = [sum_{i=0..t} (1-alpha)^i * x_{t-i}] / [sum_{i=0..t} (1-alpha)^i], updated incrementally.
  const decay = 1 - alpha;
  let num = 0, den = 0;
  const out = new Array(x.length);
  for (let t = 0; t < x.length; t++) {
    num = num * decay + x[t];
    den = den * decay + 1;
    out[t] = num / den;
  }
  return out;
}

/** Builds the sig (EWMA vol floor 0.002) and Z (clipped standardised shock) matrices for every series. */
export function buildFhsState(pack, lam = 0.95, minPeriods = 13) {
  const names = Object.keys(pack.series);
  const T = pack.dates.length;
  const alpha = 1 - lam;
  const sig = {}; // name -> array length T
  const Z = {};
  for (const name of names) {
    const x = pack.series[name].map((v) => (v === null ? NaN : v));
    const x2 = x.map((v) => (Number.isFinite(v) ? v * v : NaN));
    // pandas ewm skips NaN inputs (carries the previous accumulator forward) rather than poisoning it.
    const decay = 1 - alpha;
    let num = 0, den = 0, count = 0;
    const s = new Array(T).fill(NaN);
    for (let t = 0; t < T; t++) {
      if (Number.isFinite(x2[t])) {
        num = num * decay + x2[t];
        den = den * decay + 1;
        count++;
      } else {
        num *= decay;
        den *= decay;
      }
      s[t] = count >= minPeriods && den > 0 ? Math.sqrt(Math.max(num / den, 0)) : NaN;
    }
    sig[name] = s.map((v) => (Number.isFinite(v) ? Math.max(v, 0.002) : 0.002));
    const z = new Array(T).fill(NaN);
    for (let t = 0; t < T; t++) {
      const prevSig = t === 0 ? NaN : sig[name][t - 1];
      const raw = Number.isFinite(x[t]) && Number.isFinite(prevSig) ? x[t] / prevSig : NaN;
      z[t] = Number.isFinite(raw) ? Math.max(-8, Math.min(8, raw)) : NaN;
    }
    Z[name] = z;
  }
  return { names, T, sig, Z };
}

// Deterministic 32-bit PRNG (mulberry32), seeded — NOT numpy's PCG64, see module docstring.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// numpy's default (linear-interpolation) quantile, matching np.quantile(arr, q).
function quantile(sorted, q) {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const idx = q * (n - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Runs S simulated H-week paths for the modeled sleeve given portfolio weights `Wm` (toman amount or
 * any consistent unit per series name — normalised internally), and returns p10/p50/p90 of cumulative
 * return, max drawdown, and return-vs-USD at 26 and 52 weeks.
 *
 * `Wm`: { seriesName: weight }, over the 9 core series + stock_basket + crypto_alt_basket (the same
 * names as pack.series / portfolioRisk.js's HOLDING_TYPES[...].series keys).
 * `injectedIdx`: for verification only — supplies the exact block-bootstrap index matrix instead of
 * drawing one, so the deterministic cumulative-return/drawdown math can be checked against Python
 * bit-for-bit, decoupled from the two languages using different random number generators.
 */
export function runFHS(pack, Wm, { S = 1000, seed = 11, injectedIdx = null } = {}) {
  const p = pack.fhs_params;
  if (!p) throw new Error("market_pack.json has no fhs_params — re-export with the current tools/export_market_pack.py");
  const st = buildFhsState(pack, p.lam);
  const { sig, Z } = st;
  const pos = st.T - 1;
  const W = p.W, driftW = p.drift_w, L = p.block;

  const total = Object.values(Wm).reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
  if (!(total > 0)) return null;
  const Wn = {};
  for (const k in Wm) Wn[k] = Wm[k] / total;
  const cols = st.names.filter((n) => (Wn[n] || 0) > 1e-9);
  if (!cols.length) return null;
  const allc = Array.from(new Set([...cols, "fx_usd"]));

  const lo = Math.max(0, pos - W + 1);
  const wl = pos - lo + 1;
  const meanZ = {};
  for (const c of allc) {
    let sum = 0, n = 0;
    for (let t = lo; t <= pos; t++) {
      const v = Z[c][t];
      if (Number.isFinite(v)) { sum += v; n++; }
    }
    meanZ[c] = n > 0 ? sum / n : 0;
  }
  const Zuse = {};
  for (const c of allc) {
    const arr = new Array(wl);
    for (let i = 0; i < wl; i++) {
      const v = Z[c][lo + i];
      const centered = Number.isFinite(v) ? v - meanZ[c] : 0;
      arr[i] = centered + driftW * meanZ[c];
    }
    Zuse[c] = arr;
  }
  const sigPos = {};
  for (const c of allc) sigPos[c] = sig[c][pos];

  const Hmax = 52;
  const nb = Math.ceil(Hmax / L);
  const rng = injectedIdx ? null : makeRng(seed + pos);

  const samples = { 26: { ret: [], max_drawdown: [], ret_vs_usd: [] }, 52: { ret: [], max_drawdown: [], ret_vs_usd: [] } };

  for (let s = 0; s < S; s++) {
    let idx;
    if (injectedIdx) {
      idx = injectedIdx[s];
    } else {
      idx = new Array(Hmax);
      for (let b = 0; b < nb; b++) {
        const upper = Math.max(1, wl - L + 1);
        const start = Math.floor(rng() * upper);
        for (let k = 0; k < L; k++) {
          const h = b * L + k;
          if (h < Hmax) idx[h] = Math.min(start + k, wl - 1);
        }
      }
    }

    let cumLog = 0, cumLogUsd = 0, peak = 1, minDD = 0;
    for (let h = 0; h < Hmax; h++) {
      let p_ = 0;
      for (const c of cols) p_ += Wn[c] * Zuse[c][idx[h]] * sigPos[c];
      p_ = Math.max(p_, -0.95);
      const usdRet = Math.max(Zuse["fx_usd"][idx[h]] * sigPos["fx_usd"], -0.95);
      cumLog += Math.log1p(p_);
      cumLogUsd += Math.log1p(usdRet);
      const level = Math.exp(cumLog);
      if (level > peak) peak = level;
      const dd = level / peak - 1;
      if (dd < minDD) minDD = dd;
      const hh = h + 1;
      if (hh === 26 || hh === 52) {
        const ret = Math.expm1(cumLog);
        const usdCum = Math.expm1(cumLogUsd);
        samples[hh].ret.push(ret);
        samples[hh].max_drawdown.push(minDD);
        samples[hh].ret_vs_usd.push((1 + ret) / (1 + usdCum) - 1);
      }
    }
  }

  const out = {};
  for (const h of HS) {
    out[`${h}w`] = {};
    for (const t of ["ret", "max_drawdown", "ret_vs_usd"]) {
      const sorted = [...samples[h][t]].sort((a, b) => a - b);
      out[`${h}w`][t] = { p10: quantile(sorted, TAUS[0]), p50: quantile(sorted, TAUS[1]), p90: quantile(sorted, TAUS[2]) };
    }
  }
  return out;
}
