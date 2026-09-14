import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSET_STATS } from "./optimizer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "marketHistory.json");

export const FORECASTABLE_ASSETS = ["gold", "currency", "stock"];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * No live market-data feed is wired up yet (see ROADMAP.md, Phase 3). Rather
 * than fabricate precise-looking Iranian dollar/gold/stock history and
 * present it as real, we seed a clearly-labeled SYNTHETIC series generated
 * from the same expectedReturn/volatility assumptions already used by
 * optimizer.js, so the forecasting engine has something real to run on and
 * is internally consistent with the rest of the app. The `synthetic` flag
 * is surfaced in the API response and the UI shows a visible badge for it;
 * it flips to false as soon as a user adds a real data point.
 */
function generateSyntheticSeries(assetKey, months = 24) {
  const stats = ASSET_STATS[assetKey];
  const monthlyDrift = stats.expectedReturn / 12;
  const monthlyVol = stats.volatility / Math.sqrt(12);
  let value = 100;
  const series = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (i !== months - 1) {
      const shock = (Math.random() - 0.5) * 2 * monthlyVol;
      value = value * (1 + monthlyDrift + shock);
    }
    series.push({ period, value: Math.round(value * 100) / 100 });
  }
  return series;
}

function seedStore() {
  const store = { synthetic: true, series: {} };
  for (const key of FORECASTABLE_ASSETS) store.series[key] = generateSyntheticSeries(key);
  return store;
}

export function loadMarketHistory() {
  ensureDataDir();
  if (!fs.existsSync(FILE)) {
    const seeded = seedStore();
    fs.writeFileSync(FILE, JSON.stringify(seeded, null, 2), "utf-8");
    return seeded;
  }
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch {
    const seeded = seedStore();
    fs.writeFileSync(FILE, JSON.stringify(seeded, null, 2), "utf-8");
    return seeded;
  }
}

export function addHistoryPoint(asset, period, value) {
  const store = loadMarketHistory();
  if (!FORECASTABLE_ASSETS.includes(asset)) throw new Error("دارایی نامعتبر برای پیش‌بینی");
  store.series[asset] = [...(store.series[asset] || []), { period, value: Number(value) }].sort((a, b) =>
    a.period < b.period ? -1 : a.period > b.period ? 1 : 0
  );
  store.synthetic = false;
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2), "utf-8");
  return store;
}
