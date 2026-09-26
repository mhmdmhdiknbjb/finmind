import { $, widgetFetch, showWidgetError, formatToman, formatPercent, millionInputToToman, fillListLive, typeWordsInto } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

async function runDecision() {
  const description = $("decisionText").value.trim();
  if (!description) return;
  const amount = $("decisionAmount").value ? millionInputToToman($("decisionAmount").value) : null;

  $("decisionLoading").classList.remove("hidden");
  $("decisionContent").classList.add("hidden");
  try {
    const data = await widgetFetch("decisionLoading", "/api/widgets/decision", { decision: { description, amount } }, runDecision);
    if (!data) {
      $("decisionLoading").classList.add("hidden");
      return;
    }
    if (data.infeasible) {
      // not executable with the holdings (or not understood): say so instead of showing misleading before/after numbers
      showWidgetError("decisionLoading", data.message, null);
      $("decisionLoading").classList.add("hidden");
      return;
    }
    renderDecisionResult(data);
    $("decisionLoading").classList.add("hidden");
    $("decisionContent").classList.remove("hidden");
  } catch (e) {
    console.error(e);
    $("decisionLoading").classList.add("hidden");
  }
}

function renderDecisionResult(data) {
  typeWordsInto($("decisionSummary"), data.decisionSummary || "");
  const b = data.before || {};
  const a = data.after || {};
  $("beforeTotal").textContent = formatToman(b.totalAssets);
  $("beforeRisk").textContent = `${Math.round(b.riskScore ?? 0)} از ۱۰۰`;
  $("beforeLiquid").textContent = formatPercent(b.liquidPercent);
  $("afterTotal").textContent = formatToman(a.totalAssets);
  $("afterRisk").textContent = `${Math.round(a.riskScore ?? 0)} از ۱۰۰`;
  $("afterLiquid").textContent = formatPercent(a.liquidPercent);

  typeWordsInto($("decisionGoalImpact"), data.goalImpact || "—");

  const recEl = $("decisionRecommendation");
  // The stored value ("پیشنهاد می‌شود"...) keeps driving the behaviour-learning logic; what the user reads is a
  // fit assessment of THEIR OWN hypothetical decision, never an instruction to trade.
  const REC_LABEL = { "پیشنهاد می‌شود": "همسو با ریسک و اهداف شما", "با احتیاط": "قابل‌تأمل؛ با احتیاط", "پیشنهاد نمی‌شود": "ناهمسو با ریسک و اهداف شما" };
  recEl.textContent = REC_LABEL[data.recommendation] || data.recommendation || "—";
  recEl.className = "recommendation-badge";
  if (data.recommendation === "پیشنهاد می‌شود") recEl.classList.add("rec-go");
  else if (data.recommendation === "با احتیاط") recEl.classList.add("rec-caution");
  else if (data.recommendation === "پیشنهاد نمی‌شود") recEl.classList.add("rec-no");

  fillListLive("decisionReasoning", data.reasoning);

  $("decisionOutcomeBox").classList.remove("hidden");
  $("decisionOutcomeThanks").classList.add("hidden");
  $("decisionFollowedBtn").disabled = false;
  $("decisionAbandonedBtn").disabled = false;
  $("decisionFollowedBtn").onclick = () => recordDecisionOutcome(true, data.recommendation, data.assetChanges);
  $("decisionAbandonedBtn").onclick = () => recordDecisionOutcome(false, data.recommendation, data.assetChanges);
}

async function recordDecisionOutcome(followed, recommendation, assetChanges) {
  $("decisionFollowedBtn").disabled = true;
  $("decisionAbandonedBtn").disabled = true;
  try {
    const res = await fetch("/api/behavior/decision-outcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followed, recommendation, assetChanges }),
    });
    const data = await res.json();
    if (data.profile) {
      $("decisionOutcomeThanks").textContent = "ثبت شد — دارایی‌هات به‌روزرسانی شد و در سایر صفحات اعمال شد ✓";
    } else {
      $("decisionOutcomeThanks").textContent = "ثبت شد — به مدل ریسک رفتاری شما اضافه شد ✓";
    }
    $("decisionOutcomeThanks").classList.remove("hidden");
  } catch (e) {
    console.error(e);
  }
}

async function init() {
  const user = await initPanelShell("decision");
  if (!user) return;
  $("runDecisionBtn").onclick = runDecision;
}

init();
