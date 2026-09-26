import { ASSET_STATS, optimizePortfolio } from "./optimizer.js";
import { computeLiquidity } from "./liquidityEngine.js";

/**
 * Phase 1-style deterministic engine for the "اهداف مالی" (financial goals)
 * widget. Previously this widget asked the LLM to compute
 * requiredMonthlySaving / currentMonthlySavingCapacity / feasibility itself
 * — plain arithmetic (income - expenses, a time-value-of-money annuity)
 * handed to a language model, which is exactly the kind of number that
 * should never be guessed. This module computes all of that with a real
 * annuity (time-value-of-money) formula, the same way optimizer.js and
 * monteCarlo.js compute the numbers for the other widgets; the LLM is only
 * ever shown these outputs and asked to narrate them in Persian.
 *
 * Assumed growth rate on the money saved toward a goal is tiered by how far
 * away the deadline is — short-horizon goal money shouldn't be assumed to
 * earn a volatile long-term-portfolio return, so it borrows the same
 * cash/fund planning assumptions from optimizer.js's ASSET_STATS; only a
 * long-horizon goal (>36 months) is assumed to grow at the user's own
 * risk-adjusted optimal-portfolio return (from the QP optimizer).
 */

function monthlyRateFromAnnual(annualRate) {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function assumedAnnualReturn(targetMonths, profile) {
  if (targetMonths <= 12) {
    return { rate: ASSET_STATS.cash.expectedReturn, tier: "کوتاه‌مدت (تا ۱۲ ماه) — فرض نرخ رشد نزدیک به نقد/سپرده" };
  }
  if (targetMonths <= 36) {
    const rate = (ASSET_STATS.cash.expectedReturn + ASSET_STATS.fund.expectedReturn) / 2;
    return { rate, tier: "میان‌مدت (۱ تا ۳ سال) — فرض ترکیب محافظه‌کارانه نقد و صندوق" };
  }
  const computed = optimizePortfolio(profile);
  return { rate: computed.optimal.expectedReturn, tier: "بلندمدت (بیش از ۳ سال) — فرض بازده سبد بهینه‌ی متناسب با ریسک‌پذیری خودت" };
}

/**
 * Time-value-of-money with a starting lump sum L (the money already owned) and a monthly payment P at monthly rate r:
 *   FV(n) = L(1+r)^n + P((1+r)^n - 1)/r
 * The first version only annuitised the new savings, so a user holding 438M today was told the goal takes 38 months
 * instead of ~18 and that the pot at the deadline was 2.1B instead of ~3.8B: the growth of what they already own
 * was left out of every figure.
 */
function futureValue(lump, payment, months, r) {
  const g = Math.pow(1 + r, months);
  return lump * g + (r <= 1e-9 ? payment * months : (payment * (g - 1)) / r);
}

/** Monthly contribution needed so that lump + contributions reach `target` in `months` (0 when the lump alone gets there). */
function requiredPayment(target, lump, months, r) {
  const gap = target - lump * Math.pow(1 + r, months);
  if (gap <= 0) return 0;
  if (r <= 1e-9) return gap / months;
  return (gap * r) / (Math.pow(1 + r, months) - 1);
}

/** Months until lump + `payment`/month reaches `target`: 0 if already there, null if it never does. */
function monthsToReach(target, lump, payment, r) {
  if (target <= lump) return 0;
  if (payment <= 0 && lump <= 0) return null;
  if (r <= 1e-9) return payment > 0 ? (target - lump) / payment : null;
  const k = payment / r;
  const ratio = (target + k) / (lump + k);
  return ratio > 1 ? Math.log(ratio) / Math.log(1 + r) : null;
}

/** Money already owned that can fund a goal: liquid + semi-liquid holdings (a house or a car is not spent on a goal). */
function startingCapital(profile) {
  const liq = computeLiquidity(profile);
  return liq.breakdown.filter((b) => b.tier !== "illiquid").reduce((sum, b) => sum + b.amount, 0);
}

/**
 * The ONE place goal feasibility is decided. The goals widget, the chat/risk/liquidity prompts and the answer
 * validator all call this, so a page can never say "your saving is not enough" while the goals page says the goal
 * is reached in 18 months. `profile._engineRiskTolerance` (behaviour-adjusted tolerance) is used when present so the
 * assumed growth rate is the same in every caller.
 */
export function evaluateGoals(profile) {
  const engineProfile = { ...profile, riskTolerance: profile._engineRiskTolerance ?? profile.riskTolerance };
  return (profile.goals || []).map((goal) => ({ goal, result: evaluateGoal(engineProfile, goal) }));
}

export function evaluateGoal(profile, goal) {
  const targetAmount = Math.max(0, Number(goal?.targetAmount) || 0);
  const targetMonths = Math.max(1, Math.round(Number(goal?.targetMonths) || 1));

  const monthlyIncome = Number(profile.monthlyIncome) || 0;
  const monthlyExpenses = Number(profile.monthlyExpenses) || 0;
  const existingDebt = Number(profile.existingDebt) || 0;
  const currentMonthlySavingCapacity = Math.max(0, monthlyIncome - monthlyExpenses - existingDebt);

  const { rate: annualReturn, tier } = assumedAnnualReturn(targetMonths, profile);
  const monthlyRate = monthlyRateFromAnnual(annualReturn);

  const lump = startingCapital(profile);
  const requiredMonthlySaving = requiredPayment(targetAmount, lump, targetMonths, monthlyRate);
  const monthlySurplus = currentMonthlySavingCapacity - requiredMonthlySaving;
  const feasible = monthlySurplus >= 0;

  const monthsNeededAtCurrentPaceRaw = monthsToReach(targetAmount, lump, currentMonthlySavingCapacity, monthlyRate);
  const projectedAmountAtDeadline = futureValue(lump, currentMonthlySavingCapacity, targetMonths, monthlyRate);

  return {
    targetAmount,
    targetMonths,
    startingCapital: Math.round(lump),
    currentMonthlySavingCapacity: Math.round(currentMonthlySavingCapacity),
    requiredMonthlySaving: Math.round(requiredMonthlySaving),
    monthlySurplus: Math.round(monthlySurplus),
    feasible,
    assumedAnnualReturnPercent: Math.round(annualReturn * 1000) / 10,
    horizonTier: tier,
    monthsNeededAtCurrentPace:
      monthsNeededAtCurrentPaceRaw !== null && Number.isFinite(monthsNeededAtCurrentPaceRaw)
        ? Math.ceil(monthsNeededAtCurrentPaceRaw)
        : null,
    projectedAmountAtDeadline: Math.round(projectedAmountAtDeadline),
    projectedFromExistingAssets: Math.round(lump * Math.pow(1 + monthlyRate, targetMonths)),
  };
}
