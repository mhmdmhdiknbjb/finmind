// Shared helpers used by every panel/page script — kept as a single module
// so each page only imports what it needs instead of loading one giant
// all-widgets bundle.

export { CATEGORY_LABELS, CURRENCY_SYMBOLS, CRYPTO_SYMBOLS, ASSET_KINDS, UNIT_LABELS, kindOf, isQuantityAsset } from "./assetCatalog.js";
import { CATEGORY_LABELS } from "./assetCatalog.js";
export const CATEGORY_COLORS = {
  cash: "#2dd4bf",
  gold: "#fb923c",
  currency: "#60a5fa",
  stock: "#c084fc",
  fund: "#00D4AA",
  realestate: "#f472b6",
  crypto: "#f87171",
  other: "#94a3b8",
  metals: "#cbd5e1",
  bond: "#38bdf8",
  vehicle: "#a3a3a3",
  business: "#facc15",
  insurance: "#4ade80",
  collectibles: "#e879f9",
  receivable: "#fb7185",
};



export const SCENARIO_PRESETS = [
  { id: "usd_up_30", title: "دلار ۳۰٪ رشد کند", description: "نرخ دلار آزاد نسبت به وضعیت فعلی ۳۰ درصد افزایش پیدا می‌کند." },
  { id: "gold_down_20", title: "طلا ۲۰٪ کاهش پیدا کند", description: "قیمت طلا و سکه نسبت به وضعیت فعلی ۲۰ درصد کاهش می‌یابد." },
  { id: "inflation_spike", title: "تورم به‌شدت افزایش یابد", description: "نرخ تورم نقطه‌به‌نقطه به‌طور ناگهانی به بالای ۶۰ درصد می‌رسد." },
  { id: "stock_crash_25", title: "بورس ۲۵٪ ریزش کند", description: "شاخص کل بورس تهران ۲۵ درصد افت می‌کند." },
  { id: "stock_rally_25", title: "بورس ۲۵٪ رشد کند", description: "شاخص کل بورس تهران ۲۵ درصد رشد می‌کند." },
  { id: "rate_hike", title: "نرخ سود بانکی افزایش یابد", description: "نرخ سود سپرده بانکی و اوراق به‌طور محسوس افزایش پیدا می‌کند." },
  { id: "income_drop_30", title: "درآمد ماهانه ۳۰٪ کاهش یابد", description: "به دلیل رکود اقتصادی، درآمد ماهانه کاربر ۳۰ درصد کاهش می‌یابد." },
];

export function $(id) { return document.getElementById(id); }

export function formatToman(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " میلیارد تومان";
  if (abs >= 1e6) return (n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " میلیون تومان";
  return Math.round(n).toLocaleString("en-US") + " تومان";
}

/** Keeps a number (with its sign / ٪) left-to-right inside RTL text, so "-16.6٪" is not shown as "16.6٪-". Returns HTML. */
export function ltr(text) {
  return `<bdi dir="ltr">${text}</bdi>`;
}

/** ISO date (2026-09-18) -> Persian calendar date for display. */
export function faDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fa-IR");
}

export function formatPercent(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Math.round(n) + "٪";
}

// All money inputs in the UI are entered/shown in million-toman units so
// the user never has to type a string of zeros; the backend still stores
// and works with full toman amounts.
const MILLION = 1_000_000;
export function tomanToMillionInput(toman) {
  if (toman === null || toman === undefined || toman === "") return "";
  return Math.round((Number(toman) / MILLION) * 100) / 100;
}
export function millionInputToToman(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * MILLION) : 0;
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function fillList(elId, items) {
  const el = $(elId);
  el.innerHTML = "";
  (items || []).forEach((it) => {
    const li = document.createElement("li");
    li.textContent = it;
    el.appendChild(li);
  });
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.textContent = "موردی یافت نشد.";
    li.style.color = "var(--text-faint)";
    el.appendChild(li);
  }
}

// Tracks the "latest reveal" for a given element so a newer call (e.g. the
// widget was refreshed again before the previous animation finished) can
// invalidate the older, now-stale animation instead of letting both race.
const liveRevealTokens = new WeakMap();

/** Reveals `text` inside `el` live, word-by-word, instead of setting it all at once. */
export async function typeWordsInto(el, text, delayMs = 28) {
  if (!el) return;
  const token = Symbol();
  liveRevealTokens.set(el, token);
  el.textContent = "";
  const parts = String(text || "").split(/(\s+)/);
  for (const part of parts) {
    if (liveRevealTokens.get(el) !== token) return;
    el.textContent += part;
    if (part.trim().length) await new Promise((r) => setTimeout(r, delayMs));
  }
}

/** Same as fillList, but reveals each list item live, word-by-word, one item after another. */
export async function fillListLive(elId, items, delayMs = 28) {
  const el = $(elId);
  if (!el) return;
  const token = Symbol();
  liveRevealTokens.set(el, token);
  el.innerHTML = "";
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.textContent = "موردی یافت نشد.";
    li.style.color = "var(--text-faint)";
    el.appendChild(li);
    return;
  }
  for (const it of items) {
    if (liveRevealTokens.get(el) !== token) return;
    const li = document.createElement("li");
    el.appendChild(li);
    await typeWordsInto(li, it, delayMs);
  }
}

export function destroyChart(charts, key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

/* ---------------- Auth helpers shared by every panel/chat page ---------------- */

export async function fetchCurrentUser() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

/** Redirects to the login page if there's no active session; returns the user otherwise. */
export async function requireUserOrRedirect() {
  const user = await fetchCurrentUser();
  if (!user) {
    window.location.href = "/login.html";
    return null;
  }
  return user;
}

export async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.href = "/";
  }
}

/**
 * POST to a widget endpoint with visible feedback: after SLOW_MS a "taking longer than usual" note appears inside the
 * loading element, after HARD_MS the request is abandoned. Failures (HTTP error, timeout, network) render an error
 * banner with a retry button instead of silence. Resolves the JSON, or null when it failed (already shown to the user).
 */
const SLOW_MS = 15000;
const HARD_MS = 90000;

export function clearWidgetError(loadingId) {
  document.getElementById(loadingId + "Error")?.remove();
}

export function showWidgetError(loadingId, message, retry) {
  clearWidgetError(loadingId);
  const loading = document.getElementById(loadingId);
  if (!loading) return;
  const box = document.createElement("div");
  box.id = loadingId + "Error";
  box.className = "banner banner-warn";
  box.textContent = message + " ";
  if (retry) {
    const btn = document.createElement("button");
    btn.className = "btn btn-ghost";
    btn.textContent = "تلاش دوباره";
    btn.onclick = () => {
      box.remove();
      retry();
    };
    box.appendChild(btn);
  }
  loading.insertAdjacentElement("afterend", box);
}

export async function widgetFetch(loadingId, url, body, retry) {
  clearWidgetError(loadingId);
  const loading = document.getElementById(loadingId);
  let note = null;
  const slowTimer = setTimeout(() => {
    note = document.createElement("div");
    note.className = "widget-slow";
    note.style.cssText = "margin-top:8px;font-size:12px;color:var(--text-dim)";
    note.textContent = "این تحلیل بیشتر از حد معمول طول کشیده؛ لطفاً کمی صبر کنید…";
    loading?.appendChild(note);
  }, SLOW_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(HARD_MS),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) throw new Error((data && data.error) || "خطای سرور");
    return data;
  } catch (e) {
    console.error(e);
    const timedOut = e && (e.name === "TimeoutError" || e.name === "AbortError");
    showWidgetError(
      loadingId,
      timedOut ? "این تحلیل بیشتر از حد معمول طول کشید و متوقف شد." : "دریافت تحلیل ناموفق بود (" + (e.message || "خطا") + ").",
      retry
    );
    return null;
  } finally {
    clearTimeout(slowTimer);
    note?.remove();
  }
}
