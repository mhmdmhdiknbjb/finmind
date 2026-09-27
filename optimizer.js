import { solveQP } from "quadprog";
import { categoryStats, getMarketPack } from "./marketData.js";
import { analyzePortfolio, holdingsFromAssets, holdingsFromCategoryWeights } from "./portfolioRisk.js";
import { stackForecasts } from "./stackForward.js";
import { engineCategoryOf } from "./public/assetCatalog.js";

/**
 * Phase 1 — Portfolio optimization engine (Markowitz mean-variance, localized for Iran).
 *
 * These are NOT LLM-generated numbers. Every figure here comes from a real
 * quadratic program solved with the Goldfarb–Idnani active-set method
 * (same algorithm as R's solve.QP). The LLM is only ever shown the *outputs*
 * of this module and asked to explain them in Persian — it never invents
 * risk scores, expected returns, or allocation weights itself.
 *
 * DATA vs ASSUMPTIONS:
 *  - volatility and correlation of the PRICED categories (gold, currency,
 *    stock, fund, crypto) are measured from 3 years of real weekly returns
 *    (marketdata/market_pack.json, built from the workflow dataset), with the
 *    same sample-covariance estimator as calculator.py. Categories with no
 *    price history (cash, real estate, other) keep parametric assumptions.
 *  - expectedReturn, liquidity and the per-category upper bounds are still
 *    parametric planning assumptions: the dataset deliberately contains no
 *    return forecast, and a trailing nominal return in a high-inflation
 *    regime would be a bad expected return.
 *  - The risk score / volatility reported to the user for the current and
 *    the suggested portfolio come from portfolioRisk.js (real 1-year data),
 *    attached below as `analysis`; the QP only decides the weights.
 */

export const ASSET_ORDER = ["cash", "gold", "currency", "stock", "fund", "realestate", "crypto", "other"];

/**
 * Real estate doesn't trade in arbitrary fractions the way gold or a mutual
 * fund does — there is no such thing as a 20,000,000-toman apartment. This
 * is a rough, clearly-parametric floor for "cheapest realistic property a
 * household could actually buy" in the current market (calibrated loosely
 * against the live gold/currency prices this app already pulls — not a
 * real estate index yet; a genuine regional price feed would replace this).
 * The optimizer uses it below to refuse to suggest a real-estate position
 * too small to correspond to an actual purchase.
 */
export const MIN_PROPERTY_VALUE_TOMAN = 4_000_000_000;

const BASE_ASSET_STATS = {
  cash: { expectedReturn: 0.23, volatility: 0.03, liquidity: 1.0, upperBound: 1.0 },
  gold: { expectedReturn: 0.35, volatility: 0.22, liquidity: 0.75, upperBound: 0.5 },
  currency: { expectedReturn: 0.32, volatility: 0.25, liquidity: 0.85, upperBound: 0.4 },
  stock: { expectedReturn: 0.38, volatility: 0.35, liquidity: 0.65, upperBound: 0.5 },
  fund: { expectedReturn: 0.28, volatility: 0.12, liquidity: 0.8, upperBound: 0.6 },
  realestate: { expectedReturn: 0.3, volatility: 0.15, liquidity: 0.15, upperBound: 1.0 },
  crypto: { expectedReturn: 0.45, volatility: 0.7, liquidity: 0.7, upperBound: 0.15 },
  other: { expectedReturn: 0.2, volatility: 0.2, liquidity: 0.5, upperBound: 0.3 },
};

const MARKET = categoryStats(); // real 3-year stats for the priced categories, or null without a market pack

// Correlation matrix: captures the dollar–gold–inflation hedge cluster that
// dominates Iranian household portfolio behavior (assets that co-move when
// the rial devalues), cash's mild negative correlation with that cluster
// (its real value erodes precisely when the others spike), and real estate /
// funds as comparatively diversifying.
const CORR = {
  cash: { cash: 1, gold: -0.1, currency: -0.1, stock: -0.05, fund: 0.05, realestate: 0, crypto: -0.1, other: 0 },
  gold: { gold: 1, currency: 0.6, stock: 0.3, fund: 0.25, realestate: 0.25, crypto: 0.3, other: 0.15 },
  currency: { currency: 1, stock: 0.4, fund: 0.25, realestate: 0.35, crypto: 0.5, other: 0.15 },
  stock: { stock: 1, fund: 0.4, realestate: 0.2, crypto: 0.25, other: 0.15 },
  fund: { fund: 1, realestate: 0.15, crypto: 0.15, other: 0.1 },
  realestate: { realestate: 1, crypto: 0.15, other: 0.1 },
  crypto: { crypto: 1, other: 0.1 },
  other: { other: 1 },
};

function corr(a, b) {
  if (a === b) return 1;
  return CORR[a]?.[b] ?? CORR[b]?.[a] ?? 0;
}

function buildStats(useMarket) {
  return Object.fromEntries(
    Object.entries(BASE_ASSET_STATS).map(([k, st]) => {
      const real = useMarket ? MARKET?.vol[k] : undefined;
      return [k, real ? { ...st, volatility: real, volatilitySource: "market_data" } : { ...st, volatilitySource: "assumption" }];
    })
  );
}

function buildCovariance(stats, useMarket) {
  const n = ASSET_ORDER.length;
  const sigma = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const ai = ASSET_ORDER[i];
      const aj = ASSET_ORDER[j];
      const bothPriced = useMarket && MARKET.vol[ai] !== undefined && MARKET.vol[aj] !== undefined;
      const rho = bothPriced ? MARKET.corr(ai, aj) : corr(ai, aj);
      sigma[i][j] = rho * stats[ai].volatility * stats[aj].volatility;
    }
  }
  return sigma;
}

/** Cholesky succeeds only for a positive-definite matrix — the QP and the Monte Carlo both need one. */
function isPositiveDefinite(m) {
  const n = m.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 1e-8) return false;
        L[i][i] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return true;
}

let useMarketData = !!MARKET;
let stats = buildStats(useMarketData);
let cov = buildCovariance(stats, useMarketData);
if (useMarketData && !isPositiveDefinite(cov)) {
  console.warn("[optimizer] market-calibrated covariance is not positive definite; using parametric assumptions instead");
  useMarketData = false;
  stats = buildStats(false);
  cov = buildCovariance(stats, false);
}

export const ASSET_STATS = stats;
export const COVARIANCE = cov;
export const RISK_DATA_SOURCE = useMarketData ? { source: "market_data", asof: MARKET.asof, weeks: MARKET.weeks } : { source: "assumption" };

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function currentWeights(assets) {
  const totals = Object.fromEntries(ASSET_ORDER.map((k) => [k, 0]));
  let total = 0;
  for (const a of assets || []) {
    const cat = engineCategoryOf(a); // fine categories (اوراق بدهی، خودرو، ...) roll up to one of ASSET_ORDER
    const amt = Number(a.amount) || 0;
    totals[cat] += amt;
    total += amt;
  }
  if (total <= 0) return { weights: Object.fromEntries(ASSET_ORDER.map((k) => [k, 0])), total: 0 };
  const weights = Object.fromEntries(ASSET_ORDER.map((k) => [k, totals[k] / total]));
  return { weights, total };
}

function weightsToVector(weights) {
  return ASSET_ORDER.map((k) => weights[k] || 0);
}

function dot(a, b) {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function matVec(mat, vec) {
  return mat.map((row) => dot(row, vec));
}

/** Volatility (annual std dev) -> a 0-100 "risk score" for UI consistency. */
function volatilityToRiskScore(vol) {
  return Math.round(clamp((vol / 0.6) * 100, 0, 100));
}

function riskLevelFromScore(score) {
  if (score < 25) return "کم";
  if (score < 50) return "متوسط";
  if (score < 75) return "زیاد";
  return "بسیار زیاد";
}

export function portfolioStats(weightsObj) {
  const w = weightsToVector(weightsObj);
  const mu = ASSET_ORDER.map((k) => ASSET_STATS[k].expectedReturn);
  const liq = ASSET_ORDER.map((k) => ASSET_STATS[k].liquidity);
  const expectedReturn = dot(w, mu);
  const variance = dot(w, matVec(COVARIANCE, w));
  const volatility = Math.sqrt(Math.max(0, variance));
  const liquidity = dot(w, liq);
  const riskScore = volatilityToRiskScore(volatility);
  return {
    expectedReturn,
    volatility,
    riskScore,
    riskLevel: riskLevelFromScore(riskScore),
    liquidityPercent: Math.round(clamp(liquidity, 0, 1) * 100),
  };
}

/** riskTolerance 1..10 -> mean-variance risk-aversion coefficient lambda. */
function riskAversionFromTolerance(riskTolerance) {
  const t = clamp(Number(riskTolerance) || 5, 1, 10);
  const lambdaMax = 8;
  const lambdaMin = 0.5;
  return lambdaMax - ((t - 1) * (lambdaMax - lambdaMin)) / 9;
}

function requiredLiquidFraction(profile, total) {
  const monthlyExpenses = Number(profile.monthlyExpenses) || 0;
  const monthsBuffer = 3;
  if (!total || total <= 0) return 0.15;
  return clamp((monthlyExpenses * monthsBuffer) / total, 0.05, 0.5);
}

/**
 * Builds 1-indexed sparse structures the way the `quadprog` port expects
 * (it mirrors R's solve.QP, which is 1-indexed — index 0 of every array is
 * left empty on purpose to preserve that alignment).
 */
function oneIndexedMatrix(rows, cols) {
  const m = [];
  for (let i = 1; i <= rows; i++) {
    m[i] = new Array(cols + 1);
  }
  return m;
}

function oneIndexedVector(len) {
  return new Array(len + 1);
}

/**
 * Solves: maximize  mu'w - (lambda/2) w'Sigma w
 * subject to        sum(w) = 1
 *                    lowerBound_i <= w_i <= upperBound_i
 *                    sum(liquidity_i * w_i) >= requiredLiquidFraction
 *
 * via quadprog's minimize -d'b + 1/2 b'Db  s.t.  A'b >= b0 (first `meq` equalities).
 */
export function optimizePortfolio(profile) {
  const n = ASSET_ORDER.length;
  const { weights: curWeights, total } = currentWeights(profile.assets);
  const lambda = riskAversionFromTolerance(profile.riskTolerance);
  const reqLiquid = requiredLiquidFraction(profile, total);

  // Real estate is lumpy and illiquid: you cannot fractionally rebalance out
  // of "half an apartment" on a short horizon. Cap how far the optimizer is
  // allowed to move it away from the current holding.
  const reCurrent = curWeights.realestate || 0;
  const lowerBound = Object.fromEntries(ASSET_ORDER.map((k) => [k, 0]));
  const upperBound = Object.fromEntries(ASSET_ORDER.map((k) => [k, ASSET_STATS[k].upperBound]));
  lowerBound.realestate = reCurrent * 0.8;
  upperBound.realestate = Math.min(1, reCurrent * 1.2 + 0.1);
  // "other" (vehicles, insurance, collectibles...) is not something a portfolio suggestion can tell anyone to buy:
  // the reference mix may keep or shrink what is held, never grow it
  upperBound.other = Math.min(upperBound.other, curWeights.other || 0);

  // Never suggest growing real estate into a toman amount too small to be
  // an actual property. If the portfolio can't clear MIN_PROPERTY_VALUE_TOMAN
  // even at the band computed above, pin the upper bound back down to
  // whatever the user already holds — the optimizer can keep or shrink an
  // existing position, but won't propose buying a fraction of a house that
  // doesn't exist. A portfolio with no real estate at all and too little
  // capital gets upperBound = 0 (real estate excluded entirely).
  if (total > 0 && total * upperBound.realestate < MIN_PROPERTY_VALUE_TOMAN) {
    upperBound.realestate = reCurrent;
  }

  // Emergency cash floor, independent of risk tolerance: 3 months of expenses (6 with dependents or debt). It is a hard
  // lower bound on the cash weight. The old constraint only bounded the liquidity-WEIGHTED score, which gold/stock alone
  // satisfy, so a risk-tolerance-10 user was told to hold 0% cash.
  const nDependents = Number(profile.personal?.childrenCount) || 0;
  const cashMonths = nDependents > 0 || (Number(profile.existingDebt) || 0) > 0 ? 6 : 3;
  let cashFloor = total > 0 ? clamp(((Number(profile.monthlyExpenses) || 0) * cashMonths) / total, 0.05, 0.5) : 0.05;
  const othersLower = ASSET_ORDER.filter((k) => k !== "cash").reduce((s, k) => s + lowerBound[k], 0);
  cashFloor = Math.max(0, Math.min(cashFloor, 1 - othersLower)); // never make the program infeasible
  lowerBound.cash = cashFloor;

  const liq = ASSET_ORDER.map((k) => ASSET_STATS[k].liquidity);
  const cov = COVARIANCE;

  /** One mean-variance solve for the expected-return vector `mu`. Returns weights or null when the solver gives up. */
  function solveFor(mu) {
    // Dmat = lambda * Sigma, ridge-regularized for numerical positive-definiteness.
    const Dmat = oneIndexedMatrix(n, n);
    for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) Dmat[i][j] = lambda * cov[i - 1][j - 1] + (i === j ? 1e-6 : 0);
    const dvec = oneIndexedVector(n);
    for (let i = 1; i <= n; i++) dvec[i] = mu[i - 1];

    // Columns: [equality: sum=1] [lower bounds x n] [upper bounds x n] [liquidity floor]
    const nCols = 1 + n + n + 1;
    const Amat = oneIndexedMatrix(n, nCols);
    const bvec = oneIndexedVector(nCols);
    let col = 1;
    for (let i = 1; i <= n; i++) Amat[i][col] = 1;
    bvec[col] = 1;
    col++;
    for (let k = 0; k < n; k++) {
      for (let i = 1; i <= n; i++) Amat[i][col] = i - 1 === k ? 1 : 0;
      bvec[col] = lowerBound[ASSET_ORDER[k]];
      col++;
    }
    for (let k = 0; k < n; k++) {
      for (let i = 1; i <= n; i++) Amat[i][col] = i - 1 === k ? -1 : 0;
      bvec[col] = -upperBound[ASSET_ORDER[k]];
      col++;
    }
    for (let i = 1; i <= n; i++) Amat[i][col] = liq[i - 1];
    bvec[col] = reqLiquid;

    const result = solveQP(Dmat, dvec, Amat, bvec, 1);
    if (result.message) return { weights: null, message: result.message };
    const w = ASSET_ORDER.map((_, i) => Math.max(0, result.solution[i + 1]));
    const sum = w.reduce((s, v) => s + v, 0) || 1;
    return { weights: w.map((v) => v / sum), message: null };
  }

  // 1) the plain solve with the planning expected returns (kept as the fallback and as the "point" solution)
  const base = solveFor(ASSET_ORDER.map((k) => ASSET_STATS[k].expectedReturn));

  // 2) resampled efficiency (Michaud): expected returns are not known to 3 decimals; with 3 years of data their standard
  // error is sigma/sqrt(3). Solve the same program for many plausible return vectors drawn with the REAL covariance and
  // average the weights. Point-estimate mean-variance sends the whole answer to whichever class has the highest assumed
  // return (a corner at the caps, e.g. exactly 50% stock / 15% crypto / 0% cash); the average is a smooth, diversified
  // point that still satisfies every constraint (they are linear, so any average of feasible solutions is feasible).
  let optimalWeights;
  let solverMessage = null;
  if (!base.weights) {
    // Infeasible or numerically degenerate (very tight, conflicting constraints): fall back to the current
    // allocation rather than surface a broken optimizer result.
    optimalWeights = { ...curWeights };
    solverMessage = base.message;
  } else {
    const draws = resampledReturns(RESAMPLES);
    const acc = new Array(n).fill(0);
    let ok = 0;
    for (const mu of draws) {
      const r = solveFor(mu);
      if (!r.weights) continue;
      r.weights.forEach((v, i) => (acc[i] += v));
      ok++;
    }
    const avg = ok >= RESAMPLES / 2 ? acc.map((v) => v / ok) : base.weights;
    optimalWeights = Object.fromEntries(ASSET_ORDER.map((k, i) => [k, avg[i]]));
  }

  return {
    current: withMarketRisk({ weights: curWeights, total, ...portfolioStats(curWeights) }, profile, total),
    optimal: withMarketRisk({ weights: optimalWeights, ...portfolioStats(optimalWeights) }, profile, total, optimalWeights),
    params: { riskAversion: lambda, requiredLiquidFraction: reqLiquid, cashFloor, cashFloorMonths: cashMonths, realestateBand: [lowerBound.realestate, upperBound.realestate], resamples: RESAMPLES },
    solverMessage,
  };
}

/* ---- resampled expected returns -------------------------------------------------------------------------------- */

const RESAMPLES = 200;
const RETURN_HISTORY_YEARS = 3; // the market pack holds ~3 years of weekly returns: the mean is only that well known

/** Deterministic PRNG (mulberry32): the same portfolio always gets the same suggestion, never a flickering one. */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choleskyLower(A) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j] + (i === j ? 1e-9 : 0);
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(sum, 1e-12)) : sum / L[j][j];
    }
  }
  return L;
}

let resampledCache = null;
function resampledReturns(count) {
  if (resampledCache && resampledCache.length === count) return resampledCache;
  const n = ASSET_ORDER.length;
  const L = choleskyLower(COVARIANCE);
  const rand = seededRandom(20260926);
  const normal = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
  const mu0 = ASSET_ORDER.map((k) => ASSET_STATS[k].expectedReturn);
  const draws = [];
  for (let s = 0; s < count; s++) {
    const z = Array.from({ length: n }, normal);
    draws.push(mu0.map((m, i) => m + L[i].reduce((acc, l, j) => acc + l * z[j], 0) / Math.sqrt(RETURN_HISTORY_YEARS)));
  }
  resampledCache = draws;
  return draws;
}

/**
 * Replaces the parametric volatility / risk score of a portfolio with the ones measured on real market data by
 * portfolioRisk.js, and attaches the full dispersion + risk analysis as `analysis`. The suggested portfolio is
 * evaluated with the SAME engine (keeping the user's own mix inside each category), so "current vs suggested"
 * is an apples-to-apples comparison. Without a market pack the parametric numbers are kept unchanged.
 */
const round4 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null);

// For the 2 forward-range rows workflow's rigorous evaluation actually found beat the historical (B2)
// baseline — see clean/models/model_card.md — replaces that row's p10/p50/p90 with the FHS + LightGBM
// (STACK) correction and tags its source. Every other row keeps analyzePortfolio's B2 baseline
// untouched: that's still the validated, honest choice for them (see stackForward.js's own header).
function applyStackForwardRanges(profile, analysis) {
  if (!analysis.forward) return;
  let stacked;
  try {
    stacked = stackForecasts(profile, analysis, getMarketPack());
  } catch (e) {
    console.error("stackForwardRanges failed, keeping B2 baseline:", e.message);
    return;
  }
  const q = (v) => ({ p10: round4(v.p10), p50: round4(v.p50), p90: round4(v.p90), source: "ml_stack" });
  if (stacked.ranges.t_ret_vs_usd_26w) analysis.forward["26w"].retVsUsd = q(stacked.ranges.t_ret_vs_usd_26w);
  if (stacked.ranges.t_max_drawdown_52w) analysis.forward["52w"].maxDrawdown = q(stacked.ranges.t_max_drawdown_52w);
  // forward-looking volatility (ML): shown next to — never instead of — the measured trailing volatility
  if (stacked.vol) analysis.forwardVol = stacked.vol;
}

function withMarketRisk(stats, profile, total, categoryWeights) {
  if (!(total > 0)) return stats;
  const currentHoldings = holdingsFromAssets(profile.assets);
  const holdings = categoryWeights ? holdingsFromCategoryWeights(categoryWeights, total, currentHoldings) : currentHoldings;
  const analysis = analyzePortfolio(holdings, {
    age: profile.personal?.age,
    nDependents: profile.personal?.childrenCount,
    monthlyExpenses: profile.monthlyExpenses,
    debt: profile.existingDebt,
  });
  if (!analysis) return stats;
  applyStackForwardRanges(profile, analysis);
  // `riskScore`/`riskLevel` are THE canonical numbers shown everywhere (gauge, chips, notifications, every prompt) as
  // "ریسک سبد دارایی". They used to be pure market volatility rescaled to 0-100 — a user 100% in one illiquid, highly
  // concentrated asset could score close to a diversified portfolio of similar volatility. They are now
  // analysis.risk.composite (volatility + drawdown + tail risk + concentration + illiquidity + cash erosion, see
  // portfolioRisk.js). The pure-volatility number is kept as `volatilityScore`/`volatilityLevel` (it is also exactly
  // composite.components.volatility) for anywhere that specifically means market-price risk, not portfolio risk.
  return {
    ...stats,
    volatility: analysis.risk.wealthVol1y,
    riskScore: analysis.risk.composite.score,
    riskLevel: analysis.risk.composite.level,
    volatilityScore: analysis.risk.riskScore,
    volatilityLevel: analysis.risk.riskLevel,
    analysis,
  };
}
