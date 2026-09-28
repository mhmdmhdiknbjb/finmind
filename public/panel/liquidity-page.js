import { $, widgetFetch, formatToman, formatPercent, cssVar, destroyChart } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

const charts = {};

// `force` recomputes even if nothing the user controls has changed; a
// normal page load leaves it false so the numbers stay stable instead of
// drifting with live market rates — see snapshotStore.js.
async function loadLiquidityWidget(force = false) {
  $("liquidityLoading").classList.remove("hidden");
  $("liquidityContent").classList.add("hidden");
  try {
    const data = await widgetFetch("liquidityLoading", "/api/widgets/liquidity", { force }, () => loadLiquidityWidget(force));
    if (!data) {
      $("liquidityLoading").classList.add("hidden");
      return;
    }
    $("liquidityLoading").classList.add("hidden");
    $("liquidityContent").classList.remove("hidden");
    renderLiquidityWidget(data);
  } catch (e) {
    console.error(e);
    $("liquidityLoading").classList.add("hidden");
  }
}

const months = (n) => (Math.round(n * 10) / 10).toString();

// The numbers below are all computed by the server engines (liquidityEngine.js / liquidityGoalOverlap.js / cashErosion.js);
// this only lays them out, with the unit and definition next to each one.
function renderSmartLiquidity(data) {
  const runway = $("liquidityRunway");
  const rec = data.recommendedBufferMonths;
  if (data.runwayMonths === null || data.runwayMonths === undefined || !rec) {
    runway.innerHTML = '<div class="runway-main">برای محاسبه‌ی «پوشش هزینه» هزینه‌ی ماهانه‌ات را در «اطلاعات من» وارد کن.</div>';
  } else {
    const go0 = data.goalOverlap || {};
    const goalsBreakBuffer = go0.bufferStillCovered === false;
    const enough = data.runwayMonths >= rec && !goalsBreakBuffer;
    const shown = goalsBreakBuffer ? (go0.runwayMonthsAfterGoals ?? 0) : data.runwayMonths;
    const pct = Math.max(2, Math.min(100, (shown / rec) * 100));
    const gap = enough
      ? (data.excessCash > 0 ? `${formatToman(data.excessCash)} از نقد فوری‌ات بیشتر از حد لازم است.` : "ذخیره‌ی اضطراری‌ات کافی است.")
      : goalsBreakBuffer
        ? `اگر پول هدف‌های نزدیک‌ات را از نقد فوری برداری، فقط ${months(go0.runwayMonthsAfterGoals ?? 0)} ماه از هزینه‌هایت پوشش داده می‌شود.`
        : `برای رسیدن به ذخیره‌ی توصیه‌شده ${formatToman(data.shortfall)} کم داری.`;
    runway.innerHTML = `
      <div class="runway-main">پوشش هزینه‌ی زندگی: با پول فوری‌ات <b>${months(data.runwayMonths)} ماه</b> از هزینه‌های ماهانه‌ات پوشش داده می‌شود. <span class="profile-summary">(پول فوری ÷ هزینه‌ی ماهانه)</span></div>
      <div class="meter-row">
        <div class="meter-label"><span>در برابر ذخیره‌ی اضطراری توصیه‌شده‌ی شخصی: ${months(rec)} ماه (${formatToman(data.recommendedBuffer)})</span><b>${enough ? "کافی" : "کمتر از توصیه"}</b></div>
        <div class="meter-track"><div class="meter-fill ${enough ? "meter-suggested" : "meter-current"}" style="width:${pct}%"></div></div>
      </div>
      <div class="profile-summary" style="margin-top:8px;">${gap}</div>`;
  }

  const why = $("liquidityBufferWhy");
  const factors = data.bufferFactors || [];
  why.className = "buffer-why";
  why.innerHTML = `<h4 class="tag-neu">چرا ذخیره‌ی اضطراری تو ${months(rec || 0)} ماه است؟</h4>
    <ul><li>پایه برای همه: ${data.bufferBaseMonths} ماه هزینه</li>${factors.map((f) => `<li>${f.label}: +${f.addMonths} ماه</li>`).join("")}${factors.length ? "" : "<li>عامل افزاینده‌ای (شغل نامنظم، فرزند، بدهی) در اطلاعاتت ثبت نشده است.</li>"}${data.bufferCappedAtMax ? "<li>مجموع به سقف ۹ ماه رسید.</li>" : ""}</ul>`;

  const conflicts = $("liquidityGoalConflicts");
  conflicts.innerHTML = "";
  const go = data.goalOverlap || {};
  (go.conflictsWithGoals || []).forEach((c) => {
    const div = document.createElement("div");
    div.className = "banner banner-warn";
    div.textContent = `⚠ هدف «${c.goalTitle}» (مهلت ${c.goalTargetMonths} ماه) حدود ${formatToman(c.overlapAmount)} از پول فوری‌ات را می‌خواهد${go.bufferStillCovered ? "؛ ذخیره‌ی اضطراری هنوز پوشش داده می‌شود ولی حاشیه‌ات کم می‌شود." : " و با این کار ذخیره‌ی اضطراری‌ات دیگر پوشش داده نمی‌شود."}`;
    conflicts.appendChild(div);
  });

  const idle = $("liquidityIdleCash");
  const oc = data.excessCashOpportunityCost;
  if (data.excessCash > 0 && oc) {
    idle.className = "idle-cash-card";
    idle.innerHTML = `<b>هزینه‌ی فرصت نقد مازاد:</b> ${formatToman(data.excessCash)} از نقدت (بالاتر از ذخیره‌ی اضطراری و نیاز اهداف نزدیک) بی‌استفاده مانده است. اگر این مبلغ در ۵۲ هفته‌ی گذشته به‌جای نقد در دلار بود (رشد ${oc.usdRatePercent}٪) حدود ${formatToman(oc.vsUsd)} و اگر در طلا بود (رشد ${oc.goldRatePercent}٪) حدود ${formatToman(oc.vsGold)} بیشتر می‌شد. <span class="profile-summary">این یک محاسبه‌ی گذشته‌نگر است، نه پیش‌بینی و نه توصیه‌ی خرید؛ سود سپرده‌ی بانکی در آن حساب نشده.</span>`;
  } else {
    idle.className = "";
    idle.innerHTML = "";
  }
}

function renderLiquidityWidget(data) {
  renderSmartLiquidity(data);
  $("liquiditySummary").textContent = data.summary || "";
  destroyChart(charts, "liquidityDonut");
  destroyChart(charts, "liquidityBar");

  const donutCtx = $("liquidityDonut").getContext("2d");
  charts.liquidityDonut = new Chart(donutCtx, {
    type: "doughnut",
    data: {
      labels: ["نقد سریع", "نیمه‌نقد", "غیرنقد"],
      datasets: [{ data: [data.liquidPercent, data.semiLiquidPercent, data.illiquidPercent], backgroundColor: ["#00D4AA", "#c084fc", "#f87171"], borderColor: cssVar("--card"), borderWidth: 2 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: cssVar("--text-dim"), font: { family: "Vazirmatn" } } },
        title: { display: true, text: "توزیع نقدشوندگی", color: cssVar("--text"), font: { family: "Vazirmatn", size: 13 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatPercent(ctx.raw)}` } },
      },
      cutout: "60%",
    },
  });

  const p = data.availableByPeriod || {};
  const barCtx = $("liquidityBar").getContext("2d");
  charts.liquidityBar = new Chart(barCtx, {
    type: "bar",
    data: {
      labels: ["فوری", "تا ۱ ماه", "تا ۳ ماه", "تا ۱ سال"],
      datasets: [{ label: "مبلغ در دسترس", data: [p.immediate, p.oneMonth, p.threeMonths, p.oneYear], backgroundColor: "#00D4AA", borderRadius: 6 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: "پول در دسترس در بازه‌های زمانی", color: cssVar("--text"), font: { family: "Vazirmatn", size: 13 } },
        tooltip: { callbacks: { label: (ctx) => formatToman(ctx.raw) } },
      },
      scales: {
        x: { ticks: { color: cssVar("--text-dim"), font: { family: "Vazirmatn" } }, grid: { display: false } },
        y: { ticks: { color: cssVar("--text-dim"), callback: (v) => formatToman(v) }, grid: { color: cssVar("--border") } },
      },
    },
  });

  const warnWrap = $("liquidityWarnings");
  warnWrap.innerHTML = "";
  (data.warnings || []).forEach((w) => {
    const div = document.createElement("div");
    div.className = "banner banner-warn";
    div.textContent = "⚠ " + w;
    warnWrap.appendChild(div);
  });
  (data.notes || []).forEach((n) => {
    const div = document.createElement("div");
    div.className = "banner banner-live";
    div.textContent = "✓ " + n;
    warnWrap.appendChild(div);
  });
}

async function init() {
  const user = await initPanelShell("liquidity");
  if (!user) return;
  $("refreshLiquidityBtn").onclick = () => loadLiquidityWidget(true);
  loadLiquidityWidget();
}

init();
