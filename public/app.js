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
const CATEGORY_COLORS = {
  cash: "#4fd1c5",
  gold: "#fbbf24",
  currency: "#60a5fa",
  stock: "#a78bfa",
  fund: "#7c6bf2",
  realestate: "#f472b6",
  crypto: "#f87171",
  other: "#94a3b8",
};

const SCENARIO_PRESETS = [
  { id: "usd_up_30", title: "دلار ۳۰٪ رشد کند", description: "نرخ دلار آزاد نسبت به وضعیت فعلی ۳۰ درصد افزایش پیدا می‌کند." },
  { id: "gold_down_20", title: "طلا ۲۰٪ کاهش پیدا کند", description: "قیمت طلا و سکه نسبت به وضعیت فعلی ۲۰ درصد کاهش می‌یابد." },
  { id: "inflation_spike", title: "تورم به‌شدت افزایش یابد", description: "نرخ تورم نقطه‌به‌نقطه به‌طور ناگهانی به بالای ۶۰ درصد می‌رسد." },
  { id: "stock_crash_25", title: "بورس ۲۵٪ ریزش کند", description: "شاخص کل بورس تهران ۲۵ درصد افت می‌کند." },
  { id: "stock_rally_25", title: "بورس ۲۵٪ رشد کند", description: "شاخص کل بورس تهران ۲۵ درصد رشد می‌کند." },
  { id: "rate_hike", title: "نرخ سود بانکی افزایش یابد", description: "نرخ سود سپرده بانکی و اوراق به‌طور محسوس افزایش پیدا می‌کند." },
  { id: "income_drop_30", title: "درآمد ماهانه ۳۰٪ کاهش یابد", description: "به دلیل رکود اقتصادی، درآمد ماهانه کاربر ۳۰ درصد کاهش می‌یابد." },
];

let profile = null;
let chatHistory = [];
let charts = {};

function $(id) { return document.getElementById(id); }

function formatToman(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " میلیارد تومان";
  if (abs >= 1e6) return (n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " میلیون تومان";
  return Math.round(n).toLocaleString("en-US") + " تومان";
}

function formatPercent(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Math.round(n) + "٪";
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fillList(elId, items) {
  const el = $(elId);
  el.innerHTML = "";
  (items || []).forEach((it) => {
    const li = document.createElement("li");
    li.textContent = it;
    el.appendChild(li);
  });
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.textContent = "موردی یافت نشد.";
    li.style.color = "var(--text-faint)";
    el.appendChild(li);
  }
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

/* ---------------- Profile ---------------- */

async function fetchProfile() {
  const res = await fetch("/api/profile");
  profile = await res.json();
  populateProfileForm();
  return profile;
}

function populateProfileForm() {
  const p = profile.personal || {};
  $("fAge").value = p.age ?? "";
  $("fGender").value = p.gender ?? "مرد";
  $("fMarital").value = p.maritalStatus ?? "مجرد";
  $("fChildren").value = p.childrenCount ?? "";
  $("fIncome").value = profile.monthlyIncome ?? "";
  $("fExpenses").value = profile.monthlyExpenses ?? "";
  $("fRisk").value = profile.riskTolerance ?? 5;
  $("riskSliderVal").textContent = profile.riskTolerance ?? 5;
  $("fHorizon").value = profile.timeHorizonNote ?? "";
  $("fLiquidityNote").value = profile.liquidityNeedNote ?? "";
  renderAssetRows(profile.assets || []);
  renderGoalsList();
}

function renderAssetRows(assets) {
  const wrap = $("assetRows");
  wrap.innerHTML = "";
  if (!assets.length) assets = [{ category: "cash", label: "", amount: "" }];
  assets.forEach((a) => addAssetRow(a));
}

function addAssetRow(asset = { category: "cash", label: "", amount: "" }) {
  const wrap = $("assetRows");
  const row = document.createElement("div");
  row.className = "asset-row";

  const select = document.createElement("select");
  Object.entries(CATEGORY_LABELS).forEach(([val, label]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    if (val === asset.category) opt.selected = true;
    select.appendChild(opt);
  });

  const labelInput = document.createElement("input");
  labelInput.placeholder = "توضیح (اختیاری) مثلاً سپرده بانک ملت";
  labelInput.value = asset.label || "";

  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.placeholder = "مبلغ (تومان)";
  amountInput.value = asset.amount || "";

  const delBtn = document.createElement("button");
  delBtn.className = "btn-del";
  delBtn.textContent = "✕";
  delBtn.type = "button";
  delBtn.onclick = () => row.remove();

  row.append(select, labelInput, amountInput, delBtn);
  wrap.appendChild(row);
}

function collectProfileFromForm() {
  const assets = [];
  $("assetRows").querySelectorAll(".asset-row").forEach((row) => {
    const [select, labelInput, amountInput] = row.querySelectorAll("select, input");
    const amount = Number(amountInput.value) || 0;
    if (amount > 0) {
      assets.push({ category: select.value, label: labelInput.value.trim(), amount });
    }
  });

  return {
    personal: {
      age: $("fAge").value ? Number($("fAge").value) : null,
      gender: $("fGender").value,
      maritalStatus: $("fMarital").value,
      childrenCount: $("fChildren").value ? Number($("fChildren").value) : null,
    },
    riskTolerance: Number($("fRisk").value),
    monthlyIncome: $("fIncome").value ? Number($("fIncome").value) : null,
    monthlyExpenses: $("fExpenses").value ? Number($("fExpenses").value) : null,
    timeHorizonNote: $("fHorizon").value.trim(),
    liquidityNeedNote: $("fLiquidityNote").value.trim(),
    assets,
    goals: profile.goals || [],
  };
}

async function saveProfileAndRefresh() {
  const data = collectProfileFromForm();
  $("saveStatus").textContent = "در حال ذخیره...";
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  profile = await res.json();
  $("saveStatus").textContent = "ذخیره شد ✓";
  setTimeout(() => ($("saveStatus").textContent = ""), 2500);
  refreshCoreWidgets();
}

/* ---------------- Assets Widget ---------------- */

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
    updateTopbarStat("statTotal", formatToman(data.totalAssets));
  } catch (e) {
    console.error(e);
    $("assetsLoading").classList.add("hidden");
  }
}

function renderAssetsWidget(data) {
  destroyChart("assets");
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

  const adjustEl = $("adjustmentBanner");
  if (data.adjusted && data.adjustmentReason) {
    adjustEl.textContent = "🤖 هوش مصنوعی این ترکیب را تعدیل کرد: " + data.adjustmentReason;
    adjustEl.classList.remove("hidden");
  } else {
    adjustEl.classList.add("hidden");
  }

  fillList("assetsStrengths", data.strengths);
  fillList("assetsWeaknesses", data.weaknesses);
  fillList("assetsSuggestions", data.suggestions);
  $("assetsSummary").textContent = data.summary || "";

  renderOptimalComparisonChart(data.allocation, data.optimal, data.adjusted);
  renderStatChips("currentStatsRow", data.currentStats);
  renderStatChips("optimalStatsRow", data.optimalStats);
  if (data.adjusted && data.adjustedStats) {
    renderStatChips("adjustedStatsRow", data.adjustedStats);
    $("adjustedStatsRow").classList.remove("hidden");
  } else {
    $("adjustedStatsRow").classList.add("hidden");
  }
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
  wrap.appendChild(statChip("نوسان سالانه (ریسک)", formatPercent(stats.volatility * 100)));
  wrap.appendChild(statChip("نقدینگی", formatPercent(stats.liquidityPercent)));
}

function renderOptimalComparisonChart(current, optimal, adjusted) {
  destroyChart("optimal");
  const byCategory = {};
  (current || []).forEach((a) => (byCategory[a.category] = { label: a.label, current: a.percent, optimal: 0, adjusted: 0 }));
  (optimal || []).forEach((a) => {
    if (!byCategory[a.category]) byCategory[a.category] = { label: a.label, current: 0, optimal: 0, adjusted: 0 };
    byCategory[a.category].optimal = a.percent;
  });
  (adjusted || []).forEach((a) => {
    if (!byCategory[a.category]) byCategory[a.category] = { label: a.label, current: 0, optimal: 0, adjusted: 0 };
    byCategory[a.category].adjusted = a.percent;
  });
  const entries = Object.entries(byCategory);
  const labels = entries.map(([, v]) => v.label);
  const currentVals = entries.map(([, v]) => v.current);
  const optimalVals = entries.map(([, v]) => v.optimal);
  const adjustedVals = entries.map(([, v]) => v.adjusted);

  const datasets = [
    { label: "فعلی", data: currentVals, backgroundColor: "#7c6bf2", borderRadius: 5 },
    { label: "پیشنهادی موتور", data: optimalVals, backgroundColor: "#4fd1c5", borderRadius: 5 },
  ];
  if (adjusted && adjusted.length) {
    datasets.push({ label: "تعدیل‌شده توسط هوش مصنوعی", data: adjustedVals, backgroundColor: "#fbbf24", borderRadius: 5 });
  }

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

/* ---------------- Risk Widget ---------------- */

async function loadRiskWidget() {
  $("riskLoading").classList.remove("hidden");
  $("riskContent").classList.add("hidden");
  try {
    const res = await fetch("/api/widgets/risk", { method: "POST" });
    const data = await res.json();
    renderRiskWidget(data);
    updateTopbarStat("statRisk", `${Math.round(data.currentRiskScore)} از ۱۰۰`);
  } catch (e) {
    console.error(e);
  } finally {
    $("riskLoading").classList.add("hidden");
    $("riskContent").classList.remove("hidden");
  }
}

function renderRiskWidget(data) {
  $("riskCurrentVal").textContent = Math.round(data.currentRiskScore);
  $("riskSuggestedVal").textContent = Math.round(data.suggestedRiskScore);
  $("riskCurrentBar").style.width = Math.min(100, Math.max(0, data.currentRiskScore)) + "%";
  $("riskSuggestedBar").style.width = Math.min(100, Math.max(0, data.suggestedRiskScore)) + "%";
  $("riskLevelBadge").textContent = "ریسک " + (data.riskLevel || "—");
  const diff = data.difference ?? (data.currentRiskScore - data.suggestedRiskScore);
  $("riskDiffBadge").textContent = `اختلاف: ${diff > 0 ? "+" : ""}${Math.round(diff)}`;

  fillList("riskReasons", data.reasons);
  fillList("riskBehavioral", data.behavioralFactors);
  fillList("riskSuggestions", data.suggestions);
  $("riskSummary").textContent = data.summary || "";

  const bBanner = $("behaviorBanner");
  const info = data.riskToleranceInfo;
  if (info && info.eventCount > 0) {
    bBanner.textContent = `🧠 مدل رفتاری: بر اساس ${info.eventCount} تصمیم/واکنش واقعی شما، ریسک‌پذیری موثر ${info.effective.toFixed(1)} از ۱۰ برآورد شده (ریسک‌پذیری اعلامی: ${info.base} از ۱۰).`;
    bBanner.classList.remove("hidden");
  } else {
    bBanner.classList.add("hidden");
  }
}

/* ---------------- Liquidity Widget ---------------- */

async function loadLiquidityWidget() {
  $("liquidityLoading").classList.remove("hidden");
  $("liquidityContent").classList.add("hidden");
  try {
    const res = await fetch("/api/widgets/liquidity", { method: "POST" });
    const data = await res.json();
    $("liquidityLoading").classList.add("hidden");
    $("liquidityContent").classList.remove("hidden");
    renderLiquidityWidget(data);
    updateTopbarStat("statLiquid", formatPercent(data.liquidPercent));
  } catch (e) {
    console.error(e);
    $("liquidityLoading").classList.add("hidden");
  }
}

function renderLiquidityWidget(data) {
  destroyChart("liquidityDonut");
  destroyChart("liquidityBar");

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

/* ---------------- Goals Widget ---------------- */

function renderGoalsList() {
  const wrap = $("goalsList");
  wrap.innerHTML = "";
  const goals = profile.goals || [];
  if (!goals.length) {
    wrap.innerHTML = '<p style="color:var(--text-faint); font-size:13px;">هنوز هدف مالی‌ای ثبت نشده است.</p>';
    return;
  }
  goals.forEach((g) => {
    const item = document.createElement("div");
    item.className = "goal-item";
    item.innerHTML = `
      <div class="goal-item-head">
        <strong>${g.title}</strong>
        <span class="goal-item-meta">${formatToman(g.targetAmount)} — ${g.targetMonths} ماه</span>
      </div>
      <div class="goal-actions">
        <button class="btn btn-ghost btn-small" data-action="analyze">تحلیل مسیر رسیدن به هدف</button>
        <button class="btn btn-ghost btn-small" data-action="delete">حذف</button>
      </div>
      <div class="goal-analysis hidden"></div>
    `;
    item.querySelector('[data-action="delete"]').onclick = async () => {
      await fetch(`/api/goals/${g.id}`, { method: "DELETE" });
      profile.goals = profile.goals.filter((x) => x.id !== g.id);
      renderGoalsList();
    };
    item.querySelector('[data-action="analyze"]').onclick = async (e) => {
      const btn = e.target;
      const box = item.querySelector(".goal-analysis");
      btn.disabled = true;
      btn.textContent = "در حال تحلیل...";
      box.classList.remove("hidden");
      box.textContent = "در حال بررسی توسط هوش مصنوعی...";
      try {
        const res = await fetch("/api/widgets/goal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: g }),
        });
        const d = await res.json();
        box.innerHTML = `
          <div>امکان‌پذیری: <span class="${d.feasible ? "feasible-yes" : "feasible-no"}">${d.feasible ? "قابل دستیابی است" : "با شرایط فعلی دشوار است"}</span></div>
          <div>پس‌انداز ماهانه لازم: <b>${formatToman(d.requiredMonthlySaving)}</b></div>
          <div>توان پس‌انداز فعلی: <b>${formatToman(d.currentMonthlySavingCapacity)}</b></div>
          <ul>${(d.suggestedPath || []).map((s) => `<li>${s}</li>`).join("")}</ul>
          <p>${d.summary || ""}</p>
        `;
      } catch (err) {
        box.textContent = "خطا در دریافت تحلیل.";
      } finally {
        btn.disabled = false;
        btn.textContent = "تحلیل مسیر رسیدن به هدف";
      }
    };
    wrap.appendChild(item);
  });
}

async function addGoal() {
  const title = $("goalTitle").value.trim();
  const targetAmount = Number($("goalAmount").value);
  const targetMonths = Number($("goalMonths").value);
  if (!title || !targetAmount || !targetMonths) return;
  const res = await fetch("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, targetAmount, targetMonths }),
  });
  profile = await res.json();
  $("goalTitle").value = "";
  $("goalAmount").value = "";
  $("goalMonths").value = "";
  renderGoalsList();
}

/* ---------------- Scenario Widget ---------------- */

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
    const res = await fetch("/api/widgets/scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
    const data = await res.json();
    $("scenarioLoading").classList.add("hidden");
    $("scenarioContent").classList.remove("hidden");
    renderScenarioResult(data);
  } catch (e) {
    console.error(e);
    $("scenarioLoading").classList.add("hidden");
  }
}

function renderScenarioResult(data) {
  destroyChart("scenario");
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

  $("scenarioExplanation").textContent = data.explanation || "";
  $("scenarioRecommendation").textContent = data.recommendation || "";
}

/* ---------------- Forecast Widget ---------------- */

async function loadForecastWidget() {
  const asset = $("forecastAsset").value;
  $("forecastLoading").classList.remove("hidden");
  $("forecastContent").classList.add("hidden");
  try {
    const res = await fetch("/api/widgets/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset }),
    });
    const data = await res.json();
    $("forecastLoading").classList.add("hidden");
    $("forecastSyntheticBanner").classList.toggle("hidden", !data.synthetic);
    if (data.error) {
      $("forecastExplanation").textContent = data.error;
      $("forecastRelevance").textContent = "";
      destroyChart("forecast");
      $("forecastContent").classList.remove("hidden");
      return;
    }
    $("forecastContent").classList.remove("hidden");
    renderForecastChart(data);
    $("forecastExplanation").textContent = data.explanation || "";
    $("forecastRelevance").textContent = data.portfolioRelevance || "";
  } catch (e) {
    console.error(e);
    $("forecastLoading").classList.add("hidden");
  }
}

function renderForecastChart(data) {
  destroyChart("forecast");
  const histLabels = data.series.map((p) => p.period);
  const histValues = data.series.map((p) => p.value);
  const futureLabels = data.forecast.points.map((p) => `+${p.h}`);
  const labels = [...histLabels, ...futureLabels];

  const historyDataset = [...histValues, ...futureLabels.map(() => null)];
  const forecastMid = [...histValues.map(() => null)];
  forecastMid[histValues.length - 1] = histValues[histValues.length - 1];
  data.forecast.points.forEach((p) => forecastMid.push(p.p50));
  const forecastLow = [...histValues.map(() => null)];
  forecastLow[histValues.length - 1] = histValues[histValues.length - 1];
  data.forecast.points.forEach((p) => forecastLow.push(p.p15));
  const forecastHigh = [...histValues.map(() => null)];
  forecastHigh[histValues.length - 1] = histValues[histValues.length - 1];
  data.forecast.points.forEach((p) => forecastHigh.push(p.p85));

  const ctx = $("forecastChart").getContext("2d");
  charts.forecast = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "بازه ۷۰٪ اطمینان (بالا)", data: forecastHigh, borderColor: "transparent", backgroundColor: "rgba(79,209,197,0.12)", fill: "+1", pointRadius: 0, tension: 0.3 },
        { label: "پیش‌بینی (میانه)", data: forecastMid, borderColor: "#4fd1c5", borderDash: [6, 4], backgroundColor: "transparent", pointRadius: 2, tension: 0.3 },
        { label: "بازه ۷۰٪ اطمینان (پایین)", data: forecastLow, borderColor: "transparent", backgroundColor: "rgba(79,209,197,0.12)", fill: false, pointRadius: 0, tension: 0.3 },
        { label: "داده تاریخی", data: historyDataset, borderColor: "#7c6bf2", backgroundColor: "transparent", pointRadius: 1.5, tension: 0.3 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: cssVar("--text-dim"), font: { family: "Vazirmatn" }, filter: (item) => !item.text.includes("بالا") && !item.text.includes("پایین") } },
      },
      scales: {
        x: { ticks: { color: cssVar("--text-dim"), font: { family: "Vazirmatn" }, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { ticks: { color: cssVar("--text-dim") }, grid: { color: cssVar("--border") } },
      },
    },
  });
}

async function addForecastPoint() {
  const asset = $("forecastAsset").value;
  const period = $("forecastPeriod").value.trim();
  const value = Number($("forecastValue").value);
  if (!period || !value) return;
  await fetch("/api/market-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset, period, value }),
  });
  $("forecastPeriod").value = "";
  $("forecastValue").value = "";
  loadForecastWidget();
}

/* ---------------- Decision Widget ---------------- */

async function runDecision() {
  const description = $("decisionText").value.trim();
  if (!description) return;
  const amount = $("decisionAmount").value ? Number($("decisionAmount").value) : null;

  $("decisionLoading").classList.remove("hidden");
  $("decisionContent").classList.add("hidden");
  try {
    const res = await fetch("/api/widgets/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: { description, amount } }),
    });
    const data = await res.json();
    renderDecisionResult(data);
  } catch (e) {
    console.error(e);
  } finally {
    $("decisionLoading").classList.add("hidden");
    $("decisionContent").classList.remove("hidden");
  }
}

function renderDecisionResult(data) {
  $("decisionSummary").textContent = data.decisionSummary || "";
  const b = data.before || {};
  const a = data.after || {};
  $("beforeTotal").textContent = formatToman(b.totalAssets);
  $("beforeRisk").textContent = `${Math.round(b.riskScore ?? 0)} از ۱۰۰`;
  $("beforeLiquid").textContent = formatPercent(b.liquidPercent);
  $("afterTotal").textContent = formatToman(a.totalAssets);
  $("afterRisk").textContent = `${Math.round(a.riskScore ?? 0)} از ۱۰۰`;
  $("afterLiquid").textContent = formatPercent(a.liquidPercent);

  $("decisionGoalImpact").textContent = data.goalImpact || "—";

  const recEl = $("decisionRecommendation");
  recEl.textContent = data.recommendation || "—";
  recEl.className = "recommendation-badge";
  if (data.recommendation === "پیشنهاد می‌شود") recEl.classList.add("rec-go");
  else if (data.recommendation === "با احتیاط") recEl.classList.add("rec-caution");
  else if (data.recommendation === "پیشنهاد نمی‌شود") recEl.classList.add("rec-no");

  fillList("decisionReasoning", data.reasoning);

  $("decisionOutcomeBox").classList.remove("hidden");
  $("decisionOutcomeThanks").classList.add("hidden");
  $("decisionFollowedBtn").onclick = () => recordDecisionOutcome(true, data.recommendation);
  $("decisionAbandonedBtn").onclick = () => recordDecisionOutcome(false, data.recommendation);
}

async function recordDecisionOutcome(followed, recommendation) {
  $("decisionFollowedBtn").disabled = true;
  $("decisionAbandonedBtn").disabled = true;
  try {
    await fetch("/api/behavior/decision-outcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followed, recommendation }),
    });
    $("decisionOutcomeThanks").classList.remove("hidden");
  } catch (e) {
    console.error(e);
  }
}

/* ---------------- Emotional Alerts ---------------- */

function addEmotionalAlert(alert) {
  const card = $("emotionalCard");
  card.classList.remove("hidden");
  const list = $("emotionalList");
  const item = document.createElement("div");
  item.className = "emotional-item";
  const time = new Date().toLocaleTimeString("fa-IR");
  item.innerHTML = `<div class="em-time">${time}</div><div>${alert.reason || ""}</div><div class="em-msg">${alert.message || ""}</div>`;
  list.prepend(item);
}

/* ---------------- Chat ---------------- */

function appendChatMessage(role, text, thinking = false) {
  const wrap = $("chatMessages");
  const div = document.createElement("div");
  div.className = "chat-msg " + (role === "user" ? "chat-msg-user" : "chat-msg-bot") + (thinking ? " thinking" : "");
  div.textContent = text;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

async function sendChatMessage(message) {
  appendChatMessage("user", message);
  chatHistory.push({ role: "user", content: message });
  const thinkingEl = appendChatMessage("bot", "در حال فکر کردن...", true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: chatHistory }),
    });
    const data = await res.json();
    thinkingEl.remove();
    appendChatMessage("bot", data.reply || "متاسفانه پاسخی دریافت نشد.");
    chatHistory.push({ role: "assistant", content: data.reply || "" });
    if (data.emotional && data.emotional.flag) {
      addEmotionalAlert(data.emotional);
    }
  } catch (e) {
    thinkingEl.remove();
    appendChatMessage("bot", "خطا در ارتباط با سرور.");
  }
}

/* ---------------- Wiring ---------------- */

function updateTopbarStat(id, text) {
  $(id).textContent = text;
}

function refreshCoreWidgets() {
  loadAssetsWidget();
  loadRiskWidget();
  loadLiquidityWidget();
}

function wireEvents() {
  $("toggleProfileBtn").onclick = () => {
    $("profileBody").classList.toggle("collapsed");
  };
  $("addAssetBtn").onclick = () => addAssetRow();
  $("saveProfileBtn").onclick = saveProfileAndRefresh;
  $("fRisk").oninput = (e) => ($("riskSliderVal").textContent = e.target.value);

  $("refreshAssetsBtn").onclick = loadAssetsWidget;
  $("refreshRiskBtn").onclick = loadRiskWidget;
  $("refreshLiquidityBtn").onclick = loadLiquidityWidget;

  $("addGoalBtn").onclick = addGoal;

  $("runScenarioBtn").onclick = () => {
    const text = $("scenarioCustom").value.trim();
    if (!text) return;
    runScenario({ title: "سناریوی دلخواه کاربر", description: text }, null);
  };

  $("runDecisionBtn").onclick = runDecision;

  $("refreshForecastBtn").onclick = loadForecastWidget;
  $("forecastAsset").onchange = loadForecastWidget;
  $("addForecastPointBtn").onclick = addForecastPoint;

  $("clearEmotionalBtn").onclick = () => {
    $("emotionalList").innerHTML = "";
    $("emotionalCard").classList.add("hidden");
  };

  $("chatFab").onclick = () => $("chatPanel").classList.toggle("open");
  $("closeChatBtn").onclick = () => $("chatPanel").classList.remove("open");
  $("chatForm").onsubmit = (e) => {
    e.preventDefault();
    const input = $("chatInput");
    const msg = input.value.trim();
    if (!msg) return;
    input.value = "";
    sendChatMessage(msg);
  };
}

async function init() {
  wireEvents();
  renderScenarioPresets();
  await fetchProfile();
  refreshCoreWidgets();
  loadForecastWidget();
}

init();
