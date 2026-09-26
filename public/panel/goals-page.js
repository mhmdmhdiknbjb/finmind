import { $, formatToman, millionInputToToman, fillListLive, typeWordsInto } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

let profile = null;

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
      box.textContent = "در حال محاسبه و بررسی...";
      try {
        const d = await goalRequest(g, box);
        if (!d) return;
        const paceLine =
          d.monthsNeededAtCurrentPace === 0
            ? `<div>سرمایه‌ی موجود شما به‌تنهایی همین حالا به این هدف می‌رسد.</div>`
            : d.monthsNeededAtCurrentPace !== null
            ? `<div>با توان پس‌انداز فعلی، رسیدن به این هدف واقعاً حدود <b>${d.monthsNeededAtCurrentPace} ماه</b> طول می‌کشد (به‌جای ${d.targetMonths} ماه خواسته‌شده)</div>`
            : "";
        const flat = d.ifPriceStaysFlat;
        const flatLine =
          flat && d.priceGrowthPercent > 0
            ? `<div style="color:var(--text-faint);font-size:11.5px;">برای مقایسه، اگر قیمت هدف ثابت می‌ماند: ${flat.monthsNeededAtCurrentPace === null ? "هرگز نمی‌رسید" : flat.monthsNeededAtCurrentPace + " ماه"}</div>`
            : "";
        box.innerHTML = `
          <div>امکان‌پذیری: <span class="${d.feasible ? "feasible-yes" : "feasible-no"}">${d.feasible ? "قابل دستیابی است" : "با شرایط فعلی دشوار است"}</span></div>
          <div>مبلغ هدف در سررسید (با رشد قیمت ${d.priceGrowthPercent}٪ سالانه): <b>${formatToman(d.targetAtDeadline)}</b></div>
          <div>سرمایه‌ی موجود در نظر گرفته‌شده (نقد و نیمه‌نقد): <b>${formatToman(d.startingCapital)}</b></div>
          <div>پیش‌بینی جمع‌شده تا مهلت (سرمایه‌ی موجود + پس‌انداز فعلی): <b>${formatToman(d.projectedAmountAtDeadline)}</b></div>
          <div>پس‌انداز ماهانه‌ی جدید لازم: <b>${formatToman(d.requiredMonthlySaving)}</b></div>
          <div>توان پس‌انداز فعلی: <b>${formatToman(d.currentMonthlySavingCapacity)}</b></div>
          <div>مازاد/کسری ماهانه: <b class="${d.monthlySurplus >= 0 ? "feasible-yes" : "feasible-no"}">${d.monthlySurplus >= 0 ? "+" : ""}${formatToman(d.monthlySurplus)}</b></div>
          ${paceLine}
          ${flatLine}
          <div style="color:var(--text-faint);font-size:11.5px;">فرض رشد قیمت هدف ${d.priceGrowthPercent}٪ سالانه است (داده‌ای برای تورم/قیمت مسکن در سیستم نیست؛ هنگام افزودن هدف می‌توانید عدد خودتان را بدهید).</div>
          <div style="color:var(--text-faint);font-size:11.5px;">${d.horizonTier} — نرخ رشد فرض‌شده برای پول این هدف: ${d.assumedAnnualReturnPercent}٪ سالانه</div>
          <ul id="goalPathList_${g.id}"></ul>
          <p id="goalSummary_${g.id}"></p>
        `;
        fillListLive(`goalPathList_${g.id}`, d.suggestedPath);
        typeWordsInto(box.querySelector(`#goalSummary_${g.id}`), d.summary || "");
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
  const targetAmount = millionInputToToman($("goalAmount").value);
  const targetMonths = Number($("goalMonths").value);
  const priceGrowthPercent = $("goalGrowth") ? $("goalGrowth").value : "";
  if (!title || !targetAmount || !targetMonths) return;
  const res = await fetch("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, targetAmount, targetMonths, priceGrowthPercent }),
  });
  profile = await res.json();
  $("goalTitle").value = "";
  $("goalAmount").value = "";
  $("goalMonths").value = "";
  if ($("goalGrowth")) $("goalGrowth").value = "";
  renderGoalsList();
}

async function init() {
  const user = await initPanelShell("goals");
  if (!user) return;
  $("addGoalBtn").onclick = addGoal;
  const res = await fetch("/api/profile");
  profile = await res.json();
  renderGoalsList();
}

init();

// 15 s: a "taking longer" note; 90 s: give up with a message (never an endless "در حال تحلیل...")
async function goalRequest(goal, box) {
  const slow = setTimeout(() => {
    box.textContent = "این تحلیل بیشتر از حد معمول طول کشیده؛ لطفاً کمی صبر کنید…";
  }, 15000);
  try {
    const res = await fetch("/api/widgets/goal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || "خطای سرور");
    return data;
  } catch (e) {
    console.error(e);
    box.textContent = e && (e.name === "TimeoutError" || e.name === "AbortError") ? "این تحلیل بیشتر از حد معمول طول کشید و متوقف شد؛ دوباره تلاش کنید." : "دریافت تحلیل ناموفق بود؛ دوباره تلاش کنید.";
    return null;
  } finally {
    clearTimeout(slow);
  }
}
