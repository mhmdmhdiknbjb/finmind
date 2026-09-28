import { getMarketPack } from "./marketData.js";

/**
 * Rial cash earns no price appreciation while the dollar and gold — the two inflation yardsticks of the Iranian market
 * used across this project — kept rising. This is the ONE place that reads those yardsticks (the market pack's trailing
 * 52-week returns): portfolioRisk.js uses the rates for the composite risk's cash-erosion term, and liquidityEngine.js
 * turns the same rates into a concrete toman figure for excess cash.
 *
 * Bank-deposit interest is not modelled (the market pack has no deposit-rate series), so the figures are the
 * opportunity cost of holding plain rial cash, not a forecast: the past year's growth is not a promise about the next.
 */

/** Trailing-52-week growth of the dollar and gold (fractions, 1.0 = +100%), or null when the market pack is missing. */
export function erosionRates(regime = getMarketPack()?.regime) {
  if (!regime || !Number.isFinite(regime.usd_ret_52w) || !Number.isFinite(regime.gold_ret_52w)) return null;
  return { usd: regime.usd_ret_52w, gold: regime.gold_ret_52w };
}

/**
 * What `amount` toman of rial cash would have gained over the last 52 weeks had it been in dollars / gold instead
 * (amount × trailing return — the same product portfolioRisk.js reports as cashShareXUsd1y / cashShareXGold1y, applied
 * to a toman amount instead of a portfolio share). Null when there is no cash or no market pack.
 */
export function cashOpportunityCost(amount, regime = getMarketPack()?.regime) {
  const rates = erosionRates(regime);
  const amt = Number(amount) || 0;
  if (!rates || amt <= 0) return null;
  return {
    amount: Math.round(amt),
    usdRatePercent: Math.round(rates.usd * 1000) / 10,
    goldRatePercent: Math.round(rates.gold * 1000) / 10,
    vsUsd: Math.round(amt * rates.usd),
    vsGold: Math.round(amt * rates.gold),
  };
}
