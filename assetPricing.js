import { fetchLiveRates } from "./marketFeed.js";

/**
 * Gold, currency, and crypto holdings are entered by the user as a
 * QUANTITY (grams of gold, units of a specific currency, coins of a
 * specific crypto) — never a toman amount they'd have to guess and keep
 * updating by hand. Their toman value is always computed on the fly from
 * the live rate (BrsApi.ir) at the moment of analysis.
 *
 * A short in-memory cache avoids hammering the external feed on every
 * request; on a feed failure we fall back to the last known good rate
 * rather than breaking every widget that touches a portfolio with these
 * asset types in it.
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

/** Toman price of one unit of `quantity` for this asset, or null if not a live-priced category. */
function unitPriceToman(asset, rates) {
  if (asset.category === "gold") return rates.goldTomanPerGram;
  if (asset.category === "currency") return rates.currencies[asset.symbol || "USD"] ?? rates.usdToman;
  if (asset.category === "crypto") {
    const usdPrice = rates.cryptos[asset.symbol || "BTC"];
    return usdPrice ? usdPrice * rates.usdToman : null;
  }
  return null;
}

/**
 * Returns a copy of the profile whose gold/currency/crypto assets have a
 * real, live-priced `amount` (quantity * current rate) alongside their
 * original `quantity`/`symbol`. Every other asset category passes through
 * unchanged. Also returns the rates used, so callers can show/explain the
 * conversion.
 */
export async function resolveProfileAssets(profile) {
  let rates;
  try {
    rates = await getLiveRates();
  } catch {
    return { ...profile, assets: profile.assets || [], _liveRates: null };
  }

  const assets = (profile.assets || []).map((a) => {
    const price = unitPriceToman(a, rates);
    if (price === null || price === undefined) return a;
    const quantity = Number(a.quantity) || 0;
    return { ...a, quantity, amount: Math.round(quantity * price) };
  });
  return { ...profile, assets, _liveRates: rates };
}
