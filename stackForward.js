/**
 * Combines FHS (fhsEngine.js) + the STACK LightGBM correction (lightgbmEval.js) into a calibrated
 * forward-range prediction, for exactly the targets workflow/pipeline/07_train_risk_model.py found
 * STACK actually beats the B2 baseline on (see clean/models/model_card.md) — everything else keeps
 * using B2 (portfolioRisk.js's existing baseline path), which is the honest, validated choice there.
 *
 * Combination formula, straight from 07_train_risk_model.py / 08_advisor.py:
 *   final_quantile[q] = FHS_quantile[q] + boosterFor(target, q).predict(base_features + fhs_features)
 * then re-sorted ascending (three independently-trained quantile regressors can cross).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runFHS } from "./fhsEngine.js";
import { buildBaseFeatures } from "./mlFeatures.js";
import { predictLightGBM } from "./lightgbmEval.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STACK_DIR = path.join(__dirname, "marketdata", "stack_models");

// target column name (calculator.py's t_<target>_<h>w) -> {target, horizon} used to name fhs_ columns
// and to know which of runFHS()'s "26w"/"52w" x ret/max_drawdown/ret_vs_usd blocks to read.
const STACK_TARGETS = {
  t_ret_vs_usd_26w: { fhsTarget: "ret_vs_usd", horizon: 26 },
  t_max_drawdown_52w: { fhsTarget: "max_drawdown", horizon: 52 },
};

let _volCache = null;
/** Forward-volatility models (pipeline/10_train_vol_model.py) that passed their eligibility tests: { "26": {...}, "52": {...} } */
function loadVolModels() {
  if (_volCache) return _volCache;
  _volCache = {};
  const indexPath = path.join(STACK_DIR, "index.json");
  if (!fs.existsSync(indexPath)) return _volCache;
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  for (const [h, file] of Object.entries(index.vol || {})) {
    _volCache[h] = JSON.parse(fs.readFileSync(path.join(STACK_DIR, file), "utf8"));
  }
  return _volCache;
}

let _modelsCache = null;
function loadModels() {
  if (_modelsCache) return _modelsCache;
  const indexPath = path.join(STACK_DIR, "index.json");
  if (!fs.existsSync(indexPath)) {
    _modelsCache = {};
    return _modelsCache;
  }
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  _modelsCache = {};
  for (const [target, file] of Object.entries(index.targets)) {
    _modelsCache[target] = JSON.parse(fs.readFileSync(path.join(STACK_DIR, file), "utf8"));
  }
  return _modelsCache;
}

/**
 * Returns { t_ret_vs_usd_26w: {p10,p50,p90}, t_max_drawdown_52w: {p10,p50,p90} } for whichever of the
 * two STACK-eligible targets have a loaded model, or {} if none (e.g. models not exported yet, or no
 * market assets — matches the FHS/STACK "unavailable" fallback: the caller keeps using B2 in that case).
 */
export function stackForwardRanges(profile, analysis, pack) {
  return stackForecasts(profile, analysis, pack).ranges;
}

/**
 * One FHS simulation feeds both ML products: the STACK quantile ranges above and the forward-VOLATILITY model
 * (annualised vol expected over the next 26 / 52 weeks: point forecast + a range from the model's validation
 * residuals). Returns { ranges, vol } — each empty/null when nothing eligible is available.
 */
export function stackForecasts(profile, analysis, pack) {
  const none = { ranges: {}, vol: null };
  if (!analysis.hasMarketAssets) return none;
  const models = loadModels();
  const volModels = loadVolModels();
  const targetsToRun = Object.keys(STACK_TARGETS).filter((t) => models[t]?.method === "STACK");
  if (!targetsToRun.length && !Object.keys(volModels).length) return none;

  const sim = runFHS(pack, analysis.allocation.seriesWeights, { S: 1000, seed: 11 });
  if (!sim) return none;
  const baseX = buildBaseFeatures(profile, analysis, pack);

  let vol = null;
  for (const [h, vm] of Object.entries(volModels)) {
    const fhsVol = sim[`${h}w`].volMedian;
    if (!(fhsVol > 0)) continue;
    const logPred = Math.log(fhsVol) + predictLightGBM(vm.booster, { ...baseX, [`fhs_vol_${h}w`]: fhsVol });
    const rq = vm.resid_q;
    (vol ||= {})[`${h}w`] = {
      horizonWeeks: Number(h),
      point: Math.exp(logPred),
      p10: Math.exp(logPred + rq["0.1"]),
      p90: Math.exp(logPred + rq["0.9"]),
      fhsBaseline: fhsVol,
      trailing: baseX.y_port_ann_vol_1y,
      skillVsBestReference: vm.metrics?.test_skill_vs_best_ref ?? null,
    };
  }

  const out = {};
  for (const target of targetsToRun) {
    const { fhsTarget, horizon } = STACK_TARGETS[target];
    const fhsQ = sim[`${horizon}w`][fhsTarget]; // {p10,p50,p90} from FHS itself
    const fhsCols = {
      [`fhs_${fhsTarget}_${horizon}w_q10`]: fhsQ.p10,
      [`fhs_${fhsTarget}_${horizon}w_q50`]: fhsQ.p50,
      [`fhs_${fhsTarget}_${horizon}w_q90`]: fhsQ.p90,
    };
    const Xc = { ...baseX, ...fhsCols };
    const model = models[target];
    const qs = [10, 50, 90].map((q) => {
      const fhsBase = q === 10 ? fhsQ.p10 : q === 50 ? fhsQ.p50 : fhsQ.p90;
      return fhsBase + predictLightGBM(model.quantiles[String(q)], Xc);
    });
    qs.sort((a, b) => a - b); // 07_train_risk_model.py re-sorts too: 3 independent quantile models can cross
    out[target] = { p10: qs[0], p50: qs[1], p90: qs[2] };
  }
  return { ranges: out, vol };
}
