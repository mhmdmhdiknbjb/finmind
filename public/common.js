// Shared helpers used by every panel/page script — kept as a single module
// so each page only imports what it needs instead of loading one giant
// all-widgets bundle.

export const CATEGORY_LABELS = {
  cash: "نقد و سپرده بانکی",
  gold: "طلا",
  currency: "ارز",
  stock: "سهام (بورس)",
  fund: "صندوق سرمایه‌گذاری",
  realestate: "ملک و مستغلات",
  crypto: "رمزارز",
  other: "سایر",
};
export const CATEGORY_COLORS = {
  cash: "#2dd4bf",
  gold: "#fb923c",
  currency: "#60a5fa",
  stock: "#c084fc",
  fund: "#00D4AA",
  realestate: "#f472b6",
  crypto: "#f87171",
  other: "#94a3b8",
};

export const CURRENCY_SYMBOLS = [
  ["USD", "دلار آمریکا"], ["EUR", "یورو"], ["GBP", "پوند"], ["AED", "درهم امارات"],
  ["TRY", "لیر ترکیه"], ["CAD", "دلار کانادا"], ["AUD", "دلار استرالیا"], ["CHF", "فرانک سوئیس"],
  ["CNY", "یوآن چین"], ["SAR", "ریال عربستان"], ["KWD", "دینار کویت"], ["IQD", "دینار عراق"],
  ["JPY", "ین ژاپن"], ["INR", "روپیه هند"], ["RUB", "روبل روسیه"],
];
export const CRYPTO_SYMBOLS = [
  ["BTC", "بیت‌کوین"], ["ETH", "اتریوم"], ["USDT", "تتر"], ["XRP", "ایکس‌آرپی"], ["BNB", "بی‌ان‌بی"],
  ["SOL", "سولانا"], ["USDC", "یواس‌دی کوین"], ["ADA", "کاردانو"], ["DOGE", "دوج‌کوین"], ["TRX", "ترون"],
  ["LINK", "چین‌لینک"], ["XLM", "استلار"], ["AVAX", "آوالانچ"], ["LTC", "لایت‌کوین"], ["DOT", "پولکادات"],
];

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
