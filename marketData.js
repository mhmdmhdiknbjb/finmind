import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads the frozen market pack (marketdata/market_pack.json) produced by
 * tools/export_market_pack.py from the separate `workflow` price-history
 * dataset. It holds the last 156 weekly returns of every series the risk /
 * dispersion engines need, the market regime at the as-of date and the
 * calculator settings (liquidity factors, score weights, flag thresholds).
 *
 * If the file is missing, `getMarketPack()` returns null and callers fall
 * back to the older parametric assumptions instead of crashing.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_PATH = path.join(__dirname, "marketdata", "market_pack.json");

export const PPY = 52; // weekly data -> annualisation factor (calculator.PPY)

let cached;

export function getMarketPack() {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(PACK_PATH, "utf8"));
  } catch (err) {
    console.warn(`[marketData] market pack not available (${err.message}); falling back to parametric assumptions`);
    cached = null;
  }
  return cached;
}

/** Series as Float64 arrays with NaN for gaps (JSON stores nulls). */
export function seriesArrays(pack = getMarketPack()) {
  if (!pack) return null;
  const out = {};
  for (const [k, v] of Object.entries(pack.series)) out[k] = Float64Array.from(v, (x) => (x === null ? NaN : x));
  return out;
}

/** Bump when the risk/dispersion maths changes so cached widget results are recomputed once. */
export const ENGINE_VERSION = 2; // 2: forward-volatility ML forecast added to the risk analysis

/** Identifies the maths + market data behind stored numbers (used in the widget snapshot fingerprint). */
export function marketDataVersion() {
  const pack = getMarketPack();
  return `risk-engine-${ENGINE_VERSION}/${pack ? pack.meta.asof : "no-market-data"}`;
}

// FinMind category -> weekly return series (weekly-rebalanced blend of pack series). Categories without a
// price history (cash, real estate, other) are absent on purpose: they stay on the parametric assumptions.
const CATEGORY_BLENDS = {
  gold: [["gold_physical", 1]],
  currency: [["fx_usd", 1]],
  stock: [["stock_basket", 1]],
  fund: [["equity_fund", 0.5], ["fixed_income_fund", 0.5]],
  crypto: [["crypto_btc", 0.5], ["crypto_eth", 0.25], ["crypto_alt_basket", 0.25]],
};

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/**
 * Realised annual volatility and pairwise correlation of the priced categories over the full 156-week
 * (3-year) window, using sample (ddof=1) statistics — the same estimator calculator.py uses. Returns
 * null when the market pack is unavailable.
 */
export function categoryStats() {
  const S = seriesArrays();
  if (!S) return null;
  const n = getMarketPack().meta.weeks;
  const cat = {};
  for (const [k, parts] of Object.entries(CATEGORY_BLENDS)) {
    cat[k] = Array.from({ length: n }, (_, i) => parts.reduce((s, [series, f]) => s + f * (Number.isFinite(S[series][i]) ? S[series][i] : 0), 0));
  }
  const mu = Object.fromEntries(Object.entries(cat).map(([k, v]) => [k, mean(v)]));
  const cov = (a, b) => cat[a].reduce((s, x, i) => s + (x - mu[a]) * (cat[b][i] - mu[b]), 0) / (n - 1);
  const vol = Object.fromEntries(Object.keys(cat).map((k) => [k, Math.sqrt(cov(k, k)) * Math.sqrt(PPY)]));
  const corr = (a, b) => (a === b ? 1 : cov(a, b) / Math.sqrt(cov(a, a) * cov(b, b)));
  return { vol, corr, categories: Object.keys(cat), weeks: n, asof: getMarketPack().meta.asof };
}
