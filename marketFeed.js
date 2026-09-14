/**
 * Real, free, no-key, no-signup market data feed.
 *
 * Source: fawazahmed0/currency-api, hosted on the jsDelivr CDN — a live,
 * daily-updated JSON currency/commodity dataset with no rate limit. It is
 * reachable directly from this server (verified) and gives us:
 *   - usd -> irr: how many rial one US dollar buys
 *   - xau -> usd: the international gold price per troy ounce
 *
 * Honesty note: this is a general/global rate feed, not Iran's informal
 * free-market (بازار آزاد) rate specifically, and the gold figure is the
 * world price with no adjustment for the local coin-market premium
 * ("حباب سکه"). It's still real, live data — a meaningful upgrade over a
 * fully synthetic series — but should be described to the user as such,
 * not as an authoritative Iranian market quote.
 */

const BASE = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies";
const GRAMS_PER_OUNCE = 31.1034768;

async function fetchJSON(url, timeoutMs = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`market feed request failed: ${res.status}`);
  return res.json();
}

/**
 * Returns live { usdToman, goldTomanPerGram, date, source } or throws if
 * the feed is unreachable — callers should catch and fall back gracefully.
 */
export async function fetchLiveRates() {
  const [usdData, xauData] = await Promise.all([fetchJSON(`${BASE}/usd.json`), fetchJSON(`${BASE}/xau.json`)]);
  const usdIrr = usdData.usd.irr;
  const usdToman = usdIrr / 10;
  const xauUsdPerOunce = xauData.xau.usd;
  const goldTomanPerGram = (xauUsdPerOunce / GRAMS_PER_OUNCE) * usdToman;

  return {
    fetchedAt: new Date().toISOString(),
    date: usdData.date,
    usdToman: Math.round(usdToman),
    goldTomanPerGram: Math.round(goldTomanPerGram),
    source: "fawazahmed0/currency-api (jsDelivr) — نرخ جهانی/عمومی؛ نرخ بازار آزاد ایران یا حباب سکه در آن لحاظ نشده",
  };
}
