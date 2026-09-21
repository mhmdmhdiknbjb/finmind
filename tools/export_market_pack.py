"""Exports the market history + calculator settings the Node risk/dispersion engines need.

The heavy lifting (cleaning ~thousands of price histories into weekly returns) stays in the separate
`workflow` dataset pipeline. This script only freezes the LAST 156 WEEKS of the weekly return panel
(the 1y and 3y windows calculator.py uses) plus the calculator config into one small JSON file, so
the Node server never needs Python, pandas or parquet at runtime.

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

WEEKS = 156
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

reg = mk.REG.loc[asof]
regime = {k: (float(v) if isinstance(v, (int, float, np.floating)) and not isinstance(v, bool) else bool(v) if isinstance(v, (bool, np.bool_)) else v)
          for k, v in reg.items() if k != "asof_jalali"}

meta_model = json.load(open(WF / "clean" / "models" / "model_meta.json", encoding="utf-8"))
pack = {
    "meta": {
        "asof": str(asof.date()),
        "weeks": WEEKS,
        "periods_per_year": calc.PPY,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "workflow dataset (tgju.org + tsetmc.com weekly returns, cleaned by pipeline/02-03)",
        "stock_basket_members": top30,
        "crypto_alt_basket_members": alts_ok,
        "usd_toman": float(mk.usd_week.loc[asof]),
    },
    "dates": dates,
    "series": series,
    "series_valid_3y": valid_3y,
    "regime": regime,
    "config": {
        "liq_factor": calc.LIQ,
        "score": calc.SC,
        "flags": calc.FL,
        "risk_classes": {k: v for k, v in calc.RISK_CLASS.items()},
        "broad_list": calc.BROAD_LIST,
        "risk_list": calc.RISK_LIST,
    },
    "forward_baseline_b2": meta_model["baselines"]["B2"],
}

out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"wrote {out}  ({out.stat().st_size / 1024:.1f} KB)  as-of {asof.date()}  weeks={WEEKS}  series={len(series)}")
for k, v in series.items():
    fin = sum(x is not None for x in v)
    print(f"  {k:20s} finite {fin}/{WEEKS}")
