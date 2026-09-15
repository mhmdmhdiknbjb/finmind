import { $, CATEGORY_LABELS, CATEGORY_COLORS, formatToman, formatPercent, cssVar, fillListLive, typeWordsInto, destroyChart } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

const charts = {};

async function loadAssetsWidget() {
  $("assetsLoading").classList.remove("hidden");
  $("assetsContent").classList.add("hidden");
  try {
    const res = await fetch("/api/widgets/assets", { method: "POST" });
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
    { label: "فعلی", data: currentVals, backgroundColor: "#7c6bf2", borderRadius: 5 },
    { label: "پیشنهادی موتور", data: optimalVals, backgroundColor: "#4fd1c5", borderRadius: 5 },
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
  $("refreshAssetsBtn").onclick = loadAssetsWidget;
  loadAssetsWidget();
}

init();
