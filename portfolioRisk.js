import { getMarketPack, seriesArrays, PPY } from "./marketData.js";
import { kindOf } from "./public/assetCatalog.js";

/**
 * Dispersion (diversification) + risk engine.
 *
 * A JavaScript port of `calculator.metrics_batch` from the `workflow` dataset
 * pipeline, for a single portfolio. Every number here is deterministic and
 * computed from REAL weekly returns of the Iranian market (frozen in
 * marketdata/market_pack.json) — the LLM only ever explains these outputs.
 *
 * Conventions kept from the original calculator:
 *  - weights are shares of TOTAL wealth; assets without a price history
 *    (rial cash, real estate, other) are "unmodeled": they count for
 *    concentration/liquidity but NOT for price-based risk numbers;
 *  - price-based risk uses the modeled sleeve re-normalised to 100%, a
 *    weekly-rebalanced constant-weight portfolio, a 52-week window (156 for
 *    the 3-year numbers), sample (ddof=1) covariance, PPY=52;
 *  - a sleeve of <= 2% of wealth is treated as "no market assets".
 * Return series are nominal toman returns.
 */

// ------------------------------------------------------------------ holding types
// One holding = one type (as in calculator.ALL_W). `series` maps pack series -> share of the holding.
const HOLDING_TYPES = {
  cash_deposit: { cls: "cash_deposit", cashLike: 1 },
  fx_usd: { series: { fx_usd: 1 }, cls: "fx", fxLinked: 1 },
  fx_eur: { series: { fx_eur: 1 }, cls: "fx", fxLinked: 1 },
  fx_other: { series: { fx_other: 1 }, cls: "fx", fxLinked: 1 },
  gold_physical: { series: { gold_physical: 1 }, cls: "gold", goldLinked: 1 },
  crypto_btc: { series: { crypto_btc: 1 }, cls: "crypto", fxLinked: 1 },
  crypto_eth: { series: { crypto_eth: 1 }, cls: "crypto", fxLinked: 1 },
  crypto_stable: { series: { crypto_stable: 1 }, cls: "crypto", fxLinked: 1 },
  crypto_alt: { series: { crypto_alt_basket: 1 }, cls: "crypto", fxLinked: 1 },
  stock: { series: { stock_basket: 1 }, cls: "stock", eqLinked: 1 },
  equity_fund: { series: { equity_fund: 1 }, cls: "fund", eqLinked: 1 },
  fixed_income_fund: { series: { fixed_income_fund: 1 }, cls: "fund", cashLike: 1 },
  // FinMind's generic "fund" cannot say which kind it is: modelled as an even blend of an equity fund and a fixed-income fund.
  fund: { series: { equity_fund: 0.5, fixed_income_fund: 0.5 }, cls: "fund", eqLinked: 0.5, cashLike: 0.5, liq: 0.875 },
  // Kinds the user can now pick (public/assetCatalog.js). Gold coins / gold funds ride the same gold series;
  // a leveraged fund is modelled as an (under-stated) equity fund; kinds with no price history in the pack
  // (silver, commodity/real-estate funds, bonds, vehicles) are unmodelled: concentration + liquidity only.
  coin_full: { series: { gold_physical: 1 }, cls: "gold", goldLinked: 1 },
  coin_partial: { series: { gold_physical: 1 }, cls: "gold", goldLinked: 1 },
  gold_fund: { series: { gold_physical: 1 }, cls: "gold", goldLinked: 1 },
  silver: { cls: "gold", goldLinked: 1 },
  leveraged_fund: { series: { equity_fund: 1 }, cls: "fund", eqLinked: 1 },
  commodity_fund: { cls: "fund" },
  realestate_fund: { cls: "fund", realAsset: 1 },
  bond_govt: { cls: "bond", cashLike: 1 },
  bond_corp: { cls: "bond", cashLike: 1 },
  bond_housing_cert: { cls: "bond", cashLike: 1 },
  vehicle: { cls: "vehicle", realAsset: 1 },
  real_estate: { cls: "real_estate", realAsset: 1 },
  other_assets: { cls: "other_assets" },
};

// pack series -> risk class (calculator.RISK_CLASS)
const SERIES_CLASS = {
  fx_usd: "fx", fx_eur: "fx", fx_other: "fx",
  gold_physical: "gold",
  crypto_btc: "crypto", crypto_eth: "crypto", crypto_stable: "crypto", crypto_alt_basket: "crypto",
  stock_basket: "stock",
  equity_fund: "fund", fixed_income_fund: "fund",
};

const UNPRICED_FOR_LIQUID_BUFFER = new Set(["real_estate", "other_assets", "vehicle", "realestate_fund"]); // calculator excludes these from the emergency buffer

/** Maps a FinMind asset category (+ symbol) to a holding type. */
export function holdingTypeOf(asset) {
  switch (asset.category) {
    case "cash": return kindOf(asset)?.type || "cash_deposit";
    case "gold": return kindOf(asset)?.type || "gold_physical";
    case "currency": {
      const s = asset.symbol || "USD";
      return s === "USD" ? "fx_usd" : s === "EUR" ? "fx_eur" : "fx_other";
    }
    case "crypto": {
      const s = asset.symbol || "BTC";
      if (s === "BTC") return "crypto_btc";
      if (s === "ETH") return "crypto_eth";
      if (s === "USDT" || s === "USDC") return "crypto_stable";
      return "crypto_alt";
    }
    case "stock": return kindOf(asset)?.type || "stock";
    case "fund": return kindOf(asset)?.type || "fund";
    case "realestate": return "real_estate";
    default: return kindOf(asset)?.type || "other_assets";
  }
}

/** FinMind assets (with a resolved toman `amount`) -> [{type, amount}] merged per holding type. */
export function holdingsFromAssets(assets) {
  const byType = {};
  for (const a of assets || []) {
    const amt = Number(a.amount) || 0;
    if (amt <= 0) continue;
    const type = holdingTypeOf(a);
    byType[type] = (byType[type] || 0) + amt;
  }
  return Object.entries(byType).map(([type, amount]) => ({ type, amount }));
}

const DEFAULT_TYPE_FOR_CATEGORY = {
  cash: "cash_deposit", gold: "gold_physical", currency: "fx_usd", crypto: "crypto_btc",
  stock: "stock", fund: "fund", realestate: "real_estate", other: "other_assets",
};
const CATEGORY_OF_TYPE = (type) => {
  if (type === "cash_deposit") return "cash";
  if (type === "gold_physical" || type === "coin_full" || type === "coin_partial" || type === "silver") return "gold";
  if (type.startsWith("fx_")) return "currency";
  if (type.startsWith("crypto_")) return "crypto";
  if (type === "stock") return "stock";
  if (type === "fund" || type.endsWith("_fund")) return "fund";
  if (type === "real_estate") return "realestate";
  return "other";
};

/**
 * Turns category-level weights (e.g. the optimizer's suggestion) into holdings, keeping the user's own
 * mix inside each category (e.g. USD vs EUR) and using a default type for categories they don't hold yet.
 */
export function holdingsFromCategoryWeights(weights, total, currentHoldings) {
  const cur = {};
  for (const h of currentHoldings || []) {
    const cat = CATEGORY_OF_TYPE(h.type);
    (cur[cat] ||= []).push(h);
  }
  const out = [];
  for (const [cat, w] of Object.entries(weights)) {
    const amount = (w || 0) * total;
    if (amount <= 0) continue;
    const existing = cur[cat];
    if (existing?.length) {
      const sum = existing.reduce((s, h) => s + h.amount, 0);
      for (const h of existing) out.push({ type: h.type, amount: (amount * h.amount) / sum });
    } else {
      out.push({ type: DEFAULT_TYPE_FOR_CATEGORY[cat] || "other_assets", amount });
    }
  }
  return out;
}

// ------------------------------------------------------------------ small numeric helpers
const clip = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const nz = (x) => (Number.isFinite(x) ? x : 0);
const round = (x, nd = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** nd) / 10 ** nd : null);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

function maxDrawdownOf(returns) {
  let cum = 1;
  let peak = 1;
  let mdd = 0;
  for (const r of returns) {
    cum *= Math.exp(Math.log1p(Math.max(r, -0.95)));
    if (cum > peak) peak = cum;
    mdd = Math.min(mdd, cum / peak - 1);
  }
  return mdd;
}

const sumLog = (ps) => ps.reduce((s, p) => s + Math.log1p(Math.max(p, -0.95)), 0);

export function riskLevelFromScore(score) {
  if (score < 25) return "کم";
  if (score < 50) return "متوسط";
  if (score < 75) return "زیاد";
  return "بسیار زیاد";
}

/** Annual volatility (fraction) -> 0..100 score. Same 0.6 = "maximum" scale FinMind has always used. */
export function riskScoreFromVol(vol) {
  return Math.round(clip((vol / 0.6) * 100, 0, 100));
}

// ------------------------------------------------------------------ the engine
/**
 * @param {{type:string, amount:number}[]} holdings
 * @param {{age?:number, nDependents?:number, monthlyExpenses?:number, debt?:number}} profile
 */
export function analyzePortfolio(holdings, profile = {}) {
  const pack = getMarketPack();
  if (!pack) return null;
  const S = seriesArrays(pack);
  const cfg = pack.config;
  const reg = pack.regime;
  const cols = Object.keys(S);
  const nW = pack.meta.weeks;
  const T1 = PPY;

  const total = (holdings || []).reduce((s, h) => s + (h.amount > 0 ? h.amount : 0), 0);
  if (total <= 0) return null;

  // ---- weights per type + broad-class shares
  const w = {};
  for (const h of holdings) {
    if (!(h.amount > 0)) continue;
    if (!HOLDING_TYPES[h.type]) throw new Error(`unknown holding type '${h.type}'`);
    w[h.type] = (w[h.type] || 0) + h.amount / total;
  }
  const liqOf = (type) => HOLDING_TYPES[type].liq ?? cfg.liq_factor[type];
  const sumW = (fn) => Object.entries(w).reduce((s, [t, x]) => s + x * fn(HOLDING_TYPES[t], t), 0);

  const broadShare = {};
  for (const b of cfg.broad_list) broadShare[b] = 0;
  for (const [t, x] of Object.entries(w)) broadShare[HOLDING_TYPES[t].cls] += x;
  const share = {
    ...broadShare,
    rial_cash_like: sumW((d) => d.cashLike || 0),
    fx_linked: sumW((d) => d.fxLinked || 0),
    gold_linked: sumW((d) => d.goldLinked || 0),
    equity_linked: sumW((d) => d.eqLinked || 0),
    real_assets: sumW((d) => d.realAsset || 0),
  };

  // ---- modeled sleeve exposures over the pack's series columns
  const Wm = Object.fromEntries(cols.map((c) => [c, 0]));
  for (const [t, x] of Object.entries(w)) {
    for (const [s, f] of Object.entries(HOLDING_TYPES[t].series || {})) Wm[s] += x * f;
  }
  const modeledShare = cols.reduce((s, c) => s + Wm[c], 0);
  const hasMarket = modeledShare > 0.02 + 1e-6;

  // ---- concentration (whole wealth). A "stock"/"crypto_alt" holding isn't really one undiversified
  // position — FinMind always models it as the equal-weight 30-stock / alt-coin basket (same as
  // calculator.py's own concentration metric, which counts each basket member as its own holding) —
  // so it's expanded here the same way, or a bare stock holding would look artificially concentrated.
  const stockN = (pack.meta.stock_basket_members || []).length || 1;
  const altN = (pack.meta.crypto_alt_basket_members || []).length || 1;
  const hold = [];
  for (const [t, x] of Object.entries(w)) {
    if (t === "stock" && x > 0) hold.push(...Array(stockN).fill(x / stockN));
    else if (t === "crypto_alt" && x > 0) hold.push(...Array(altN).fill(x / altN));
    else hold.push(x);
  }
  const hhiHoldings = hold.reduce((s, x) => s + x * x, 0);
  const bs = cfg.broad_list.map((b) => broadShare[b]);
  const hhiClass = bs.reduce((s, x) => s + x * x, 0);
  const entropy = -bs.reduce((s, x) => s + (x > 0 ? x * Math.log(x) : 0), 0);
  const sorted = [...hold].sort((a, b) => b - a);
  const top1 = sorted[0];
  const top3 = sorted.slice(0, 3).reduce((s, x) => s + x, 0);

  // ---- liquidity
  const liquidityScore = sumW((d, t) => liqOf(t));
  const liquidShare = Object.entries(w).reduce((s, [t, x]) => s + (UNPRICED_FOR_LIQUID_BUFFER.has(t) ? 0 : x * liqOf(t)), 0);
  const monthly = Number(profile.monthlyExpenses) || 0;
  const emergencyMonths = monthly > 0 ? (total * liquidShare) / monthly : null;

  // ---- price-based risk on the modeled sleeve
  let past = null;
  let rcls = null;
  let topRiskClass = null;
  let topRiskShare = null;
  let apc = null;
  let divRatio = null;
  let topHoldingRisk = null;
  if (hasMarket) {
    const Wn = Object.fromEntries(cols.map((c) => [c, Wm[c] / modeledShare]));
    const held = cols.filter((c) => Wn[c] > 0);
    const lo1 = nW - T1;
    const R1 = (c) => Array.from({ length: T1 }, (_, i) => nz(S[c][lo1 + i]));
    const cols1 = Object.fromEntries(cols.map((c) => [c, R1(c)]));
    const P = Array.from({ length: T1 }, (_, i) => held.reduce((s, c) => s + cols1[c][i] * Wn[c], 0));
    const ann = Math.expm1(sumLog(P));
    const vol = sd(P) * Math.sqrt(PPY);
    const mdd = maxDrawdownOf(P);
    const Ps = [...P].sort((a, b) => a - b);
    const cvar = (Ps[0] + Ps[1] + Ps[2]) / 3;
    const var95 = Ps[2];

    // sample covariance across all columns (np.cov, ddof=1)
    const mu = Object.fromEntries(cols.map((c) => [c, mean(cols1[c])]));
    const Sg = {};
    for (const a of cols) {
      Sg[a] = {};
      for (const b of cols) {
        let s = 0;
        for (let i = 0; i < T1; i++) s += (cols1[a][i] - mu[a]) * (cols1[b][i] - mu[b]);
        Sg[a][b] = s / (T1 - 1);
      }
    }
    const WS = Object.fromEntries(cols.map((a) => [a, held.reduce((s, b) => s + Wn[b] * Sg[b][a], 0)]));
    const varp = held.reduce((s, a) => s + WS[a] * Wn[a], 0);
    const sig = Object.fromEntries(cols.map((c) => [c, Math.sqrt(Math.max(Sg[c][c], 0))]));
    const RC = Object.fromEntries(cols.map((c) => [c, varp > 0 ? (WS[c] * Wn[c]) / varp : NaN]));
    rcls = Object.fromEntries(cfg.risk_list.map((k) => [k, 0]));
    for (const c of cols) rcls[SERIES_CLASS[c]] += nz(RC[c]);
    divRatio = (held.reduce((s, c) => s + Wn[c] * sig[c], 0) * Math.sqrt(PPY)) / vol;
    const Cm = (a, b) => (sig[a] * sig[b] > 0 ? Sg[a][b] / (sig[a] * sig[b]) : 0);
    const sq = held.reduce((s, c) => s + Wn[c] ** 2, 0);
    const wc = held.reduce((s, a) => s + Wn[a] * held.reduce((t, b) => t + Wn[b] * Cm(a, b), 0), 0);
    apc = sq < 1 - 1e-6 ? (wc - sq) / (1 - sq) : NaN;

    // beta to USD and return relative to USD
    const usd = cols1.fx_usd;
    const uMean = mean(usd);
    const pMean = mean(P);
    let num = 0;
    let den = 0;
    for (let i = 0; i < T1; i++) {
      num += (P[i] - pMean) * (usd[i] - uMean);
      den += (usd[i] - uMean) ** 2;
    }
    const betaUsd = num / den;
    const usdAnn = Math.expm1(sumLog(usd));

    const rcEntries = Object.entries(rcls).sort((a, b) => b[1] - a[1]);
    [topRiskClass, topRiskShare] = rcEntries[0];
    topHoldingRisk = Math.max(...cols.map((c) => nz(RC[c])));

    // 3-year window: only if every held series (for a basket: every member) has >= 130 of 156 finite weeks
    let ann3 = null;
    let vol3 = null;
    let mdd3 = null;
    const valid3 = held.every((c) => pack.series_valid_3y?.[c] !== false);
    if (nW >= 156 && valid3) {
      const P3 = Array.from({ length: 156 }, (_, i) => held.reduce((s, c) => s + nz(S[c][nW - 156 + i]) * Wn[c], 0));
      ann3 = Math.expm1(sumLog(P3) / 3);
      vol3 = sd(P3) * Math.sqrt(PPY);
      mdd3 = maxDrawdownOf(P3);
    }

    past = {
      annReturn1y: ann, annVol1y: vol, maxDrawdown1y: mdd, cvar95Weekly1y: cvar, var95Weekly1y: var95,
      returnVsUsd1y: (1 + ann) / (1 + usdAnn) - 1, betaUsd1y: betaUsd,
      annReturn3y: ann3, annVol3y: vol3, maxDrawdown3y: mdd3,
    };
  }

  // ---- diversification score (0..100)
  const SC = cfg.score;
  const c1 = Math.min((1 / hhiClass) / 6, 1);
  const c2 = clip((1 - top1) / 0.8, 0, 1);
  const c3 = 1 - clip(Number.isFinite(apc) ? apc : 1.0, 0, 1);
  const c6 = 1 - clip(((topRiskShare ?? 1.0) - 0.35) / 0.65, 0, 1);
  const c4 = liquidityScore;
  const c5 = 1 - clip(share.rial_cash_like / 0.6, 0, 1);
  const diversificationScore = 100 * (SC.effective_n_class * c1 + SC.top1_share * c2 + SC.avg_pairwise_corr * c3 +
    SC.risk_balance * c6 + SC.liquidity * c4 + SC.cash_erosion * c5);

  // ---- rule flags (only those that apply to holdings FinMind can express)
  const FL = cfg.flags;
  const age = Number(profile.age) || 0;
  const debtToWealth = (Number(profile.debt) || 0) / total;
  const flags = [];
  const flag = (id, cond) => cond && flags.push(id);
  flag("single_asset_dominant", top1 > FL.single_asset_share);
  flag("no_liquid_buffer", emergencyMonths !== null && emergencyMonths < FL.liquid_buffer_months);
  flag("crypto_heavy_older", broadShare.crypto > FL.crypto_old_share && age > 50);
  flag("mostly_rial_cash_like", share.rial_cash_like > FL.cash_like_share);
  flag("realestate_heavy_illiquid", broadShare.real_estate > FL.realestate_heavy_share);
  flag("no_fx_gold_hedge", share.fx_linked + share.gold_linked < FL.no_hedge_share && reg.usd_ret_52w > 0.3);
  flag("debt_heavy", debtToWealth > FL.debt_ratio);
  // calculator.py: leveraged-fund share is only a risk for someone with dependents or over 50; a large coin
  // position is only flagged while the coin premium ("حباب") over its gold value is high.
  const nDependents = Number(profile.nDependents) || 0;
  flag("leveraged_fund_risk", (w.leveraged_fund || 0) > FL.leverage_share && (nDependents > 0 || age > 50));
  const coinBubble = Math.max(reg.bubble_emami_pct ?? -Infinity, reg.bubble_bahar_pct ?? -Infinity);
  flag("coin_bubble_exposure", (w.coin_full || 0) + (w.coin_partial || 0) > FL.coin_share && Number.isFinite(coinBubble) && coinBubble > FL.coin_bubble_pct);
  flag("no_market_assets", !hasMarket);

  // ---- forward ranges: vol-scaled historical quantiles (calculator's B2 baseline; the ML/FHS layers are not ported)
  let forward = null;
  if (hasMarket) {
    forward = {};
    const B2 = pack.forward_baseline_b2;
    for (const H of [26, 52]) {
      const sc = Math.max(past.annVol1y * Math.sqrt(H / 52), 0.02);
      const q = (t) => ({ p10: round(sc * B2[`t_${t}_${H}w`]["0.1"]), p50: round(sc * B2[`t_${t}_${H}w`]["0.5"]), p90: round(sc * B2[`t_${t}_${H}w`]["0.9"]) });
      forward[`${H}w`] = { horizonWeeks: H, ret: q("ret"), maxDrawdown: q("max_drawdown"), retVsUsd: q("ret_vs_usd") };
    }
  }

  const wealthVol = past ? past.annVol1y * modeledShare : 0;
  const riskScore = riskScoreFromVol(wealthVol);

  // ---- composite risk index (0..100). riskScore above is the MARKET-VOLATILITY score (kept as is: it is the number the
  // Python calculator defines and tools/verify_risk_engine.mjs checks). It says nothing about a portfolio that is one asset,
  // illiquid, or mostly rial cash losing value, so those dimensions are scored separately and combined with fixed weights.
  const ms = modeledShare;
  // Concentration as a RISK term must be concentration of RISK (variance), not of capital: c1/c2 above are
  // diversificationScore's capital-based HHI/top1, so a portfolio that is mostly safe cash was scored as
  // "concentrated" exactly like one that is mostly crypto, and since a higher risk-tolerance's optimal mix here
  // holds LESS cash (so it looks capital-diversified), the composite fell as risk tolerance rose — the opposite
  // of what a risk score must do. `topRiskShare`/`rcls` are the share of variance one class contributes (already
  // computed above, only inside `if (hasMarket)`), which correctly treats a concentrated safe holding as low-risk.
  const rcVals = rcls ? Object.values(rcls).filter((v) => Number.isFinite(v) && v > 0) : [];
  const hhiRC = rcVals.reduce((s, v) => s + v * v, 0);
  const concentrationRisk = hasMarket
    ? 100 * (1 - (0.5 * Math.min(hhiRC > 0 ? 1 / hhiRC / 6 : 0, 1) + 0.5 * clip((1 - (topRiskShare ?? 1)) / 0.8, 0, 1)))
    : 0; // no priced holding: no risk to concentrate (a concentrated safe/illiquid position is scored by illiquidity/cashErosion instead)

  const composite = (() => {
    const comp = {
      volatility: riskScore,
      drawdown: past ? 100 * clip((Math.abs(past.maxDrawdown1y) * ms) / 0.5, 0, 1) : 0,
      tail: past ? 100 * clip((Math.abs(past.cvar95Weekly1y) * ms) / 0.08, 0, 1) : 0,
      concentration: concentrationRisk,
      illiquidity: 100 * (1 - liquidityScore),
      cashErosion: 100 * clip(share.rial_cash_like / 0.6, 0, 1),
    };
    const W = { volatility: 0.35, drawdown: 0.15, tail: 0.1, concentration: 0.2, illiquidity: 0.1, cashErosion: 0.1 };
    const score = Math.round(Object.keys(W).reduce((s, k) => s + W[k] * comp[k], 0));
    const rounded = Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, Math.round(v)]));
    return { score, level: riskLevelFromScore(score), components: rounded, weights: W };
  })();

  // name only the unpriced classes actually held: a fixed "cash, real estate, other" text made readers (and the LLM)
  // believe a cash+gold portfolio contained real estate
  const UNPRICED_LABELS = { cash_deposit: "نقد و سپرده", bond: "اوراق", real_estate: "ملک", vehicle: "خودرو", other_assets: "سایر" };
  const unpricedNames = Object.entries(UNPRICED_LABELS).filter(([k]) => (broadShare[k] || 0) > 0.0005).map(([, l]) => l).join("، ");
  const warnings = [];
  if (!hasMarket) warnings.push("هیچ دارایی قیمت‌داری (ارز، طلا، سهام، صندوق، رمزارز) برای محاسبه‌ی ریسک بازار ثبت نشده است.");
  if (hasMarket && modeledShare < 0.999) {
    warnings.push(`${round((1 - modeledShare) * 100, 1)}٪ از دارایی (${unpricedNames || "سایر"}) تاریخچه‌ی قیمتی ندارد؛ عددهای نوسان و ریزش فقط بخش قیمت‌دار (${round(modeledShare * 100, 1)}٪) را پوشش می‌دهند.`);
  }
  if (w.fund) warnings.push("نوع صندوق مشخص نیست؛ به‌صورت ترکیب مساوی صندوق سهامی و درآمد ثابت مدل شده است.");
  if (w.stock) warnings.push("سهام بدون نماد ثبت شده؛ به‌صورت سبد هم‌وزن ۳۰ سهم پرمعامله مدل شده است.");
  if (w.crypto_alt) warnings.push("آلت‌کوین‌ها به‌صورت سبد هم‌وزن آلت‌کوین‌های موجود مدل شده‌اند.");

  return {
    asOf: pack.meta.asof,
    total,
    modeledShare,
    hasMarketAssets: hasMarket,
    allocation: { byType: w, byClass: broadShare, exposureShares: share, seriesWeights: Wm },
    dispersion: {
      diversificationScore, effectiveNHoldings: 1 / hhiHoldings, hhiHoldings, effectiveNClass: 1 / hhiClass, hhiClass,
      entropyClassNorm: entropy / Math.log(cfg.broad_list.length), top1Share: top1, top3Share: top3,
      nHoldings: hold.filter((x) => x > 1e-6).length, nClasses: bs.filter((x) => x > 1e-6).length,
      avgPairwiseCorr1y: Number.isFinite(apc) ? apc : null, diversificationRatio: Number.isFinite(divRatio) ? divRatio : null,
      riskContributionByClass: rcls, topRiskClass, topRiskClassShare: topRiskShare, topHoldingRiskShare: topHoldingRisk, flags,
    },
    liquidity: { liquidityScore, emergencyMonths },
    risk: { sleeve: past, wealthVol1y: wealthVol, riskScore, riskLevel: riskLevelFromScore(riskScore), composite },
    cashErosion: { cashShareXUsd1y: (w.cash_deposit || 0) * reg.usd_ret_52w, cashShareXGold1y: (w.cash_deposit || 0) * reg.gold_ret_52w },
    forward,
    marketContext: {
      usdRet13w: reg.usd_ret_13w, usdRet52w: reg.usd_ret_52w, goldRet52w: reg.gold_ret_52w, tedpixRet52w: reg.tedpix_ret_52w,
      tedpixDdFrom3yHigh: reg.tedpix_dd_from_3y_high, fxFreeVsNimaGap: reg.fx_free_vs_nima_gap, shockFx13w: reg.shock_fx_13w,
    },
    warnings,
  };
}
