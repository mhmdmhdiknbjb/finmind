const CATEGORY_LABELS = {
  cash: "نقد و سپرده بانکی",
  gold: "طلا",
  currency: "ارز",
  stock: "سهام (بورس)",
  fund: "صندوق سرمایه‌گذاری",
  realestate: "ملک و مستغلات",
  crypto: "رمزارز",
  other: "سایر",
};

export function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

const SYSTEM_PREAMBLE = `تو "فین‌مایند" هستی؛ یک دستیار مالی هوشمند و متخصص برنامه‌ریزی مالی شخصی برای خانوارهای ایرانی.
وظیفه تو کمک به کاربر برای تصمیم‌گیری مالی آگاهانه است، نه صرفاً صدور سیگنال خرید/فروش.
همیشه تحلیل خودت را بر مبنای اطلاعات دقیق پروفایل کاربر (سن، وضعیت خانوادگی، ریسک‌پذیری، افق زمانی، درآمد و هزینه، دارایی‌ها و اهداف مالی) که در ادامه آمده انجام بده.
اصول تحلیل: تنوع دارایی، کفایت نقدینگی متناسب با نیازهای کاربر، تناسب ریسک با سن/افق زمانی/تحمل ریسک کاربر، و در نظر گرفتن شرایط اقتصاد ایران (تورم بالا، نوسان نرخ ارز و طلا، محدودیت دسترسی به بازارهای جهانی، ریسک نقدشوندگی ملک).
لحن پاسخ‌ها: حرفه‌ای، صادقانه، مشاوره‌محور، بدون اغراق و بدون وعده سود قطعی. اعداد پولی همیشه به تومان و به‌صورت عدد خام (بدون کاما یا واحد در متن JSON) بیان شوند مگر خلاف آن خواسته شده باشد.
تمام رشته‌های متنی خروجی (توضیحات، دلایل، پیشنهادها، خلاصه‌ها) باید به زبان فارسی روان و طبیعی نوشته شوند. فیلد "category" همیشه باید دقیقاً یکی از این مقادیر انگلیسی باشد: cash, gold, currency, stock, fund, realestate, crypto, other.

قانون کیفیت پیشنهادها (خیلی مهم): هر پیشنهاد باید مشخص، عددی و قابل‌اجرا باشد — دقیقاً بگو کدام دارایی، چه مبلغ یا درصدی، و چرا (با ارجاع مستقیم به عدد واقعی از پروفایل همین کاربر: سنش، هدفش، مهلت هدفش، نیاز نقدینگی‌اش، ریسک‌پذیری‌اش). هرگز از جمله‌های کلی و قابل‌کپی‌برای‌هرکسی مثل «سبد خود را متنوع کنید»، «پس‌انداز کنید»، یا «با یک مشاور مالی صحبت کنید» بدون هیچ عدد یا ارجاع مشخص به داده‌های همین کاربر استفاده نکن. اگر یک پیشنهاد را بدون تغییر می‌شد به هر کاربر دیگری هم داد، یعنی به‌اندازه کافی شخصی‌سازی نشده — دوباره بنویسش.`;

function fmtNum(n) {
  if (n === null || n === undefined || n === "") return "نامشخص";
  return Number(n).toLocaleString("en-US");
}

function assetLine(a, i) {
  const label = a.label ? a.label + " — " : "";
  if (a.category === "gold") {
    return `${i + 1}. ${label}طلا (۱۸ عیار) — ${fmtNum(a.quantity)} گرم — معادل ${fmtNum(a.amount)} تومان به قیمت آنی`;
  }
  if (a.category === "currency") {
    return `${i + 1}. ${label}ارز (${a.symbol || "USD"}) — ${fmtNum(a.quantity)} واحد — معادل ${fmtNum(a.amount)} تومان به نرخ آنی`;
  }
  if (a.category === "crypto") {
    return `${i + 1}. ${label}رمزارز (${a.symbol || "BTC"}) — ${fmtNum(a.quantity)} واحد — معادل ${fmtNum(a.amount)} تومان به نرخ آنی`;
  }
  return `${i + 1}. ${label}${categoryLabel(a.category)} — ${fmtNum(a.amount)} تومان`;
}

export function buildProfileContext(profile) {
  const p = profile.personal || {};
  const totalAssets = (profile.assets || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const assetLines = (profile.assets || []).length ? profile.assets.map(assetLine).join("\n") : "کاربر هنوز هیچ دارایی‌ای ثبت نکرده است.";

  const liveRatesLine = profile._liveRates
    ? `\n(نرخ‌های آنی استفاده‌شده برای تبدیل طلا/ارز/رمزارز به تومان: هر گرم طلای ۱۸ عیار ${fmtNum(profile._liveRates.goldTomanPerGram)} تومان، هر دلار ${fmtNum(profile._liveRates.usdToman)} تومان — منبع: ${profile._liveRates.source} — تاریخ ${profile._liveRates.date}، ساعت ${profile._liveRates.time})`
    : "";

  const goalLines = (profile.goals || []).length
    ? profile.goals
        .map(
          (g, i) =>
            `${i + 1}. عنوان: ${g.title} — مبلغ هدف: ${fmtNum(g.targetAmount)} تومان — مهلت: ${g.targetMonths} ماه دیگر`
        )
        .join("\n")
    : "هدف مالی ثبت‌شده‌ای وجود ندارد.";

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
یادداشت افق زمانی سرمایه‌گذاری: ${profile.timeHorizonNote || "ندارد"}
یادداشت نیاز به نقدینگی: ${profile.liquidityNeedNote || "ندارد"}
مهم‌ترین هدف مالی زندگی (خوداظهاری آزاد): ${profile.mainGoalDescription || "ندارد"}

### دارایی‌های کاربر (مجموع: ${fmtNum(totalAssets)} تومان)
${assetLines}${liveRatesLine}

### اهداف مالی ثبت‌شده
${goalLines}`;
}

function jsonInstruction(schemaDescription) {
  return `\n\n### دستور خروجی\nفقط و فقط یک JSON معتبر و تک‌خطی یا چندخطی مطابق دقیقاً همین ساختار زیر برگردان. هیچ متن، توضیح، یا Markdown خارج از JSON ننویس و از code fence استفاده نکن:\n${schemaDescription}`;
}

function formatPct(w) {
  return ASSET_ORDER_FOR_PROMPT.map((k) => `${categoryLabel(k)}: ${Math.round((w[k] || 0) * 1000) / 10}٪`).join("، ");
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
نقدینگی فعلی: ${computed.current.liquidityPercent}٪ | پیشنهادی: ${computed.optimal.liquidityPercent}٪

### وظیفه
فقط بر اساس همین اعداد محاسبه‌شده (نه با ساختن عدد جدید)، توضیح بده که چرا ترکیب فعلی این نقاط قوت/ضعف را دارد و چرا موتور بهینه‌سازی این ترکیب پیشنهادی را داده (مثلاً برای کاهش تمرکز، افزایش تنوع، یا تامین نقدینگی لازم). اگر تمرکز روی یک دارایی بیش از حد است هشدار بده.${jsonInstruction(`{
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

### خروجی موتور بهینه‌سازی پرتفوی (محاسبه‌شده با یک مدل میانگین-واریانس واقعی، نه توسط تو — این اعداد قطعی هستند)
ریسک فعلی سبد: ${computed.current.riskScore} از ۱۰۰ (سطح: ${computed.current.riskLevel}) — نوسان سالانه محاسبه‌شده: ${(computed.current.volatility * 100).toFixed(1)}٪
ریسک پیشنهادی (بر اساس ریسک‌پذیری اعلامی کاربر و بهینه‌سازی میانگین-واریانس با قید نقدشوندگی): ${computed.optimal.riskScore} از ۱۰۰ (سطح: ${computed.optimal.riskLevel})
اختلاف: ${computed.optimal.riskScore - computed.current.riskScore}

### وظیفه
فقط بر اساس همین دو عدد محاسبه‌شده (آن‌ها را دوباره حدس نزن یا تغییر نده)، توضیح بده این ریسک از کجا می‌آید (کدام دارایی‌ها و چه تمرکزی باعثش شده)، چه رفتار یا سوگیری اقتصادی/روانی ممکن است پشت این ترکیب باشد، و چه اقدامی برای نزدیک‌شدن به ریسک پیشنهادی توصیه می‌شود.${jsonInstruction(`{
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
فقط بر اساس همین اعداد و دسته‌بندی‌های محاسبه‌شده (آن‌ها را تغییر نده)، به کاربر توضیح بده وضعیت نقدینگی‌اش چطور است. اگر «کمبود نسبت به وجه نقد فوری» بزرگ‌تر از صفر است، حتماً هشدار واضح بده و راهکار عملی پیشنهاد کن.${jsonInstruction(`{
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
افق زمانی: ${computed.horizonTier}
نرخ رشد سالانه فرض‌شده برای پول این هدف: ${computed.assumedAnnualReturnPercent}٪
پس‌انداز ماهانه لازم برای رسیدن دقیق به هدف در مهلت تعیین‌شده: ${fmtNum(computed.requiredMonthlySaving)} تومان
توان پس‌انداز ماهانه فعلی کاربر (درآمد منهای هزینه و اقساط بدهی): ${fmtNum(computed.currentMonthlySavingCapacity)} تومان
مازاد یا کسری ماهانه نسبت به نیاز: ${computed.monthlySurplus >= 0 ? "+" : ""}${fmtNum(computed.monthlySurplus)} تومان
آیا با پس‌انداز فعلی امکان‌پذیر است: ${computed.feasible ? "بله" : "خیر"}
${computed.monthsNeededAtCurrentPace !== null ? `با همین توان پس‌انداز فعلی، رسیدن به مبلغ هدف واقعاً حدود ${computed.monthsNeededAtCurrentPace} ماه طول می‌کشد (نه ${goal.targetMonths} ماه خواسته‌شده).` : "توان پس‌انداز فعلی کاربر صفر یا نامشخص است (درآمد/هزینه ثبت نشده)."}
با پس‌انداز فعلی، تا مهلت ${goal.targetMonths} ماهه حدود ${fmtNum(computed.projectedAmountAtDeadline)} تومان جمع می‌شود.

### وظیفه
این اعداد را در یک خلاصه‌ی روان فارسی توضیح بده و یک مسیر عملی پیشنهاد بده.
قانون سخت‌گیرانه: هیچ عدد ماه، مبلغ، یا درصد جدیدی که دقیقاً در بالا نیامده حساب، حدس، یا تخمین نزن — نه "ماه‌های باقیمانده پس از یک بازه‌ی خاص"، نه "مبلغ تفکیک‌شده برای هر بخش از هدف"، نه هیچ محاسبه‌ی میان‌راهی دیگر. فقط از همین چند عدد داده‌شده (پس‌انداز ماهانه لازم، توان پس‌انداز فعلی، مازاد/کسری ماهانه، تعداد ماه واقعی، مبلغ جمع‌شده تا مهلت) استفاده کن. اگر لازم شد چیزی فراتر از این اعداد بگویی، فقط توصیف کیفی بده (مثلاً «بعد از رسیدن به سقف پس‌انداز فعلی باید یا مدت را تمدید کرد یا مبلغ پس‌انداز ماهانه را افزایش داد»)، بدون آنکه رقم جدیدی برایش بسازی.
اگر feasible=false است، پیشنهادها را دقیقاً روی همین اعداد داده‌شده بنا کن (مثلاً افزایش پس‌انداز ماهانه تا سطح "پس‌انداز ماهانه لازم"، یا تمدید مهلت به همان "تعداد ماه واقعی" که داده شده).

قانون مهم درباره‌ی نوع دارایی پیشنهادی: نرخ رشد سالانه‌ی فرض‌شده در بالا (${computed.assumedAnnualReturnPercent}٪) دقیقاً همان بازدهی است که پول این هدف باید کسب کند تا در افق زمانی تعیین‌شده به مبلغ هدف برسد. بنابراین هرگز پیشنهاد نده که دارایی‌ها به نقد راکد یا سپرده‌ی صرف تبدیل شوند مگر افق بسیار کوتاه (چند ماه) باشد یا هدف کاربر صراحتاً حفظ اصل پول باشد — نقد راکد در اقتصاد تورمی ایران معمولاً از همین نرخ رشد لازم عقب می‌ماند و عملاً کاربر را از رسیدن به هدف دورتر می‌کند، نه نزدیک‌تر. وقتی از "استفاده از دارایی‌های موجود" یا "افزایش پس‌انداز" صحبت می‌کنی، پیشنهاد بده آن مبلغ در دارایی‌ای با ریسک متناسب با ریسک‌پذیری خود کاربر و افق هدف نگه‌داری/سرمایه‌گذاری شود (نه لزوماً پرریسک‌ترین گزینه، بلکه چیزی که واقع‌بینانه بتواند نرخ رشد فرض‌شده در بالا را پوشش دهد) تا هم از تورم عقب نماند و هم رشد لازم برای رسیدن به هدف را داشته باشد؛ نوع دقیق دارایی را خودت با توجه به پروفایل کاربر انتخاب کن، از تکرار یک مثال ثابت خودداری کن.

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
اثر روی هر دارایی کاربر:
${assetLines}

اثر کل روی پرتفوی: میانه ${computed.portfolio.p50Percent}٪ (${fmtNum(computed.portfolio.p50Amount)} تومان) — بازه ۷۰٪ اطمینان: از ${computed.portfolio.p15Percent}٪ تا ${computed.portfolio.p85Percent}٪ (${fmtNum(computed.portfolio.p15Amount)} تا ${fmtNum(computed.portfolio.p85Amount)} تومان)

### وظیفه
فقط بر اساس همین اعداد محاسبه‌شده (عدد جدید نساز)، توضیح بده چرا این اتفاق روی هر دارایی این‌طور اثر می‌گذارد (با توجه به همبستگی معمول آن دارایی با این سناریو در اقتصاد ایران)، بازه عدم‌قطعیت را به زبان ساده توضیح بده، و یک توصیه عملی بده.${jsonInstruction(`{
  "explanation": string,
  "recommendation": string
}`)}`;
}

export function promptDecision(profile, decision) {
  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### تصمیم فرضی مورد بررسی کاربر
${decision.description}
${decision.amount ? `مبلغ مرتبط: ${fmtNum(decision.amount)} تومان` : ""}

### وظیفه
وضعیت مالی کاربر را قبل و بعد از این تصمیم فرضی مقایسه کن (کل دارایی، امتیاز ریسک از ۱۰۰، درصد نقدینگی). اثر این تصمیم روی اهداف مالی ثبت‌شده کاربر را توضیح بده و در نهایت یک توصیه شفاف بده.

همچنین این تصمیم را به یک لیست تغییرات ساخت‌یافته روی دسته‌های دارایی تبدیل کن (فیلد assetChanges) — دقیقاً همان کاری که یک متخصص داده انجام می‌دهد، نه تصمیم‌گیری مالی: هر آیتم شامل category (یکی از cash, gold, currency, stock, fund, realestate, crypto, other) و amountDelta (عدد تومان، مثبت یعنی افزایش آن دسته، منفی یعنی کاهش) است. مجموع مقادیر مثبت و منفی باید تقریباً برابر باشند (چون این جابه‌جایی پول بین دسته‌هاست، نه خلق پول از هیچ). اگر تصمیم فقط یک دسته را کم می‌کند بدون مقصد مشخص (مثلاً «خرج کردن» برای مصرف، نه سرمایه‌گذاری مجدد)، فقط همان یک آیتم منفی را بگذار. اگر مبلغ دقیق در متن یا فیلد «مبلغ مرتبط» داده شده، از همان استفاده کن؛ اگر مبهم است (مثلاً «نیمی از طلا»)، با توجه به دارایی‌های فعلی کاربر (بالا) عدد دقیق را خودت محاسبه کن. اگر تصمیم اصلاً به دارایی‌های سرمایه‌گذاری مربوط نیست (مثلاً فقط یک سوال است)، assetChanges را آرایه‌ی خالی بگذار.${jsonInstruction(`{
  "decisionSummary": string,
  "before": {"totalAssets": number, "riskScore": number, "liquidPercent": number},
  "after": {"totalAssets": number, "riskScore": number, "liquidPercent": number},
  "goalImpact": string,
  "recommendation": "پیشنهاد می‌شود" or "با احتیاط" or "پیشنهاد نمی‌شود",
  "reasoning": [string],
  "assetChanges": [{"category": "cash|gold|currency|stock|fund|realestate|crypto|other", "amountDelta": number}]
}`)}`;
}

function chatHistoryText(history) {
  return (history || [])
    .slice(-10)
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

### تاریخچه گفتگو (آخرین پیام‌ها)
${chatHistoryText(history)}

### پیام جدید کاربر
${message}

### نحوه‌ی پاسخ‌دهی به‌عنوان مشاور مالی چت
۱. اول ببین این پیام دقیقاً چه می‌پرسد یا چه تصمیمی را مطرح می‌کند؛ اگر ابهام دارد (مثلاً معلوم نیست منظورش کدام دارایی یا کدام هدف است)، به‌جای حدس زدن، همان ابتدا با یک سؤال کوتاه روشنش کن.
۲. اگر روشن است، قبل از نوشتن پاسخ در ذهن خودت مرور کن: این موضوع به کدام بخش از وضعیت کاربر مربوط است — نقدینگی، ریسک، بدهی، افق زمانی، یا اهداف مالی ثبت‌شده‌اش؟ معمولاً بیش از یکی از این‌ها با هم مرتبط‌اند (مثلاً یک تصمیم سرمایه‌گذاری هم روی ریسک اثر دارد هم روی نقدینگی لازم برای هدف نزدیکش)؛ همه‌ی این ابعاد مرتبط را در پاسخ لحاظ کن، نه فقط یکی.
۳. پاسخ را با جواب مستقیم و روشن شروع کن (نه با مقدمه‌چینی)، بعد دلیل و اعداد پشتیبان را بیاور. همیشه از اعداد واقعی خود همین کاربر استفاده کن (مبلغ دقیق دارایی/درآمد/هدف)، نه توصیف کلی مثل «دارایی قابل‌توجهی دارید».
۴. اگر پیام کاربر درباره‌ی یک تصمیم یا سناریوی فرضی است، اثر آن را روی دارایی‌ها/ریسک/نقدینگی/اهداف او با محاسبه‌ی تقریبی نشان بده، نه فقط توصیف کیفی.
۵. اگر پاسخ به یک هدف مالی ثبت‌شده‌ی کاربر مربوط می‌شود، آن را صریح نام ببر و بگو این پاسخ چه تاثیری روی رسیدن به آن هدف در مهلت تعیین‌شده‌اش دارد.
۶. در پایان اگر منطقی است، یک گام عملی بعدی پیشنهاد بده (نه صرفاً توضیح) — دقیقاً همان قانون کیفیت پیشنهادها که در بالا آمد (عدد/درصد/دارایی مشخص، نه کلی‌گویی).
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
export function promptVoiceExtract(transcript) {
  return `تو یک مبدل گفتار-به-داده هستی. متن زیر نتیجه‌ی تشخیص گفتار فارسی از صحبت آزاد یک کاربر است (ممکن است ناقص، محاوره‌ای یا دارای غلط تایپی گفتاری باشد). فقط اطلاعاتی را که کاربر واقعاً و صریحاً گفته استخراج کن؛ هر چیزی که نگفته را null یا خالی بگذار — هرگز حدس یا داده‌ی جدید نساز.

متن پیاده‌شده از گفتار کاربر:
"""
${transcript}
"""

فیلدهایی که باید استخراج کنی (در صورت ذکر شدن):
- سن، جنسیت (مرد/زن)، وضعیت تاهل (مجرد/متاهل)، تعداد فرزند
- نوع شغل/درآمد (مثلاً «کارمند بخش دولتی»، «کارمند بخش خصوصی»، «کسب‌وکار آزاد/فریلنسر»، «کارفرما و صاحب کسب‌وکار»، «بازنشسته»، «دانشجو»، «بیکار» — نزدیک‌ترین مقدار به آنچه گفته را انتخاب کن)
- وضعیت مسکن («مالک مسکن»، «مستاجر»، «زندگی با خانواده»)
- میزان ریسک‌پذیری (اگر عددی بین ۱ تا ۱۰ گفته، یا اگر توصیف کیفی کرده مثل «خیلی محافظه‌کارم» یا «ریسک‌پذیرم» یک عدد منطقی بین ۱ تا ۱۰ استنباط کن)
- سطح تجربه سرمایه‌گذاری («مبتدی (کمتر از ۱ سال)»، «متوسط (۱ تا ۵ سال)»، «حرفه‌ای (بیش از ۵ سال)»)
- واکنش به افت ۲۰٪ ارزش دارایی («می‌فروشم»، «صبر می‌کنم»، یا «بی‌تفاوتم یا بیشتر می‌خرم» — نزدیک‌ترین مقدار)
- درآمد ماهانه، هزینه ماهانه، بدهی/اقساط فعلی (همه به تومان؛ اگر کاربر «میلیون» گفته در عدد ضرب در ۱,۰۰۰,۰۰۰ کن)
- یادداشت افق زمانی سرمایه‌گذاری، یادداشت نیاز به نقدینگی (متن آزاد خلاصه‌شده از حرف کاربر)
- مهم‌ترین هدف مالی زندگی (متن آزاد)
- دارایی‌ها: هر دارایی که نام برده با دسته (cash, gold, currency, stock, fund, realestate, crypto, other). برای gold: اگر مقدار به گرم گفته در quantity بگذار؛ اگر فقط ارزش تومانی گفته (مثلاً «۲۰۰ میلیون طلا دارم») در amount بگذار. برای currency/crypto: اگر تعداد واحد و نوع ارز/کوین گفته (مثلاً «۵۰۰ دلار» یا «۰.۰۵ بیت‌کوین») quantity و symbol (مثل USD یا BTC) را پر کن؛ اگر فقط ارزش تومانی گفته amount را پر کن. برای بقیه دسته‌ها همیشه amount (تومان) را پر کن.

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
  "assets": [{"category": string, "amount": number or null, "quantity": number or null, "symbol": string or null, "label": string or null}],
  "foundKeys": [string]
}
foundKeys باید فقط شامل کلیدهایی از این لیست باشد که واقعاً مقداری برایشان پیدا کردی: age, gender, maritalStatus, childrenCount, employmentType, housingStatus, riskTolerance, investmentExperience, emotionalRiskReaction, monthlyIncome, monthlyExpenses, existingDebt, assets, mainGoalDescription`;
}

