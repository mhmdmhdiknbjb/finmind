import { fetchLiveRates } from "./marketFeed.js";

/**
 * Gold and currency holdings are entered by the user as a QUANTITY (grams
 * of gold, units of foreign currency) — never a toman amount they'd have to
 * guess and keep updating by hand. Their toman value is always computed
 * on the fly from the live rate at the moment of analysis, per the user's
 * explicit request: "با محاسبه‌ی قیمت آنی به تومان محاسبه بشه."
 *
 * A short in-memory cache avoids hammering the external feed on every
 * request; on a feed failure we fall back to the last known good rate
 * rather than breaking every widget that touches a portfolio with gold or
 * currency in it.
 */

const CACHE_MS = 10 * 60 * 1000;
let cache = null; // { rates, fetchedAt }

export async function getLiveRates() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.rates;
  try {
    const rates = await fetchLiveRates();
    cache = { rates, fetchedAt: Date.now() };
    return rates;
  } catch (err) {
    if (cache) return cache.rates;
    throw err;
  }
}

function priceFor(category, rates) {
  if (category === "gold") return rates.goldTomanPerGram;
  if (category === "currency") return rates.usdToman;
  return null;
}

/**
 * Returns a copy of the profile whose gold/currency assets have a real,
 * live-priced `amount` (quantity * current rate) alongside their original
 * `quantity`. Every other asset category passes through unchanged. Also
 * returns the rates used, so callers can show/explain the conversion.
 */
export async function resolveProfileAssets(profile) {
  const rates = await getLiveRates();
  const assets = (profile.assets || []).map((a) => {
    const price = priceFor(a.category, rates);
    if (price === null) return a;
    const quantity = Number(a.quantity) || 0;
    return { ...a, quantity, amount: Math.round(quantity * price) };
  });
  return { ...profile, assets, _liveRates: rates };
}
