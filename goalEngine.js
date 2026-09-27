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

/**
 * Assumed yearly price growth of what the goal buys (a house deposit, a car, tuition...). The dataset holds no
 * inflation or housing-price series, so this is a planning assumption, not a measurement: it is shown to the user, can be
 * set per goal (`priceGrowthPercent`), and the result WITHOUT price growth is always reported next to it. It is
 * deliberately of the same order as the growth assumed for the money itself (a 30% nominal return against a flat target
 * would treat the whole return as real profit, and told users a house deposit needed 18 months instead of 60).
 */
export const DEFAULT_GOAL_PRICE_GROWTH = 0.3;

/** First month n (0..MAX) where lump + payments reach a target that itself grows at monthly rate g; null if never. */
function monthsToReachGrowingTarget(target, growth, lump, payment, r) {
  const MAX = 600;
  for (let n = 0; n <= MAX; n++) {
    if (futureValue(lump, payment, n, r) >= target * Math.pow(1 + growth, n)) return n;
  }
  return null;
}

export function evaluateGoal(profile, goal) {
  const targetAmount = Math.max(0, Number(goal?.targetAmount) || 0);
  const targetMonths = Math.max(1, Math.round(Number(goal?.targetMonths) || 1));
  const growthPct = Number.isFinite(Number(goal?.priceGrowthPercent)) && goal?.priceGrowthPercent !== "" && goal?.priceGrowthPercent != null
    ? Math.min(300, Math.max(0, Number(goal.priceGrowthPercent)))
    : DEFAULT_GOAL_PRICE_GROWTH * 100;
  const priceGrowth = growthPct / 100;
  const monthlyGrowth = monthlyRateFromAnnual(priceGrowth);

  const monthlyIncome = Number(profile.monthlyIncome) || 0;
  const monthlyExpenses = Number(profile.monthlyExpenses) || 0;
  const existingDebt = Number(profile.existingDebt) || 0;
  const currentMonthlySavingCapacity = Math.max(0, monthlyIncome - monthlyExpenses - existingDebt);

  const { rate: annualReturn, tier } = assumedAnnualReturn(targetMonths, profile);
  const monthlyRate = monthlyRateFromAnnual(annualReturn);

  const lump = startingCapital(profile);

  // what the goal will cost when the deadline arrives, in future toman
  const targetAtDeadline = targetAmount * Math.pow(1 + monthlyGrowth, targetMonths);
  const requiredMonthlySaving = requiredPayment(targetAtDeadline, lump, targetMonths, monthlyRate);
  const monthlySurplus = currentMonthlySavingCapacity - requiredMonthlySaving;

  const projectedAmountAtDeadline = futureValue(lump, currentMonthlySavingCapacity, targetMonths, monthlyRate);
  const feasible = projectedAmountAtDeadline >= targetAtDeadline - 1;

  const monthsRaw = monthsToReachGrowingTarget(targetAmount, monthlyGrowth, lump, currentMonthlySavingCapacity, monthlyRate);

  // the same goal if its price stayed flat (today's toman): the optimistic reading, shown for comparison only
  const flatMonthsRaw = monthsToReach(targetAmount, lump, currentMonthlySavingCapacity, monthlyRate);
  const flatRequired = requiredPayment(targetAmount, lump, targetMonths, monthlyRate);

  const ceilOrNull = (v) => (v !== null && Number.isFinite(v) ? Math.ceil(v) : null);

  /**
   * A goal can be `feasible: true` on a razor's edge (e.g. 98.5% of monthly capacity committed, one month of slack
   * out of 60) — technically reachable, but one small cost increase or income dip makes it not. `feasible` alone
   * hid that from every narrative text, which then called a wafer-thin margin a plain "strength". Two margins:
   *  - savingMarginPercent: how much of the required monthly saving is spare capacity (null when the lump alone
   *    covers the goal — requiredMonthlySaving is 0 and the ratio is undefined, not "infinite margin").
   *  - monthsMargin / monthsMarginPercent: how much slack the deadline itself has.
   * marginTier is the single field prompts/validators key off: "infeasible" | "tight" | "moderate" | "comfortable"
   * | "covered_by_capital" (already funded by what the user owns, no ongoing saving needed at all).
   */
  const savingMarginPercent = feasible && requiredMonthlySaving > 0 ? Math.round((monthlySurplus / requiredMonthlySaving) * 1000) / 10 : null;
  const monthsNeeded = ceilOrNull(monthsRaw);
  const monthsMargin = feasible && monthsNeeded !== null ? targetMonths - monthsNeeded : null;
  const monthsMarginPercent = monthsMargin !== null ? Math.round((monthsMargin / targetMonths) * 1000) / 10 : null;

  let marginTier;
  if (!feasible) marginTier = "infeasible";
  else if (requiredMonthlySaving <= 0) marginTier = "covered_by_capital";
  else if (savingMarginPercent < 10 || (monthsMarginPercent !== null && monthsMarginPercent < 10)) marginTier = "tight";
  else if (savingMarginPercent < 40 || (monthsMarginPercent !== null && monthsMarginPercent < 40)) marginTier = "moderate";
  else marginTier = "comfortable";

  return {
    targetAmount,
    targetMonths,
    priceGrowthPercent: Math.round(growthPct * 10) / 10,
    targetAtDeadline: Math.round(targetAtDeadline),
    startingCapital: Math.round(lump),
    currentMonthlySavingCapacity: Math.round(currentMonthlySavingCapacity),
    requiredMonthlySaving: Math.round(requiredMonthlySaving),
    monthlySurplus: Math.round(monthlySurplus),
    feasible,
    savingMarginPercent,
    monthsMargin,
    monthsMarginPercent,
    marginTier,
    assumedAnnualReturnPercent: Math.round(annualReturn * 1000) / 10,
    horizonTier: tier,
    monthsNeededAtCurrentPace: monthsNeeded,
    projectedAmountAtDeadline: Math.round(projectedAmountAtDeadline),
    projectedFromExistingAssets: Math.round(lump * Math.pow(1 + monthlyRate, targetMonths)),
    ifPriceStaysFlat: {
      monthsNeededAtCurrentPace: ceilOrNull(flatMonthsRaw),
      requiredMonthlySaving: Math.round(flatRequired),
      feasible: projectedAmountAtDeadline >= targetAmount - 1,
    },
  };
}
