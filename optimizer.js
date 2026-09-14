import { solveQP } from "quadprog";

/**
 * Phase 1 — Portfolio optimization engine (Markowitz mean-variance, localized for Iran).
 *
 * These are NOT LLM-generated numbers. Every figure here comes from a real
 * quadratic program solved with the Goldfarb–Idnani active-set method
 * (same algorithm as R's solve.QP). The LLM is only ever shown the *outputs*
 * of this module and asked to explain them in Persian — it never invents
 * risk scores, expected returns, or allocation weights itself.
 *
 * ASSUMPTIONS: expectedReturn / volatility / correlation below are parametric
 * planning assumptions (annual, nominal Toman terms), not fitted from a real
 * historical dataset yet. That data-calibration step is Phase 5 of the
 * roadmap (see ROADMAP.md). Until then, these numbers should be read as
 * "reasonable long-run planning assumptions for the Iranian market", not
 * as a backtested forecast.
 */

export const ASSET_ORDER = ["cash", "gold", "currency", "stock", "fund", "realestate", "crypto", "other"];

export const ASSET_STATS = {
  cash: { expectedReturn: 0.23, volatility: 0.03, liquidity: 1.0, upperBound: 1.0 },
  gold: { expectedReturn: 0.35, volatility: 0.22, liquidity: 0.75, upperBound: 0.5 },
  currency: { expectedReturn: 0.32, volatility: 0.25, liquidity: 0.85, upperBound: 0.4 },
  stock: { expectedReturn: 0.38, volatility: 0.35, liquidity: 0.65, upperBound: 0.5 },
  fund: { expectedReturn: 0.28, volatility: 0.12, liquidity: 0.8, upperBound: 0.6 },
  realestate: { expectedReturn: 0.3, volatility: 0.15, liquidity: 0.15, upperBound: 1.0 },
  crypto: { expectedReturn: 0.45, volatility: 0.7, liquidity: 0.7, upperBound: 0.15 },
  other: { expectedReturn: 0.2, volatility: 0.2, liquidity: 0.5, upperBound: 0.3 },
};

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

function buildCovariance() {
  const n = ASSET_ORDER.length;
  const sigma = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const ai = ASSET_ORDER[i];
      const aj = ASSET_ORDER[j];
      sigma[i][j] = corr(ai, aj) * ASSET_STATS[ai].volatility * ASSET_STATS[aj].volatility;
    }
  }
  return sigma;
}

const COVARIANCE = buildCovariance();

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function currentWeights(assets) {
  const totals = Object.fromEntries(ASSET_ORDER.map((k) => [k, 0]));
  let total = 0;
  for (const a of assets || []) {
    const cat = ASSET_ORDER.includes(a.category) ? a.category : "other";
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

  // Dmat = lambda * Sigma, ridge-regularized for numerical positive-definiteness.
  const Dmat = oneIndexedMatrix(n, n);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= n; j++) {
      Dmat[i][j] = lambda * COVARIANCE[i - 1][j - 1] + (i === j ? 1e-6 : 0);
    }
  }

  const dvec = oneIndexedVector(n);
  for (let i = 1; i <= n; i++) dvec[i] = ASSET_STATS[ASSET_ORDER[i - 1]].expectedReturn;

  const liq = ASSET_ORDER.map((k) => ASSET_STATS[k].liquidity);

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

  let optimalWeights;
  if (result.message) {
    // Infeasible or numerically degenerate (can happen with very tight,
    // conflicting constraints) — fall back to the current allocation
    // rather than surface a broken optimizer result.
    optimalWeights = { ...curWeights };
  } else {
    optimalWeights = {};
    for (let i = 0; i < n; i++) optimalWeights[ASSET_ORDER[i]] = Math.max(0, result.solution[i + 1]);
    const sum = Object.values(optimalWeights).reduce((s, v) => s + v, 0) || 1;
    for (const k of ASSET_ORDER) optimalWeights[k] = optimalWeights[k] / sum;
  }

  return {
    current: { weights: curWeights, total, ...portfolioStats(curWeights) },
    optimal: { weights: optimalWeights, ...portfolioStats(optimalWeights) },
    params: { riskAversion: lambda, requiredLiquidFraction: reqLiquid, realestateBand: [lowerBound.realestate, upperBound.realestate] },
    solverMessage: result.message || null,
  };
}
