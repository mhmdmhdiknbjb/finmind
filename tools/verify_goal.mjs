// Goal engine sanity checks: the money already owned must count, the goal's own price growth must count,
// and every figure must agree with the others.
import { evaluateGoal } from "../goalEngine.js";
let fail = 0;
const check = (name, ok, info = "") => { if (!ok) fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); };
const base = { monthlyIncome: 50e6, monthlyExpenses: 33e6, existingDebt: 0, riskTolerance: 5, horizonYears: 5 };
const withAssets = { ...base, assets: [{ category: "cash", kind: "deposit_short", amount: 438.6e6 }] };
const noAssets = { ...base, assets: [] };
const flatGoal = { title: "x", targetAmount: 1e9, targetMonths: 60, priceGrowthPercent: 0 };

const a = evaluateGoal(withAssets, flatGoal);
const b = evaluateGoal(noAssets, flatGoal);
const r = Math.pow(1 + a.assumedAnnualReturnPercent / 100, 1 / 12) - 1;
const fv = (L, P, n) => L * Math.pow(1 + r, n) + (P * (Math.pow(1 + r, n) - 1)) / r;

// ---- flat target (priceGrowthPercent 0): pure time-value-of-money
check("no assets: months matches annuity", Math.abs(fv(0, 17e6, b.monthsNeededAtCurrentPace) - 1e9) < 17e6 * 1.5, `(${b.monthsNeededAtCurrentPace})`);
check("existing assets shorten the time", a.monthsNeededAtCurrentPace < b.monthsNeededAtCurrentPace);
check("months is the first month reaching the goal", fv(438.6e6, 17e6, a.monthsNeededAtCurrentPace) >= 1e9 && fv(438.6e6, 17e6, a.monthsNeededAtCurrentPace - 1) < 1e9);
check("projected at deadline = lump growth + annuity", Math.abs(a.projectedAmountAtDeadline / fv(438.6e6, 17e6, 60) - 1) < 0.005);
check("split adds up", Math.abs(a.projectedFromExistingAssets / a.projectedAmountAtDeadline - fv(438.6e6, 0, 60) / fv(438.6e6, 17e6, 60)) < 0.005);
const big = evaluateGoal(withAssets, { ...flatGoal, targetAmount: 3e9 });
check("required saving with the lump reaches the goal", big.requiredMonthlySaving > 0 && Math.abs(fv(438.6e6, big.requiredMonthlySaving, 60) / 3e9 - 1) < 0.005, `(${big.requiredMonthlySaving})`);
check("feasible <=> projection >= target", a.feasible === (a.projectedAmountAtDeadline >= 1e9));
const rich = evaluateGoal({ ...base, assets: [{ category: "cash", kind: "deposit_short", amount: 3e9 }] }, flatGoal);
check("lump alone covers the goal", rich.monthsNeededAtCurrentPace === 0 && rich.requiredMonthlySaving === 0);
const house = evaluateGoal({ ...base, assets: [{ category: "realestate", amount: 5e9 }] }, flatGoal);
check("real estate is not counted as goal capital", house.startingCapital === 0);

// ---- the goal's own price growth (default 30%/yr when not given)
const grown = evaluateGoal(withAssets, { title: "x", targetAmount: 1e9, targetMonths: 60 });
check("default price growth is applied", grown.priceGrowthPercent === 30);
check("target at deadline = amount x (1+g)^years", Math.abs(grown.targetAtDeadline / (1e9 * Math.pow(1.3, 5)) - 1) < 0.001, `(${grown.targetAtDeadline})`);
check("price growth makes the goal take longer than the flat reading", grown.monthsNeededAtCurrentPace > grown.ifPriceStaysFlat.monthsNeededAtCurrentPace, `(${grown.monthsNeededAtCurrentPace} vs flat ${grown.ifPriceStaysFlat.monthsNeededAtCurrentPace})`);
check("flat reading equals the priceGrowth=0 engine result", grown.ifPriceStaysFlat.monthsNeededAtCurrentPace === a.monthsNeededAtCurrentPace);
const g = Math.pow(1.3, 1 / 12) - 1;
const hit = grown.monthsNeededAtCurrentPace;
check("months = first month the pot reaches the GROWN price", hit !== null && fv(438.6e6, 17e6, hit) >= 1e9 * Math.pow(1 + g, hit) * 0.995 && (hit === 0 || fv(438.6e6, 17e6, hit - 1) < 1e9 * Math.pow(1 + g, hit - 1) * 1.005));
const grownBig = evaluateGoal(withAssets, { title: "x", targetAmount: 1e9, targetMonths: 60, priceGrowthPercent: 60 });
check("faster price growth needs more saving / more months", grownBig.requiredMonthlySaving >= grown.requiredMonthlySaving);
check("feasible flag agrees with projection vs grown target", grown.feasible === (grown.projectedAmountAtDeadline >= grown.targetAtDeadline - 1));
process.exit(fail ? 1 : 0);
