// Deterministic checks for the smart-liquidity engines: personalised buffer, runway, near-goal overlap, idle-cash cost.
// Run: node tools/verify_liquidity.mjs
import { computeLiquidity, recommendedBufferMonths } from "../liquidityEngine.js";
import { computeLiquidityAnalysis } from "../liquidityGoalOverlap.js";
import { cashOpportunityCost, erosionRates } from "../cashErosion.js";

let fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const base = { monthlyIncome: 60e6, monthlyExpenses: 30e6, existingDebt: 0, personal: { employmentType: "کارمند بخش دولتی", childrenCount: 0 }, assets: [{ category: "cash", amount: 400e6 }, { category: "gold", amount: 100e6 }], goals: [] };

// buffer months
check("plain employee = 3 months", recommendedBufferMonths(base).months, 3);
check("freelancer + 2 kids + debt = 3+2+1+1 = 7", recommendedBufferMonths({ ...base, existingDebt: 5e6, personal: { employmentType: "کسب‌وکار آزاد/فریلنسر", childrenCount: 2 } }).months, 7);
check("retired = 4", recommendedBufferMonths({ ...base, personal: { employmentType: "بازنشسته" } }).months, 4);
check("children add at most 1.5", recommendedBufferMonths({ ...base, personal: { employmentType: "کارمند بخش دولتی", childrenCount: 9 } }).months, 4.5);
check("capped at 9", recommendedBufferMonths({ ...base, existingDebt: 1, personal: { employmentType: "کارفرما و صاحب کسب‌وکار", childrenCount: 9 } }).months, 7.5);

// buffer amount + runway
const liq = computeLiquidity({ ...base, existingDebt: 5e6 });
check("buffer = months x expenses", liq.recommendedBuffer, 4 * 30e6);
check("runway = immediate / expenses", liq.runwayMonths, Math.round((liq.availableByPeriod.immediate / 30e6) * 10) / 10);
check("runway null without expenses", computeLiquidity({ ...base, monthlyExpenses: 0 }).runwayMonths, null);

// near-goal overlap: goal need = target - saving capacity x months; semi-liquid (gold) funds it first
const a1 = computeLiquidityAnalysis({ ...base, goals: [{ title: "الف", targetAmount: 450e6, targetMonths: 8 }] });
check("overlap spills only beyond gold: need 450-8*30=210, gold 100 -> 110", a1.goalOverlap.conflictsWithGoals, [{ goalTitle: "الف", goalTargetMonths: 8, overlapAmount: 110000000 }]);
check("buffer still covered", a1.goalOverlap.bufferStillCovered, true);
const a2 = computeLiquidityAnalysis({ ...base, assets: [{ category: "cash", amount: 250e6 }], goals: [{ title: "ب", targetAmount: 450e6, targetMonths: 8 }] });
check("buffer no longer covered when the goal eats the cash", a2.goalOverlap.bufferStillCovered, false);
check("far goals are ignored", computeLiquidityAnalysis({ ...base, goals: [{ title: "ج", targetAmount: 900e6, targetMonths: 24 }] }).goalOverlap.nearGoalCount, 0);

// idle cash: capped by rial cash, net of goal money; opportunity cost = excess x trailing return
const r = erosionRates();
check("no excess -> no cost", cashOpportunityCost(0), null);
const oc = cashOpportunityCost(100e6);
check("cost vs usd = amount x usd return", oc.vsUsd, Math.round(100e6 * r.usd));
check("excess <= cash", a1.excessCash <= a1.cashAmount, true);

console.log(fail ? `\n${fail} FAIL` : "\nall ok");
process.exit(fail ? 1 : 0);
