"""Exports the market history + calculator settings the Node risk/dispersion engines need.

The heavy lifting (cleaning ~thousands of price histories into weekly returns) stays in the separate
`workflow` dataset pipeline. This script freezes the last WEEKS of the weekly return panel plus the
calculator config into one small JSON file, so the Node server never needs Python, pandas or parquet
at runtime.

WEEKS=320: the 1y/3y windows calculator.py uses need only the last 52/156 weeks (sliced from the END
of the array — safe regardless of total length), but fhsEngine.js's block-bootstrap (portfolioRisk's
FHS port) needs the calibrated W=260-week window from clean/models/fhs_config.json PLUS ~60 weeks of
lead-in so its own EWMA volatility estimator (min_periods=13) is properly warmed up before that window
starts, the same way it is in Python (computed over the whole multi-year history, not a short slice).

usage:  python tools/export_market_pack.py [--workflow C:\\Users\\GREEN\\Desktop\\workflow] [--out marketdata/market_pack.json]
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("--workflow", default=r"C:\Users\GREEN\Desktop\workflow")
ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "marketdata" / "market_pack.json"))
args = ap.parse_args()

WF = Path(args.workflow)
sys.path.insert(0, str(WF / "pipeline"))
import calculator as calc  # noqa: E402  (needs the workflow pipeline on sys.path)

WEEKS = 320
mk = calc.Market()
asof = mk.last_asof
pos = mk.weeks_pos[asof]
lo = pos - WEEKS + 1
dates = [d.strftime("%Y-%m-%d") for d in mk.dates[lo:pos + 1]]


def clean(a):
    return [None if not np.isfinite(x) else float(x) for x in a]


# ---- plain sub-class series (the holding types FinMind can express)
SUBCLASS_USED = ["fx_usd", "fx_eur", "fx_other", "gold_physical", "crypto_btc", "crypto_eth", "crypto_stable",
                 "equity_fund", "fixed_income_fund"]
series = {s: clean(mk.R_sub[s].values[lo:pos + 1].astype(float)) for s in SUBCLASS_USED}

# ---- baskets for holdings entered without symbols. Same rule as calculator.exposures_from_holdings:
#      stock amount -> equal weight over the 30 most liquid eligible stocks; crypto_alt -> equal weight over the alt coins.
avail, stocks_ok, alts_ok = mk.eligible(asof)
top30 = stocks_ok.nlargest(30, "w").asset_id.tolist()
R_inst = mk.R_inst
stock_basket = np.nan_to_num(R_inst[top30].values[lo:pos + 1].astype(float)).mean(1)
alt_basket = np.nan_to_num(R_inst[alts_ok].values[lo:pos + 1].astype(float)).mean(1)
series["stock_basket"] = clean(stock_basket)
series["crypto_alt_basket"] = clean(alt_basket)

# calculator only reports 3-year numbers when EVERY held series has >=130 finite weeks in the 156-week window.
# A basket is only as complete as its weakest member, so record that per series (baskets have no NaN of their own).
def full3(a):
    return int(np.isfinite(a[lo:pos + 1]).sum()) >= 130


valid_3y = {s: full3(mk.R_sub[s].values.astype(float)) for s in SUBCLASS_USED}
valid_3y["stock_basket"] = all(full3(R_inst[a].values.astype(float)) for a in top30)
valid_3y["crypto_alt_basket"] = all(full3(R_inst[a].values.astype(float)) for a in alts_ok)

# ---- portfolio-weighted "class features" (mlfeatures.py's cf_*) for the STACK correction model.
# Only exported for the 11 modeled categories FinMind can actually put nonzero weight on (see
# portfolioRisk.js HOLDING_TYPES) — a category with zero weight in every FinMind portfolio can never
# affect the weighted average, so its row would never be used.
CF_CATS = ["fx_usd", "fx_eur", "fx_other", "gold_physical", "crypto_btc", "crypto_eth", "crypto_stable",
           "crypto_alt", "stock", "equity_fund", "fixed_income_fund"]
CLASS_FEATS = ["ann_vol_1y", "ann_vol_3y", "max_drawdown_1y", "mom_3m", "mom_12m", "beta_usd_1y", "ann_ret_vs_usd_1y"]
Fs = mk.Fs_by.get(asof)
class_features = {}
for c in CF_CATS:
    row = {}
    for f in CLASS_FEATS:
        v = Fs.loc[c, f] if (Fs is not None and c in Fs.index) else np.nan
        row[f] = float(v) if np.isfinite(v) else None
    class_features[c] = row

reg = mk.REG.loc[asof]
regime = {k: (float(v) if isinstance(v, (int, float, np.floating)) and not isinstance(v, bool) else bool(v) if isinstance(v, (bool, np.bool_)) else v)
          for k, v in reg.items() if k != "asof_jalali"}

usd_toman = float(mk.usd_week.loc[asof])
if not np.isfinite(usd_toman):
    # a NaN would be written as a bare NaN token, which is not valid JSON — refuse instead of shipping a broken pack
    sys.exit("usd_toman is NaN at the as-of week: refusing to export a broken market pack")

meta_model = json.load(open(WF / "clean" / "models" / "model_meta.json", encoding="utf-8"))
fhs_config = json.load(open(WF / "clean" / "models" / "fhs_config.json", encoding="utf-8"))
pack = {
    "meta": {
        "asof": str(asof.date()),
        "weeks": WEEKS,
        "periods_per_year": calc.PPY,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "workflow dataset (tgju.org + tsetmc.com weekly returns, cleaned by pipeline/02-03)",
        "stock_basket_members": top30,
        "crypto_alt_basket_members": alts_ok,
        "usd_toman": usd_toman,
    },
    "dates": dates,
    "series": series,
    "series_valid_3y": valid_3y,
    "regime": regime,
    "class_features": class_features,
    "config": {
        "liq_factor": calc.LIQ,
        "score": calc.SC,
        "flags": calc.FL,
        "risk_classes": {k: v for k, v in calc.RISK_CLASS.items()},
        "broad_list": calc.BROAD_LIST,
        "risk_list": calc.RISK_LIST,
    },
    "forward_baseline_b2": meta_model["baselines"]["B2"],
    # calibrated on train+val months only (07_train_risk_model.py); fhsEngine.js uses these verbatim
    # rather than re-guessing lam/W/drift_w/block, the same "freeze what Python calibrated" pattern as B2.
    "fhs_params": {"lam": fhs_config["lam"], "W": fhs_config["params"]["W"], "drift_w": fhs_config["params"]["drift_w"],
                    "block": fhs_config["block"], "S": fhs_config["S"]},
}

# ---- STACK correction models (LightGBM) for the 2 targets that actually beat B2 in 07_train_risk_model.py
# (see clean/models/model_card.md — everything else stays on the B2 baseline). Exported via LightGBM's
# own dump_model() as plain JSON tree ensembles so portfolioRisk.js can evaluate them without needing
# LightGBM, Python or a native binding at runtime (lightgbmEval.js walks the same tree structure).
STACK_TARGETS = {"t_ret_vs_usd_26w": None, "t_max_drawdown_52w": None}
for target in STACK_TARGETS:
    method = meta_model["models"].get(target, {}).get("method")
    if method != "STACK":
        continue
    quantiles = {}
    for q in (10, 50, 90):
        import lightgbm as lgb  # noqa: E402  (only needed here, keep the top of the file import-light)
        booster = lgb.Booster(model_file=str(WF / "clean" / "models" / f"{target}_q{q}_stack.txt"))
        quantiles[str(q)] = booster.dump_model()
    STACK_TARGETS[target] = {"method": method, "quantiles": quantiles}

stack_dir = Path(args.out).resolve().parent / "stack_models"
stack_dir.mkdir(parents=True, exist_ok=True)
stack_index = {}
for target, data in STACK_TARGETS.items():
    if data is None:
        continue
    fname = f"{target}.json"
    (stack_dir / fname).write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    stack_index[target] = fname
    print(f"wrote {stack_dir / fname}  ({(stack_dir / fname).stat().st_size / 1024:.1f} KB)")
# ---- forward-VOLATILITY models (pipeline/10_train_vol_model.py): only horizons that passed its eligibility tests
vol_index = {}
vol_meta_path = WF / "clean" / "models" / "vol_model_meta.json"
if vol_meta_path.exists():
    import lightgbm as lgb  # noqa: E402
    vol_meta = json.load(open(vol_meta_path, encoding="utf-8"))
    for H in (26, 52):
        vm = vol_meta["models"].get(f"vol_{H}w", {})
        if vm.get("method") != "STACK":
            continue
        booster = lgb.Booster(model_file=str(WF / "clean" / "models" / f"vol_{H}w_stack.txt"))
        fname = f"vol_{H}w.json"
        payload = {"method": "STACK", "horizon": H, "booster": booster.dump_model(), "resid_q": vm["resid_q"],
                   "metrics": {k: vm[k] for k in vm if k.startswith(("val_", "test_", "n_"))}}
        (stack_dir / fname).write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        vol_index[str(H)] = fname
        print(f"wrote {stack_dir / fname}  ({(stack_dir / fname).stat().st_size / 1024:.1f} KB)")

(stack_dir / "index.json").write_text(json.dumps({"targets": stack_index, "vol": vol_index, "feature_order": meta_model["features"]}, ensure_ascii=False, indent=1), encoding="utf-8")

out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"wrote {out}  ({out.stat().st_size / 1024:.1f} KB)  as-of {asof.date()}  weeks={WEEKS}  series={len(series)}")
for k, v in series.items():
    fin = sum(x is not None for x in v)
    print(f"  {k:20s} finite {fin}/{WEEKS}")
