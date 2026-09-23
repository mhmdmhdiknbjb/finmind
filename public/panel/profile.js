import {
  $,
  CATEGORY_LABELS,
  CURRENCY_SYMBOLS,
  CRYPTO_SYMBOLS,
  formatToman,
  tomanToMillionInput,
  millionInputToToman,
} from "../common.js";
import { initPanelShell } from "./panel-shell.js";

let profile = null;

/* ---------------- Profile form ---------------- */

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
  $("fEmployment").value = p.employmentType || "کارمند بخش خصوصی";
  $("fHousing").value = p.housingStatus || "مستاجر";
  $("fIncome").value = tomanToMillionInput(profile.monthlyIncome);
  $("fExpenses").value = tomanToMillionInput(profile.monthlyExpenses);
  $("fDebt").value = tomanToMillionInput(profile.existingDebt);
  $("fRisk").value = profile.riskTolerance ?? 5;
  $("riskSliderVal").textContent = profile.riskTolerance ?? 5;
  $("fExperience").value = profile.investmentExperience || "مبتدی (کمتر از ۱ سال)";
  $("fEmotionalReaction").value = profile.emotionalRiskReaction || "صبر می‌کنم";
  $("fHorizon").value = profile.timeHorizonNote ?? "";
  $("fLiquidityNote").value = profile.liquidityNeedNote ?? "";
  $("fMainGoal").value = profile.mainGoalDescription ?? "";
  $("fFreeNotes").value = profile.freeNotes ?? "";
  renderAssetRows(profile.assets || []);
  renderProfileSummary();
}

function renderProfileSummary() {
  const p = profile.personal || {};
  const el = $("profileSummary");
  if (!profile.onboarded) {
    el.classList.add("hidden");
    return;
  }
  const assetCount = (profile.assets || []).length;
  const parts = [];
  if (p.age) parts.push(`${p.age} ساله`);
  if (p.gender) parts.push(p.gender);
  parts.push(`ریسک‌پذیری ${profile.riskTolerance ?? 5}/۱۰`);
  parts.push(`${assetCount} دارایی ثبت‌شده`);
  el.textContent = parts.join(" — ");
  el.classList.remove("hidden");
}

// Gold, currency and crypto are entered by quantity (grams / units of a
// chosen currency or coin), never a toman amount the user would have to
// compute themselves — the server converts using the live rate. This cache
// just avoids re-fetching on every keystroke.
let liveRatesCache = null;
async function getLiveRatesCached() {
  if (liveRatesCache) return liveRatesCache;
  try {
    const res = await fetch("/api/live-rates");
    if (!res.ok) return null;
    liveRatesCache = await res.json();
    return liveRatesCache;
  } catch {
    return null;
  }
}

function isQuantityCategory(cat) {
  return cat === "gold" || cat === "currency" || cat === "crypto";
}

function symbolListFor(cat) {
  if (cat === "currency") return CURRENCY_SYMBOLS;
  if (cat === "crypto") return CRYPTO_SYMBOLS;
  return null;
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

  // Second field: a free-text label for most categories, or a symbol picker
  // (which currency / which coin) for currency & crypto.
  let secondField = document.createElement("input");
  secondField.placeholder = "توضیح (اختیاری) مثلاً سپرده بانک ملت";
  secondField.value = asset.label || "";

  const valueInput = document.createElement("input");
  valueInput.type = "number";

  const hint = document.createElement("div");
  hint.className = "asset-row-hint hidden";

  function buildSymbolSelect(cat, symbol) {
    const sel = document.createElement("select");
    symbolListFor(cat).forEach(([val, label]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = `${val} — ${label}`;
      if (val === symbol) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = updateHint;
    return sel;
  }

  function rebuildSecondField(cat, initialAsset) {
    const list = symbolListFor(cat);
    const next = list ? buildSymbolSelect(cat, initialAsset?.category === cat ? initialAsset.symbol : null) : (() => {
      const input = document.createElement("input");
      input.placeholder = "توضیح (اختیاری) مثلاً سپرده بانک ملت";
      input.value = initialAsset?.category === cat ? initialAsset.label || "" : "";
      return input;
    })();
    secondField.replaceWith(next);
    secondField = next;
  }

  function setPlaceholderFor(cat) {
    if (cat === "gold") {
      valueInput.step = "0.001";
      valueInput.placeholder = "مقدار (گرم)";
    } else if (cat === "currency") {
      valueInput.step = "0.01";
      valueInput.placeholder = "تعداد";
    } else if (cat === "crypto") {
      valueInput.step = "0.0001";
      valueInput.placeholder = "تعداد واحد";
    } else {
      valueInput.step = "0.1";
      valueInput.placeholder = "مبلغ (میلیون تومان)";
    }
  }

  async function updateHint() {
    const cat = select.value;
    if (!isQuantityCategory(cat) || !valueInput.value) {
      hint.classList.add("hidden");
      return;
    }
    const rates = await getLiveRatesCached();
    if (!rates) {
      hint.classList.add("hidden");
      return;
    }
    let price = null;
    if (cat === "gold") price = rates.goldTomanPerGram;
    else if (cat === "currency") price = rates.currencies[secondField.value || "USD"] ?? rates.usdToman;
    else if (cat === "crypto") {
      const usd = rates.cryptos[secondField.value || "BTC"];
      price = usd ? usd * rates.usdToman : null;
    }
    if (!price) {
      hint.classList.add("hidden");
      return;
    }
    hint.textContent = `≈ ${formatToman(Number(valueInput.value) * price)} (نرخ آنی)`;
    hint.classList.remove("hidden");
  }

  rebuildSecondField(asset.category, asset);
  setPlaceholderFor(asset.category);
  if (isQuantityCategory(asset.category)) {
    valueInput.value = asset.quantity ?? "";
  } else {
    valueInput.value = tomanToMillionInput(asset.amount);
  }
  updateHint();

  select.onchange = () => {
    rebuildSecondField(select.value, null);
    setPlaceholderFor(select.value);
    valueInput.value = "";
    hint.classList.add("hidden");
  };
  valueInput.oninput = updateHint;

  const delBtn = document.createElement("button");
  delBtn.className = "btn-del";
  delBtn.textContent = "✕";
  delBtn.type = "button";
  delBtn.onclick = () => row.remove();

  const valueWrap = document.createElement("div");
  valueWrap.className = "asset-value-wrap";
  valueWrap.append(valueInput, hint);

  row.append(select, secondField, valueWrap, delBtn);
  wrap.appendChild(row);
}

function collectProfileFromForm() {
  const assets = [];
  $("assetRows").querySelectorAll(".asset-row").forEach((row) => {
    const [select, secondField, valueInput] = row.querySelectorAll("select, input");
    const category = select.value;
    if (category === "currency" || category === "crypto") {
      const quantity = Number(valueInput.value) || 0;
      if (quantity > 0) assets.push({ category, symbol: secondField.value, quantity });
    } else if (category === "gold") {
      const quantity = Number(valueInput.value) || 0;
      if (quantity > 0) assets.push({ category, label: secondField.value.trim(), quantity });
    } else {
      const amount = millionInputToToman(valueInput.value);
      if (amount > 0) assets.push({ category, label: secondField.value.trim(), amount });
    }
  });

  return {
    personal: {
      age: $("fAge").value ? Number($("fAge").value) : null,
      gender: $("fGender").value,
      maritalStatus: $("fMarital").value,
      childrenCount: $("fChildren").value ? Number($("fChildren").value) : null,
      employmentType: $("fEmployment").value,
      housingStatus: $("fHousing").value,
    },
    riskTolerance: Number($("fRisk").value),
    investmentExperience: $("fExperience").value,
    emotionalRiskReaction: $("fEmotionalReaction").value,
    monthlyIncome: $("fIncome").value ? millionInputToToman($("fIncome").value) : null,
    monthlyExpenses: $("fExpenses").value ? millionInputToToman($("fExpenses").value) : null,
    existingDebt: $("fDebt").value ? millionInputToToman($("fDebt").value) : null,
    timeHorizonNote: $("fHorizon").value.trim(),
    liquidityNeedNote: $("fLiquidityNote").value.trim(),
    mainGoalDescription: $("fMainGoal").value.trim(),
    freeNotes: $("fFreeNotes").value.trim(),
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
  renderProfileSummary();
}

/* ---------------- Onboarding Wizard ---------------- */

const ONB_TOTAL_STEPS = 5;
let onbCurrentStep = 1;

function startOnboarding() {
  $("voiceEditBtn").classList.add("hidden");
  $("profileSummary").classList.add("hidden");
  $("onbWelcome").classList.remove("hidden");
  $("profileFormWrap").classList.add("hidden");
}

function beginWizardSteps() {
  $("onbWelcome").classList.add("hidden");
  $("profileFormWrap").classList.remove("hidden");
  $("profileFormWrap").classList.add("onboarding-mode");
  showOnbStep(1);
}

function showOnbStep(n) {
  onbCurrentStep = n;
  document.querySelectorAll(".onb-step").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.step) === n);
  });
  $("onbProgressText").textContent = `مرحله ${n} از ${ONB_TOTAL_STEPS}`;
  $("onbProgressFill").style.width = `${(n / ONB_TOTAL_STEPS) * 100}%`;
  $("onbBackBtn").disabled = n === 1;
  $("onbNextBtn").textContent = n === ONB_TOTAL_STEPS ? "پایان و شروع" : "بعدی";
}

function onbNext() {
  if (onbCurrentStep < ONB_TOTAL_STEPS) {
    showOnbStep(onbCurrentStep + 1);
  } else {
    finishOnboarding();
  }
}

function onbBack() {
  if (onbCurrentStep > 1) showOnbStep(onbCurrentStep - 1);
}

async function finishOnboarding() {
  const data = collectProfileFromForm();
  data.onboarded = true;
  $("onbNextBtn").disabled = true;
  $("onbNextBtn").textContent = "در حال ذخیره...";
  await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  window.location.href = "dashboard.html";
}

/* ---------------- Voice Assistant ---------------- */

const VOICE_CHECKLIST = [
  { key: "age", label: "سن" },
  { key: "gender", label: "جنسیت" },
  { key: "maritalStatus", label: "وضعیت تاهل" },
  { key: "childrenCount", label: "تعداد فرزند" },
  { key: "employmentType", label: "نوع شغل/درآمد" },
  { key: "housingStatus", label: "وضعیت مسکن" },
  { key: "riskTolerance", label: "میزان ریسک‌پذیری" },
  { key: "investmentExperience", label: "تجربه سرمایه‌گذاری" },
  { key: "emotionalRiskReaction", label: "واکنش به افت بازار" },
  { key: "monthlyIncome", label: "درآمد ماهانه" },
  { key: "monthlyExpenses", label: "هزینه ماهانه" },
  { key: "existingDebt", label: "بدهی/اقساط فعلی" },
  { key: "assets", label: "دارایی‌ها" },
  { key: "mainGoalDescription", label: "هدف اصلی مالی" },
];

let voiceFoundKeys = new Set();
let voiceTranscriptAccum = "";
let voiceMediaRecorder = null;
let voiceAudioChunks = [];
let voiceIsRecording = false;
// "onboarding" (first-time wizard) or "edit" (already-onboarded user adding
// to their existing info) — controls where the back/continue buttons return to.
let voiceMode = "onboarding";

function renderVoiceChecklist() {
  const ul = $("voiceChecklist");
  ul.innerHTML = "";
  VOICE_CHECKLIST.forEach((item) => {
    const li = document.createElement("li");
    const done = voiceFoundKeys.has(item.key);
    li.className = done ? "done" : "";
    li.innerHTML = `<span class="vc-mark">${done ? "✓" : ""}</span><span>${item.label}</span>`;
    ul.appendChild(li);
  });
}

function startVoiceAssistant() {
  voiceMode = "onboarding";
  $("voiceBackBtn").textContent = "بازگشت";
  $("voiceContinueBtn").textContent = "ادامه و مرور نهایی";
  $("onbWelcome").classList.add("hidden");
  $("voicePanel").classList.remove("hidden");
  voiceFoundKeys = new Set();
  voiceTranscriptAccum = "";
  $("voiceTranscript").textContent = "";
  $("voiceStatus").textContent = "برای شروع، دکمه رو بزن";
  renderVoiceChecklist();
}

/** Same voice assistant, opened from the always-visible edit form instead of
 * the first-time onboarding welcome screen. */
function openVoiceForEdit() {
  voiceMode = "edit";
  $("voiceBackBtn").textContent = "انصراف";
  $("voiceContinueBtn").textContent = "بازگشت به فرم";
  $("profileFormWrap").classList.add("hidden");
  $("voicePanel").classList.remove("hidden");
  voiceFoundKeys = new Set();
  voiceTranscriptAccum = "";
  $("voiceTranscript").textContent = "";
  $("voiceStatus").textContent = "برای شروع، دکمه رو بزن";
  renderVoiceChecklist();
}

function backFromVoiceAssistant() {
  if (voiceIsRecording && voiceMediaRecorder) voiceMediaRecorder.stop();
  $("voicePanel").classList.add("hidden");
  if (voiceMode === "edit") {
    $("profileFormWrap").classList.remove("hidden");
  } else {
    $("onbWelcome").classList.remove("hidden");
  }
}

async function toggleVoiceRecording() {
  if (voiceIsRecording) {
    voiceMediaRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    $("voiceStatus").textContent = "مرورگرت از ضبط صدا پشتیبانی نمی‌کنه. لطفاً دستی وارد کن.";
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceAudioChunks = [];
    voiceMediaRecorder = new MediaRecorder(stream);
    voiceMediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) voiceAudioChunks.push(e.data);
    };
    voiceMediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      $("voiceRecordBtn").classList.remove("recording");
      $("voiceRecordIcon").textContent = "🎙️";
      voiceIsRecording = false;
      const blob = new Blob(voiceAudioChunks, { type: voiceMediaRecorder.mimeType || "audio/webm" });
      await processVoiceRecording(blob);
    };
    voiceMediaRecorder.start();
    voiceIsRecording = true;
    $("voiceRecordBtn").classList.add("recording");
    $("voiceRecordIcon").textContent = "⏹️";
    $("voiceStatus").textContent = "در حال ضبط... دوباره دکمه رو بزن تا تموم بشه";
  } catch (e) {
    console.error(e);
    $("voiceStatus").textContent = "دسترسی به میکروفون ممکن نشد. لطفاً اجازه بده یا دستی وارد کن.";
  }
}

async function processVoiceRecording(blob) {
  $("voiceStatus").textContent = "در حال تبدیل صدا به متن...";
  try {
    const transRes = await fetch("/api/voice/transcribe", {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob,
    });
    const transData = await transRes.json();
    const text = (transData.text || "").trim();
    if (!text) {
      $("voiceStatus").textContent = "چیزی شنیده نشد. دوباره امتحان کن.";
      return;
    }
    voiceTranscriptAccum += (voiceTranscriptAccum ? " " : "") + text;
    $("voiceTranscript").textContent = voiceTranscriptAccum;
    $("voiceStatus").textContent = "در حال استخراج اطلاعات...";

    const extractRes = await fetch("/api/voice/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: voiceTranscriptAccum }),
    });
    const extracted = await extractRes.json();
    applyVoiceExtraction(extracted);
    $("voiceStatus").textContent = "برای گفتن موارد باقی‌مونده دوباره ضبط کن، یا ادامه بده";
  } catch (e) {
    console.error(e);
    $("voiceStatus").textContent = "خطا در پردازش صدا. دوباره امتحان کن.";
  }
}

function applyVoiceExtraction(extracted) {
  const p = extracted.personal || {};
  if (p.age) $("fAge").value = p.age;
  if (p.gender) $("fGender").value = p.gender;
  if (p.maritalStatus) $("fMarital").value = p.maritalStatus;
  if (p.childrenCount !== null && p.childrenCount !== undefined) $("fChildren").value = p.childrenCount;
  if (p.employmentType) $("fEmployment").value = p.employmentType;
  if (p.housingStatus) $("fHousing").value = p.housingStatus;
  if (extracted.riskTolerance) {
    $("fRisk").value = extracted.riskTolerance;
    $("riskSliderVal").textContent = extracted.riskTolerance;
  }
  if (extracted.investmentExperience) $("fExperience").value = extracted.investmentExperience;
  if (extracted.emotionalRiskReaction) $("fEmotionalReaction").value = extracted.emotionalRiskReaction;
  if (extracted.monthlyIncome) $("fIncome").value = tomanToMillionInput(extracted.monthlyIncome);
  if (extracted.monthlyExpenses) $("fExpenses").value = tomanToMillionInput(extracted.monthlyExpenses);
  if (extracted.existingDebt) $("fDebt").value = tomanToMillionInput(extracted.existingDebt);
  if (extracted.timeHorizonNote) $("fHorizon").value = extracted.timeHorizonNote;
  if (extracted.liquidityNeedNote) $("fLiquidityNote").value = extracted.liquidityNeedNote;
  if (extracted.mainGoalDescription) $("fMainGoal").value = extracted.mainGoalDescription;

  if (extracted.assets && extracted.assets.length) {
    const existingRows = $("assetRows").querySelectorAll(".asset-row");
    if (existingRows.length === 1) {
      const [, secondField, valueInput] = existingRows[0].querySelectorAll("select, input");
      if (!valueInput.value && !secondField.value) existingRows[0].remove();
    }
    extracted.assets.forEach((a) => addAssetRow(a));
  }

  (extracted.foundKeys || []).forEach((k) => voiceFoundKeys.add(k));
  renderVoiceChecklist();
}

function continueFromVoiceAssistant() {
  $("voicePanel").classList.add("hidden");
  if (voiceMode === "edit") {
    $("profileFormWrap").classList.remove("hidden");
  } else {
    beginWizardSteps();
  }
}

/* ---------------- Wiring ---------------- */

function wireEvents() {
  $("voiceEditBtn").onclick = openVoiceForEdit;
  $("addAssetBtn").onclick = () => addAssetRow();
  $("saveProfileBtn").onclick = saveProfileAndRefresh;
  $("fRisk").oninput = (e) => ($("riskSliderVal").textContent = e.target.value);

  $("onbStartBtn").onclick = beginWizardSteps;
  $("onbVoiceBtn").onclick = startVoiceAssistant;
  $("voiceRecordBtn").onclick = toggleVoiceRecording;
  $("voiceBackBtn").onclick = backFromVoiceAssistant;
  $("voiceContinueBtn").onclick = continueFromVoiceAssistant;
  $("onbNextBtn").onclick = onbNext;
  $("onbBackBtn").onclick = onbBack;
}

async function init() {
  const user = await initPanelShell("profile");
  if (!user) return;

  wireEvents();
  await fetchProfile();

  if (!profile.onboarded) {
    startOnboarding();
  }
}

init();
