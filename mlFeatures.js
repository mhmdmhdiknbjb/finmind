/**
 * Builds the 141-feature vector workflow/pipeline/mlfeatures.py + calculator.py compute for the
 * STACK forward-risk correction models, from data FinMind already has — reusing analyzePortfolio()'s
 * own `w` (per-holding-type weight), `share` (derived shares) and `marketContext`/regime outputs
 * rather than recomputing them, so there is exactly one place that turns holdings into weights.
 *
 * DATA vs ASSUMPTIONS (same spirit as optimizer.js's header comment):
 *  - w_, d_share_, y_, f_, ctx_, reg_ and cf_ columns are computed from real data (the same
 *    deterministic engines used everywhere else in the app) or come frozen from market_pack.json.
 *  - The STACK model was trained on 26 fine-grained asset subclasses. FinMind's asset kinds
 *    (public/assetCatalog.js) now cover most of them (coins, silver, gold/leveraged/real-estate/commodity
 *    funds, government/corporate/housing bonds, vehicles); the one with no FinMind equivalent
 *    (equity_index) stays at weight 0 — a genuine approximation, not a bug.
 *  - profile_horizon_years falls back to the same age-based heuristic the synthetic training data used
 *    (workflow/pipeline/04_synthetic_portfolios.py) when the user hasn't filled in the new horizon field.
 */

const MARITAL = ["single", "married", "divorced", "widowed"];
const EMPLOY = ["employee", "government", "self_employed", "retired", "student", "unemployed"];
const RISK_LIST = ["fx", "gold", "crypto", "stock", "fund", "bond"];
const CF_CATS = ["fx_usd", "fx_eur", "fx_other", "gold_physical", "crypto_btc", "crypto_eth", "crypto_stable",
  "crypto_alt", "stock", "equity_fund", "fixed_income_fund"];
const CLASS_FEATS = ["ann_vol_1y", "ann_vol_3y", "max_drawdown_1y", "mom_3m", "mom_12m", "beta_usd_1y", "ann_ret_vs_usd_1y"];

const MARITAL_MAP = { "مجرد": "single", "متاهل": "married" };
// FinMind's employment field is free text with datalist suggestions, not a fixed enum, so this is a
// best-effort keyword match; anything unrecognised defaults to "employee" (the most common answer).
const EMPLOYMENT_MAP = [
  [/دولتی/, "government"],
  [/خصوصی/, "employee"],
  [/آزاد|فریلنسر|کارفرما|صاحب/, "self_employed"],
  [/بازنشسته/, "retired"],
  [/دانشجو/, "student"],
  [/بیکار/, "unemployed"],
];

function matchEmployment(text) {
  for (const [re, key] of EMPLOYMENT_MAP) if (re.test(text || "")) return key;
  return "employee";
}

/** Same heuristic 04_synthetic_portfolios.py samples horizon_years around, used only as a fallback
 * when the user hasn't filled in the (optional) numeric horizon field. */
function fallbackHorizonYears(age) {
  const a = Number(age) || 35;
  return Math.max(1, Math.min(30, Math.round(Math.max(2, 68 - a) * 0.5)));
}

/**
 * profile: the full FinMind profile object (personal.*, riskTolerance, monthlyIncome, horizonYears, ...)
 * analysis: the object analyzePortfolio() returns for this user
 * pack: market_pack.json
 * Returns { featureName: number } for every one of the 141 base features (everything except the 3
 * fhs_<target>_<h>w_q* columns, which the caller adds per-target since they depend on which forward
 * target is being predicted).
 */
export function buildBaseFeatures(profile, analysis, pack) {
  const p = profile.personal || {};
  const w = analysis.allocation.byType;
  const share = analysis.allocation.exposureShares;
  const usdToman = pack.meta.usd_toman;
  const total = analysis.total;
  const mc = analysis.marketContext;
  const X = {};

  X.profile_age = Number(p.age) || 0;
  X.profile_n_dependents = Number(p.childrenCount) || 0;
  X.profile_risk_tolerance = Number(profile.riskTolerance) || 5;
  X.profile_horizon_years = Number(profile.horizonYears) || fallbackHorizonYears(p.age);
  X.profile_debt_to_wealth = total > 0 ? (Number(profile.existingDebt) || 0) / total : 0;
  X.profile_owns_home = p.housingStatus === "مالک مسکن" ? 1 : 0;
  X.profile_log_wealth_usd = Math.log1p(total / usdToman);
  X.profile_log_income_usd = Math.log1p((Number(profile.monthlyIncome) || 0) / usdToman);
  X.profile_log_expenses_usd = Math.log1p((Number(profile.monthlyExpenses) || 0) / usdToman);

  const maritalKey = MARITAL_MAP[p.maritalStatus] || "single";
  for (const m of MARITAL) X[`marital_${m}`] = m === maritalKey ? 1 : 0;
  const employKey = matchEmployment(p.employmentType);
  for (const e of EMPLOY) X[`employment_${e}`] = e === employKey ? 1 : 0;

  // ---- w_* (26 ALL_W categories) — everything FinMind cannot distinguish stays 0, see file header.
  const wGet = (t) => w[t] || 0;
  Object.assign(X, {
    w_fx_usd: wGet("fx_usd"), w_fx_eur: wGet("fx_eur"), w_fx_other: wGet("fx_other"),
    w_gold_physical: wGet("gold_physical"), w_coin_full: wGet("coin_full"), w_coin_partial: wGet("coin_partial"), w_silver: wGet("silver"), w_gold_fund: wGet("gold_fund"),
    w_crypto_btc: wGet("crypto_btc"), w_crypto_eth: wGet("crypto_eth"), w_crypto_stable: wGet("crypto_stable"),
    w_equity_index: 0, w_crypto_alt: wGet("crypto_alt"), w_stock: wGet("stock"),
    w_equity_fund: wGet("equity_fund") + 0.5 * wGet("fund"), w_leveraged_fund: wGet("leveraged_fund"),
    w_fixed_income_fund: wGet("fixed_income_fund") + 0.5 * wGet("fund"),
    w_realestate_fund: wGet("realestate_fund"), w_commodity_fund: wGet("commodity_fund"), w_bond_govt: wGet("bond_govt"), w_bond_corp: wGet("bond_corp"), w_bond_housing_cert: wGet("bond_housing_cert"),
    w_cash_deposit: wGet("cash_deposit"), w_real_estate: wGet("real_estate"), w_vehicle: wGet("vehicle"),
    w_other_assets: wGet("other_assets"),
  });

  // ---- d_share_* — already computed by analyzePortfolio as `exposureShares`.
  Object.assign(X, {
    d_share_cash_deposit: share.cash_deposit || 0, d_share_fx: share.fx || 0, d_share_gold: share.gold || 0,
    d_share_crypto: share.crypto || 0, d_share_stock: share.stock || 0, d_share_fund: share.fund || 0,
    d_share_bond: share.bond || 0, d_share_real_estate: share.real_estate || 0, d_share_vehicle: share.vehicle || 0,
    d_share_other_assets: share.other_assets || 0, d_share_rial_cash_like: share.rial_cash_like || 0,
    d_share_fx_linked: share.fx_linked || 0, d_share_gold_linked: share.gold_linked || 0,
    d_share_equity_linked: share.equity_linked || 0, d_share_real_assets: share.real_assets || 0,
    d_modeled_share: analysis.modeledShare || 0,
  });

  // ---- y_* — already computed by analyzePortfolio, just renamed.
  const d = analysis.dispersion, s = analysis.risk.sleeve, l = analysis.liquidity, ce = analysis.cashErosion;
  Object.assign(X, {
    y_hhi_holdings: d.hhiHoldings, y_effective_n_holdings: d.effectiveNHoldings, y_hhi_class: d.hhiClass,
    y_effective_n_class: d.effectiveNClass, y_entropy_class_norm: d.entropyClassNorm, y_top1_share: d.top1Share,
    y_top3_share: d.top3Share, y_n_holdings: d.nHoldings, y_n_classes: d.nClasses,
    y_liquidity_score: l.liquidityScore, y_emergency_months: l.emergencyMonths ?? 0,
    y_port_ann_ret_1y: s?.annReturn1y ?? 0, y_port_ann_vol_1y: s?.annVol1y ?? 0, y_port_max_drawdown_1y: s?.maxDrawdown1y ?? 0,
    y_port_cvar95_weekly_1y: s?.cvar95Weekly1y ?? 0, y_port_var95_weekly_1y: s?.var95Weekly1y ?? 0,
    y_port_ret_vs_usd_1y: s?.returnVsUsd1y ?? 0, y_port_beta_usd_1y: s?.betaUsd1y ?? 0,
    y_avg_pairwise_corr_1y: d.avgPairwiseCorr1y ?? 0, y_diversification_ratio: d.diversificationRatio ?? 1,
    y_port_ann_ret_3y: s?.annReturn3y ?? 0, y_port_ann_vol_3y: s?.annVol3y ?? 0, y_port_max_drawdown_3y: s?.maxDrawdown3y ?? 0,
    y_top_risk_class_share: d.topRiskClassShare ?? 0, y_top_holding_risk_share: d.topHoldingRiskShare ?? 0,
    y_cash_erosion_vs_usd_1y: ce.cashShareXUsd1y, y_cash_erosion_vs_gold_1y: ce.cashShareXGold1y,
    y_diversification_score: d.diversificationScore,
    y_top_risk_class_code: d.topRiskClass ? RISK_LIST.indexOf(d.topRiskClass) : -1,
  });
  const rc = d.riskContributionByClass || {};
  for (const c of RISK_LIST) X[`y_risk_share_${c}`] = rc[c] || 0;

  // ---- f_* flags + n_flags
  const flagSet = new Set(d.flags || []);
  for (const f of ["single_asset_dominant", "no_liquid_buffer", "crypto_heavy_older", "mostly_rial_cash_like",
    "realestate_heavy_illiquid", "no_fx_gold_hedge", "debt_heavy", "no_market_assets", "leveraged_fund_risk", "coin_bubble_exposure"]) {
    X[`f_${f}`] = flagSet.has(f) ? 1 : 0;
  }
  X.n_flags = flagSet.size;

  // ---- ctx_* — already computed by analyzePortfolio as `marketContext`.
  Object.assign(X, {
    ctx_usd_ret_13w: mc.usdRet13w, ctx_usd_ret_52w: mc.usdRet52w, ctx_gold_ret_52w: mc.goldRet52w,
    ctx_tedpix_ret_52w: mc.tedpixRet52w, ctx_tedpix_dd_from_3y_high: mc.tedpixDdFrom3yHigh,
    ctx_fx_free_vs_nima_gap: mc.fxFreeVsNimaGap, ctx_shock_fx_13w: mc.shockFx13w,
  });

  // ---- reg_* — the full frozen regime block, 1:1.
  for (const [k, v] of Object.entries(pack.regime)) X[`reg_${k}`] = typeof v === "boolean" ? (v ? 1 : 0) : v;

  // ---- cf_* — portfolio-weighted current class features (mlfeatures.py), weighted by w_* over the
  // 22 modeled CATS; only the 11 categories FinMind can populate ever carry nonzero weight, so those
  // are the only rows market_pack.json needs (see tools/export_market_pack.py CF_CATS).
  const cf = pack.class_features || {};
  for (const feat of CLASS_FEATS) {
    let num = 0, den = 0;
    for (const cat of CF_CATS) {
      const wc = wCatWeight(w, cat);
      const v = cf[cat]?.[feat];
      if (wc > 0 && v !== null && v !== undefined && Number.isFinite(v)) { num += wc * v; den += wc; }
    }
    X[`cf_${feat}`] = den > 1e-6 ? num / den : 0;
  }

  return X;
}

// Maps a CF_CATS / calculator.py category name to its FinMind holding-type weight (same split as w_*
// above: "fund" splits evenly between equity_fund and fixed_income_fund).
function wCatWeight(w, cat) {
  if (cat === "equity_fund") return (w.equity_fund || 0) + 0.5 * (w.fund || 0);
  if (cat === "fixed_income_fund") return (w.fixed_income_fund || 0) + 0.5 * (w.fund || 0);
  return w[cat] || 0;
}
