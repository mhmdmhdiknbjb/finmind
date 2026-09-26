import { $, widgetFetch, CATEGORY_LABELS, SCENARIO_PRESETS, formatToman, cssVar, typeWordsInto, destroyChart } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

const charts = {};

function renderScenarioPresets() {
  const wrap = $("scenarioPresets");
  wrap.innerHTML = "";
  SCENARIO_PRESETS.forEach((s) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = s.title;
    chip.onclick = () => runScenario(s, chip);
    wrap.appendChild(chip);
  });
}

async function runScenario(scenario, chipEl) {
  document.querySelectorAll("#scenarioPresets .chip").forEach((c) => c.classList.remove("active"));
  if (chipEl) chipEl.classList.add("active");

  $("scenarioLoading").classList.remove("hidden");
  $("scenarioContent").classList.add("hidden");
  try {
    const data = await widgetFetch("scenarioLoading", "/api/widgets/scenario", { scenario }, () => runScenario(scenario, chipEl));
    if (!data) {
      $("scenarioLoading").classList.add("hidden");
      return;
    }
    $("scenarioLoading").classList.add("hidden");
    $("scenarioContent").classList.remove("hidden");
    renderScenarioResult(data);
  } catch (e) {
    console.error(e);
    $("scenarioLoading").classList.add("hidden");
  }
}

function renderScenarioResult(data) {
  destroyChart(charts, "scenario");
  const ctx = $("scenarioChart").getContext("2d");
  const items = data.impactByAsset || [];
  const labels = items.map((i) => i.label || CATEGORY_LABELS[i.category] || i.category);
  const values = items.map((i) => i.changePercent);
  const colors = values.map((v) => (v >= 0 ? "#34d399" : "#f87171"));

  charts.scenario = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "درصد تغییر", data: values, backgroundColor: colors, borderRadius: 6 }] },
    options: {
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.raw > 0 ? "+" : ""}${ctx.raw}٪` } },
      },
      scales: {
        x: { ticks: { color: cssVar("--text-dim"), callback: (v) => v + "٪" }, grid: { color: cssVar("--border") } },
        y: { ticks: { color: cssVar("--text-dim"), font: { family: "Vazirmatn" } }, grid: { display: false } },
      },
    },
  });

  const totalEl = $("scenarioTotal");
  const pct = data.totalPortfolioChangePercent ?? 0;
  totalEl.textContent = `اثر کلی بر سبد دارایی: ${pct > 0 ? "+" : ""}${pct}٪ (${formatToman(data.totalPortfolioChangeAmount)})`;
  totalEl.className = "scenario-total " + (pct >= 0 ? "pos" : "neg");

  const rangeEl = $("scenarioRange");
  if (data.confidenceRange) {
    const r = data.confidenceRange;
    rangeEl.textContent = `بازه ۷۰٪ اطمینان (شبیه‌سازی مونت‌کارلو، ${data.trials || ""} تکرار): بین ${r.p15Percent > 0 ? "+" : ""}${r.p15Percent}٪ و ${r.p85Percent > 0 ? "+" : ""}${r.p85Percent}٪`;
    rangeEl.classList.remove("hidden");
  } else {
    rangeEl.classList.add("hidden");
  }
  const engineTag = $("scenarioEngineTag");
  if (engineTag) engineTag.textContent = data.confidenceRange ? "مونت‌کارلو" : "تحلیل کیفی";

  typeWordsInto($("scenarioExplanation"), data.explanation || "");
  typeWordsInto($("scenarioRecommendation"), data.recommendation || "");
}

async function init() {
  const user = await initPanelShell("scenario");
  if (!user) return;
  renderScenarioPresets();
  $("runScenarioBtn").onclick = () => {
    const text = $("scenarioCustom").value.trim();
    if (!text) return;
    runScenario({ title: "سناریوی دلخواه کاربر", description: text }, null);
  };
}

init();
