import { ASSET_ORDER, ASSET_STATS, COVARIANCE, currentWeights } from "./optimizer.js";

/**
 * Phase 2 — Monte Carlo scenario simulation.
 *
 * A scenario shock ("dollar up 30%") is not a single deterministic number.
 * It fixes the return of one or more asset classes at a known value and
 * asks: given the historical correlation structure between assets (the same
 * covariance matrix built in optimizer.js), what is the *probability
 * distribution* of the effect on the rest of the portfolio?
 *
 * We answer that with the standard multivariate-normal conditioning formula
 * (not an LLM guess):
 *
 *   X ~ N(mu, Sigma), partitioned into shocked block 1 and free block 2.
 *   X2 | X1 = x1  ~  N(mu2 + Sigma21 Sigma11^-1 (x1 - mu1),
 *                      Sigma22 - Sigma21 Sigma11^-1 Sigma12)
 *
 * We then draw thousands of samples from that conditional distribution
 * (via Cholesky decomposition) to get real percentiles — e.g. "with 70%
 * probability your portfolio moves between X% and Y%" — instead of a
 * single LLM-invented delta.
 */

function zeros(n) {
  return new Array(n).fill(0);
}

function matInverse(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...zeros(n).map((_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    }
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    const pivot = M[col][col] || 1e-9;
    for (let j = 0; j < 2 * n; j++) M[col][j] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let j = 0; j < 2 * n; j++) M[r][j] -= factor * M[col][j];
    }
  }
  return M.map((row) => row.slice(n));
}

function matMul(A, B) {
  const rows = A.length;
  const inner = B.length;
  const cols = B[0].length;
  const out = Array.from({ length: rows }, () => zeros(cols));
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < inner; k++) {
      const a = A[i][k];
      if (!a) continue;
      for (let j = 0; j < cols; j++) out[i][j] += a * B[k][j];
    }
  }
  return out;
}

function transpose(A) {
  const rows = A.length;
  const cols = A[0].length;
  const out = Array.from({ length: cols }, () => zeros(rows));
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) out[j][i] = A[i][j];
  return out;
}

function subVec(a, b) {
  return a.map((v, i) => v - b[i]);
}

function addVec(a, b) {
  return a.map((v, i) => v + b[i]);
}

/** Cholesky decomposition of a symmetric positive semi-definite matrix (with ridge regularization). */
function cholesky(A) {
  const n = A.length;
  const L = Array.from({ length: n }, () => zeros(n));
  const ridge = 1e-8;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j] + (i === j ? ridge : 0);
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(sum, 1e-12));
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sortedArr, p) {
  const idx = clampIdx((p / 100) * (sortedArr.length - 1), 0, sortedArr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function clampIdx(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * shocks: { category: annualReturnShock } for one or more asset classes,
 * e.g. { currency: 0.30 } for "dollar up 30%".
 */
export function simulateShock(profile, shocks, trials = 8000) {
  const n = ASSET_ORDER.length;
  const shockedKeys = Object.keys(shocks).filter((k) => ASSET_ORDER.includes(k));
  const shockedIdx = shockedKeys.map((k) => ASSET_ORDER.indexOf(k));
  const freeIdx = ASSET_ORDER.map((_, i) => i).filter((i) => !shockedIdx.includes(i));

  const mu = ASSET_ORDER.map((k) => ASSET_STATS[k].expectedReturn);
  const x1 = shockedIdx.map((i) => shocks[ASSET_ORDER[i]]);
  const mu1 = shockedIdx.map((i) => mu[i]);
  const mu2 = freeIdx.map((i) => mu[i]);

  const Sigma11 = shockedIdx.map((i) => shockedIdx.map((j) => COVARIANCE[i][j]));
  const Sigma21 = freeIdx.map((i) => shockedIdx.map((j) => COVARIANCE[i][j]));
  const Sigma22 = freeIdx.map((i) => freeIdx.map((j) => COVARIANCE[i][j]));
  const Sigma12 = transpose(Sigma21);

  let condMean2 = mu2;
  let condCov2 = Sigma22;

  if (shockedIdx.length > 0 && freeIdx.length > 0) {
    const Sigma11Inv = matInverse(Sigma11);
    const diff = subVec(x1, mu1).map((v) => [v]);
    const meanAdj = matMul(Sigma21, matMul(Sigma11Inv, diff)).map((r) => r[0]);
    condMean2 = addVec(mu2, meanAdj);
    const covAdj = matMul(Sigma21, matMul(Sigma11Inv, Sigma12));
    condCov2 = Sigma22.map((row, i) => row.map((v, j) => v - covAdj[i][j]));
  }

  const L = freeIdx.length > 0 ? cholesky(condCov2) : [];
  const { weights, total } = currentWeights(profile.assets);
  const weightVec = ASSET_ORDER.map((k) => weights[k] || 0);

  const portfolioSamples = new Array(trials);
  const assetSamples = ASSET_ORDER.map(() => new Array(trials));

  for (let t = 0; t < trials; t++) {
    const full = new Array(n);
    for (let k = 0; k < shockedIdx.length; k++) full[shockedIdx[k]] = x1[k];

    if (freeIdx.length > 0) {
      const z = freeIdx.map(() => randn());
      for (let i = 0; i < freeIdx.length; i++) {
        let sample = condMean2[i];
        for (let j = 0; j <= i; j++) sample += L[i][j] * z[j];
        full[freeIdx[i]] = sample;
      }
    }

    let portfolioReturn = 0;
    for (let i = 0; i < n; i++) {
      assetSamples[i][t] = full[i];
      portfolioReturn += weightVec[i] * full[i];
    }
    portfolioSamples[t] = portfolioReturn;
  }

  portfolioSamples.sort((a, b) => a - b);
  const portfolioPct = {
    p15: percentile(portfolioSamples, 15),
    p50: percentile(portfolioSamples, 50),
    p85: percentile(portfolioSamples, 85),
    mean: portfolioSamples.reduce((s, v) => s + v, 0) / trials,
  };

  const impactByAsset = ASSET_ORDER.map((k, i) => {
    const w = weightVec[i];
    if (w <= 0.0001) return null;
    const sorted = [...assetSamples[i]].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    return {
      category: k,
      p15: percentile(sorted, 15),
      p50,
      p85: percentile(sorted, 85),
      changePercent: Math.round(p50 * 1000) / 10,
      changeAmount: Math.round(p50 * w * total),
    };
  }).filter(Boolean);

  return {
    shocks,
    trials,
    total,
    portfolio: {
      p15Percent: Math.round(portfolioPct.p15 * 1000) / 10,
      p50Percent: Math.round(portfolioPct.p50 * 1000) / 10,
      p85Percent: Math.round(portfolioPct.p85 * 1000) / 10,
      p15Amount: Math.round(portfolioPct.p15 * total),
      p50Amount: Math.round(portfolioPct.p50 * total),
      p85Amount: Math.round(portfolioPct.p85 * total),
    },
    impactByAsset,
  };
}
