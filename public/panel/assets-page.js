import { $, CATEGORY_LABELS, CATEGORY_COLORS, formatToman, formatPercent, cssVar, fillListLive, typeWordsInto, destroyChart, ltr, faDate } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

const charts = {};

// `force` recomputes even if nothing the user controls has changed
// (explicit "تحلیل مجدد" click); a normal page load leaves it false so the
// widget serves its last stored numbers instead of drifting with every
// live gold/dollar rate tick — see snapshotStore.js.
async function loadAssetsWidget(force = false) {
  $("assetsLoading").classList.remove("hidden");
  $("assetsContent").classList.add("hidden");
  try {
    const res = await fetch("/api/widgets/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const data = await res.json();
    $("assetsLoading").classList.add("hidden");
    $("assetsContent").classList.remove("hidden");
    $("assetsTextContent").classList.remove("hidden");
    renderAssetsWidget(data);
  } catch (e) {
    console.error(e);
    $("assetsLoading").classList.add("hidden");
  }
}

function renderAssetsWidget(data) {
  destroyChart(charts, "assets");
  const ctx = $("assetsChart").getContext("2d");
  const labels = (data.allocation || []).map((a) => a.label || CATEGORY_LABELS[a.category] || a.category);
  const values = (data.allocation || []).map((a) => a.amount);
  const colors = (data.allocation || []).map((a) => CATEGORY_COLORS[a.category] || "#94a3b8");

  charts.assets = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: cssVar("--card"), borderWidth: 2 }] },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: cssVar("--text-dim"), font: { family: "Vazirmatn" }, padding: 14 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatToman(ctx.raw)}` } },
      },
      cutout: "62%",
    },
  });

  const warnEl = $("concentrationWarning");
  if (data.concentrationWarning) {
    warnEl.textContent = "⚠ " + data.concentrationWarning;
    warnEl.classList.remove("hidden");
  } else {
    warnEl.classList.add("hidden");
  }

  fillListLive("assetsStrengths", data.strengths);
  fillListLive("assetsWeaknesses", data.weaknesses);
  fillListLive("assetsSuggestions", data.suggestions);
  typeWordsInto($("assetsSummary"), data.summary || "");

  renderOptimalComparisonChart(data.allocation, data.optimal);
  renderStatChips("currentStatsRow", data.currentStats);
  renderStatChips("optimalStatsRow", data.optimalStats);
  renderDispersion(data.dispersion);
}

const pct1 = (x) => ltr(Number.isFinite(x) ? (x * 100).toFixed(1) + "٪" : "—");

/** پراکندگی: deterministic diversification numbers (portfolioRisk.js) — hidden when no market data is available. */
function renderDispersion(d) {
  const card = $("dispersionCard");
  destroyChart(charts, "dispersion");
  if (!d) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  $("dispersionAsOf").textContent = `داده‌ی بازار تا ${faDate(d.asOf)}`;

  const stats = $("dispersionStats");
  stats.innerHTML = "";
  const score = ltr(d.suggestedDiversificationScore === null ? `${d.diversificationScore} از ۱۰۰` : `${d.diversificationScore} → ${d.suggestedDiversificationScore}`);
  stats.appendChild(statChip("امتیاز تنوع (فعلی → پیشنهادی)", score));
  stats.appendChild(statChip("تعداد مؤثر کلاس دارایی", ltr(d.effectiveNClass)));
  stats.appendChild(statChip("بزرگ‌ترین قلم", pct1(d.top1Share)));
  stats.appendChild(statChip("سه قلم بزرگ", pct1(d.top3Share)));
  if (d.avgPairwiseCorr !== null) stats.appendChild(statChip("همبستگی متوسط دارایی‌ها", ltr(d.avgPairwiseCorr.toFixed(2))));

  const labels = d.capitalShareByClass.map((c) => c.label);
  const riskByKey = Object.fromEntries(d.riskShareByClass.map((c) => [c.key, c.share]));
  const datasets = [{ label: "سهم سرمایه", data: d.capitalShareByClass.map((c) => Math.round(c.share * 1000) / 10), backgroundColor: "#c084fc", borderRadius: 5 }];
  if (d.riskShareByClass.length) {
    datasets.push({ label: "سهم ریسک", data: d.capitalShareByClass.map((c) => Math.round((riskByKey[c.key] ?? 0) * 1000) / 10), backgroundColor: "#fb923c", borderRadius: 5 });
  }
  charts.dispersion = new Chart($("dispersionChart").getContext("2d"), {
    type: "bar",
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { position: "bottom", labels: { color: cssVar("--text-dim"), font: { family: "Vazirmatn" } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}٪` } },
      },
      scales: {
        x: { ticks: { color: cssVar("--text-dim"), callback: (v) => v + "٪" }, grid: { color: cssVar("--border") } },
        y: { ticks: { color: cssVar("--text-dim"), font: { family: "Vazirmatn" } }, grid: { display: false } },
      },
    },
  });

  const flags = $("dispersionFlags");
  flags.innerHTML = "";
  if (!d.flags.length) {
    const ok = document.createElement("div");
    ok.className = "banner banner-live";
    ok.textContent = "✓ هیچ پرچم هشداری روی ساختار سبد شناسایی نشد.";
    flags.appendChild(ok);
  }
  d.flags.forEach((f) => {
    const div = document.createElement("div");
    div.className = "banner banner-warn";
    div.textContent = "⚠ " + f.text;
    flags.appendChild(div);
  });
  $("dispersionNotes").textContent = d.warnings.join(" ");
}

function statChip(label, value) {
  const div = document.createElement("div");
  div.className = "stat-chip";
  div.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value">${value}</span>`;
  return div;
}

function renderStatChips(elId, stats) {
  const wrap = $(elId);
  wrap.innerHTML = "";
  if (!stats) return;
  wrap.appendChild(statChip("بازده مورد انتظار سالانه", formatPercent(stats.expectedReturn * 100)));
  wrap.appendChild(statChip("نوسان سالانه", formatPercent(stats.volatility * 100)));
  // Same 0-100 score shown on صفحه‌ی ریسک‌سنجی (identical formula, identical
  // number) so the two pages never look like they disagree about risk.
  wrap.appendChild(statChip("امتیاز ریسک (از ۱۰۰)", stats.riskScore));
  wrap.appendChild(statChip("نقدینگی", formatPercent(stats.liquidityPercent)));
}

function renderOptimalComparisonChart(current, optimal) {
  destroyChart(charts, "optimal");
  const byCategory = {};
  (current || []).forEach((a) => (byCategory[a.category] = { label: a.label, current: a.percent, optimal: 0 }));
  (optimal || []).forEach((a) => {
    if (!byCategory[a.category]) byCategory[a.category] = { label: a.label, current: 0, optimal: 0 };
    byCategory[a.category].optimal = a.percent;
  });
  const entries = Object.entries(byCategory);
  const labels = entries.map(([, v]) => v.label);
  const currentVals = entries.map(([, v]) => v.current);
  const optimalVals = entries.map(([, v]) => v.optimal);

  const datasets = [
    { label: "فعلی", data: currentVals, backgroundColor: "#c084fc", borderRadius: 5 },
    { label: "پیشنهادی موتور", data: optimalVals, backgroundColor: "#00D4AA", borderRadius: 5 },
  ];

  const ctx = $("optimalChart").getContext("2d");
  charts.optimal = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { position: "bottom", labels: { color: cssVar("--text-dim"), font: { family: "Vazirmatn" } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}٪` } },
      },
      scales: {
        x: { ticks: { color: cssVar("--text-dim"), callback: (v) => v + "٪" }, grid: { color: cssVar("--border") } },
        y: { ticks: { color: cssVar("--text-dim"), font: { family: "Vazirmatn" } }, grid: { display: false } },
      },
    },
  });
}

async function init() {
  const user = await initPanelShell("assets");
  if (!user) return;
  $("refreshAssetsBtn").onclick = () => loadAssetsWidget(true);
  loadAssetsWidget();
}

init();
