import { ASSET_ORDER, ASSET_STATS, currentWeights } from "./optimizer.js";
import { ASSET_KINDS } from "./public/assetCatalog.js";

/**
 * Deterministic liquidity classification.
 *
 * The liquidity widget used to ask the LLM to bucket each asset into
 * نقد سریع/نیمه‌نقد/غیرنقد on every call — with no fixed rule, the same
 * asset (e.g. gold) could land in a different bucket from one run to the
 * next. Each asset category now has a FIXED tier and an estimated months-
 * to-liquidate, derived from the same `liquidity` score already used as a
 * hard constraint in optimizer.js, so "how liquid is gold" always gets the
 * same, explainable answer.
 */

const TIER_BY_CATEGORY = {
  cash: { tier: "liquid", monthsToLiquidate: 0, note: "قابل برداشت فوری" },
  currency: { tier: "liquid", monthsToLiquidate: 0.1, note: "معمولاً ظرف چند روز قابل فروش است" },
  fund: { tier: "liquid", monthsToLiquidate: 0.25, note: "ابطال واحدهای صندوق معمولاً طی چند روز کاری انجام می‌شود" },
  gold: { tier: "semiLiquid", monthsToLiquidate: 0.5, note: "قابل فروش نسبتاً سریع، اما با اسپرد/حباب قیمتی" },
  crypto: { tier: "semiLiquid", monthsToLiquidate: 0.25, note: "در بازار جهانی سریع نقد می‌شود، اما محدودیت‌های ارزی/قانونی داخلی ممکن است فرآیند را کند کند" },
  stock: { tier: "semiLiquid", monthsToLiquidate: 0.5, note: "تسویه T+2 و محدودیت‌های دامنه نوسان بورس تهران می‌تواند فروش کامل را کند کند" },
  other: { tier: "semiLiquid", monthsToLiquidate: 1, note: "بسته به نوع دارایی متغیر است؛ فرض میانه در نظر گرفته شده" },
  realestate: { tier: "illiquid", monthsToLiquidate: 6, note: "فروش ملک در ایران معمولاً چند ماه طول می‌کشد" },
  // finer categories (public/assetCatalog.js) get their own tier instead of being lumped into «سایر»
  metals: { tier: "semiLiquid", monthsToLiquidate: 0.5, note: "نقره و فلزات معمولاً با اسپرد و چند روز زمان فروش نقد می‌شوند" },
  bond: { tier: "semiLiquid", monthsToLiquidate: 1, note: "اوراق بدهی در بازار ثانویه قابل فروش‌اند ولی عمق معاملات محدود است" },
  vehicle: { tier: "illiquid", monthsToLiquidate: 2, note: "فروش خودرو معمولاً چند هفته تا چند ماه زمان می‌برد و به قیمت روز بازار بستگی دارد" },
  business: { tier: "illiquid", monthsToLiquidate: 12, note: "سهم غیربورسی یا کسب‌وکار بازار ثانویه‌ی روشنی ندارد؛ نقد شدنش ماه‌ها تا سال‌ها طول می‌کشد" },
  insurance: { tier: "illiquid", monthsToLiquidate: 12, note: "بیمه و پس‌انداز بازنشستگی با جریمه یا محدودیت قابل برداشت است" },
  collectibles: { tier: "illiquid", monthsToLiquidate: 6, note: "کالاهای کلکسیونی و تجهیزات باید خریدار پیدا کنند؛ قیمت فروش نامطمئن است" },
  receivable: { tier: "illiquid", monthsToLiquidate: 6, note: "زمان وصول طلب، چک یا ودیعه به طرف مقابل بستگی دارد" },
};

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Deterministic liquidity breakdown for the current portfolio: tier
 * percentages, a cumulative available-by-period schedule, and a warning if
 * the liquid+near-liquid portion can't cover a stated liquidity need.
 */
export function computeLiquidity(profile) {
  const { total } = currentWeights(profile.assets);

  // grouped by the FINE category (خودرو، اوراق بدهی، ...) so each gets its own liquidity tier
  const amounts = {};
  for (const a of profile.assets || []) {
    const cat = TIER_BY_CATEGORY[a.category] ? a.category : ASSET_KINDS[a.category]?.engine || "other";
    amounts[cat] = (amounts[cat] || 0) + (Number(a.amount) || 0);
  }
  const order = [...ASSET_ORDER, ...Object.keys(TIER_BY_CATEGORY).filter((k) => !ASSET_ORDER.includes(k))];
  const breakdown = order.filter((k) => (amounts[k] || 0) > 0 && total > 0 && amounts[k] / total > 0.0001).map((k) => ({
    category: k,
    amount: amounts[k],
    percent: (amounts[k] / total) * 100,
    ...TIER_BY_CATEGORY[k],
  }));

  const tierTotals = { liquid: 0, semiLiquid: 0, illiquid: 0 };
  for (const b of breakdown) tierTotals[b.tier] += b.amount;

  const byPeriod = { immediate: 0, oneMonth: 0, threeMonths: 0, oneYear: 0 };
  for (const b of breakdown) {
    if (b.monthsToLiquidate <= 0.1) byPeriod.immediate += b.amount;
    if (b.monthsToLiquidate <= 1) byPeriod.oneMonth += b.amount;
    if (b.monthsToLiquidate <= 3) byPeriod.threeMonths += b.amount;
    if (b.monthsToLiquidate <= 12) byPeriod.oneYear += b.amount;
  }

  const monthlyExpenses = Number(profile.monthlyExpenses) || 0;
  const recommendedBuffer = monthlyExpenses * 3;
  const shortfall = recommendedBuffer > 0 ? Math.max(0, recommendedBuffer - byPeriod.immediate) : 0;

  return {
    total,
    breakdown,
    liquidPercent: total > 0 ? Math.round(clamp((tierTotals.liquid / total) * 1000, 0, 1000)) / 10 : 0,
    semiLiquidPercent: total > 0 ? Math.round(clamp((tierTotals.semiLiquid / total) * 1000, 0, 1000)) / 10 : 0,
    illiquidPercent: total > 0 ? Math.round(clamp((tierTotals.illiquid / total) * 1000, 0, 1000)) / 10 : 0,
    availableByPeriod: {
      immediate: Math.round(byPeriod.immediate),
      oneMonth: Math.round(byPeriod.oneMonth),
      threeMonths: Math.round(byPeriod.threeMonths),
      oneYear: Math.round(byPeriod.oneYear),
    },
    recommendedBuffer,
    shortfall: Math.round(shortfall),
  };
}
