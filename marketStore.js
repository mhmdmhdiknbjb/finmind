import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSET_STATS } from "./optimizer.js";
import { fetchLiveRates } from "./marketFeed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "marketHistory.json");

export const FORECASTABLE_ASSETS = ["gold", "currency", "stock"];

// Only gold and currency have a real live anchor available (see
// marketFeed.js). The Tehran Stock Exchange index has no free, reachable
// feed from this environment, so it stays synthetic-only until one is
// wired up.
const LIVE_ANCHOR_FIELD = { gold: "goldTomanPerGram", currency: "usdToman" };
const LIVE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // don't hammer the feed more than every 6h

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function monthPeriod(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Builds `months` of history ending at `anchorValue` (today), walking
 * BACKWARD from that real value using the same expectedReturn/volatility
 * assumptions as optimizer.js. The only synthetic part is the shape of the
 * path leading up to today; the endpoint itself — the number that matters
 * most for a forecast — is real.
 */
function synthesizeHistoryToAnchor(assetKey, months, anchorValue) {
  const stats = ASSET_STATS[assetKey];
  const monthlyDrift = stats.expectedReturn / 12;
  const monthlyVol = stats.volatility / Math.sqrt(12);
  const now = new Date();
  const series = new Array(months);
  let value = anchorValue;
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    series[months - 1 - i] = { period: monthPeriod(d), value: Math.round(value * 100) / 100 };
    const shock = (Math.random() - 0.5) * 2 * monthlyVol;
    value = value / (1 + monthlyDrift + shock);
  }
  return series;
}

/** Fully synthetic series (index starting at 100) for assets with no real anchor (e.g. stock). */
function generateIndexSeries(assetKey, months = 24) {
  const stats = ASSET_STATS[assetKey];
  const monthlyDrift = stats.expectedReturn / 12;
  const monthlyVol = stats.volatility / Math.sqrt(12);
  let value = 100;
  const series = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    if (i !== months - 1) {
      const shock = (Math.random() - 0.5) * 2 * monthlyVol;
      value = value * (1 + monthlyDrift + shock);
    }
    series.push({ period: monthPeriod(d), value: Math.round(value * 100) / 100 });
  }
  return series;
}

function seedStore() {
  const store = { series: {}, meta: {} };
  for (const key of FORECASTABLE_ASSETS) {
    store.series[key] = generateIndexSeries(key);
    store.meta[key] = { source: "synthetic", liveAnchor: false };
  }
  return store;
}

function readStoreFile() {
  ensureDataDir();
  if (!fs.existsSync(FILE)) return seedStore();
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    if (!raw.meta) {
      // migrate from the old single global `synthetic` boolean shape
      const meta = {};
      for (const key of FORECASTABLE_ASSETS) meta[key] = { source: raw.synthetic === false ? "manual" : "synthetic", liveAnchor: false };
      return { series: raw.series || {}, meta };
    }
    return raw;
  } catch {
    return seedStore();
  }
}

function writeStoreFile(store) {
  ensureDataDir();
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function loadMarketHistory() {
  const store = readStoreFile();
  if (!fs.existsSync(FILE)) writeStoreFile(store);
  return store;
}

/**
 * Tries to refresh gold/currency with a real live anchor (see
 * marketFeed.js), respecting a refresh cooldown. On any failure (feed
 * unreachable, timeout) it silently keeps whatever history already exists —
 * a forecast widget should never hard-fail just because an external feed
 * hiccuped.
 */
export async function ensureFreshMarketHistory() {
  const store = loadMarketHistory();
  const now = Date.now();
  const needsRefresh = Object.keys(LIVE_ANCHOR_FIELD).some((key) => {
    const meta = store.meta[key];
    if (!meta || meta.source === "manual") return false;
    if (!meta.fetchedAt) return true;
    return now - new Date(meta.fetchedAt).getTime() > LIVE_REFRESH_INTERVAL_MS;
  });
  if (!needsRefresh) return store;

  try {
    const live = await fetchLiveRates();
    for (const [assetKey, field] of Object.entries(LIVE_ANCHOR_FIELD)) {
      if (store.meta[assetKey]?.source === "manual") continue; // don't overwrite real user-entered data
      const anchorValue = live[field];
      store.series[assetKey] = synthesizeHistoryToAnchor(assetKey, 24, anchorValue);
      store.meta[assetKey] = { source: "live", liveAnchor: true, fetchedAt: live.fetchedAt, feedDate: live.date, note: live.source };
    }
    writeStoreFile(store);
  } catch (err) {
    console.warn("live market feed unreachable, keeping existing history:", err.message);
  }
  return store;
}

export function addHistoryPoint(asset, period, value) {
  const store = loadMarketHistory();
  if (!FORECASTABLE_ASSETS.includes(asset)) throw new Error("دارایی نامعتبر برای پیش‌بینی");
  store.series[asset] = [...(store.series[asset] || []), { period, value: Number(value) }].sort((a, b) =>
    a.period < b.period ? -1 : a.period > b.period ? 1 : 0
  );
  store.meta[asset] = { source: "manual", liveAnchor: false };
  writeStoreFile(store);
  return store;
}
