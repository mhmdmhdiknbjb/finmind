import { CATEGORY_LABELS, engineCategoryOf } from "./public/assetCatalog.js";

/**
 * Grounding layer: the LLM only explains numbers the engines / the user's profile already contain. This module
 *  (1) builds a block of hard facts that goes into every prompt,
 *  (2) validates what the model wrote — money amounts must exist in the grounded data, and it must not claim the
 *      user holds an asset class they do not hold —
 *  (3) answers plain factual questions ("how much gold do I have?") without the model at all.
 */

const num = (v) => Number(v) || 0;
export const fmt = (n) => Math.round(num(n)).toLocaleString("en-US");

/* ------------------------------------------------------------------ facts */

// keyword groups per engine category; matched as whole Persian words (so «ارزش» never counts as «ارز»)
const CAT_TERMS = {
  stock: ["سهام", "بورس", "سهام‌داری", "سهامداری"],
  realestate: ["ملک", "املاک", "مستغلات", "آپارتمان", "زمین"],
  crypto: ["رمزارز", "رمزارزها", "کریپتو", "بیت‌کوین", "بیتکوین", "اتریوم"],
  fund: ["صندوق", "صندوق‌ها"],
  currency: ["ارز", "دلار", "یورو"],
  gold: ["طلا", "سکه"],
};
const CAT_NAME = { stock: "سهام", realestate: "ملک", crypto: "رمزارز", fund: "صندوق سرمایه‌گذاری", currency: "ارز", gold: "طلا و سکه", cash: "نقد", other: "سایر" };

export function holdings(profile) {
  const byEngine = {};
  let total = 0;
  for (const a of profile.assets || []) {
    const amt = num(a.amount);
    if (amt <= 0) continue;
    const c = engineCategoryOf(a);
    byEngine[c] = (byEngine[c] || 0) + amt;
    total += amt;
  }
  return { byEngine, total };
}

/** Engine categories among cash/gold/currency/stock/fund/realestate/crypto the user has NO money in. */
export function notHeld(profile) {
  const { byEngine } = holdings(profile);
  return Object.keys(CAT_TERMS).filter((c) => !(byEngine[c] > 0));
}

/** The block injected into every prompt: everything the model may state as fact about this user. */
export function factsBlock(profile) {
  const { byEngine, total } = holdings(profile);
  const lines = Object.entries(byEngine)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `- ${CAT_NAME[c] || c}: ${fmt(v)} تومان (${total ? Math.round((v / total) * 1000) / 10 : 0}٪ از کل)`);
  const missing = notHeld(profile).map((c) => CAT_NAME[c]);
  const goals = (profile.goals || []).map((g) => `«${g.title}» به مبلغ ${fmt(g.targetAmount)} تومان تا ${g.targetMonths} ماه دیگر`);
  return `### واقعیت‌های قطعی (تنها منبع مجاز برای هر عدد یا ادعا درباره‌ی وضعیت این کاربر)
درآمد ماهانه: ${fmt(profile.monthlyIncome)} تومان | هزینه ماهانه: ${fmt(profile.monthlyExpenses)} تومان | بدهی: ${fmt(profile.existingDebt)} تومان
مجموع دارایی‌ها: ${fmt(total)} تومان
تفکیک دارایی‌ها:
${lines.join("\n") || "- هیچ دارایی‌ای ثبت نشده است"}
دارایی‌هایی که کاربر «ندارد» (اصلاً به عنوان دارایی او از آن‌ها حرف نزن، تمرکز یا سهمی برایشان ادعا نکن): ${missing.length ? missing.join("، ") : "—"}
اهداف ثبت‌شده: ${goals.length ? goals.join(" | ") : "هدفی ثبت نشده"}
قواعد: هر مبلغ، مدت یا هدفی که در این بلاک و پروفایل نیست را نساز؛ اگر داده‌ای نداری بگو «این را در اطلاعات ثبت‌شده ندیدم». اگر تاریخچه‌ی گفتگو یا هر چیز دیگری با این بلاک تفاوت دارد، این بلاک درست است.`;
}

/* ------------------------------------------------------------ number parse */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export function normDigits(s) {
  return String(s).replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d))
    .replace(/(?<=\d)[٬,،](?=\d{3}(?!\d))/g, "").replace(/(?<=\d)[٫\/](?=\d)/g, ".");
}

const WORD_NUM = { یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90, صد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500, ششصد: 600, هفتصد: 700, هشتصد: 800, نهصد: 900 };
const WORD_RE = Object.keys(WORD_NUM).sort((a, b) => b.length - a.length).join("|");
const UNIT = { میلیارد: 1e9, میلیون: 1e6, هزار: 1e3 };

/** All money-scale (>= 1,000,000) values mentioned in a text, in toman. */
export function extractMoney(text) {
  const t = normDigits(text);
  const out = [];
  const re = new RegExp(`(\\d+(?:\\.\\d+)?|(?<![\\u0600-\\u06FF])(?:${WORD_RE})(?:\\s+و\\s+(?:${WORD_RE}))*)\\s*(هزار\\s+میلیارد|میلیارد|میلیون|هزار)?`, "g");
  let m;
  while ((m = re.exec(t))) {
    let v;
    if (/^\d/.test(m[1])) v = parseFloat(m[1]);
    else v = m[1].split(/\s+و\s+/).reduce((s, w) => s + (WORD_NUM[w.trim()] || 0), 0);
    const u = m[2];
    if (u) v *= /^هزار\s+میلیارد/.test(u) ? 1e12 : UNIT[u];
    else if (!/^\d/.test(m[1])) continue; // a bare number word without a unit is not money
    if (v >= 1e6) out.push(v);
  }
  return out;
}

/** Money values found in the grounded text (facts, profile, engine blocks, the user's own message) + their pairwise sums/differences. */
export function allowedMoney(groundText, extra = []) {
  const base = [...new Set([...extractMoney(groundText), ...extra.map(num).filter((v) => v > 0)])].slice(0, 80);
  const all = new Set(base);
  for (let i = 0; i < base.length; i++)
    for (let j = i + 1; j < base.length; j++) {
      all.add(base[i] + base[j]);
      all.add(Math.abs(base[i] - base[j]));
    }
  // one month / three months / a year of the monthly figures the user gave
  for (const b of base) for (const k of [3, 6, 12]) all.add(b * k);
  return [...all];
}

const near = (v, allowed) => allowed.some((a) => Math.abs(v - a) <= Math.max(a * 0.015, 1000));

/** Money amounts in `text` that appear nowhere in the grounded data. */
export function badNumbers(text, allowed) {
  return extractMoney(text).filter((v) => !near(v, allowed));
}

/** Percentages above 100 that are not in the grounded data (a corrupted "94.5٪" arrives as "945٪"). */
function badPercents(text, groundText) {
  const ground = new Set((normDigits(groundText).match(/d+(?:.d+)?/g) || []).map(Number));
  const out = [];
  for (const m of normDigits(text).matchAll(/(d+(?:.d+)?)s*(?:٪|%|درصد)/g)) {
    const v = parseFloat(m[1]);
    if (v > 100 && ![...ground].some((g) => Math.abs(g - v) < 0.6)) out.push(v);
  }
  return out;
}

const Q_STOP = new Set(["آیا", "چقدر", "چند", "چطور", "چگونه", "برای", "رسیدن", "است", "هست", "باید", "دارم", "دارد", "چرا", "وضعیت", "اینکه", "می‌توانم", "میتونم", "میشه", "کنم", "کند", "شود", "بگو", "بگویید", "لطفا", "لطفاً", "درباره", "مورد"]);

/** Cheap relevance guard: a reply that shares no content word with the question ("Sure, ask me anything!") is off-topic. */
export function answersQuestion(question, reply) {
  // the profile is already on file: a reply asking the user to supply it again ignored the data it was given
  if (/(لطفاً|لطفا|اگر لطف)[^.؟\n]{0,80}(ارائه|ارسال|وارد|اعلام|بفرستید|بدهید)/.test(String(reply))) return false;
  // "the profile does not say…" while the profile is right there
  if (/(ارائه نشده|در پروفایل[^.]{0,30}(نیست|نشده|وجود ندارد)|اطلاعات(?:ی)? (?:کافی )?(?:ندارم|در دسترس نیست))/.test(String(reply))) return false;
  const words = (String(question).match(/[\u0621-\u063A\u0641-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC\u200c]{4,}/g) || []).filter((w) => !Q_STOP.has(w));
  if (!words.length) return true;
  const r = String(reply);
  const stem = (w) => (w.length >= 6 ? w.slice(0, w.length - 2) : w.slice(0, w.length - 1));
  return words.some((w) => r.includes(stem(w)));
}

/** Qualitative claims about the user's cash flow that the profile contradicts (invented debt, invented overspending). */
function badCashflowClaim(s, profile) {
  const NEG = /(ندار|بدون|فاقد|نیست|هیچ|بی‌?بدهی|ثبت نشده)/;
  if (num(profile.existingDebt) <= 0 && /(بدهی|مقروض|اقساط|قسط|وام)/.test(s) && !NEG.test(s)) return "کاربر بدهی/قسطی ثبت نکرده است (بدهی صفر)";
  if (num(profile.monthlyIncome) > num(profile.monthlyExpenses) && (/بیشs*ازs*(?:نیاز|درآمد)[^.]{0,30}هزینه/.test(s) || /هزینه[^.]{0,40}بیشs*(?:تر)?s*ازs*درآمد/.test(s))) return "درآمد کاربر از هزینه‌اش بیشتر است، نه کمتر";
  return null;
}

/* ------------------------------------------------------------- validation */

const EXEMPT = /(ندار(?:ید|د|ی|م)|نیست|نیستند|فاقد|بدون|نداشتن|نمی‌?دار|هیچ|اگر|چنانچه|در صورت|افزودن|اضافه|ورود|وارد|گزینه|بررسی|سناریو|فرضی|مقایسه|ترکیب مرجع|ترکیب پیشنهادی|پیشنهادی|بهینه|مثلا|معمولاً|به‌?طور کلی|ثبت نشده|ثبت‌شده‌ای)/;

const wordRe = (term) => new RegExp(`(?<![\\u0600-\\u06FF])${term}(?![\\u0600-\\u06FF])`);
const TERM_RES = Object.fromEntries(Object.entries(CAT_TERMS).map(([c, ts]) => [c, ts.map(wordRe)]));

function splitSentences(text) {
  return String(text).split(/(?<=[.!؟?۔])\s+|\n+/).filter((x) => x.trim());
}

/**
 * Validates free text sentence by sentence. Returns {ok, problems:[string], badSentences:[string]}.
 *  - a money amount that exists nowhere in the grounded data is a fabricated number;
 *  - a sentence claiming the user holds a category they do not (allowed when negated / hypothetical, or when the
 *    user brought the category up themselves).
 * `checkCategories` is off for scenario / decision text, where talking about a class the user does not hold is the point.
 */
export function validateText(text, { profile, groundText, userMessage = "", extra = [], checkCategories = true }) {
  const problems = [];
  const badSentences = [];
  const allowed = allowedMoney(groundText + "\n" + userMessage, extra);
  const missing = checkCategories ? notHeld(profile) : [];
  for (const s of splitSentences(text)) {
    const nums = badNumbers(s, allowed);
    if (nums.length) {
      problems.push(`مبلغ ${nums.map(fmt).join("، ")} تومان در داده‌های کاربر وجود ندارد: «${s.trim().slice(0, 100)}»`);
      badSentences.push(s);
      continue;
    }
    const pcts = badPercents(s, groundText);
    if (pcts.length) {
      problems.push(`درصد نامعتبر ${pcts.join("، ")}٪: «${s.trim().slice(0, 100)}»`);
      badSentences.push(s);
      continue;
    }
    const cf = checkCategories ? badCashflowClaim(s, profile) : null;
    if (cf) {
      problems.push(`ادعای نادرست (${cf}): «${s.trim().slice(0, 100)}»`);
      badSentences.push(s);
      continue;
    }
    if (!missing.length || EXEMPT.test(s)) continue;
    const hit = missing.find((c) => TERM_RES[c].some((r) => r.test(s)) && !TERM_RES[c].some((r) => r.test(userMessage)));
    if (hit) {
      problems.push(`ادعای داشتن «${CAT_NAME[hit]}» در حالی که کاربر چنین دارایی‌ای ندارد: «${s.trim().slice(0, 100)}»`);
      badSentences.push(s);
    }
  }
  return { ok: problems.length === 0, problems, badSentences };
}

/** Text of every string leaf of a JSON value, joined (for validating a whole widget answer in one pass). */
export function collectStrings(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectStrings(x, out));
  return out;
}

/** Removes the offending sentences from every string of a JSON answer (last resort after retries); drops emptied list items. */
export function stripBadSentences(v, badSentences) {
  const bad = new Set(badSentences.map((s) => s.trim()));
  const clean = (s) => splitSentences(s).filter((x) => !bad.has(x.trim())).join(" ").trim();
  const walk = (x) => {
    if (typeof x === "string") return clean(x);
    if (Array.isArray(x)) return x.map(walk).filter((y) => y !== "");
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)]));
    return x;
  };
  return walk(v);
}

/* --------------------------------------------- deterministic factual answers */

const CAT_ASK = [
  { cats: ["gold"], re: /طلا|سکه/ },
  { cats: ["cash"], re: /نقد|سپرده|پول(?!ی)|حساب/ },
  { cats: ["currency"], re: /(?<![؀-ۿ])(ارز|دلار|یورو)(?![؀-ۿ])/ },
  { cats: ["stock"], re: /سهام|بورس/ },
  { cats: ["fund"], re: /صندوق/ },
  { cats: ["crypto"], re: /رمزارز|کریپتو|بیت‌?کوین|اتریوم/ },
  { cats: ["realestate"], re: /(?<![؀-ۿ])(ملک|املاک|مستغلات|آپارتمان|زمین)(?![؀-ۿ])/ },
];

function itemsOf(profile, cat) {
  return (profile.assets || []).filter((a) => num(a.amount) > 0 && engineCategoryOf(a) === cat);
}

function describeItem(a) {
  const name = a.label || CATEGORY_LABELS[a.category] || a.category;
  return `${name}: ${fmt(a.amount)} تومان`;
}

/**
 * A plain "how much X do I have / what's my income / my goals" question is answered from the profile itself.
 * Returns the reply text, or null when the message is not such a question (then the LLM answers, with validation).
 */
export function answerFactual(profile, message) {
  const m = String(message).trim();
  if (m.length > 140) return null;
  const asks = /(چقدر|چند|چنده|چیه|چیست|چقد|مقدار|مبلغ|میزان|دقیقاً|دقیقا|مجموع|کل)/.test(m);
  if (!asks) return null;
  // how much can be saved: pure arithmetic on two profile numbers
  if (/(پس‌?انداز|مازاد)/.test(m) && !/(بخرم|بفروشم|اگر|چرا|چطور|چگونه|پیشنهاد|ریسک|توصیه|هدف)/.test(m)) {
    const inc = num(profile.monthlyIncome);
    const exp = num(profile.monthlyExpenses);
    const surplus = inc - exp;
    const state = surplus >= 0 ? `حدود ${fmt(surplus)} تومان در ماه مازاد دارید` : `ماهانه ${fmt(-surplus)} تومان کسری دارید`;
    const debt = num(profile.existingDebt) > 0 ? ` (بدهی ثبت‌شده‌ی شما ${fmt(profile.existingDebt)} تومان است.)` : "";
    return `طبق اطلاعات ثبت‌شده‌ی شما: درآمد ماهانه ${fmt(inc)} تومان و هزینه‌ی ماهانه ${fmt(exp)} تومان است؛ یعنی ${state}.${debt}`;
  }
  // decisions, advice or reasoning are the model's job
  if (/(بخرم|بفروشم|بهتر|چرا|چطور|چگونه|اگر|پیشنهاد|ریسک|توصیه|بشه|میشه|می‌شود|شود|می‌?توان|می‌?تونم|پس‌?انداز|مناسب|کافی)/.test(m)) return null;
  // two questions in one message: answering only the first would silently drop the other
  if ((m.match(/چقدر|چند|چنده|چیه|چیست|چقد|؟|\?/g) || []).length > 2) return null;
  const { byEngine, total } = holdings(profile);
  const holdAsk = /(دارم|دارایی|موجودی|سرمایه)/.test(m);

  if (holdAsk) {
    const wanted = CAT_ASK.filter((c) => c.re.test(m)).flatMap((c) => c.cats);
    if (wanted.length) {
      const parts = wanted.map((c) => {
        const items = itemsOf(profile, c);
        if (!items.length) return `${CAT_NAME[c]}: در اطلاعات ثبت‌شده‌ی شما دارایی‌ای در این بخش ثبت نشده است.`;
        const det = items.length > 1 ? ` (${items.map(describeItem).join("، ")})` : "";
        return `${CAT_NAME[c]}: ${fmt(byEngine[c])} تومان${det}`;
      });
      const held = wanted.filter((c) => byEngine[c] > 0);
      const sum = held.length > 1 ? `\nجمع این موارد: ${fmt(held.reduce((s, c) => s + byEngine[c], 0))} تومان.` : "";
      return `طبق اطلاعات ثبت‌شده‌ی شما:\n${parts.join("\n")}${sum}\nمجموع کل دارایی‌های شما ${fmt(total)} تومان است.`;
    }
    if (/(مجموع|کل|همه|دارایی|سرمایه)/.test(m)) {
      const rows = Object.entries(byEngine).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${CAT_NAME[c] || c}: ${fmt(v)} تومان`);
      if (!rows.length) return "هنوز دارایی‌ای در پروفایل شما ثبت نشده است.";
      return `مجموع دارایی‌های ثبت‌شده‌ی شما ${fmt(total)} تومان است:\n${rows.join("\n")}`;
    }
  }
  if (/درآمد/.test(m)) return `درآمد ماهانه‌ی ثبت‌شده‌ی شما ${fmt(profile.monthlyIncome)} تومان است.`;
  if (/هزینه/.test(m)) return `هزینه‌ی ماهانه‌ی ثبت‌شده‌ی شما ${fmt(profile.monthlyExpenses)} تومان است.`;
  if (/بدهی|قسط|وام/.test(m)) return `بدهی/اقساط ثبت‌شده‌ی شما ${fmt(profile.existingDebt)} تومان است.`;
  if (/اهداف|هدف/.test(m)) {
    const gs = profile.goals || [];
    if (!gs.length) return "هنوز هدف مالی‌ای ثبت نکرده‌اید.";
    return "اهداف ثبت‌شده‌ی شما:\n" + gs.map((g, i) => `${i + 1}. ${g.title} — ${fmt(g.targetAmount)} تومان تا ${g.targetMonths} ماه دیگر`).join("\n");
  }
  return null;
}

/** Safe reply when the model keeps failing validation: only facts from the profile, plus an honest note. */
export function fallbackReply(profile) {
  const { byEngine, total } = holdings(profile);
  const rows = Object.entries(byEngine).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${CAT_NAME[c] || c}: ${fmt(v)} تومان`);
  return `نتوانستم پاسخی بنویسم که ۱۰۰٪ با اطلاعات ثبت‌شده‌ی شما هم‌خوان باشد و ترجیح دادم عددی نسازم. آنچه از پروفایل شما مطمئنم:\nدرآمد ماهانه ${fmt(profile.monthlyIncome)} تومان، هزینه‌ی ماهانه ${fmt(profile.monthlyExpenses)} تومان، مجموع دارایی ${fmt(total)} تومان${rows.length ? " (" + rows.join("، ") + ")" : ""}.\nلطفاً سؤالت را کمی دقیق‌تر یا کوتاه‌تر بپرس تا از روی همین داده‌ها پاسخ بدهم.`;
}
