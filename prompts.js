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
تمام رشته‌های متنی خروجی (توضیحات، دلایل، پیشنهادها، خلاصه‌ها) باید به زبان فارسی روان و طبیعی نوشته شوند. فیلد "category" همیشه باید دقیقاً یکی از این مقادیر انگلیسی باشد: cash, gold, currency, stock, fund, realestate, crypto, other.`;

function fmtNum(n) {
  if (n === null || n === undefined || n === "") return "نامشخص";
  return Number(n).toLocaleString("en-US");
}

export function buildProfileContext(profile) {
  const p = profile.personal || {};
  const totalAssets = (profile.assets || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const assetLines = (profile.assets || []).length
    ? profile.assets
        .map(
          (a, i) =>
            `${i + 1}. ${a.label ? a.label + " — " : ""}${categoryLabel(a.category)} — ${fmtNum(a.amount)} تومان`
        )
        .join("\n")
    : "کاربر هنوز هیچ دارایی‌ای ثبت نکرده است.";

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
میزان ریسک‌پذیری اعلامی کاربر (مقیاس ۱ تا ۱۰): ${profile.riskTolerance ?? 5}
درآمد ماهانه: ${fmtNum(profile.monthlyIncome)} تومان
هزینه ماهانه: ${fmtNum(profile.monthlyExpenses)} تومان
یادداشت افق زمانی سرمایه‌گذاری: ${profile.timeHorizonNote || "ندارد"}
یادداشت نیاز به نقدینگی: ${profile.liquidityNeedNote || "ندارد"}

### دارایی‌های کاربر (مجموع: ${fmtNum(totalAssets)} تومان)
${assetLines}

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

export function promptLiquidity(profile) {
  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### وظیفه
دارایی‌های کاربر را از نظر سرعت نقدشوندگی دسته‌بندی کن (نقد سریع/نیمه‌نقد/غیرنقد) و درصد هر دسته از کل دارایی را محاسبه کن. همچنین تخمین بزن در بازه‌های زمانی مختلف (فوری، تا ۱ ماه، تا ۳ ماه، تا ۱ سال) چه مقدار از دارایی‌ها قابل نقد شدن است. با توجه به هزینه ماهانه و یادداشت نیاز نقدینگی کاربر، اگر کمبود نقدینگی وجود دارد هشدار بده.${jsonInstruction(`{
  "liquidPercent": number,
  "semiLiquidPercent": number,
  "illiquidPercent": number,
  "availableByPeriod": {"immediate": number, "oneMonth": number, "threeMonths": number, "oneYear": number},
  "warnings": [string],
  "summary": string
}`)}`;
}

export function promptGoal(profile, goal) {
  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### هدف مالی مورد بررسی
عنوان: ${goal.title}
مبلغ هدف: ${fmtNum(goal.targetAmount)} تومان
مهلت: ${goal.targetMonths} ماه دیگر

### وظیفه
بررسی کن با توجه به وضعیت فعلی دارایی، درآمد و هزینه کاربر، رسیدن به این هدف در این بازه زمانی چقدر واقع‌بینانه است. مقدار پس‌انداز ماهانه لازم برای رسیدن به هدف را محاسبه کن و آن را با توان پس‌انداز فعلی کاربر (درآمد منهای هزینه) مقایسه کن. یک مسیر پیشنهادی (ترکیب پس‌انداز و سرمایه‌گذاری) ارائه بده.${jsonInstruction(`{
  "feasible": boolean,
  "requiredMonthlySaving": number,
  "currentMonthlySavingCapacity": number,
  "gap": number,
  "suggestedPath": [string],
  "risks": [string],
  "summary": string
}`)}`;
}

export function promptScenario(profile, scenario) {
  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### سناریوی مورد بررسی
${scenario.title}
${scenario.description || ""}

### وظیفه
اثر این سناریو را روی تک‌تک دارایی‌های کاربر شبیه‌سازی کن (بر اساس نوع دارایی و همبستگی معمول آن با این سناریو در اقتصاد ایران) و درصد و مبلغ تغییر هر دارایی و کل سبد را محاسبه کن. توضیح بده چرا و چگونه این اتفاق روی هر بخش اثر می‌گذارد.${jsonInstruction(`{
  "scenarioTitle": string,
  "impactByAsset": [{"category": string, "label": string, "changePercent": number, "changeAmount": number}],
  "totalPortfolioChangePercent": number,
  "totalPortfolioChangeAmount": number,
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
وضعیت مالی کاربر را قبل و بعد از این تصمیم فرضی مقایسه کن (کل دارایی، امتیاز ریسک از ۱۰۰، درصد نقدینگی). اثر این تصمیم روی اهداف مالی ثبت‌شده کاربر را توضیح بده و در نهایت یک توصیه شفاف بده.${jsonInstruction(`{
  "decisionSummary": string,
  "before": {"totalAssets": number, "riskScore": number, "liquidPercent": number},
  "after": {"totalAssets": number, "riskScore": number, "liquidPercent": number},
  "goalImpact": string,
  "recommendation": "پیشنهاد می‌شود" or "با احتیاط" or "پیشنهاد نمی‌شود",
  "reasoning": [string]
}`)}`;
}

export function promptChat(profile, message, history) {
  const historyText = (history || [])
    .slice(-10)
    .map((h) => `${h.role === "user" ? "کاربر" : "دستیار"}: ${h.content}`)
    .join("\n");

  return `${SYSTEM_PREAMBLE}

${buildProfileContext(profile)}

### تاریخچه گفتگو (آخرین پیام‌ها)
${historyText || "(بدون تاریخچه قبلی)"}

### پیام جدید کاربر
${message}

### وظیفه
به پیام کاربر با توجه کامل به پروفایل و دارایی‌های او پاسخ بده. پاسخ باید دقیق، مفید و شخصی‌سازی‌شده باشد نه کلی‌گویی. اگر لازم است سناریو شبیه‌سازی کن یا محاسبه انجام بده.
همچنین بررسی کن آیا این پیام نشانه یک تصمیم یا واکنش هیجانی/آنی است (مثلاً ترس ناگهانی از نوسان کوتاه‌مدت بازار، هیجان زیاد برای ورود سریع به یک دارایی داغ، یا تصمیمی که با اهداف بلندمدت و ساختار مالی فعلی او در تضاد است). اگر چنین نشانه‌ای هست flag را true بگذار و دلیل و پیام هشدار را بنویس؛ در غیر این صورت flag را false بگذار.${jsonInstruction(`{
  "reply": string,
  "emotional": {"flag": boolean, "reason": string or null, "message": string or null}
}`)}`;
}
