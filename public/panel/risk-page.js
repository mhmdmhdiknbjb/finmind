import { $, fillListLive, typeWordsInto } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

// `force` recomputes even if nothing the user controls has changed; a
// normal page load leaves it false so this stays the same number shown
// everywhere else in the app instead of drifting with live market rates —
// see snapshotStore.js.
async function loadRiskWidget(force = false) {
  $("riskLoading").classList.remove("hidden");
  $("riskContent").classList.add("hidden");
  try {
    const res = await fetch("/api/widgets/risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const data = await res.json();
    renderRiskWidget(data);
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

async function init() {
  const user = await initPanelShell("risk");
  if (!user) return;
  $("refreshRiskBtn").onclick = () => loadRiskWidget(true);
  loadRiskWidget();
}

init();
