// Regression test: the JS risk/dispersion engine must reproduce calculator.py (workflow pipeline) exactly.
// usage: node tools/verify_risk_engine.mjs        (fixtures: tools/risk_engine_reference.json)
// Regenerate the fixtures after refreshing the market pack (tools/export_market_pack.py) by re-running
// calculator.metrics_for_user on the same holdings in the workflow pipeline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzePortfolio } from "../portfolioRisk.js";
import { getMarketPack } from "../marketData.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(fs.readFileSync(path.join(dir, "risk_engine_reference.json"), "utf8"));
const pack = getMarketPack();
if (pack.meta.asof !== ref.packAsOf) {
  console.error(`market pack as-of ${pack.meta.asof} != fixtures as-of ${ref.packAsOf}: regenerate the fixtures`);
  process.exit(2);
}

let checks = 0;
let failures = 0;
function eq(label, got, want) {
  checks++;
  const bothNull = (got === null || got === undefined || Number.isNaN(got)) && (want === null || want === undefined);
  if (bothNull) return;
  const ok = typeof want === "string" ? got === want : Number.isFinite(got) && Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want));
  if (!ok) {
    failures++;
    console.error(`  FAIL ${label}: got ${got}, want ${want}`);
  }
}

ref.cases.forEach((c, i) => {
  const p = c.user.profile;
  const holdings = Object.entries(c.user.holdings_toman).map(([type, amount]) => ({ type, amount }));
  const r = analyzePortfolio(holdings, { age: p.age, nDependents: p.n_dependents, monthlyExpenses: p.monthly_expenses_toman, debt: p.debt_toman });
  const e = c.expected;
  const d = r.dispersion;
  const s = r.risk.sleeve || {};
  const tag = `case ${i} (${c.mode})`;
  // metrics independent of how many holdings a basket counts as
  eq(`${tag} ret1y`, s.annReturn1y, e.y_port_ann_ret_1y);
  eq(`${tag} vol1y`, s.annVol1y, e.y_port_ann_vol_1y);
  eq(`${tag} mdd1y`, s.maxDrawdown1y, e.y_port_max_drawdown_1y);
  eq(`${tag} cvar`, s.cvar95Weekly1y, e.y_port_cvar95_weekly_1y);
  eq(`${tag} beta`, s.betaUsd1y, e.y_port_beta_usd_1y);
  eq(`${tag} vol3y`, s.annVol3y, e.y_port_ann_vol_3y);
  eq(`${tag} mdd3y`, s.maxDrawdown3y, e.y_port_max_drawdown_3y);
  for (const k of Object.keys(d.riskContributionByClass || {})) eq(`${tag} rc_${k}`, d.riskContributionByClass[k], e[`y_risk_share_${k}`]);
  if (c.mode === "full") {
    eq(`${tag} score`, d.diversificationScore, e.y_diversification_score);
    eq(`${tag} hhiHoldings`, d.hhiHoldings, e.y_hhi_holdings);
    eq(`${tag} effNClass`, d.effectiveNClass, e.y_effective_n_class);
    eq(`${tag} entropy`, d.entropyClassNorm, e.y_entropy_class_norm);
    eq(`${tag} top1`, d.top1Share, e.y_top1_share);
    eq(`${tag} top3`, d.top3Share, e.y_top3_share);
    eq(`${tag} liquidity`, r.liquidity.liquidityScore, e.y_liquidity_score);
    eq(`${tag} emergency`, r.liquidity.emergencyMonths, e.y_emergency_months);
    eq(`${tag} avgCorr`, d.avgPairwiseCorr1y, e.y_avg_pairwise_corr_1y);
    eq(`${tag} divRatio`, d.diversificationRatio, e.y_diversification_ratio);
    eq(`${tag} vsUsd`, s.returnVsUsd1y, e.y_port_ret_vs_usd_1y);
    eq(`${tag} topRiskClass`, d.topRiskClass ?? "none", e.y_top_risk_class);
    eq(`${tag} cashErosionUsd`, r.cashErosion.cashShareXUsd1y, e.y_cash_erosion_vs_usd_1y);
  }
});

console.log(`risk engine vs calculator.py: ${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
