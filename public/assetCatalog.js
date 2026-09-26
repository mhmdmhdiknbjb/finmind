/**
 * Single source of truth for WHAT a user can hold, shared by the browser (profile form) and the server
 * (pricing, risk engine, liquidity, prompts) — plain data, no DOM and no Node APIs.
 *
 * Two levels:
 *  - CATEGORY (what the user first picks: طلا، خودرو، اوراق بدهی، ...). 15 of them.
 *  - KIND inside a category (سکه امامی، صندوق اهرمی، ...), which carries:
 *      unit : how the amount is entered — "toman" (money) or a quantity: "gram" | "mesghal" | "count"
 *      live : BrsApi symbol to price a quantity at the live rate (gold kinds only; currency/crypto by symbol)
 *      type : the risk-engine holding type (portfolioRisk.js HOLDING_TYPES) this kind is modelled as
 *
 * ENGINE CATEGORY: the optimizer, scenario and decision engines work on 8 broad categories (cash, gold,
 * currency, stock, fund, realestate, crypto, other). Each fine category declares which one it rolls up to
 * (`engine`); the extra ones (اوراق بدهی، خودرو، ...) roll up to "other" there. The risk engine
 * (portfolioRisk.js) and the liquidity engine use the fine level, so those numbers stay precise.
 *
 * A kind with no price history in the market pack maps to a holding type without a return series: it
 * still counts for concentration / liquidity, but not for price-based risk — the same honest treatment
 * cash and real estate already get.
 */

export const ENGINE_CATEGORIES = ["cash", "gold", "currency", "stock", "fund", "realestate", "crypto", "other"];

export const CATEGORY_LABELS = {
  cash: "نقد و سپرده بانکی",
  currency: "ارز",
  gold: "طلا و سکه",
  metals: "نقره و فلزات گرانبها",
  crypto: "رمزارز",
  stock: "سهام و بورس",
  fund: "صندوق سرمایه‌گذاری",
  bond: "اوراق بدهی و صکوک",
  realestate: "ملک و مستغلات",
  vehicle: "خودرو و وسایل نقلیه",
  business: "کسب‌وکار و سهام غیربورسی",
  insurance: "بیمه و بازنشستگی",
  collectibles: "کالا و اقلام ارزشمند",
  receivable: "طلب، وام و ودیعه",
  other: "سایر دارایی‌ها",
};

export const UNIT_LABELS = { toman: "میلیون تومان", gram: "گرم", mesghal: "مثقال", count: "عدد" };

const T = "toman";

export const ASSET_KINDS = {
  cash: {
    engine: "cash",
    default: "deposit_short",
    kinds: [
      { id: "deposit_short", label: "سپرده کوتاه‌مدت / حساب جاری", unit: T, type: "cash_deposit" },
      { id: "deposit_long", label: "سپرده بلندمدت بانکی", unit: T, type: "cash_deposit" },
      { id: "deposit_cert", label: "گواهی سپرده بانکی", unit: T, type: "cash_deposit" },
      { id: "cash_hand", label: "وجه نقد (نزد خودم)", unit: T, type: "cash_deposit" },
      { id: "broker_cash", label: "وجه نقد در حساب کارگزاری", unit: T, type: "cash_deposit" },
      { id: "wallet", label: "کیف پول دیجیتال ریالی", unit: T, type: "cash_deposit" },
    ],
  },
  currency: { engine: "currency", default: null, kinds: [] }, // entered by symbol, see CURRENCY_SYMBOLS
  gold: {
    engine: "gold",
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
      { id: "coin_cert", label: "گواهی سپرده سکه (بورس کالا، بر حسب سکه)", unit: "count", live: "IR_COIN_EMAMI", type: "coin_full" },
      { id: "silver", label: "نقره", unit: T, type: "silver", hidden: true }, // legacy: now under «نقره و فلزات گرانبها»
    ],
  },
  metals: {
    engine: "gold",
    default: "silver",
    kinds: [
      { id: "silver", label: "نقره (ارزش به میلیون تومان)", unit: T, type: "silver" },
      { id: "platinum", label: "پلاتین و پالادیوم", unit: T, type: "other_assets" },
      { id: "industrial_metal", label: "فلزات صنعتی (مس، آلومینیوم، ...)", unit: T, type: "other_assets" },
    ],
  },
  crypto: { engine: "crypto", default: null, kinds: [] }, // entered by symbol, see CRYPTO_SYMBOLS
  stock: {
    engine: "stock",
    default: "bourse",
    kinds: [
      { id: "bourse", label: "سهام بورس تهران", unit: T, type: "stock" },
      { id: "farabourse", label: "سهام فرابورس", unit: T, type: "stock" },
      { id: "adalat", label: "سهام عدالت", unit: T, type: "stock" },
      { id: "rights", label: "حق‌تقدم سهام", unit: T, type: "stock" },
      { id: "managed", label: "سبد سهام تحت مدیریت (سبدگردان)", unit: T, type: "stock" },
      { id: "foreign_stock", label: "سهام و ETF خارجی", unit: T, type: "other_assets" },
    ],
  },
  fund: {
    engine: "fund",
    default: "mixed",
    kinds: [
      { id: "fixed_income", label: "صندوق درآمد ثابت", unit: T, type: "fixed_income_fund" },
      { id: "equity", label: "صندوق سهامی", unit: T, type: "equity_fund" },
      { id: "index", label: "صندوق شاخصی / قابل‌معامله (ETF)", unit: T, type: "equity_fund" },
      { id: "mixed", label: "صندوق مختلط / نوع نامشخص", unit: T, type: "fund" },
      { id: "gold_fund", label: "صندوق طلا", unit: T, type: "gold_fund" },
      { id: "leveraged", label: "صندوق اهرمی", unit: T, type: "leveraged_fund" },
      { id: "realestate_fund", label: "صندوق املاک و مستغلات", unit: T, type: "realestate_fund" },
      { id: "commodity_fund", label: "صندوق کالایی", unit: T, type: "commodity_fund" },
      { id: "fund_of_funds", label: "صندوق در صندوق", unit: T, type: "fund" },
      { id: "venture", label: "صندوق جسورانه (VC) / خصوصی", unit: T, type: "other_assets" },
      { id: "project_fund", label: "صندوق پروژه", unit: T, type: "other_assets" },
    ],
  },
  bond: {
    engine: "other",
    default: "govt_bond",
    kinds: [
      { id: "govt_bills", label: "اسناد خزانه اسلامی", unit: T, type: "bond_govt" },
      { id: "govt_bond", label: "اوراق مشارکت / اجاره دولتی", unit: T, type: "bond_govt" },
      { id: "sukuk_corp", label: "صکوک و اوراق مرابحه شرکتی", unit: T, type: "bond_corp" },
      { id: "participation", label: "اوراق مشارکت شهرداری / شرکتی", unit: T, type: "bond_corp" },
      { id: "housing_cert", label: "گواهی حق‌تقدم تسهیلات مسکن", unit: T, type: "bond_housing_cert" },
    ],
  },
  realestate: {
    engine: "realestate",
    default: "residential",
    kinds: [
      { id: "residential", label: "ملک مسکونی (آپارتمان / ویلا)", unit: T, type: "real_estate" },
      { id: "commercial", label: "ملک تجاری / اداری", unit: T, type: "real_estate" },
      { id: "rental", label: "ملک اجاره‌ای (درآمدزا)", unit: T, type: "real_estate" },
      { id: "land", label: "زمین", unit: T, type: "real_estate" },
      { id: "farmland", label: "باغ / زمین کشاورزی", unit: T, type: "real_estate" },
      { id: "presale", label: "پیش‌خرید", unit: T, type: "real_estate" },
      { id: "construction_share", label: "مشارکت در ساخت", unit: T, type: "real_estate" },
    ],
  },
  vehicle: {
    engine: "other",
    default: "car",
    kinds: [
      { id: "car", label: "خودرو سواری", unit: T, type: "vehicle" },
      { id: "commercial_vehicle", label: "وانت / کامیون / خودروی تجاری", unit: T, type: "vehicle" },
      { id: "motorcycle", label: "موتورسیکلت", unit: T, type: "vehicle" },
      { id: "other_vehicle", label: "سایر وسایل نقلیه (قایق، ماشین‌آلات سنگین، ...)", unit: T, type: "vehicle" },
    ],
  },
  business: {
    engine: "other",
    default: "own_business",
    kinds: [
      { id: "own_business", label: "کسب‌وکار شخصی (ارزش تقریبی)", unit: T, type: "other_assets" },
      { id: "private_equity", label: "سهام شرکت غیربورسی / خصوصی", unit: T, type: "other_assets" },
      { id: "startup", label: "سرمایه‌گذاری در استارتاپ", unit: T, type: "other_assets" },
      { id: "partnership", label: "شراکت / مضاربه", unit: T, type: "other_assets" },
      { id: "goodwill", label: "سرقفلی و حق امتیاز", unit: T, type: "other_assets" },
    ],
  },
  insurance: {
    engine: "other",
    default: "life_insurance",
    kinds: [
      { id: "life_insurance", label: "بیمه عمر و سرمایه‌گذاری", unit: T, type: "other_assets" },
      { id: "pension", label: "صندوق بازنشستگی / پس‌انداز بلندمدت", unit: T, type: "other_assets" },
      { id: "social_security", label: "ذخیره‌ی تأمین اجتماعی / کارمندی", unit: T, type: "other_assets" },
    ],
  },
  collectibles: {
    engine: "other",
    default: "art",
    kinds: [
      { id: "art", label: "آثار هنری", unit: T, type: "other_assets" },
      { id: "carpet", label: "فرش دستباف", unit: T, type: "other_assets" },
      { id: "antique", label: "عتیقه و اشیای کلکسیونی", unit: T, type: "other_assets" },
      { id: "watch_jewel", label: "ساعت و جواهرات گران‌قیمت (غیرطلا)", unit: T, type: "other_assets" },
      { id: "equipment", label: "ماشین‌آلات و تجهیزات کسب‌وکار", unit: T, type: "other_assets" },
      { id: "inventory", label: "کالا و موجودی انبار", unit: T, type: "other_assets" },
      { id: "nft", label: "دارایی دیجیتال غیررمزارزی (NFT و ...)", unit: T, type: "other_assets" },
    ],
  },
  receivable: {
    engine: "other",
    default: "loan_given",
    kinds: [
      { id: "loan_given", label: "وام / قرض داده‌شده", unit: T, type: "other_assets" },
      { id: "cheque", label: "چک و سفته دریافتنی", unit: T, type: "other_assets" },
      { id: "deposit_rent", label: "ودیعه / رهن پرداخت‌شده", unit: T, type: "other_assets" },
      { id: "trade_receivable", label: "مطالبات تجاری", unit: T, type: "other_assets" },
    ],
  },
  other: {
    engine: "other",
    default: "other_misc",
    kinds: [
      { id: "other_misc", label: "سایر", unit: T, type: "other_assets" },
      // legacy kinds from before the finer categories existed: still resolve, no longer offered in the form
      { id: "vehicle", label: "خودرو / موتورسیکلت", unit: T, type: "vehicle", hidden: true },
      { id: "bond_govt", label: "اوراق بدهی دولتی", unit: T, type: "bond_govt", hidden: true },
      { id: "bond_corp", label: "اوراق مشارکت / صکوک شرکتی", unit: T, type: "bond_corp", hidden: true },
      { id: "insurance", label: "بیمه عمر و سرمایه‌گذاری", unit: T, type: "other_assets", hidden: true },
      { id: "pension", label: "صندوق بازنشستگی", unit: T, type: "other_assets", hidden: true },
      { id: "private_equity", label: "سهام غیربورسی / شراکت", unit: T, type: "other_assets", hidden: true },
      { id: "loan_given", label: "طلب / وام داده‌شده", unit: T, type: "other_assets", hidden: true },
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
  if (!def || !def.kinds.length) return null;
  return def.kinds.find((k) => k.id === asset.kind) || def.kinds.find((k) => k.id === def.default) || null;
}

/** True when the asset is entered as a quantity (grams / coins / units) and priced live, not as a toman amount. */
export function isQuantityAsset(asset) {
  if (asset?.category === "currency" || asset?.category === "crypto") return true;
  if (asset?.category === "gold") return !!kindOf(asset)?.live;
  return false;
}

/** The broad category the optimizer / scenario / decision engines use for this asset (one of ENGINE_CATEGORIES). */
export function engineCategoryOf(asset) {
  return ASSET_KINDS[asset?.category]?.engine || "other";
}
