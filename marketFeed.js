/**
 * Real, live market data feed — BrsApi.ir free Gold/Currency/Crypto
 * webservice (https://brsapi.ir/free-api-gold-currency-webservice/).
 * Unlike the previous generic feed, this one quotes gold and currency
 * directly in Toman for the Iranian market (gold per gram at 18-karat
 * purity, the figure Iranians actually reference day-to-day), plus a full
 * cryptocurrency list in USD. Free tier: up to 1500 requests/day, no
 * payment required.
 */

import { BRSAPI_KEY } from "./config.js";

const ENDPOINT = "https://Api.BrsApi.ir/Market/Gold_Currency.php";

async function fetchJSON(url, timeoutMs = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`BrsApi request failed: ${res.status}`);
  return res.json();
}

/**
 * Returns live rates or throws if the feed/key is unreachable — callers
 * should catch and fall back gracefully.
 *   goldTomanPerGram : 18-karat gold price per gram, Toman
 *   currencies       : { USD: tomanPrice, EUR: tomanPrice, ... }
 *   cryptos          : { BTC: usdPrice, ETH: usdPrice, ... }
 */
export async function fetchLiveRates() {
  if (!BRSAPI_KEY) throw new Error("BRSAPI_KEY تنظیم نشده است");

  const data = await fetchJSON(`${ENDPOINT}?key=${encodeURIComponent(BRSAPI_KEY)}`);
  if (data.successful === false) throw new Error(data.message_error || "BrsApi error");

  const gold18k = (data.gold || []).find((g) => g.symbol === "IR_GOLD_18K");
  if (!gold18k) throw new Error("قیمت طلای ۱۸ عیار در پاسخ BrsApi یافت نشد");

  const currencies = {};
  for (const c of data.currency || []) currencies[c.symbol] = c.price;

  const cryptos = {};
  for (const c of data.cryptocurrency || []) cryptos[c.symbol] = Number(c.price);

  if (!currencies.USD) throw new Error("نرخ دلار در پاسخ BrsApi یافت نشد");

  return {
    fetchedAt: new Date().toISOString(),
    date: data.date,
    time: data.time,
    usdToman: currencies.USD,
    goldTomanPerGram: gold18k.price,
    currencies,
    cryptos,
    source: "BrsApi.ir (نرخ آزاد بازار ایران)",
  };
}
