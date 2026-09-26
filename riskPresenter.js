/**
 * Turns the raw output of portfolioRisk.js into (a) compact JSON for the widget APIs and (b) Persian text
 * blocks for the LLM prompts. Nothing is computed here — only rounding, labels and wording — so the numbers
 * on a page and the numbers the assistant quotes always come from the same analysis object.
 */

export const CLASS_LABELS = {
  cash_deposit: "نقد و سپرده",
  fx: "ارز",
  gold: "طلا",
  crypto: "رمزارز",
  stock: "سهام",
  fund: "صندوق",
  bond: "اوراق",
  real_estate: "ملک",
  vehicle: "خودرو",
  other_assets: "سایر",
};

export const FLAG_TEXT = {
  single_asset_dominant: "بیش از نیمی از کل دارایی در یک قلم متمرکز است",
  no_liquid_buffer: "ذخیره‌ی نقدشونده کمتر از ۳ ماه هزینه‌ی زندگی است",
  crypto_heavy_older: "سهم رمزارز بالاست و سن بالای ۵۰ است",
  mostly_rial_cash_like: "بیش از ۷۰٪ دارایی ریالی/نقدی یا صندوق درآمد ثابت است (فرسایش قدرت خرید)",
  realestate_heavy_illiquid: "بیش از ۷۵٪ دارایی در ملک و غیرنقدشونده است",
  no_fx_gold_hedge: "تقریباً هیچ پوشش ارزی/طلایی وجود ندارد، در حالی که دلار در یک سال گذشته رشد شدید داشته",
  debt_heavy: "بدهی بیش از ۵۰٪ ثروت است",
  leveraged_fund_risk: "سهم صندوق اهرمی بالاست و کاربر تحت‌تکفل دارد یا بالای ۵۰ سال است",
  coin_bubble_exposure: "سهم سکه بالاست و حباب سکه بیش از ۱۰٪ است",
  no_market_assets: "هیچ دارایی قیمت‌داری برای محاسبه‌ی ریسک بازار وجود ندارد",
};

const r = (x, nd = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** nd) / 10 ** nd : null);
const pct = (x, nd = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(nd)}٪` : "نامشخص");
const labelledShares = (obj, min = 0.0005) =>
  Object.entries(obj || {})
    .filter(([, v]) => Number.isFinite(v) && Math.abs(v) >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: CLASS_LABELS[k] || k, share: r(v) }));

/** JSON for /api/widgets/assets — the "dispersion" (diversification) part. */
export function dispersionPayload(cur, opt) {
  if (!cur) return null;
  const d = cur.dispersion;
  return {
    asOf: cur.asOf,
    diversificationScore: r(d.diversificationScore, 1),
    suggestedDiversificationScore: opt ? r(opt.dispersion.diversificationScore, 1) : null,
    effectiveNClass: r(d.effectiveNClass, 2),
    effectiveNHoldings: r(d.effectiveNHoldings, 2),
    top1Share: r(d.top1Share),
    top3Share: r(d.top3Share),
    nHoldings: d.nHoldings,
    nClasses: d.nClasses,
    avgPairwiseCorr: r(d.avgPairwiseCorr1y),
    diversificationRatio: r(d.diversificationRatio),
    capitalShareByClass: labelledShares(cur.allocation.byClass),
    riskShareByClass: cur.hasMarketAssets ? labelledShares(d.riskContributionByClass, 0.0005) : [],
    topRiskClass: d.topRiskClass ? { key: d.topRiskClass, label: CLASS_LABELS[d.topRiskClass] || d.topRiskClass, share: r(d.topRiskClassShare) } : null,
    flags: d.flags.map((id) => ({ id, text: FLAG_TEXT[id] || id })),
    modeledShare: r(cur.modeledShare),
    warnings: cur.warnings,
  };
}

/** JSON for /api/widgets/risk — realised risk of the market-priced part, measured on real weekly data. */
export function riskPayload(cur, opt) {
  if (!cur) return null;
  const s = cur.risk.sleeve;
  return {
    asOf: cur.asOf,
    hasMarketAssets: cur.hasMarketAssets,
    modeledShare: r(cur.modeledShare),
    wealthVolatility1y: r(cur.risk.wealthVol1y),
    suggestedWealthVolatility1y: opt ? r(opt.risk.wealthVol1y) : null,
    sleeve: s && {
      annVolatility1y: r(s.annVol1y),
      maxDrawdown1y: r(s.maxDrawdown1y),
      cvar95Weekly1y: r(s.cvar95Weekly1y),
      betaUsd1y: r(s.betaUsd1y, 2),
      returnVsUsd1y: r(s.returnVsUsd1y),
      annReturn1y: r(s.annReturn1y),
      annVolatility3y: r(s.annVol3y),
      maxDrawdown3y: r(s.maxDrawdown3y),
    },
    forward: cur.forward,
    // ML forecast of the volatility the next 26 / 52 weeks will actually have (null when no validated model)
    forwardVol: cur.forwardVol
      ? Object.fromEntries(Object.entries(cur.forwardVol).map(([k, v]) => [k, { horizonWeeks: v.horizonWeeks, point: r(v.point), p10: r(v.p10), p90: r(v.p90), trailing: r(v.trailing) }]))
      : null,
    cashErosion: { vsUsd1y: r(cur.cashErosion.cashShareXUsd1y), vsGold1y: r(cur.cashErosion.cashShareXGold1y) },
    warnings: cur.warnings,
  };
}

/** Persian block for promptAssets: the deterministic dispersion numbers the LLM must quote, not invent. */
export function dispersionPromptBlock(cur, opt) {
  if (!cur) return "";
  const d = cur.dispersion;
  const classes = labelledShares(cur.allocation.byClass).map((c) => `${c.label} ${pct(c.share)}`).join("، ");
  const riskClasses = cur.hasMarketAssets ? labelledShares(d.riskContributionByClass).map((c) => `${c.label} ${pct(c.share)}`).join("، ") : "ندارد";
  return `
### خروجی موتور پراکندگی دارایی (محاسبه‌ی قطعی روی داده‌ی واقعی بازار ایران تا ${cur.asOf} — این اعداد را عیناً به‌کار ببر، عدد جدید نساز)
امتیاز تنوع (پراکندگی): ${d.diversificationScore.toFixed(1)} از ۱۰۰${opt ? ` (در ترکیب پیشنهادی: ${opt.dispersion.diversificationScore.toFixed(1)})` : ""}
تعداد مؤثر کلاس‌های دارایی: ${d.effectiveNClass.toFixed(2)} | بزرگ‌ترین قلم: ${pct(d.top1Share)} از کل دارایی | سه قلم بزرگ: ${pct(d.top3Share)}
سهم سرمایه هر کلاس: ${classes}
سهم هر کلاس از ریسک (نوسان) بخش قیمت‌دار: ${riskClasses}${d.topRiskClass ? ` — بیشترین سهم ریسک: ${CLASS_LABELS[d.topRiskClass]} (${pct(d.topRiskClassShare)})` : ""}
همبستگی متوسط دارایی‌ها: ${d.avgPairwiseCorr1y === null ? "نامشخص" : d.avgPairwiseCorr1y.toFixed(2)}
پرچم‌های هشدار: ${d.flags.length ? d.flags.map((f) => FLAG_TEXT[f]).join("؛ ") : "هیچ"}
محدودیت: ${cur.warnings.length ? cur.warnings.join(" ") : "ندارد"}
نکته: «سهم ریسک» با «سهم سرمایه» فرق دارد و اختلافشان مهم است؛ اگر یک کلاس سهم ریسکش بسیار بیشتر از سهم سرمایه‌اش است، به کاربر بگو.`;
}

/** Persian block for promptRisk: realised past risk + historical (not predicted) ranges. */
export function riskPromptBlock(cur) {
  if (!cur) return "";
  if (!cur.hasMarketAssets) {
    return `\n### ریسک واقعی بازار\nکاربر هیچ دارایی قیمت‌داری (ارز، طلا، سهام، صندوق، رمزارز) ندارد؛ برای ریسک بازار داده‌ای در دسترس نیست. عددی نساز.`;
  }
  const s = cur.risk.sleeve;
  const f = cur.forward;
  const isMl = (h, t) => f[h][t].source === "ml_stack";
  const cell = (h, t, label) => `${label} ${pct(f[h][t].p10)} تا ${pct(f[h][t].p90)} (میانه ${pct(f[h][t].p50)})${isMl(h, t) ? " [مدل اعتبارسنجی‌شده]" : " [نوسان‌محور تاریخی]"}`;
  const rng = (h) => [cell(h, "ret", "بازده اسمی:"), cell(h, "maxDrawdown", "بیشینه ریزش:"), cell(h, "retVsUsd", "بازده نسبت به دلار:")].join(" | ");
  const fv = cur.forwardVol;
  const volLine = fv
    ? `
نوسان سالانه‌ی پیش‌بینی‌شده برای آینده [مدل اعتبارسنجی‌شده، برآورد نه تضمین]: ۲۶ هفته‌ی آینده ${fv["26w"] ? `${pct(fv["26w"].point)} (بازه‌ی محتمل ${pct(fv["26w"].p10)} تا ${pct(fv["26w"].p90)})` : "نامشخص"} | ۵۲ هفته‌ی آینده ${fv["52w"] ? `${pct(fv["52w"].point)} (بازه‌ی محتمل ${pct(fv["52w"].p10)} تا ${pct(fv["52w"].p90)})` : "نامشخص"} — در برابر نوسان اندازه‌گیری‌شده‌ی گذشته: ${pct(s.annVol1y)}`
    : "";
  const anyMl = ["26w", "52w"].some((h) => isMl(h, "ret") || isMl(h, "maxDrawdown") || isMl(h, "retVsUsd"));
  return `
### ریسک واقعی گذشته‌ی بخش قیمت‌دار (داده‌ی هفتگی واقعی بازار ایران تا ${cur.asOf} — عیناً به‌کار ببر، عدد جدید نساز)
سهم بخش قیمت‌دار از کل دارایی: ${pct(cur.modeledShare)} (بقیه نقد/ملک/سایر است و تاریخچه‌ی قیمتی ندارد)
نوسان سالانه‌ی ۱ ساله: ${pct(s.annVol1y)}${s.annVol3y === null ? "" : ` | ۳ ساله: ${pct(s.annVol3y)}`} | بیشینه ریزش ۱ ساله: ${pct(s.maxDrawdown1y)}${s.maxDrawdown3y === null ? "" : ` | ۳ ساله: ${pct(s.maxDrawdown3y)}`}
بدترین هفته‌ها (میانگین ۳ هفته‌ی بدتر از ۵۲): ${pct(s.cvar95Weekly1y)} | بتا نسبت به دلار: ${s.betaUsd1y.toFixed(2)} | بازده ۱ ساله نسبت به دلار: ${pct(s.returnVsUsd1y)}
بازه‌ی ۲۶ هفته: ${rng("26w")}
بازه‌ی ۵۲ هفته: ${rng("52w")}${volLine}
محدودیت: ${cur.warnings.length ? cur.warnings.join(" ") : "ندارد"}
نکته: ردیف‌های «[نوسان‌محور تاریخی]» فقط از نوسان تاریخی ساخته شده‌اند و پیش‌بینی نیستند — با عبارت «بازه‌ی محتمل تاریخی» بیان کن.${anyMl ? " ردیف‌های «[مدل اعتبارسنجی‌شده]» خروجی یک مدل آماری (شبیه‌سازی تاریخی + تصحیح یادگیری ماشین) هستند که روی داده‌ی نگه‌داشته‌شده تست و فقط در همین دو مورد تأیید شده — هنوز هم تضمین نیستند، ولی می‌توانی با عبارت «برآورد مدل» به‌جای صرفاً «تاریخی» به آن‌ها اشاره کنی." : ""}`;
}
