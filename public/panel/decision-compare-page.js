import { $, widgetFetch, showWidgetError, formatToman, formatPercent, millionInputToToman, fillListLive, typeWordsInto } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;

function addOptionRow(preset = { description: "", amount: "" }) {
  const wrap = $("compareOptionRows");
  if (wrap.children.length >= MAX_OPTIONS) return;
  const row = document.createElement("div");
  row.className = "compare-option-row";
  row.innerHTML = `
    <textarea class="js-desc" rows="2" placeholder="مثلاً نیمی از طلا را بفروشم و سهام بخرم"></textarea>
    <input class="js-amount" type="number" placeholder="مبلغ مرتبط (اختیاری، میلیون تومان)" />
    <button class="btn-del js-remove" type="button" title="حذف این گزینه">✕</button>
  `;
  row.querySelector(".js-desc").value = preset.description || "";
  row.querySelector(".js-amount").value = preset.amount || "";
  row.querySelector(".js-remove").onclick = () => {
    if (wrap.querySelectorAll(".compare-option-row").length > MIN_OPTIONS) row.remove();
  };
  wrap.appendChild(row);
}

function collectOptions() {
  return [...$("compareOptionRows").querySelectorAll(".compare-option-row")]
    .map((row) => ({
      description: row.querySelector(".js-desc").value.trim(),
      amount: row.querySelector(".js-amount").value ? millionInputToToman(row.querySelector(".js-amount").value) : null,
    }))
    .filter((o) => o.description);
}

// fillListLive (common.js) only targets an element found by a fixed document id; each compare-block's pros/cons
// <ul> here is created dynamically with no id, so this local twin reveals into an arbitrary <ul> element the same
// live, word-by-word way.
async function fillListLiveInto(ul, items) {
  ul.innerHTML = "";
  if (!items || !items.length) return;
  for (const it of items) {
    const li = document.createElement("li");
    ul.appendChild(li);
    await typeWordsInto(li, it);
  }
}

function renderCompareResult(data) {
  const b = data.before || {};
  $("compareBeforeTotal").textContent = formatToman(b.totalAssets);
  $("compareBeforeRisk").textContent = `${Math.round(b.riskScore ?? 0)} از ۱۰۰`;
  $("compareBeforeReturn").textContent = formatPercent(b.expectedReturnPercent);
  $("compareBeforeLiquid").textContent = formatPercent(b.liquidPercent);

  const grid = $("compareGrid");
  grid.innerHTML = "";
  (data.options || []).forEach((o, i) => {
    const block = document.createElement("div");
    block.className = "compare-block";
    block.innerHTML = o.feasible
      ? `<h4>${o.label || `گزینه ${i + 1}`}</h4>
         <div class="compare-row"><span>ریسک</span><b>${Math.round(o.riskScore ?? 0)} از ۱۰۰</b></div>
         <div class="compare-row"><span>بازده مورد انتظار</span><b>${formatPercent(o.expectedReturnPercent)}</b></div>
         <div class="compare-row"><span>نقد سریع</span><b>${formatPercent(o.liquidPercent)}</b></div>
         <p class="compare-fit"></p>
         <b class="tag-pos" style="font-size:12px;">مزایا</b><ul class="pros-list"></ul>
         <b class="tag-neg" style="font-size:12px;">معایب</b><ul class="cons-list"></ul>`
      : `<h4>${o.label || `گزینه ${i + 1}`}</h4><p class="banner banner-warn" style="margin:0;">${o.infeasibleReason || "غیرقابل‌اجرا"}</p>`;
    grid.appendChild(block);
    if (o.feasible) {
      typeWordsInto(block.querySelector(".compare-fit"), o.fitWithObjective || "");
      fillListLiveInto(block.querySelector(".pros-list"), o.pros);
      fillListLiveInto(block.querySelector(".cons-list"), o.cons);
    }
  });

  const ranking = Array.isArray(data.ranking) ? data.ranking : [];
  $("compareRankingBox").innerHTML = ranking.length
    ? `<b>ترتیب تناسب (بهترین تا بدترین):</b> ${ranking.map((idx) => (data.options[idx] || {}).label || `گزینه ${idx + 1}`).join(" ← ")}`
    : "";

  const recEl = $("compareRecommendation");
  recEl.textContent = data.recommendation || "—";
  recEl.className = "recommendation-badge";

  fillListLive("compareReasoning", data.reasoning);
}

async function runCompare() {
  const options = collectOptions();
  if (options.length < MIN_OPTIONS) {
    showWidgetError("compareLoading", `لطفاً حداقل ${MIN_OPTIONS} گزینه را کامل بنویس.`, null);
    return;
  }
  $("compareLoading").classList.remove("hidden");
  $("compareContent").classList.add("hidden");
  const data = await widgetFetch("compareLoading", "/api/widgets/decision-compare", { options }, runCompare);
  $("compareLoading").classList.add("hidden");
  if (!data) return;
  renderCompareResult(data);
  $("compareContent").classList.remove("hidden");
}

async function init() {
  const user = await initPanelShell("decisionCompare");
  if (!user) return;
  addOptionRow();
  addOptionRow();
  $("addCompareOptionBtn").onclick = () => addOptionRow();
  $("runCompareBtn").onclick = runCompare;
}

init();
