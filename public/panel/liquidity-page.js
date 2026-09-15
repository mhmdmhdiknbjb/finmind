import { $, formatToman, formatPercent, cssVar, destroyChart } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

const charts = {};

// `force` recomputes even if nothing the user controls has changed; a
// normal page load leaves it false so the numbers stay stable instead of
// drifting with live market rates — see snapshotStore.js.
async function loadLiquidityWidget(force = false) {
  $("liquidityLoading").classList.remove("hidden");
  $("liquidityContent").classList.add("hidden");
  try {
    const res = await fetch("/api/widgets/liquidity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const data = await res.json();
    $("liquidityLoading").classList.add("hidden");
    $("liquidityContent").classList.remove("hidden");
    renderLiquidityWidget(data);
  } catch (e) {
    console.error(e);
    $("liquidityLoading").classList.add("hidden");
  }
}

function renderLiquidityWidget(data) {
  destroyChart(charts, "liquidityDonut");
  destroyChart(charts, "liquidityBar");

  const donutCtx = $("liquidityDonut").getContext("2d");
  charts.liquidityDonut = new Chart(donutCtx, {
    type: "doughnut",
    data: {
      labels: ["نقد سریع", "نیمه‌نقد", "غیرنقد"],
      datasets: [{ data: [data.liquidPercent, data.semiLiquidPercent, data.illiquidPercent], backgroundColor: ["#4fd1c5", "#7c6bf2", "#f87171"], borderColor: cssVar("--card"), borderWidth: 2 }],
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
      datasets: [{ label: "مبلغ در دسترس", data: [p.immediate, p.oneMonth, p.threeMonths, p.oneYear], backgroundColor: "#4fd1c5", borderRadius: 6 }],
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
}

async function init() {
  const user = await initPanelShell("liquidity");
  if (!user) return;
  $("refreshLiquidityBtn").onclick = () => loadLiquidityWidget(true);
  loadLiquidityWidget();
}

init();
