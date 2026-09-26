// Sanity checks for the scenario simulator (monteCarlo.js): the median effect of a shock must be
// (share of the shocked asset) x (shock), the shock size itself must be uncertain, and assets the
// scenario does not touch must only carry the short scenario-horizon spread, not a full year of volatility.
import { simulateShock } from "../monteCarlo.js";
let fail = 0;
const check = (name, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: got ${got}, want ${want} ±${tol}`);
};
const checkTrue = (name, cond, info = "") => {
  if (!cond) fail++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name} ${info}`);
};
const mk = (cash, gold, stock = 0) => ({
  assets: [{ category: "cash", amount: cash }, { category: "gold", amount: gold }, { category: "stock", amount: stock }].filter((a) => a.amount > 0),
});

const N = 30000;
check("100% gold, gold -100% (cannot go below -100)", simulateShock(mk(0, 100), { gold: -1 }, N).portfolio.p50Percent, -100, 0.01);
check("100% gold, gold -20%: median", simulateShock(mk(0, 100), { gold: -0.2 }, N).portfolio.p50Percent, -20, 0.6);
check("54.4% gold, gold -20%: median ~ -10.9", simulateShock(mk(456, 544), { gold: -0.2 }, N).portfolio.p50Percent, -10.88, 1.5);
check("no gold held, gold -20%: median ~ 0", simulateShock(mk(100, 0), { gold: -0.2 }, N).portfolio.p50Percent, 0, 1.5);

const r = simulateShock(mk(456, 544, 0), { gold: -0.2 }, N);
const gold = r.impactByAsset.find((a) => a.category === "gold");
const cash = r.impactByAsset.find((a) => a.category === "cash");
checkTrue("shocked asset has an uncertainty band", gold.p85 - gold.p15 > 0.06, `(width ${(100 * (gold.p85 - gold.p15)).toFixed(1)} pt)`);
check("shock size band ~ ±25% of the shock (p15..p85 width ~10 pt)", 100 * (gold.p85 - gold.p15), 10.4, 2);
checkTrue("untouched cash: narrow band (3-month horizon, not a year of volatility)", cash.p85 - cash.p15 < 0.05, `(width ${(100 * (cash.p85 - cash.p15)).toFixed(1)} pt)`);

const r2 = simulateShock(mk(300, 300, 400), { gold: -0.2 }, N);
const stock = r2.impactByAsset.find((a) => a.category === "stock");
checkTrue("stock's band is conditional on the gold shock, about half of its whole-year spread (3 months = half the volatility)", stock.p85 - stock.p15 < 0.38, `(width ${(100 * (stock.p85 - stock.p15)).toFixed(1)} pt; was ~67 pt)`);
checkTrue("reports the scenario horizon", r2.horizonMonths === 3);
process.exit(fail ? 1 : 0);
