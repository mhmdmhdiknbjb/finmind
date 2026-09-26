import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLiveRates } from "./marketFeed.js";
import { kindOf, isQuantityAsset } from "./public/assetCatalog.js";

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

// Last good rates are also kept on disk: after a restart while the feed is down there is no in-memory cache, and gold /
// currency / crypto holdings would then be valued at 0 (the model saw "no gold"; risk and liquidity silently dropped it).
const RATES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "last_rates.json");

function readSavedRates() {
  try {
    return JSON.parse(fs.readFileSync(RATES_FILE, "utf-8"));
  } catch {
    return null;
  }
}

const CACHE_MS = 10 * 60 * 1000;
let cache = null; // { rates, fetchedAt }

export async function getLiveRates() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.rates;
  try {
    const rates = await fetchLiveRates();
    cache = { rates, fetchedAt: Date.now() };
    try {
      fs.mkdirSync(path.dirname(RATES_FILE), { recursive: true });
      fs.writeFileSync(RATES_FILE, JSON.stringify(rates), "utf-8");
    } catch {
      /* the disk copy is only a fallback */
    }
    return rates;
  } catch (err) {
    if (cache) return cache.rates;
    const saved = readSavedRates();
    if (saved) {
      console.warn("[rates] live feed failed, using the last saved rates:", String(err.message).slice(0, 100));
      return saved;
    }
    throw err;
  }
}

/** Toman price of one unit of `quantity` for this asset, or null if not a live-priced category. */
function unitPriceToman(asset, rates) {
  if (asset.category === "gold") {
    const live = kindOf(asset)?.live; // silver etc. have no live quote: they are entered as a toman amount
    if (!live) return null;
    return rates.gold?.[live] ?? (live === "IR_GOLD_18K" ? rates.goldTomanPerGram : null);
  }
  if (asset.category === "currency") return rates.currencies[asset.symbol || "USD"] ?? rates.usdToman;
  if (asset.category === "crypto") {
    const usdPrice = rates.cryptos[asset.symbol || "BTC"];
    return usdPrice ? usdPrice * rates.usdToman : null;
  }
  return null;
}

/**
 * Normalizes a batch of freshly-extracted assets (e.g. from the voice
 * assistant) so gold/currency/crypto rows always end up with a `quantity`:
 * if only a toman `amount` was captured ("۲۰۰ میلیون طلا دارم"), convert it
 * to a quantity at the current live rate; if a quantity was already given,
 * leave it as-is. Non-live-priced categories pass through unchanged.
 */
export async function normalizeExtractedAssets(assets) {
  if (!assets || !assets.length) return [];
  let rates = null;
  try {
    rates = await getLiveRates();
  } catch {
    /* fall through — live-priced categories without a quantity get dropped below */
  }

  const out = [];
  for (const a of assets) {
    if (!a || !a.category) continue;
    const kind = kindOf(a)?.id; // undefined for currency/crypto; falls back to the category default for an unknown id
    const probe = { category: a.category, symbol: a.symbol, kind };
    if (isQuantityAsset(probe)) {
      const symbol = a.symbol || (a.category === "crypto" ? "BTC" : "USD");
      let quantity = Number(a.quantity) || 0;
      if (quantity <= 0 && a.amount && rates) {
        const price = unitPriceToman({ ...probe, symbol }, rates);
        if (price) quantity = Number(a.amount) / price;
      }
      if (quantity > 0) out.push({ category: a.category, ...(a.category === "gold" ? { kind } : { symbol }), quantity, label: a.label || "" });
    } else {
      const amount = Number(a.amount) || 0;
      if (amount > 0) out.push({ category: a.category, ...(kind ? { kind } : {}), amount, label: a.label || "" });
    }
  }
  return out;
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

/**
 * Applies a confirmed decision's effect to the actual stored portfolio.
 * `changes` is the assetChanges list from promptDecision: [{category,
 * amountDelta}], a toman delta per category (never invented by the LLM in
 * isolation — it's a structured extraction of a decision the user just
 * confirmed they actually went through with). For gold/currency/crypto the
 * toman delta is converted to a quantity delta at the current live rate
 * (matching the same symbol already on that asset row, or a sensible
 * default — USD / BTC — for a brand-new row); other categories adjust
 * `amount` directly. Amounts/quantities never go below zero, and a
 * category with no existing row is only created for a net increase.
 */
export async function applyAssetChanges(profile, changes) {
  const assets = (profile.assets || []).map((a) => ({ ...a }));
  if (!changes || !changes.length) return assets;

  let rates = null;
  try {
    rates = await getLiveRates();
  } catch {
    // no live feed available: skip live-priced categories, still apply plain ones below
  }

  for (const change of changes) {
    const category = change?.category;
    const amountDelta = Number(change?.amountDelta);
    if (!category || !Number.isFinite(amountDelta) || amountDelta === 0) continue;

    if (category === "gold" || category === "currency" || category === "crypto") {
      // only rows priced by quantity can absorb a toman delta (a toman-entered silver row cannot)
      const idx = assets.findIndex((a) => a.category === category && isQuantityAsset(a));
      const refAsset = idx !== -1 ? assets[idx] : { category, ...(category === "gold" ? { kind: "gold18" } : { symbol: category === "crypto" ? "BTC" : "USD" }) };
      const price = rates ? unitPriceToman(refAsset, rates) : null;
      if (!price) continue;
      const quantityDelta = amountDelta / price;
      if (idx === -1) {
        if (quantityDelta <= 0) continue;
        assets.push({ category, ...(category === "gold" ? { kind: refAsset.kind } : { symbol: refAsset.symbol }), quantity: quantityDelta });
      } else {
        assets[idx].quantity = Math.max(0, (Number(assets[idx].quantity) || 0) + quantityDelta);
      }
    } else {
      const idx = assets.findIndex((a) => a.category === category);
      if (idx === -1) {
        if (amountDelta <= 0) continue;
        assets.push({ category, label: "", amount: amountDelta });
      } else {
        assets[idx].amount = Math.max(0, (Number(assets[idx].amount) || 0) + amountDelta);
      }
    }
  }

  return assets.filter((a) => (Number(a.quantity) || Number(a.amount) || 0) > 0.0001);
}
