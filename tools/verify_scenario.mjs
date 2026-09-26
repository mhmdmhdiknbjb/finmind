// Sanity checks for the scenario simulator (monteCarlo.js): the shock must translate into
// (share of the shocked asset) x (shock) for the portfolio, no more and no less.
import { simulateShock } from "../monteCarlo.js";
let fail = 0;
const check = (name, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: got ${got}, want ${want} ±${tol}`);
};
const mk = (cash, gold) => ({ assets: [{ category: "cash", amount: cash }, { category: "gold", amount: gold }].filter((a) => a.amount > 0) });

check("100% gold, gold -100%", simulateShock(mk(0, 100), { gold: -1 }, 4000).portfolio.p50Percent, -100, 0.01);
check("100% gold, gold -20%", simulateShock(mk(0, 100), { gold: -0.2 }, 4000).portfolio.p50Percent, -20, 0.01);
// 54.4% gold: -20% gold ~ -10.9% (cash spillover from the correlation matrix is small)
check("54.4% gold, gold -20%", simulateShock(mk(456, 544), { gold: -0.2 }, 20000).portfolio.p50Percent, -10.88, 1.5);
check("no gold held, gold -20%", simulateShock(mk(100, 0), { gold: -0.2 }, 20000).portfolio.p50Percent, 0, 1.5);
check("shocked asset impact", simulateShock(mk(456, 544), { gold: -0.2 }, 4000).impactByAsset.find((a) => a.category === "gold").changePercent, -20, 0.01);
process.exit(fail ? 1 : 0);
