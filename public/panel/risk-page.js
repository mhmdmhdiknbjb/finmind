import { $, widgetFetch, fillListLive, typeWordsInto, ltr, faDate } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

// `force` recomputes even if nothing the user controls has changed; a
// normal page load leaves it false so this stays the same number shown
// everywhere else in the app instead of drifting with live market rates —
// see snapshotStore.js.
async function loadRiskWidget(force = false) {
  $("riskLoading").classList.remove("hidden");
  $("riskContent").classList.add("hidden");
  try {
    const data = await widgetFetch("riskLoading", "/api/widgets/risk", { force }, () => loadRiskWidget(force));
    if (!data) {
      $("riskLoading").classList.add("hidden");
      return;
    }
    renderRiskWidget(data);
    $("riskLoading").classList.add("hidden");
    $("riskContent").classList.remove("hidden");
  } catch (e) {
    console.error(e);
    $("riskLoading").classList.add("hidden");
  }
}

const GAUGE_RADIUS = 70;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_RADIUS;

function setRiskGauge(value) {
  const v = Math.min(100, Math.max(0, value || 0));
  const arc = $("riskGaugeArc");
  arc.style.strokeDasharray = GAUGE_CIRC;
  arc.style.strokeDashoffset = GAUGE_CIRC * (1 - v / 100);
  $("riskGaugeNum").textContent = Math.round(v).toLocaleString("fa-IR");
}

function renderRiskWidget(data) {
  $("riskCurrentVal").textContent = Math.round(data.currentRiskScore);
  $("riskSuggestedVal").textContent = Math.round(data.suggestedRiskScore);
  $("riskCurrentBar").style.width = Math.min(100, Math.max(0, data.currentRiskScore)) + "%";
  $("riskSuggestedBar").style.width = Math.min(100, Math.max(0, data.suggestedRiskScore)) + "%";
  $("riskLevelBadge").textContent = "ریسک " + (data.riskLevel || "—");
  $("riskGaugeLevel").textContent = data.riskLevel || "—";
  setRiskGauge(data.currentRiskScore);
  const diff = data.difference ?? (data.currentRiskScore - data.suggestedRiskScore);
  $("riskDiffBadge").textContent = `اختلاف: ${diff > 0 ? "+" : ""}${Math.round(diff)}`;

  renderMarketRisk(data.marketRisk);
  renderComposite(data.marketRisk);

  fillListLive("riskReasons", data.reasons);
  fillListLive("riskBehavioral", data.behavioralFactors);
  fillListLive("riskSuggestions", data.suggestions);
  typeWordsInto($("riskSummary"), data.summary || "");

  const bBanner = $("behaviorBanner");
  const info = data.riskToleranceInfo;
  if (info && info.eventCount > 0) {
    bBanner.textContent = `🧠 مدل رفتاری: بر اساس ${info.eventCount} تصمیم/واکنش واقعی شما، ریسک‌پذیری موثر ${info.effective.toFixed(1)} از ۱۰ برآورد شده (ریسک‌پذیری اعلامی: ${info.base} از ۱۰).`;
    bBanner.classList.remove("hidden");
  } else {
    bBanner.classList.add("hidden");
  }
}

const pct1 = (x) => ltr(Number.isFinite(x) ? (x * 100).toFixed(1) + "٪" : "—");
const pct0 = (x) => ltr(Number.isFinite(x) ? Math.round(x * 100) + "٪" : "—");

function chip(label, value) {
  const div = document.createElement("div");
  div.className = "stat-chip";
  div.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value">${value}</span>`;
  return div;
}

const COMPOSITE_LABELS = {
  volatility: "نوسان بازار",
  drawdown: "افت از اوج",
  tail: "هفته‌های بد",
  concentration: "تمرکز",
  illiquidity: "ضعف نقدشوندگی",
  cashErosion: "فرسایش نقد",
};

/** شاخص ترکیبی: نوسان + افت + دم بد + تمرکز + نقدشوندگی + فرسایش نقد (the volatility gauge above is only the first part). */
function renderComposite(mr) {
  const block = $("compositeBlock");
  const c = mr && mr.composite;
  if (!c) {
    block.classList.add("hidden");
    return;
  }
  block.classList.remove("hidden");
  // this IS the number in the gauge above — the breakdown just shows what it's made of
  $("compositeScore").textContent = "= " + c.score + " از ۱۰۰ (" + c.level + ")";
  const wrap = $("compositeStats");
  wrap.innerHTML = "";
  Object.entries(COMPOSITE_LABELS).forEach(([k, label]) => wrap.appendChild(chip(label + " (وزن " + Math.round((c.weights[k] || 0) * 100) + "٪)", ltr(c.components[k]))));
  $("compositeNote").textContent = "ریسک سبد فقط نوسان قیمت نیست؛ این عدد نوسان، افت، هفته‌های بد، تمرکز، ضعف نقدشوندگی و فرسایش پول نقد را با وزن‌های ثابت ترکیب می‌کند — برای همین حتی سبدی با نوسان کم اما تمرکز بالا می‌تواند امتیاز ریسک بالایی بگیرد.";
}

/** ریسک واقعی: numbers measured on real weekly market data (portfolioRisk.js) — hidden when there is nothing priced. */
function renderMarketRisk(m) {
  const block = $("marketRiskBlock");
  if (!m || !m.hasMarketAssets || !m.sleeve) {
    block.classList.add("hidden");
    return;
  }
  block.classList.remove("hidden");
  $("marketRiskAsOf").innerHTML = `داده‌ی بازار تا ${faDate(m.asOf)} — پوشش ${pct0(m.modeledShare)} از دارایی`;

  const s = m.sleeve;
  const stats = $("marketRiskStats");
  stats.innerHTML = "";
  stats.append(
    chip("نوسان سالانه (۱ سال)", pct1(s.annVolatility1y)),
    chip("بیشینه ریزش (۱ سال)", pct1(s.maxDrawdown1y)),
    chip("میانگین ۳ هفته‌ی بدتر", pct1(s.cvar95Weekly1y)),
    chip("بتا نسبت به دلار", ltr(s.betaUsd1y)),
    chip("بازده نسبت به دلار (۱ سال)", pct1(s.returnVsUsd1y))
  );
  const fv = m.forwardVol;
  if (fv) {
    for (const [k, label] of [["26w", "۲۶ هفته"], ["52w", "۵۲ هفته"]]) {
      if (!fv[k]) continue;
      const c = chip(`نوسان پیش‌بینی‌شده (${label} آینده) <span class="ml-tag" title="مدل یادگیری ماشین اعتبارسنجی‌شده؛ برآورد است نه تضمین. بازه‌ی محتمل: ${pct0(fv[k].p10)} تا ${pct0(fv[k].p90)}">مدل</span>`, pct1(fv[k].point));
      stats.append(c);
    }
  }
  if (s.annVolatility3y !== null) stats.append(chip("نوسان سالانه (۳ سال)", pct1(s.annVolatility3y)));
  if (s.maxDrawdown3y !== null) stats.append(chip("بیشینه ریزش (۳ سال)", pct1(s.maxDrawdown3y)));

  const body = $("forwardRangeBody");
  body.innerHTML = "";
  [["26w", "۲۶ هفته"], ["52w", "۵۲ هفته"]].forEach(([key, label]) => {
    const f = m.forward?.[key];
    if (!f) return;
    const tr = document.createElement("tr");
    const tag = (r) => (r.source === "ml_stack" ? ' <span class="ml-tag" title="شبیه‌سازی تاریخی + تصحیح یادگیری ماشین، روی داده‌ی نگه‌داشته‌شده اعتبارسنجی‌شده">مدل</span>' : "");
    const cell = (r) => `${pct0(r.p10)} تا ${pct0(r.p90)} <small>(میانه ${pct0(r.p50)})</small>${tag(r)}`;
    tr.innerHTML = `<td>${label}</td><td>${cell(f.ret)}</td><td>${pct0(f.maxDrawdown.p90)} تا ${pct0(f.maxDrawdown.p10)}${tag(f.maxDrawdown)}</td><td>${cell(f.retVsUsd)}</td>`;
    body.appendChild(tr);
  });
  const hasMl = ["26w", "52w"].some((h) => ["ret", "maxDrawdown", "retVsUsd"].some((t) => m.forward?.[h]?.[t]?.source === "ml_stack"));
  $("marketRiskNotes").textContent = m.warnings.join(" ") + " بازه‌های بدون برچسب «مدل» فقط از تاریخچه‌ی نوسان ساخته شده‌اند و پیش‌بینی نیستند."
    + (hasMl ? " ردیف‌های با برچسب «مدل» خروجی یک مدل آماری اعتبارسنجی‌شده‌اند (نه صرفاً نوسان تاریخی) ولی همچنان تضمین نیستند." : "");
}

async function init() {
  const user = await initPanelShell("risk");
  if (!user) return;
  $("refreshRiskBtn").onclick = () => loadRiskWidget(true);
  loadRiskWidget();
}

init();
