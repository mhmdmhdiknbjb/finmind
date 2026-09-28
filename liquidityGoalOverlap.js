import { computeLiquidity } from "./liquidityEngine.js";
import { cashOpportunityCost } from "./cashErosion.js";

/**
 * Does money earmarked for a NEAR financial goal eat into the emergency buffer? Fully deterministic (no model).
 *
 * A goal counts as "near" when its deadline is within NEAR_GOAL_MONTHS. The part of such a goal that monthly saving
 * cannot cover by itself (targetAmount - monthly saving capacity x months, in today's toman — the same saving capacity
 * goalEngine.js uses) has to come out of holdings that are already liquid. Near goals are served in order of deadline;
 * each takes from the semi-liquid holdings first (gold, stocks... are sold to fund a goal without touching the
 * emergency money) and only the remainder spills onto the immediately available money — that spill is `overlapAmount`.
 * The buffer is still covered when what is left of the immediate money is at least the recommended buffer.
 *
 * goalEngine.js is imported (not liquidityEngine.js importing it) so the dependency stays one-directional:
 * goalEngine -> liquidityEngine.
 */
export const NEAR_GOAL_MONTHS = 12;

export function computeGoalLiquidityOverlap(profile, liquidity = computeLiquidity(profile)) {
  const monthlyIncome = Number(profile.monthlyIncome) || 0;
  const monthlyExpenses = Number(profile.monthlyExpenses) || 0;
  const existingDebt = Number(profile.existingDebt) || 0;
  const savingCapacity = Math.max(0, monthlyIncome - monthlyExpenses - existingDebt);

  const immediate = liquidity.availableByPeriod.immediate;
  const semiLiquid = liquidity.breakdown.filter((b) => b.tier === "semiLiquid").reduce((s, b) => s + b.amount, 0);

  const nearGoals = (profile.goals || [])
    .map((g) => ({ title: g.title || "هدف بدون عنوان", targetAmount: Math.max(0, Number(g.targetAmount) || 0), targetMonths: Math.max(1, Math.round(Number(g.targetMonths) || 0)) }))
    .filter((g) => g.targetAmount > 0 && g.targetMonths > 0 && g.targetMonths <= NEAR_GOAL_MONTHS)
    .sort((a, b) => a.targetMonths - b.targetMonths);

  let semiLeft = semiLiquid;
  const conflictsWithGoals = [];
  let totalSpill = 0;
  for (const g of nearGoals) {
    const need = Math.max(0, g.targetAmount - savingCapacity * g.targetMonths);
    const fromSemi = Math.min(need, semiLeft);
    semiLeft -= fromSemi;
    const spill = need - fromSemi;
    if (spill > 0) {
      totalSpill += spill;
      conflictsWithGoals.push({ goalTitle: g.title, goalTargetMonths: g.targetMonths, overlapAmount: Math.round(spill) });
    }
  }

  const immediateAfterGoals = Math.max(0, immediate - totalSpill);
  return {
    nearGoalCount: nearGoals.length,
    conflictsWithGoals,
    bufferStillCovered: liquidity.recommendedBuffer <= 0 ? true : immediateAfterGoals >= liquidity.recommendedBuffer,
    immediateAfterGoals: Math.round(immediateAfterGoals),
    // months of expenses the immediate money still covers once the near goals have taken their share (null: expenses unknown)
    runwayMonthsAfterGoals: monthlyExpenses > 0 ? Math.round((immediateAfterGoals / monthlyExpenses) * 10) / 10 : null,
  };
}

/** computeLiquidity + the goal overlap: everything the liquidity page and its prompt show. */
export function computeLiquidityAnalysis(profile) {
  const liquidity = computeLiquidity(profile);
  const goalOverlap = computeGoalLiquidityOverlap(profile, liquidity);
  // idle cash = plain rial cash above the buffer AND above what near goals still need from the immediate money
  const excessCash = liquidity.recommendedBuffer > 0 ? Math.max(0, Math.min(liquidity.cashAmount, goalOverlap.immediateAfterGoals - liquidity.recommendedBuffer)) : 0;
  return { ...liquidity, goalOverlap, excessCash: Math.round(excessCash), excessCashOpportunityCost: cashOpportunityCost(excessCash) };
}
