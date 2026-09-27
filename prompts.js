import { optimizePortfolio } from "./optimizer.js";
import { dispersionPromptBlock, riskPromptBlock } from "./riskPresenter.js";
import { computeLiquidity } from "./liquidityEngine.js";

import { factsBlock, notHeld } from "./grounding.js";
import { evaluateGoals } from "./goalEngine.js";
import { CATEGORY_LABELS, ASSET_KINDS, UNIT_LABELS, kindOf } from "./public/assetCatalog.js";

export function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

const SYSTEM_PREAMBLE = `تو دستیار تحلیل مالی «چقدر» هستی؛ توضیح‌دهنده‌ی وضعیت مالی خانوارهای ایرانی، نه مشاور سرمایه‌گذاری و نه صادرکننده‌ی سیگنال معامله.
وظیفه تو کمک به کاربر برای فهمیدن وضعیت خودش و تصمیم‌گیری آگاهانه است؛ تصمیم نهایی همیشه با خود کاربر است.
همیشه تحلیل خودت را بر مبنای اطلاعات دقیق پروفایل کاربر (سن، وضعیت خانوادگی، ریسک‌پذیری، افق زمانی، درآمد و هزینه، دارایی‌ها و اهداف مالی) که در ادامه آمده انجام بده.
اصول تحلیل: تنوع دارایی، کفایت نقدینگی متناسب با نیازهای کاربر، تناسب ریسک با سن/افق زمانی/تحمل ریسک کاربر، و در نظر گرفتن شرایط اقتصاد ایران (تورم بالا، نوسان نرخ ارز و طلا، محدودیت دسترسی به بازارهای جهانی، ریسک نقدشوندگی ملک).
لحن پاسخ‌ها: حرفه‌ای، صادقانه، بدون اغراق و بدون وعده سود قطعی. اعداد پولی همیشه به تومان و به‌صورت عدد خام (بدون کاما یا واحد در متن JSON) بیان شوند مگر خلاف آن خواسته شده باشد.
تمام رشته‌های متنی خروجی (توضیحات، دلایل، ملاحظات، خلاصه‌ها) باید به زبان فارسی روان و طبیعی نوشته شوند. جمله‌ها کوتاه، ساده و کاملاً قابل‌فهم باشند (هر جمله یک نکته، بدون اصطلاح ساختگی یا جمله‌ی نامفهوم)؛ هر رشته حداکثر دو تا سه جمله و هر آرایه حداکثر ۴ مورد باشد تا خروجی کوتاه بماند. فقط درباره‌ی چیزهایی بنویس که در داده‌ها آمده؛ اگر مطمئن نیستی، ننویس. فیلد "category" همیشه باید دقیقاً یکی از این مقادیر انگلیسی باشد: cash, gold, currency, stock, fund, realestate, crypto, other.

### قانون سخت‌گیرانه: هرگز دستور معامله نده (اولویت بالاتر از هر قانون دیگر)
- هیچ‌وقت نگو «X گرم/تومان/درصد از فلان دارایی بخر»، «فلان دارایی را بفروش»، «این مبلغ را از A به B منتقل کن»، «حدود ۲۰٪ سبدت را وارد X کن» یا هر جمله‌ی مشابه که یک اقدام معاملاتی با مقدار مشخص را به کاربر دیکته کند. نام بردن یک محصول/نماد/صندوق/سکه‌ی مشخص برای خرید هم ممنوع است.
- به‌جای دستور، این‌ها را بگو: (۱) وضعیت فعلی چیست و چرا (با ارجاع به عدد واقعی همین کاربر)، (۲) کدام عامل‌ها ریسک/تمرکز/کمبود نقدینگی را می‌سازند، (۳) جهت‌های کلی و گزینه‌های قابل بررسی به زبان کیفی (مثلاً «سهم طلا از ریسک سبد بسیار بیشتر از سهم سرمایه‌اش است؛ کم‌کردن این تمرکز یا افزودن دارایی‌های کم‌همبستگی معمولاً نوسان را کم می‌کند») همراه با مزیت و هزینه‌ی هر گزینه، (۴) پرسش‌هایی که کاربر باید از خودش بپرسد.
- اعداد ترکیب «پیشنهادی/بهینه» که در ورودی می‌آید خروجی یک مدل ریاضی برای مقایسه و فهم است، نه توصیه‌ی معامله؛ اگر به آن ارجاع می‌دهی صراحتاً بگو «ترکیب مرجع مدل» و آن را به دستور خرید/فروش یا مبلغ قابل‌اجرا تبدیل نکن.
- اگر کاربر مستقیم پرسید «چقدر بخرم/بفروشم؟» یا «کدام را بخرم؟»، مؤدبانه توضیح بده که نمی‌توانی عدد یا دستور معامله بدهی، سپس عوامل مؤثر در تصمیمش را از روی داده‌های خودش تحلیل کن و در صورت لزوم پیشنهاد کن برای تصمیم نهایی با یک مشاور مالی مجاز مشورت کند.

قانون کیفیت ملاحظات: هر ملاحظه باید شخصی‌سازی‌شده باشد — با ارجاع مستقیم به داده‌ی واقعی همین کاربر (سنش، هدفش، مهلت هدفش، نیاز نقدینگی‌اش، ریسک‌پذیری‌اش، سهم و ریسک دارایی‌هایش) — ولی از جنس تحلیل و گزینه‌های قابل بررسی باشد، نه دستور معامله. جمله‌های کلی و قابل‌کپی‌برای‌هرکسی مثل «سبد خود را متنوع کنید» یا «پس‌انداز کنید» بدون ارجاع به داده‌های همین کاربر ممنوع است؛ اگر یک ملاحظه را بدون تغییر می‌شد به هر کاربر دیگری هم گفت، دوباره بنویسش.

قانون سخت‌گیرانه‌ی ضدهذیان (اولویت بالاتر از سبک نوشتن): قبل از نوشتن هر جمله که یک عدد، درصد، یا نام دسته‌ی دارایی در آن هست، از خودت بپرس «این عدد/دسته دقیقاً کجای بلوک‌های بالا (پروفایل کاربر، خروجی موتورها، اعداد رسمی) آمده؟». اگر جواب «هیچ‌جا، ولی به‌نظر منطقی می‌رسد» است، آن جمله را ننویس یا آن را کاملاً کیفی و بدون عدد/دسته‌ی مشخص بنویس. ساختن عددی که «تقریباً درست به‌نظر می‌رسد» (مثلاً نقدینگی را با یک درصد نزدیک ولی نادرست بیان کردن) از عدد کاملاً غلط هم بدتر است، چون کاربر آن را باور می‌کند. کلماتی مثل «بررسی»، «گزینه»، «پیشنهادی» تو را از این قانون معاف نمی‌کنند — این‌ها فقط سبک نوشتن‌اند، نه مجوز ساختن واقعیت جدید.`;

function fmtNum(n) {
  if (n === null || n === undefined || n === "") return "نامشخص";
  return Number(n).toLocaleString("en-US");
}

function assetLine(a, i) {
  const label = a.label ? a.label + " — " : "";
  const kind = kindOf(a);
  if (a.category === "gold" && kind?.live) {
    if (!(Number(a.amount) > 0) && Number(a.quantity) > 0) return `${i + 1}. ${label}${kind.label} — ${fmtNum(a.quantity)} ${UNIT_LABELS[kind.unit]} — ارزش تومانی به‌دلیل در دسترس نبودن قیمت آنی محاسبه نشد (عددی برایش نساز)`;
    return `${i + 1}. ${label}${kind.label} — ${fmtNum(a.quantity)} ${UNIT_LABELS[kind.unit]} — معادل ${fmtNum(a.amount)} تومان به قیمت آنی`;
  }
  if (kind && a.category !== "gold") {
    return `${i + 1}. ${label}${categoryLabel(a.category)} (${kind.label}) — ${fmtNum(a.amount)} تومان`;
  }
  if (a.category === "gold") {
    return `${i + 1}. ${label}${kind?.label || "طلا"} — ${fmtNum(a.amount)} تومان`;
  }
  if (a.category === "currency") {
    return `${i + 1}. ${label}ارز (${a.symbol || "USD"}) — ${fmtNum(a.quantity)} واحد — معادل ${fmtNum(a.amount)} تومان به نرخ آنی`;
  }
  if (a.category === "crypto") {
    return `${i + 1}. ${label}رمزارز (${a.symbol || "BTC"}) — ${fmtNum(a.quantity)} واحد — معادل ${fmtNum(a.amount)} تومان به نرخ آنی`;
  }
  return `${i + 1}. ${label}${categoryLabel(a.category)} — ${fmtNum(a.amount)} تومان`;
}

/** Per-goal verdicts from goalEngine.js (the same function as the goals page): the only source for "is my saving enough for my goal". */
/**
 * Second line of defense against the "کاهش سهم ملک/سهام" hallucination (a model claiming ownership of a class the
 * user doesn't hold, usually while phrasing it as a "قابل بررسی" suggestion). grounding.js's factsBlock already
 * states this negative list once at the end of the context; models are weak at inferring absence from a list they
 * have to scan, and strong at obeying an explicit negative list — so it is repeated here, right after the goal
 * status, with a rule that closes the exact loophole a hallucination used ("reducing" or "redistributing" something
 * that isn't held is different from proposing it as a brand-new option).
 */
function notHeldCategoriesBlock(profile) {
  const missing = notHeld(profile);
  if (!missing.length) return "";
  const labels = missing.map((c) => categoryLabel(c)).join("، ");
  return `\n\n### دسته‌های دارایی که این کاربر اصلاً ندارد (قانون سخت‌گیرانه: هرگز از این دسته‌ها به‌عنوان دارایی موجود کاربر حرف نزن — نه در reasons، نه در suggestions، نه در هیچ رشته‌ی دیگر — حتی برای پیشنهاد «کاهش سهم» یا «توزیع مجدد»؛ اگر می‌خواهی به یکی از این‌ها اشاره کنی فقط می‌توانی به‌صراحت بگویی کاربر این دسته را اصلاً ندارد یا آن را به‌عنوان یک گزینه‌ی کاملاً جدید برای افزودن مطرح کنی، نه برای کاهش یا توزیع مجدد چیزی که وجود ندارد)\n${labels}`;
}

function goalStatusBlock(profile) {
  if (!(profile.goals || []).length) return "";
  const lines = evaluateGoals(profile).map(({ goal, result: r }) => {
    const pace =
      r.monthsNeededAtCurrentPace === 0
        ? "سرمایه‌ی موجود به‌تنهایی به هدف می‌رسد"
        : r.monthsNeededAtCurrentPace !== null
          ? `با سرمایه‌ی موجود و پس‌انداز ماهانه‌ی فعلی حدود ${r.monthsNeededAtCurrentPace} ماه`
          : "با پس‌انداز فعلی به هدف نمی‌رسد";
    // `feasible: true` can still be a razor's edge (a wafer-thin monthly/time margin): a goal like that must never be
    // narrated as a plain, unqualified "strength" — always name the margin so the user knows how little room there is
    const MARGIN_TEXT = {
      infeasible: "—",
      covered_by_capital: "بدون وابستگی به پس‌انداز ماهانه، چون سرمایه‌ی موجود به‌تنهایی کافی است",
      tight: `حاشیه‌ی امنیت بسیار کم و لبه‌ی تیغ (فقط ${r.savingMarginPercent ?? r.monthsMarginPercent}٪ فضای مانور در پس‌انداز/مهلت) — هرگز این را ساده یا بدون هشدار «نقطه‌قوت» معرفی نکن؛ صریح بگو کوچک‌ترین افزایش هزینه یا کاهش درآمد یا تأخیر می‌تواند این هدف را از دسترس خارج کند`,
      moderate: `حاشیه‌ی امنیت متوسط (حدود ${r.savingMarginPercent ?? r.monthsMarginPercent}٪ فضای مانور)`,
      comfortable: `حاشیه‌ی امنیت خوب (حدود ${r.savingMarginPercent ?? r.monthsMarginPercent}٪ فضای مانور)`,
    };
    return `«${goal.title}»: ${r.feasible ? "با شرایط فعلی در مهلت قابل دستیابی است" : "با شرایط فعلی در مهلت قابل دستیابی نیست"} — ${pace} (مهلت ${goal.targetMonths} ماه) — پیش‌بینی جمع‌شده تا مهلت ${fmtNum(r.projectedAmountAtDeadline)} تومان در برابر مبلغ هدف در سررسید ${fmtNum(r.targetAtDeadline)} (مبلغ امروز ${fmtNum(r.targetAmount)} با فرض رشد قیمت ${r.priceGrowthPercent}٪ سالانه) — ${MARGIN_TEXT[r.marginTier]}`;
  });
  return `\n\n### وضعیت رسیدن به اهداف (خروجی موتور اهداف، همان اعداد صفحه‌ی اهداف مالی — هر جمله درباره‌ی کافی/ناکافی بودن درآمد یا پس‌انداز برای هدف، یا هر جمله‌ای که یک هدف را «نقطه‌قوت»/دستاورد ساده معرفی می‌کند، باید دقیقاً با همین‌ها و همین حاشیه‌ی امنیت هم‌خوان باشد)\n${lines.join("\n")}`;
}

export function buildProfileContext(profile) {
  const p = profile.personal || {};
  const totalAssets = (profile.assets || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const assetLines = (profile.assets || []).length ? profile.assets.map(assetLine).join("\n") : "کاربر هنوز هیچ دارایی‌ای ثبت نکرده است.";

  const liveRatesLine = profile._liveRates
    ? `\n(نرخ‌های آنی استفاده‌شده برای تبدیل طلا/ارز/رمزارز به تومان: هر گرم طلای ۱۸ عیار ${fmtNum(profile._liveRates.goldTomanPerGram)} تومان، هر دلار ${fmtNum(profile._liveRates.usdToman)} تومان — منبع: ${profile._liveRates.source}${profile._liveRates.date ? ` — تاریخ ${profile._liveRates.date}، ساعت ${profile._liveRates.time}` : ` — دریافت‌شده در ${profile._liveRates.fetchedAt}`})`
    : "";

  const goalLines = (profile.goals || []).length
    ? profile.goals
        .map(
          (g, i) =>
            `${i + 1}. عنوان: ${g.title} — مبلغ هدف: ${fmtNum(g.targetAmount)} تومان — مهلت: ${g.targetMonths} ماه دیگر`
        )
        .join("\n")
    : "هدف مالی ثبت‌شده‌ای وجود ندارد.";

  // Computed ONCE here with the exact same deterministic engines used by the
  // dedicated ریسک/نقدینگی pages (optimizer.js, liquidityEngine.js), and
  // injected into every prompt that includes this context — chat included.
  // This is what keeps "ریسک فعلی" or "نقدینگی سریع" from ever being stated
  // as a different number on one page/response than another: every prompt
  // sees the same canonical figures and is told to reuse them verbatim,
  // never re-derive or guess its own.
  const engineProfile = { ...profile, riskTolerance: profile._engineRiskTolerance ?? profile.riskTolerance };
  const riskComputed = optimizePortfolio(engineProfile).current;
  const liquidityComputed = computeLiquidity(profile);
  const canonicalNumbers = `

### اعداد رسمی و ثابت وضعیت فعلی سبد دارایی (محاسبه‌شده با موتور ریسک روی داده‌ی واقعی بازار و موتور نقدشوندگی — دقیقاً همین اعداد در همه‌ی صفحات و پاسخ‌های برنامه استفاده می‌شود؛ اگر جایی درباره‌ی ریسک یا نقدینگی فعلی کاربر صحبت می‌کنی، همیشه عیناً همین اعداد را بگو، هرگز عدد دیگری نساز یا دوباره حدس نزن)
ریسک فعلی سبد (شاخص ترکیبی: نوسان + افت + دم بد + تمرکز + نقدشوندگی + فرسایش نقد، نه صرفاً نوسان قیمت): ${riskComputed.riskScore} از ۱۰۰ (سطح: ${riskComputed.riskLevel})
نقدینگی سریع: ${liquidityComputed.liquidPercent}٪ | نیمه‌نقد: ${liquidityComputed.semiLiquidPercent}٪ | غیرنقد: ${liquidityComputed.illiquidPercent}٪`;

  return `### پروفایل کاربر
سن: ${p.age ?? "نامشخص"}
جنسیت: ${p.gender ?? "نامشخص"}
وضعیت تاهل: ${p.maritalStatus ?? "نامشخص"}
تعداد فرزند: ${p.childrenCount ?? "نامشخص"}
نوع شغل/درآمد: ${p.employmentType || "نامشخص"}
وضعیت مسکن: ${p.housingStatus || "نامشخص"}
سطح تجربه سرمایه‌گذاری: ${profile.investmentExperience || "نامشخص"}
واکنش احتمالی به افت ۲۰٪ ارزش دارایی‌ها (خوداظهاری): ${profile.emotionalRiskReaction || "نامشخص"}
میزان ریسک‌پذیری اعلامی کاربر (مقیاس ۱ تا ۱۰): ${profile.riskTolerance ?? 5}
درآمد ماهانه: ${fmtNum(profile.monthlyIncome)} تومان
هزینه ماهانه: ${fmtNum(profile.monthlyExpenses)} تومان
بدهی/اقساط وام فعلی: ${fmtNum(profile.existingDebt)} تومان
افق زمانی سرمایه‌گذاری: ${profile.horizonYears ? `${profile.horizonYears} سال` : "نامشخص"}
یادداشت افق زمانی سرمایه‌گذاری: ${profile.timeHorizonNote || "ندارد"}
یادداشت نیاز به نقدینگی: ${profile.liquidityNeedNote || "ندارد"}
مهم‌ترین هدف مالی زندگی (خوداظهاری آزاد): ${profile.mainGoalDescription || "ندارد"}
یادداشت آزاد کاربر (هر نکته‌ی دیگری که خودش صلاح دیده اضافه کند): ${profile.freeNotes || "ندارد"}

### دارایی‌های کاربر (مجموع: ${fmtNum(totalAssets)} تومان)
${assetLines}${liveRatesLine}

### اهداف مالی ثبت‌شده
${goalLines}${goalStatusBlock(profile)}${notHeldCategoriesBlock(profile)}${canonicalNumbers}

${factsBlock(profile)}`;
}

// appended to the task instructions of the two widgets a "دارایی نداشته" hallucination has actually been observed
// in (assets, risk): asks for one explicit self-check pass against the negative list and the official numbers
// before the JSON is emitted, on top of the server-side validator that catches what slips through anyway.
const SELF_CHECK_INSTRUCTION = `پیش از فرستادن JSON نهایی، هر رشته‌ی reasons/suggestions/weaknesses/strengths را یک‌بار در ذهنت با بلوک «دسته‌های دارایی که کاربر اصلاً ندارد» و با اعداد رسمی بالا مقایسه کن؛ اگر هر رشته اسم یک دسته‌ی نداشته را به‌عنوان دارایی موجود آورده یا عددی دارد که در بلوک‌های بالا نیست، آن رشته را حذف یا بازنویسی کن، بعد JSON را بفرست.`;

function jsonInstruction(schemaDescription) {
  return `\n\n### دستور خروجی\nفقط و فقط یک JSON معتبر و تک‌خطی یا چندخطی مطابق دقیقاً همین ساختار زیر برگردان. هیچ متن، توضیح، یا Markdown خارج از JSON ننویس و از code fence استفاده نکن:\n${schemaDescription}`;
}

// only categories with weight: listing "سهام: 0٪ ، ملک: 0٪" invites the model to write about assets the portfolio lacks
function formatPct(w) {
  const rows = ASSET_ORDER_FOR_PROMPT.filter((k) => (w[k] || 0) > 0.0005);
  return rows.length ? rows.map((k) => `${categoryLabel(k)}: ${Math.round((w[k] || 0) * 1000) / 10}٪`).join("، ") : "—";
}

const ASSET_ORDER_FOR_PROMPT = ["cash", "gold", "currency", "stock", "fund", "realestate", "crypto", "other"];

/**
 * `computed` comes from optimizer.js (a real mean-variance QP solve, not the
 * LLM). The model is ONLY asked to explain these already-computed numbers in
 * Persian — it must not invent its own percentages, risk scores or returns.
 */
export function promptAssets(profile, computed) {
  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### خروجی موتور بهینه‌سازی پرتفوی (محاسبه‌شده، نه حدسی — این اعداد را عیناً به‌کار ببر و عدد جدیدی نساز)
ترکیب فعلی (درصد از کل دارایی): ${formatPct(computed.current.weights)}
ترکیب پیشنهادی بهینه (خروجی مدل بهینه‌سازی میانگین-واریانس با قیود نقدشوندگی ایران): ${formatPct(computed.optimal.weights)}
بازده مورد انتظار سالانه فعلی: ${(computed.current.expectedReturn * 100).toFixed(1)}٪ | پیشنهادی: ${(computed.optimal.expectedReturn * 100).toFixed(1)}٪
امتیاز نقدشوندگی وزنی (میانگین ضریب نقدشوندگی دارایی‌ها؛ با درصد «نقد سریع/نیمه‌نقد» صفحه‌ی نقدینگی فرق دارد و جایگزین آن نیست) فعلی: ${computed.current.liquidityPercent}٪ | پیشنهادی: ${computed.optimal.liquidityPercent}٪
${dispersionPromptBlock(computed.current.analysis, computed.optimal.analysis)}

### وظیفه
فقط بر اساس همین اعداد محاسبه‌شده (نه با ساختن عدد جدید)، توضیح بده که چرا ترکیب فعلی این نقاط قوت/ضعف را دارد و چرا موتور بهینه‌سازی این ترکیب پیشنهادی را داده (مثلاً برای کاهش تمرکز، افزایش تنوع، یا تامین نقدینگی لازم). اگر تمرکز روی یک دارایی بیش از حد است هشدار بده. فیلد suggestions در این خروجی «ملاحظات و گزینه‌های قابل بررسی» است: تحلیل کیفی و جهت‌های کلی (مثلاً کاهش تمرکز، افزایش تنوع، تامین نقدینگی) با مزیت/هزینه‌ی هرکدام — نه دستور خرید/فروش و نه مبلغ/گرم/درصد قابل‌اجرا.
${SELF_CHECK_INSTRUCTION}${jsonInstruction(`{
  "concentrationWarning": string or null,
  "strengths": [string],
  "weaknesses": [string],
  "suggestions": [string],
  "summary": string
}`)}`;
}

export function promptRisk(profile, computed) {
  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### خروجی موتور ریسک (شاخصی ترکیبی از نوسان، افت، دم بد، تمرکز، نقدشوندگی و فرسایش نقد — نه صرفاً نوسان قیمت — اندازه‌گیری‌شده روی داده‌ی هفتگی واقعی بازار ایران، نه توسط تو — این اعداد قطعی هستند)
ریسک فعلی سبد: ${computed.current.riskScore} از ۱۰۰ (سطح: ${computed.current.riskLevel}) — نوسان بازار به‌تنهایی (زیرمجموعه‌ی همین شاخص، فقط بخش قیمت‌دار): ${(computed.current.volatility * 100).toFixed(1)}٪ سالانه، امتیاز نوسان ${computed.current.volatilityScore} از ۱۰۰
ریسک پیشنهادی (بر اساس ریسک‌پذیری اعلامی کاربر و بهینه‌سازی میانگین-واریانس با قید نقدشوندگی): ${computed.optimal.riskScore} از ۱۰۰ (سطح: ${computed.optimal.riskLevel})
اختلاف: ${computed.optimal.riskScore - computed.current.riskScore}
${riskPromptBlock(computed.current.analysis)}

### وظیفه
فقط بر اساس همین اعداد محاسبه‌شده (آن‌ها را دوباره حدس نزن یا تغییر نده)، توضیح بده این ریسک از کجا می‌آید (کدام دارایی‌ها و چه تمرکزی باعثش شده)، چه رفتار یا سوگیری اقتصادی/روانی ممکن است پشت این ترکیب باشد، و چه جهت‌های کلی‌ای می‌تواند اختلاف با ریسک مرجع مدل را کم کند. فیلد suggestions «ملاحظات و گزینه‌های قابل بررسی» است: کیفی، با مزیت/هزینه، بدون دستور معامله و بدون مقدار قابل‌اجرا.
قانون مرز موضوعی: reasons و suggestions این بخش فقط درباره‌ی ریسک سبد (نوسان، تمرکز، نقدشوندگی، فرسایش نقد) است. اگر لازم شد به وضعیت یک هدف مالی هم اشاره کنی (مثلاً چون حاشیه‌ی امنیتش کم است)، آن جمله را با یک عبارت رابط صریح شروع کن که ربطش به ریسک سبد را روشن کند (مثلاً «همین تمرکز ریسک، به‌طور خاص برای هدف با حاشیه‌ی امنیت کم زیر هم مهم است چون...») — هرگز یک جمله‌ی مستقل و بی‌مقدمه درباره‌ی مهلت/حاشیه‌ی امنیت یک هدف را وسط suggestions ریسک نگذار؛ آن موضوع صفحه‌ی خودِ آن هدف است.
${SELF_CHECK_INSTRUCTION}${jsonInstruction(`{
  "reasons": [string],
  "behavioralFactors": [string],
  "suggestions": [string],
  "summary": string
}`)}`;
}

/**
 * `computed` comes from liquidityEngine.js — a FIXED tier (liquid/semi-liquid/
 * illiquid) per asset category derived from the same liquidity scores used
 * in optimizer.js, not a per-call LLM guess. This is what keeps the answer
 * to "is gold liquid?" from changing between calls. The LLM only explains
 * these numbers.
 */
export function promptLiquidity(profile, computed) {
  const breakdownText = computed.breakdown
    .map((b) => `${categoryLabel(b.category)}: ${fmtNum(Math.round(b.amount))} تومان — دسته: ${b.tier === "liquid" ? "نقد سریع" : b.tier === "semiLiquid" ? "نیمه‌نقد" : "غیرنقد"} (${b.note})`)
    .join("\n");

  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### طبقه‌بندی نقدشوندگی (محاسبه‌شده با قاعده‌ی ثابت، نه حدس — این دسته‌بندی‌ها همیشه یکسان و قطعی هستند، عوض‌شان نکن)
${breakdownText}

نقد سریع: ${computed.liquidPercent}٪ | نیمه‌نقد: ${computed.semiLiquidPercent}٪ | غیرنقد: ${computed.illiquidPercent}٪
پول در دسترس: فوری ${fmtNum(computed.availableByPeriod.immediate)} تومان | تا ۱ ماه ${fmtNum(computed.availableByPeriod.oneMonth)} | تا ۳ ماه ${fmtNum(computed.availableByPeriod.threeMonths)} | تا ۱ سال ${fmtNum(computed.availableByPeriod.oneYear)}
ذخیره‌ی نقدی توصیه‌شده (۳ ماه هزینه): ${fmtNum(computed.recommendedBuffer)} تومان | کمبود نسبت به وجه نقد فوری: ${fmtNum(computed.shortfall)} تومان

### وظیفه
فقط بر اساس همین اعداد و دسته‌بندی‌های محاسبه‌شده (آن‌ها را تغییر نده)، به کاربر توضیح بده وضعیت نقدینگی‌اش چطور است. فیلد warnings فقط برای «مشکل یا خطر واقعی» است؛ اگر کمبود نقدینگی نیست (کمبود نسبت به وجه نقد فوری صفر است)، خبر خوب مثل «ذخیره‌ی نقدی کافی است» را در warnings نگذار (آن را در summary بنویس) و اگر خطر مشخصی نیست warnings را آرایه‌ی خالی بگذار. اگر «کمبود نسبت به وجه نقد فوری» بزرگ‌تر از صفر است، حتماً هشدار واضح بده و راهکارهای کلی را به‌صورت کیفی توضیح بده (مثلاً اهمیت داشتن ذخیره‌ی نقدشونده، مزیت/هزینه‌ی نگه‌داری آن) — بدون اینکه بگویی کدام دارایی را چقدر بفروشی یا بخری.${jsonInstruction(`{
  "warnings": [string],
  "summary": string
}`)}`;
}

/**
 * `computed` comes from goalEngine.js (a real time-value-of-money annuity
 * calculation, the same "engine computes / LLM only narrates" split used
 * for every other widget) — the LLM never computes feasibility or the
 * required monthly saving itself, only explains numbers it's handed.
 */
export function promptGoal(profile, goal, computed) {
  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### هدف مالی مورد بررسی
عنوان: ${goal.title}
مبلغ هدف: ${fmtNum(goal.targetAmount)} تومان
مهلت: ${goal.targetMonths} ماه دیگر

### اعداد محاسبه‌شده توسط موتور مالی (عیناً استفاده کن، عدد جدیدی نساز)
رشد قیمت خودِ هدف (فرض): ${computed.priceGrowthPercent}٪ سالانه؛ مبلغ هدف در سررسید با این رشد: ${fmtNum(computed.targetAtDeadline)} تومان (مبلغ امروز ${fmtNum(computed.targetAmount)}). این فرض تخمین است نه داده؛ حتماً یک‌بار در متن بگو که محاسبه با فرض رشد قیمت هدف انجام شده و اگر هدف واقعاً گران نمی‌شود نتیجه خوش‌بینانه‌تر است. اگر قیمت هدف ثابت می‌ماند: ${computed.ifPriceStaysFlat.monthsNeededAtCurrentPace === null ? "هرگز نمی‌رسید" : computed.ifPriceStaysFlat.monthsNeededAtCurrentPace + " ماه"}.
افق زمانی: ${computed.horizonTier}
نرخ رشد سالانه فرض‌شده برای پول این هدف: ${computed.assumedAnnualReturnPercent}٪
سرمایه‌ی موجود کاربر که برای این هدف حساب شده (دارایی‌های نقد و نیمه‌نقد فعلی؛ ملک/خودرو حساب نشده و در صورت وجود چند هدف، همین سرمایه بین همه‌ی اهداف مشترک است): ${fmtNum(computed.startingCapital)} تومان — اگر بدون هیچ پس‌انداز جدیدی نگه داشته شود با نرخ رشد فرض‌شده تا مهلت به ${fmtNum(computed.projectedFromExistingAssets)} تومان می‌رسد
پس‌انداز ماهانه‌ی جدید لازم (علاوه بر همین سرمایه‌ی موجود) برای رسیدن دقیق به هدف در مهلت تعیین‌شده: ${fmtNum(computed.requiredMonthlySaving)} تومان
توان پس‌انداز ماهانه فعلی کاربر (درآمد منهای هزینه و اقساط بدهی): ${fmtNum(computed.currentMonthlySavingCapacity)} تومان
مازاد یا کسری ماهانه نسبت به نیاز: ${computed.monthlySurplus >= 0 ? "+" : ""}${fmtNum(computed.monthlySurplus)} تومان
آیا با پس‌انداز فعلی امکان‌پذیر است: ${computed.feasible ? "بله" : "خیر"}
نتیجه‌ی قطعی موتور: این هدف ${computed.feasible ? "با شرایط فعلی در مهلت قابل دستیابی است؛ هرگز نگو پس‌انداز یا درآمد «کافی نیست/کفایت ندارد» و لازم نیست درآمد یا سرمایه‌ی جدید بیاورد" : "با شرایط فعلی در مهلت قابل دستیابی نیست؛ نگو کافی است"} — درباره‌ی کافی/ناکافی بودن قضاوت خودت را نکن، فقط همین را توضیح بده.
${computed.monthsNeededAtCurrentPace === 0 ? "سرمایه‌ی موجود کاربر به‌تنهایی همین حالا به مبلغ هدف می‌رسد." : computed.monthsNeededAtCurrentPace !== null ? `با سرمایه‌ی موجود و همین توان پس‌انداز فعلی، رسیدن به مبلغ هدف حدود ${computed.monthsNeededAtCurrentPace} ماه طول می‌کشد (مهلت خواسته‌شده ${goal.targetMonths} ماه است).` : "توان پس‌انداز فعلی کاربر صفر یا نامشخص است (درآمد/هزینه ثبت نشده)."}
با سرمایه‌ی موجود به‌علاوه‌ی پس‌انداز ماهانه‌ی فعلی، تا مهلت ${goal.targetMonths} ماهه حدود ${fmtNum(computed.projectedAmountAtDeadline)} تومان جمع می‌شود.

### وظیفه
این اعداد را در یک خلاصه‌ی روان فارسی توضیح بده و مسیرهای ممکن را به‌صورت کیفی (تنظیم پس‌انداز، تمدید مهلت، کاهش مبلغ هدف) با مزیت/هزینه‌ی هرکدام مقایسه کن.
قانون سخت‌گیرانه: هیچ عدد ماه، مبلغ، یا درصد جدیدی که دقیقاً در بالا نیامده حساب، حدس، یا تخمین نزن — نه "ماه‌های باقیمانده پس از یک بازه‌ی خاص"، نه "مبلغ تفکیک‌شده برای هر بخش از هدف"، نه هیچ محاسبه‌ی میان‌راهی دیگر. فقط از همین چند عدد داده‌شده (پس‌انداز ماهانه لازم، توان پس‌انداز فعلی، مازاد/کسری ماهانه، تعداد ماه واقعی، مبلغ جمع‌شده تا مهلت) استفاده کن. اگر لازم شد چیزی فراتر از این اعداد بگویی، فقط توصیف کیفی بده (مثلاً «بعد از رسیدن به سقف پس‌انداز فعلی باید یا مدت را تمدید کرد یا مبلغ پس‌انداز ماهانه را افزایش داد»)، بدون آنکه رقم جدیدی برایش بسازی.
اگر feasible=false است، پیشنهادها را دقیقاً روی همین اعداد داده‌شده بنا کن (مثلاً افزایش پس‌انداز ماهانه تا سطح "پس‌انداز ماهانه لازم"، یا تمدید مهلت به همان "تعداد ماه واقعی" که داده شده).

قانون مهم درباره‌ی نوع دارایی پیشنهادی: نرخ رشد سالانه‌ی فرض‌شده در بالا (${computed.assumedAnnualReturnPercent}٪) دقیقاً همان بازدهی است که پول این هدف باید کسب کند تا در افق زمانی تعیین‌شده به مبلغ هدف برسد. پس توضیح بده که نگه‌داشتن پول این هدف به‌صورت نقد راکد در اقتصاد تورمی ایران معمولاً از همین نرخ رشد لازم عقب می‌ماند (مگر افق بسیار کوتاه باشد یا هدف کاربر حفظ اصل پول باشد)، و اینکه پول این هدف باید در چه «سطح ریسکی» قرار بگیرد تا نرخ رشد فرض‌شده واقع‌بینانه باشد — فقط در حد سطح ریسک/ویژگی دارایی (مثلاً نقدشوندگی، نوسان)، بدون نام بردن محصول مشخص، بدون مبلغ خرید و بدون دستور معامله.

اگر با توجه به دارایی‌های نقد/نیمه‌نقد فعلی کاربر بخشی از هدف از محل دارایی موجود قابل تامین است، آن را هم به‌صورت کیفی (بدون مبلغ دقیق ساختگی) در مسیر پیشنهادی بیاور.${jsonInstruction(`{
  "suggestedPath": [string],
  "risks": [string],
  "summary": string
}`)}`;
}

/**
 * Non-market scenarios (personal income/expense changes, or free text that
 * doesn't map to a tradable asset shock) have no statistical model to run —
 * there is no "covariance of your salary". For these, the LLM does the full
 * qualitative reasoning, same as the original MVP design.
 */
export function promptScenarioQualitative(profile, scenario) {
  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### سناریوی مورد بررسی (سناریوی غیربازاری — بدون مدل آماری قابل‌اجرا)
${scenario.title}
${scenario.description || ""}

### وظیفه
این سناریو یک اتفاق بازاری با قیمت قابل‌شبیه‌سازی نیست (مثلاً تغییر درآمد/هزینه شخصی)، بنابراین اثر آن را با استدلال کیفی بر دارایی‌ها، نقدینگی و اهداف مالی کاربر تحلیل کن. اگر بخشی از اثر قابل محاسبه عددی است (مثلاً کاهش توان پس‌انداز ماهانه) آن را محاسبه کن.${jsonInstruction(`{
  "scenarioTitle": string,
  "impactByAsset": [{"category": string, "label": string, "changePercent": number, "changeAmount": number}],
  "totalPortfolioChangePercent": number,
  "totalPortfolioChangeAmount": number,
  "explanation": string,
  "recommendation": string
}`)}`;
}

/**
 * Lightweight extraction call: translate a free-text scenario into a
 * structured asset-shock vector the Monte Carlo engine can simulate — the
 * LLM's job here is strictly natural-language-to-structured-data, not
 * computing any financial outcome itself.
 */
export function promptScenarioExtract(customText) {
  return `تو یک مبدل متن آزاد به داده ساخت‌یافته هستی. کاربر یک سناریوی اقتصادی فرضی نوشته است. اگر این سناریو مستقیماً معادل یک تغییر قیمت (شوک) روی یک یا چند مورد از این دسته‌های دارایی باشد: cash, gold, currency, stock, fund, realestate, crypto — آن را استخراج کن. اگر سناریو یک رویداد بازاری با شوک قیمتی مشخص نیست (مثلاً تغییر درآمد شخصی، هزینه، یا موضوعی نامرتبط با قیمت دارایی)، shocks را null بگذار.

متن کاربر: "${customText}"

فقط JSON زیر را برگردان، بدون هیچ توضیح اضافه:
{
  "shocks": {"category": number} or null,
  "scenarioTitle": string
}
مثال: اگر کاربر بنویسد "اگر دلار ۴۰٪ رشد کند چه می‌شود؟" خروجی باید {"shocks": {"currency": 0.4}, "scenarioTitle": "رشد ۴۰ درصدی دلار"} باشد. مقدار شوک باید عدد اعشاری بین -1 و 3 باشد (مثلاً ۴۰٪ رشد یعنی 0.4، ۲۰٪ کاهش یعنی -0.2).`;
}

/**
 * `computed` is the output of monteCarlo.simulateShock — real percentiles
 * from a conditional multivariate-normal simulation, not an LLM guess. The
 * model only explains these numbers in Persian.
 */
export function promptScenarioExplain(profile, scenarioTitle, computed) {
  const assetLines = computed.impactByAsset
    .map((a) => `${categoryLabel(a.category)}: میانه ${a.changePercent}٪ (بازه ۷۰٪ اطمینان: ${Math.round(a.p15 * 1000) / 10}٪ تا ${Math.round(a.p85 * 1000) / 10}٪)`)
    .join("\n");

  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### نتیجه شبیه‌سازی مونت‌کارلو برای سناریوی «${scenarioTitle}» (محاسبه‌شده با ${computed.trials} تکرار روی توزیع نرمال چندمتغیره شرطی، نه حدس — این اعداد را عیناً به‌کار ببر)
افق بازه‌ها: ${computed.horizonMonths} ماه پس از شوک؛ اندازه‌ی خود شوک هم نامطمئن فرض شده (انحراف معیار نسبی ${Math.round(computed.shockSeveritySd * 100)}٪). دارایی‌هایی که شوک مستقیم ندارند فقط از راه همبستگی با دارایی شوک‌خورده اثر می‌گیرند و بازه‌ی آن‌ها نوسان همین افق کوتاه است نه یک سال.
اثر روی هر دارایی کاربر:
${assetLines}

اثر کل روی پرتفوی: میانه ${computed.portfolio.p50Percent}٪ (${fmtNum(computed.portfolio.p50Amount)} تومان) — بازه ۷۰٪ اطمینان: از ${computed.portfolio.p15Percent}٪ تا ${computed.portfolio.p85Percent}٪ (${fmtNum(computed.portfolio.p15Amount)} تا ${fmtNum(computed.portfolio.p85Amount)} تومان)

### وظیفه
فقط بر اساس همین اعداد محاسبه‌شده (عدد جدید نساز)، توضیح بده چرا این اتفاق روی هر دارایی این‌طور اثر می‌گذارد (با توجه به همبستگی معمول آن دارایی با این سناریو در اقتصاد ایران)، بازه عدم‌قطعیت را به زبان ساده توضیح بده، و در فیلد recommendation ملاحظات کیفی برای مقابله یا آمادگی (مثلاً نگاه به تمرکز و نقدینگی) را بنویس — بدون دستور خرید/فروش و بدون مقدار قابل‌اجرا.${jsonInstruction(`{
  "explanation": string,
  "recommendation": string
}`)}`;
}

/**
 * Step 1 of 2 for the decision-assistant widget: pure NL-understanding —
 * turn the user's free-text decision into structured per-category asset
 * deltas. This is the one part of this widget an LLM genuinely has to do
 * (interpreting "نیمی از طلا" or "۲۰۰ میلیون از سپرده‌ام" needs language
 * understanding); everything downstream (the real before/after risk score
 * and liquidity %) is then computed deterministically by the same engines
 * used on the ریسک‌سنجی/نقدینگی pages — see promptDecisionExplain below and
 * the /api/widgets/decision route in server.js.
 */
export function promptDecisionExtract(profile, decision) {
  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### تصمیم فرضی مورد بررسی کاربر
${decision.description}
${decision.amount ? `مبلغ مرتبط: ${fmtNum(decision.amount)} تومان` : ""}

### وظیفه
این تصمیم را به یک لیست تغییرات ساخت‌یافته روی دسته‌های دارایی تبدیل کن — دقیقاً کار یک متخصص استخراج داده، نه تصمیم‌گیری مالی: هر آیتم شامل category (یکی از cash, gold, currency, stock, fund, realestate, crypto, other) و amountDelta (عدد تومان، مثبت یعنی افزایش آن دسته، منفی یعنی کاهش) است. مجموع مقادیر مثبت و منفی باید تقریباً برابر باشند (چون این جابه‌جایی پول بین دسته‌هاست، نه خلق پول از هیچ). اگر تصمیم فقط یک دسته را کم می‌کند بدون مقصد مشخص (مثلاً «خرج کردن» برای مصرف، نه سرمایه‌گذاری مجدد)، فقط همان یک آیتم منفی را بگذار. اگر مبلغ دقیق در متن یا فیلد «مبلغ مرتبط» داده شده، از همان استفاده کن؛ اگر مبهم است (مثلاً «نیمی از طلا»)، با توجه به دارایی‌های فعلی کاربر (بالا) عدد دقیق را خودت محاسبه کن. اگر تصمیم اصلاً به دارایی‌های سرمایه‌گذاری مربوط نیست (مثلاً فقط یک سوال است)، assetChanges را آرایه‌ی خالی بگذار.${jsonInstruction(`{
  "assetChanges": [{"category": "cash|gold|currency|stock|fund|realestate|crypto|other", "amountDelta": number}]
}`)}`;
}

/**
 * Step 2 of 2: `computed.before`/`computed.after` come from applying the
 * extracted assetChanges to a copy of the profile and running BOTH through
 * optimizer.js + liquidityEngine.js — the exact same functions the
 * ریسک‌سنجی/نقدینگی pages call. The LLM only narrates and recommends based
 * on these numbers; it never states its own risk score or liquidity %, so
 * this widget can no longer disagree with the dedicated pages.
 */
export function promptDecisionExplain(profile, decision, computed) {
  const b = computed.before;
  const a = computed.after;
  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### تصمیم فرضی مورد بررسی کاربر
${decision.description}
${decision.amount ? `مبلغ مرتبط: ${fmtNum(decision.amount)} تومان` : ""}

### وضعیت قبل و بعد از این تصمیم (محاسبه‌شده با همان موتور بهینه‌سازی پرتفوی و موتور نقدشوندگی که در صفحات ریسک‌سنجی و نقدینگی استفاده می‌شوند — دقیقاً همین اعداد را در پاسخت بیاور، عدد جدیدی نساز)
قبل: کل دارایی ${fmtNum(b.totalAssets)} تومان | ریسک ${b.riskScore} از ۱۰۰ | نقدینگی سریع ${b.liquidPercent}٪
بعد: کل دارایی ${fmtNum(a.totalAssets)} تومان | ریسک ${a.riskScore} از ۱۰۰ | نقدینگی سریع ${a.liquidPercent}٪

### وظیفه
یک خلاصه‌ی روان از این تصمیم بنویس، اثرش را روی اهداف مالی ثبت‌شده‌ی کاربر (در صورت وجود) توضیح بده، و صرفاً بر اساس همین تغییر در ریسک و نقدینگی که بالا آمده (نه حدس خودت) ارزیابی نهایی بده. توجه: مقدار فیلد recommendation فقط ارزیابی «تناسب این تصمیم با ریسک/نقدینگی/اهداف خود کاربر» است و توصیه‌ی اجرای معامله نیست (مقادیر: «پیشنهاد می‌شود» = همسو، «با احتیاط» = قابل‌تأمل، «پیشنهاد نمی‌شود» = ناهمسو). اگر ریسک بعد از تصمیم به‌طور نگران‌کننده‌ای افزایش یافته یا نقدینگی سریع به سطح خطرناکی افت کرده، «پیشنهاد نمی‌شود» یا «با احتیاط» بده؛ در غیر این صورت و اگر با اهداف کاربر همسو است، «پیشنهاد می‌شود» بده. در reasoning فقط دلیل‌های تحلیلی بنویس، نه دستور معامله یا مقدار جایگزین.${jsonInstruction(`{
  "decisionSummary": string,
  "goalImpact": string,
  "recommendation": "پیشنهاد می‌شود" or "با احتیاط" or "پیشنهاد نمی‌شود",
  "reasoning": [string]
}`)}`;
}

function chatHistoryText(history) {
  return (history || [])
    .slice(-6)
    .map((h) => `${h.role === "user" ? "کاربر" : "دستیار"}: ${h.content}`)
    .join("\n");
}

/**
 * Plain-text reply prompt (no JSON wrapper) — used with llm.js's streamLLM
 * so the reply can render live, word-by-word, instead of appearing all at
 * once when the full response finishes. The emotional-reaction check is a
 * separate, small, non-streamed call (see promptChatEmotionalCheck) so it
 * doesn't force the visible reply to wait on JSON structure.
 */
export function promptChatReply(profile, message, history) {
  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### تاریخچه گفتگو (فقط برای فهم ادامه‌ی مکالمه؛ اگر با «واقعیت‌های قطعی» فرق دارد، آن بلاک درست است و تاریخچه نادرست)
${chatHistoryText(history)}

### پیام جدید کاربر
${message}

### نحوه‌ی پاسخ‌دهی به‌عنوان مشاور مالی چت
۱. اول ببین این پیام دقیقاً چه می‌پرسد یا چه تصمیمی را مطرح می‌کند؛ اگر ابهام دارد (مثلاً معلوم نیست منظورش کدام دارایی یا کدام هدف است)، به‌جای حدس زدن، همان ابتدا با یک سؤال کوتاه روشنش کن.
۲. اگر روشن است، قبل از نوشتن پاسخ در ذهن خودت مرور کن: این موضوع به کدام بخش از وضعیت کاربر مربوط است — نقدینگی، ریسک، بدهی، افق زمانی، یا اهداف مالی ثبت‌شده‌اش؟ معمولاً بیش از یکی از این‌ها با هم مرتبط‌اند (مثلاً یک تصمیم سرمایه‌گذاری هم روی ریسک اثر دارد هم روی نقدینگی لازم برای هدف نزدیکش)؛ همه‌ی این ابعاد مرتبط را در پاسخ لحاظ کن، نه فقط یکی.
۰. اگر پرسش درباره‌ی یک واقعیت پروفایل است (مبلغ دارایی، درآمد، هدف…)، فقط همان را از «واقعیت‌های قطعی» بخوان و بگو؛ چیزی اضافه یا حدسی نگو و بحث نامرتبط نکن.
۳. پاسخ را با جواب مستقیم و روشن شروع کن (نه با مقدمه‌چینی)، بعد دلیل و اعداد پشتیبان را بیاور. همیشه از اعداد واقعی خود همین کاربر استفاده کن (مبلغ دقیق دارایی/درآمد/هدف)، نه توصیف کلی مثل «دارایی قابل‌توجهی دارید».
۴. اگر پیام کاربر درباره‌ی یک تصمیم یا سناریوی فرضی خود اوست، اثر آن را روی ریسک/نقدینگی/اهدافش با اعداد واقعی همین پروفایل (و اعداد رسمی ثابت بالا) تحلیل کن؛ ولی خودت مقدار یا دستور معامله پیشنهاد نکن.
۵. اگر پاسخ به یک هدف مالی ثبت‌شده‌ی کاربر مربوط می‌شود، آن را صریح نام ببر و بگو این پاسخ چه تاثیری روی رسیدن به آن هدف در مهلت تعیین‌شده‌اش دارد.
۶. در پایان اگر منطقی است، یک گام بعدی «اطلاعاتی» پیشنهاد بده (مثلاً بررسی یک صفحه‌ی مرتبط در برنامه، به‌روزکردن یک اطلاعات پروفایل، یا پرسش‌هایی که کاربر باید از خودش/مشاور مجاز بپرسد) — نه دستور معامله و نه مقدار قابل‌اجرا.
۷. لحن دوستانه و طبیعی چت باشد، نه گزارش رسمی؛ ولی هرگز محتوا را فدای لحن نکن.

فقط متن پاسخ را به فارسی بنویس — بدون JSON، بدون Markdown، بدون هیچ نشانه‌گذاری اضافه دور پاسخ.`;
}

/**
 * Small, fast, non-streamed classification call: does this specific user
 * message show signs of an emotional/impulsive reaction? Runs alongside
 * the streamed reply so the emotional-alert widget can still work without
 * forcing the visible chat text through a JSON wrapper.
 */
export function promptChatEmotionalCheck(message, history) {
  return `بررسی کن آیا پیام زیر از یک کاربر در یک اپ مالی، نشانه‌ی یک تصمیم یا واکنش هیجانی/آنی است (مثلاً ترس ناگهانی از نوسان کوتاه‌مدت بازار، هیجان زیاد برای ورود سریع به یک دارایی داغ، یا تصمیمی که آشکارا با برنامه‌ریزی بلندمدت در تضاد است). فقط بر اساس همین پیام قضاوت کن.

### تاریخچه گفتگو (برای زمینه)
${chatHistoryText(history)}

### پیام کاربر
${message}

اگر flag=false است، reason و message را null بگذار.${jsonInstruction(`{"flag": boolean, "reason": string or null, "message": string or null}`)}`;
}

/**
 * Voice-assistant onboarding: the user talks freely (speech-to-text runs in
 * the browser via the Web Speech API — no separate transcription service),
 * and this extracts whatever profile fields/assets/goal they actually
 * mentioned from the raw transcript. This is the same "LLM as structured-
 * data extractor" pattern as promptScenarioExtract — it pulls out what was
 * said, it does not decide anything or invent values for what wasn't said.
 */
const KIND_LIST_FOR_PROMPT = Object.entries(ASSET_KINDS)
  .map(([cat, def]) => `  • ${cat}: ${def.kinds.map((k) => `${k.id} (${k.label})`).join("، ")}`)
  .join("\n");

export function promptVoiceExtract(transcript) {
  return `تو یک مبدل گفتار-به-داده هستی. متن زیر نتیجه‌ی تشخیص گفتار فارسی از صحبت آزاد یک کاربر است (ممکن است ناقص، محاوره‌ای یا دارای غلط تایپی گفتاری باشد). فقط اطلاعاتی را که کاربر واقعاً و صریحاً گفته استخراج کن؛ هر چیزی که نگفته را null یا خالی بگذار — هرگز حدس یا داده‌ی جدید نساز.

متن پیاده‌شده از گفتار کاربر:
"""
${transcript}
"""

فیلدهایی که باید استخراج کنی (در صورت ذکر شدن):
- سن، جنسیت (مرد/زن)، وضعیت تاهل (مجرد/متاهل)، تعداد فرزند
- نوع شغل/درآمد: این فیلد متن آزاد است، خودت را محدود به چند دسته‌ی از پیش تعیین‌شده نکن. دقیقاً همان عنوان شغلی یا وضعیت درآمدی‌ای که کاربر گفته را بنویس (مثلاً «مهندس نرم‌افزار»، «پزشک»، «راننده تاکسی»، «صاحب مغازه لوازم خانگی»، «کارمند بانک»، «بازنشسته آموزش‌وپرورش»...)؛ فقط اگر کاربر توصیف کلی و بدون عنوان مشخص گفت (مثلاً فقط «کارمندم» یا «آزاد کار می‌کنم» یا «بیکارم» یا «دانشجو هستم»)، همان توصیف کلی خودش را عیناً بنویس — چیزی را که نگفته حدس نزن یا به یک دسته‌ی نزدیک تغییر نده
- وضعیت مسکن («مالک مسکن»، «مستاجر»، «زندگی با خانواده»)
- میزان ریسک‌پذیری (اگر عددی بین ۱ تا ۱۰ گفته، یا اگر توصیف کیفی کرده مثل «خیلی محافظه‌کارم» یا «ریسک‌پذیرم» یک عدد منطقی بین ۱ تا ۱۰ استنباط کن)
- سطح تجربه سرمایه‌گذاری («مبتدی (کمتر از ۱ سال)»، «متوسط (۱ تا ۵ سال)»، «حرفه‌ای (بیش از ۵ سال)»)
- واکنش به افت ۲۰٪ ارزش دارایی («می‌فروشم»، «صبر می‌کنم»، یا «بی‌تفاوتم یا بیشتر می‌خرم» — نزدیک‌ترین مقدار)
- درآمد ماهانه، هزینه ماهانه، بدهی/اقساط فعلی (همه به تومان؛ اگر کاربر «میلیون» گفته در عدد ضرب در ۱,۰۰۰,۰۰۰ کن)
- یادداشت افق زمانی سرمایه‌گذاری، یادداشت نیاز به نقدینگی (متن آزاد خلاصه‌شده از حرف کاربر)
- مهم‌ترین هدف مالی زندگی (متن آزاد)
- دارایی‌ها: هر دارایی که نام برده با دسته (${Object.keys(ASSET_KINDS).join(", ")}) و در صورت مشخص‌بودن نوعش (kind) از لیست زیر. اگر نوع را نگفته kind را null بگذار (حدس نزن).
${KIND_LIST_FOR_PROMPT}
  برای gold: مقدار را در quantity به واحد همان kind بگذار (گرم، مثقال، یا تعداد سکه)؛ اگر فقط ارزش تومانی گفته (مثلاً «۲۰۰ میلیون طلا دارم») در amount بگذار. نقره (kind=silver) همیشه amount (تومان) دارد. برای currency/crypto: اگر تعداد واحد و نوع ارز/کوین گفته (مثلاً «۵۰۰ دلار» یا «۰.۰۵ بیت‌کوین») quantity و symbol (مثل USD یا BTC) را پر کن؛ اگر فقط ارزش تومانی گفته amount را پر کن. برای بقیه دسته‌ها همیشه amount (تومان) را پر کن.

### دستور خروجی
فقط JSON زیر را برگردان:
{
  "personal": {"age": number or null, "gender": "مرد" or "زن" or null, "maritalStatus": "مجرد" or "متاهل" or null, "childrenCount": number or null, "employmentType": string or null, "housingStatus": string or null},
  "riskTolerance": number or null,
  "investmentExperience": string or null,
  "emotionalRiskReaction": string or null,
  "monthlyIncome": number or null,
  "monthlyExpenses": number or null,
  "existingDebt": number or null,
  "timeHorizonNote": string or null,
  "liquidityNeedNote": string or null,
  "mainGoalDescription": string or null,
  "assets": [{"category": string, "kind": string or null, "amount": number or null, "quantity": number or null, "symbol": string or null, "label": string or null}],
  "foundKeys": [string]
}
foundKeys باید فقط شامل کلیدهایی از این لیست باشد که واقعاً مقداری برایشان پیدا کردی: age, gender, maritalStatus, childrenCount, employmentType, housingStatus, riskTolerance, investmentExperience, emotionalRiskReaction, monthlyIncome, monthlyExpenses, existingDebt, assets, mainGoalDescription`;
}

