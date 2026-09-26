/**
 * Single source of truth for WHAT a user can hold, shared by the browser (profile form) and the server
 * (pricing, risk engine, prompts) — it is plain data, no DOM and no Node APIs.
 *
 * The app keeps 8 broad categories (cash, gold, currency, stock, fund, realestate, crypto, other) because
 * the optimizer, liquidity and scenario engines work on those. Inside a category the user now picks a
 * KIND (e.g. gold -> "سکه امامی"), which carries:
 *   unit  : how the amount is entered — "toman" (a money amount), or a quantity: "gram" | "mesghal" | "count"
 *   live  : BrsApi symbol used to price a quantity at the live rate (gold kinds only; currency/crypto are
 *           priced by their own symbol)
 *   type  : the risk-engine holding type (portfolioRisk.js HOLDING_TYPES) this kind is modelled as
 *
 * A kind that has no price history in the market pack (e.g. silver, bonds, vehicles) maps to a holding type
 * without a return series: it still counts for concentration / liquidity, but not for price-based risk —
 * the same honest treatment cash and real estate already get.
 */

export const CATEGORY_LABELS = {
  cash: "نقد و سپرده بانکی",
  gold: "طلا و سکه",
  currency: "ارز",
  stock: "سهام (بورس)",
  fund: "صندوق سرمایه‌گذاری",
  realestate: "ملک و مستغلات",
  crypto: "رمزارز",
  other: "سایر دارایی‌ها",
};

export const UNIT_LABELS = { toman: "میلیون تومان", gram: "گرم", mesghal: "مثقال", count: "عدد" };

export const ASSET_KINDS = {
  cash: {
    default: "deposit_short",
    kinds: [
      { id: "deposit_short", label: "سپرده کوتاه‌مدت / حساب جاری", unit: "toman", type: "cash_deposit" },
      { id: "deposit_long", label: "سپرده بلندمدت بانکی", unit: "toman", type: "cash_deposit" },
      { id: "deposit_cert", label: "گواهی سپرده بانکی", unit: "toman", type: "cash_deposit" },
      { id: "cash_hand", label: "وجه نقد (نزد خودم)", unit: "toman", type: "cash_deposit" },
    ],
  },
  gold: {
    default: "gold18",
    kinds: [
      { id: "gold18", label: "طلای ۱۸ عیار (گرم)", unit: "gram", live: "IR_GOLD_18K", type: "gold_physical" },
      { id: "gold24", label: "طلای ۲۴ عیار (گرم)", unit: "gram", live: "IR_GOLD_24K", type: "gold_physical" },
      { id: "gold_melted", label: "طلای آب‌شده (مثقال)", unit: "mesghal", live: "IR_GOLD_MELTED", type: "gold_physical" },
      { id: "gold_jewelry", label: "طلای زینتی / جواهر (گرم، به قیمت ۱۸ عیار)", unit: "gram", live: "IR_GOLD_18K", type: "gold_physical" },
      { id: "coin_emami", label: "سکه امامی (عدد)", unit: "count", live: "IR_COIN_EMAMI", type: "coin_full" },
      { id: "coin_bahar", label: "سکه بهار آزادی (عدد)", unit: "count", live: "IR_COIN_BAHAR", type: "coin_full" },
      { id: "coin_half", label: "نیم‌سکه (عدد)", unit: "count", live: "IR_COIN_HALF", type: "coin_partial" },
      { id: "coin_quarter", label: "ربع‌سکه (عدد)", unit: "count", live: "IR_COIN_QUARTER", type: "coin_partial" },
      { id: "coin_1g", label: "سکه گرمی (عدد)", unit: "count", live: "IR_COIN_1G", type: "coin_partial" },
      { id: "silver", label: "نقره (ارزش به میلیون تومان)", unit: "toman", type: "silver" },
    ],
  },
  stock: {
    default: "bourse",
    kinds: [
      { id: "bourse", label: "سهام بورس تهران", unit: "toman", type: "stock" },
      { id: "farabourse", label: "سهام فرابورس", unit: "toman", type: "stock" },
      { id: "adalat", label: "سهام عدالت", unit: "toman", type: "stock" },
      { id: "rights", label: "حق‌تقدم سهام", unit: "toman", type: "stock" },
    ],
  },
  fund: {
    default: "mixed",
    kinds: [
      { id: "fixed_income", label: "صندوق درآمد ثابت", unit: "toman", type: "fixed_income_fund" },
      { id: "equity", label: "صندوق سهامی", unit: "toman", type: "equity_fund" },
      { id: "index", label: "صندوق شاخصی / قابل‌معامله (ETF)", unit: "toman", type: "equity_fund" },
      { id: "mixed", label: "صندوق مختلط / نوع نامشخص", unit: "toman", type: "fund" },
      { id: "gold_fund", label: "صندوق طلا", unit: "toman", type: "gold_fund" },
      { id: "leveraged", label: "صندوق اهرمی", unit: "toman", type: "leveraged_fund" },
      { id: "realestate_fund", label: "صندوق املاک و مستغلات", unit: "toman", type: "realestate_fund" },
      { id: "commodity_fund", label: "صندوق کالایی", unit: "toman", type: "commodity_fund" },
      { id: "fund_of_funds", label: "صندوق در صندوق", unit: "toman", type: "fund" },
    ],
  },
  realestate: {
    default: "residential",
    kinds: [
      { id: "residential", label: "ملک مسکونی (آپارتمان / ویلا)", unit: "toman", type: "real_estate" },
      { id: "commercial", label: "ملک تجاری / اداری", unit: "toman", type: "real_estate" },
      { id: "land", label: "زمین / باغ", unit: "toman", type: "real_estate" },
      { id: "presale", label: "پیش‌خرید / در حال ساخت", unit: "toman", type: "real_estate" },
    ],
  },
  other: {
    default: "other_misc",
    kinds: [
      { id: "vehicle", label: "خودرو / موتورسیکلت", unit: "toman", type: "vehicle" },
      { id: "bond_govt", label: "اوراق بدهی دولتی (اسناد خزانه، اراد، ...)", unit: "toman", type: "bond_govt" },
      { id: "bond_corp", label: "اوراق مشارکت / صکوک شرکتی", unit: "toman", type: "bond_corp" },
      { id: "insurance", label: "بیمه عمر و سرمایه‌گذاری", unit: "toman", type: "other_assets" },
      { id: "pension", label: "صندوق بازنشستگی / پس‌انداز بلندمدت", unit: "toman", type: "other_assets" },
      { id: "private_equity", label: "سهام غیربورسی / شراکت در کسب‌وکار", unit: "toman", type: "other_assets" },
      { id: "loan_given", label: "طلب / وام داده‌شده", unit: "toman", type: "other_assets" },
      { id: "other_misc", label: "سایر", unit: "toman", type: "other_assets" },
    ],
  },
};

// Every currency the live feed (BrsApi) quotes in toman.
export const CURRENCY_SYMBOLS = [
  ["USD", "دلار آمریکا"], ["EUR", "یورو"], ["GBP", "پوند انگلیس"], ["AED", "درهم امارات"],
  ["TRY", "لیر ترکیه"], ["CAD", "دلار کانادا"], ["AUD", "دلار استرالیا"], ["CHF", "فرانک سوئیس"],
  ["CNY", "یوآن چین"], ["JPY", "ین ژاپن"], ["SAR", "ریال عربستان"], ["KWD", "دینار کویت"],
  ["QAR", "ریال قطر"], ["OMR", "ریال عمان"], ["BHD", "دینار بحرین"], ["IQD", "دینار عراق"],
  ["INR", "روپیه هند"], ["PKR", "روپیه پاکستان"], ["RUB", "روبل روسیه"], ["AFN", "افغانی"],
  ["SEK", "کرون سوئد"], ["MYR", "رینگیت مالزی"], ["THB", "بات تایلند"], ["AZN", "منات آذربایجان"],
  ["AMD", "درام ارمنستان"], ["GEL", "لاری گرجستان"], ["SYP", "لیر سوریه"],
];

// Every coin the live feed quotes in USD.
export const CRYPTO_SYMBOLS = [
  ["BTC", "بیت‌کوین"], ["ETH", "اتریوم"], ["USDT", "تتر"], ["USDC", "یواس‌دی کوین"], ["BNB", "بی‌ان‌بی"],
  ["XRP", "ایکس‌آرپی"], ["SOL", "سولانا"], ["ADA", "کاردانو"], ["DOGE", "دوج‌کوین"], ["TRX", "ترون"],
  ["LINK", "چین‌لینک"], ["XLM", "استلار"], ["AVAX", "آوالانچ"], ["SHIB", "شیبا"], ["LTC", "لایت‌کوین"],
  ["DOT", "پولکادات"], ["UNI", "یونی‌سواپ"], ["ATOM", "کازماس"], ["FIL", "فایل‌کوین"],
];

/** The kind definition for an asset (its `kind`, else the category's default), or null for currency/crypto. */
export function kindOf(asset) {
  const def = ASSET_KINDS[asset?.category];
  if (!def) return null;
  return def.kinds.find((k) => k.id === asset.kind) || def.kinds.find((k) => k.id === def.default) || null;
}

/** True when the asset is entered as a quantity (grams / coins / units) and priced live, not as a toman amount. */
export function isQuantityAsset(asset) {
  if (asset?.category === "currency" || asset?.category === "crypto") return true;
  if (asset?.category === "gold") return !!kindOf(asset)?.live;
  return false;
}
