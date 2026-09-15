import { ASSET_STATS, optimizePortfolio, portfolioStats } from "./optimizer.js";

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
 * Required monthly contribution (ordinary annuity, PMT) to reach `futureValue`
 * in `months` months at monthly rate `r`.
 */
function requiredPayment(futureValue, months, r) {
  if (r <= 1e-9) return futureValue / months;
  return (futureValue * r) / (Math.pow(1 + r, months) - 1);
}

/** How many months of saving `payment`/month at rate `r` it actually takes to reach `futureValue`. */
function monthsToReach(futureValue, payment, r) {
  if (payment <= 0) return null;
  if (r <= 1e-9) return futureValue / payment;
  const inside = 1 + (futureValue * r) / payment;
  if (inside <= 0) return null;
  return Math.log(inside) / Math.log(1 + r);
}

/** Amount actually accumulated after `months` of saving `payment`/month at rate `r`. */
function futureValueOfSavings(payment, months, r) {
  if (r <= 1e-9) return payment * months;
  return (payment * (Math.pow(1 + r, months) - 1)) / r;
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

  const requiredMonthlySaving = requiredPayment(targetAmount, targetMonths, monthlyRate);
  const monthlySurplus = currentMonthlySavingCapacity - requiredMonthlySaving;
  const feasible = monthlySurplus >= 0;

  const monthsNeededAtCurrentPaceRaw = monthsToReach(targetAmount, currentMonthlySavingCapacity, monthlyRate);
  const projectedAmountAtDeadline = futureValueOfSavings(currentMonthlySavingCapacity, targetMonths, monthlyRate);

  return {
    targetAmount,
    targetMonths,
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
  };
}
