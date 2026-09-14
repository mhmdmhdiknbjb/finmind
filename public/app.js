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

const CURRENCY_SYMBOLS = [
  ["USD", "دلار آمریکا"], ["EUR", "یورو"], ["GBP", "پوند"], ["AED", "درهم امارات"],
  ["TRY", "لیر ترکیه"], ["CAD", "دلار کانادا"], ["AUD", "دلار استرالیا"], ["CHF", "فرانک سوئیس"],
  ["CNY", "یوآن چین"], ["SAR", "ریال عربستان"], ["KWD", "دینار کویت"], ["IQD", "دینار عراق"],
  ["JPY", "ین ژاپن"], ["INR", "روپیه هند"], ["RUB", "روبل روسیه"],
];
const CRYPTO_SYMBOLS = [
  ["BTC", "بیت‌کوین"], ["ETH", "اتریوم"], ["USDT", "تتر"], ["XRP", "ایکس‌آرپی"], ["BNB", "بی‌ان‌بی"],
  ["SOL", "سولانا"], ["USDC", "یواس‌دی کوین"], ["ADA", "کاردانو"], ["DOGE", "دوج‌کوین"], ["TRX", "ترون"],
  ["LINK", "چین‌لینک"], ["XLM", "استلار"], ["AVAX", "آوالانچ"], ["LTC", "لایت‌کوین"], ["DOT", "پولکادات"],
];

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

// All money inputs in the UI are entered/shown in million-toman units so
// the user never has to type a string of zeros; the backend still stores
// and works with full toman amounts.
const MILLION = 1_000_000;
function tomanToMillionInput(toman) {
  if (toman === null || toman === undefined || toman === "") return "";
  return Math.round((Number(toman) / MILLION) * 100) / 100;
}
function millionInputToToman(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * MILLION) : 0;
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

// Tracks the "latest reveal" for a given element so a newer call (e.g. the
// widget was refreshed again before the previous animation finished) can
// invalidate the older, now-stale animation instead of letting both race.
const liveRevealTokens = new WeakMap();

/** Reveals `text` inside `el` live, word-by-word, instead of setting it all at once. */
async function typeWordsInto(el, text, delayMs = 28) {
  if (!el) return;
  const token = Symbol();
  liveRevealTokens.set(el, token);
  el.textContent = "";
  const parts = String(text || "").split(/(\s+)/);
  for (const part of parts) {
    if (liveRevealTokens.get(el) !== token) return;
    el.textContent += part;
    if (part.trim().length) await new Promise((r) => setTimeout(r, delayMs));
  }
}

/** Same as fillList, but reveals each list item live, word-by-word, one item after another. */
async function fillListLive(elId, items, delayMs = 28) {
  const el = $(elId);
  if (!el) return;
  const token = Symbol();
  liveRevealTokens.set(el, token);
  el.innerHTML = "";
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.textContent = "موردی یافت نشد.";
    li.style.color = "var(--text-faint)";
    el.appendChild(li);
    return;
  }
  for (const it of items) {
    if (liveRevealTokens.get(el) !== token) return;
    const li = document.createElement("li");
    el.appendChild(li);
    await typeWordsInto(li, it, delayMs);
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
  renderAssetRows(profile.assets || []);
  renderGoalsList();
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

/* ---------------- Onboarding Wizard ---------------- */

const ONB_TOTAL_STEPS = 5;
let onbCurrentStep = 1;

function startOnboarding() {
  // Hide every other dashboard widget so the wizard is the only thing to
  // deal with; only sections that weren't already hidden get marked and
  // restored later (e.g. the emotional-alert card should stay hidden).
  document.querySelectorAll("main.grid > section").forEach((sec) => {
    if (sec.id === "profileCard") return;
    if (!sec.classList.contains("hidden")) {
      sec.classList.add("hidden");
      sec.dataset.onbHidden = "true";
    }
  });
  $("chatFab").classList.add("hidden");

  $("profileBody").classList.remove("collapsed");
  $("toggleProfileBtn").classList.add("hidden");
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
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  profile = await res.json();

  $("profileFormWrap").classList.remove("onboarding-mode");
  $("toggleProfileBtn").classList.remove("hidden");
  $("profileBody").classList.add("collapsed");
  $("onbNextBtn").disabled = false;
  renderProfileSummary();

  document.querySelectorAll('main.grid > section[data-onb-hidden="true"]').forEach((sec) => {
    sec.classList.remove("hidden");
    delete sec.dataset.onbHidden;
  });
  $("chatFab").classList.remove("hidden");

  refreshCoreWidgets();
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
  $("onbWelcome").classList.add("hidden");
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
  $("onbWelcome").classList.remove("hidden");
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
  beginWizardSteps();
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
  wrap.appendChild(statChip("نوسان سالانه (ریسک)", formatPercent(stats.volatility * 100)));
  wrap.appendChild(statChip("نقدینگی", formatPercent(stats.liquidityPercent)));
}

function renderOptimalComparisonChart(current, optimal) {
  destroyChart("optimal");
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

  typeWordsInto($("scenarioExplanation"), data.explanation || "");
  typeWordsInto($("scenarioRecommendation"), data.recommendation || "");
}

/* ---------------- Decision Widget ---------------- */

async function runDecision() {
  const description = $("decisionText").value.trim();
  if (!description) return;
  const amount = $("decisionAmount").value ? millionInputToToman($("decisionAmount").value) : null;

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
  recEl.textContent = data.recommendation || "—";
  recEl.className = "recommendation-badge";
  if (data.recommendation === "پیشنهاد می‌شود") recEl.classList.add("rec-go");
  else if (data.recommendation === "با احتیاط") recEl.classList.add("rec-caution");
  else if (data.recommendation === "پیشنهاد نمی‌شود") recEl.classList.add("rec-no");

  fillListLive("decisionReasoning", data.reasoning);

  $("decisionOutcomeBox").classList.remove("hidden");
  $("decisionOutcomeThanks").classList.add("hidden");
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
      profile = data.profile;
      populateProfileForm();
      $("decisionOutcomeThanks").textContent = "ثبت شد — دارایی‌هات به‌روزرسانی شد و در ویجت‌های بالا اعمال شد ✓";
      refreshCoreWidgets();
    } else {
      $("decisionOutcomeThanks").textContent = "ثبت شد — به مدل ریسک رفتاری شما اضافه شد ✓";
    }
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

// Reads the /api/chat SSE stream and appends the reply text into `botEl`
// live, as each delta actually arrives from the LLM — not a reveal
// animation played after the fact, but the real live output.
async function streamChatReplyInto(botEl, message) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history: chatHistory }),
  });
  if (!res.ok || !res.body) throw new Error("پاسخ سرور نامعتبر بود.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullReply = "";
  let emotional = null;
  let started = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let evt;
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (evt.type === "delta" && typeof evt.text === "string") {
        if (!started) {
          started = true;
          botEl.classList.remove("thinking");
          botEl.textContent = "";
        }
        fullReply += evt.text;
        botEl.textContent = fullReply;
        const wrap = $("chatMessages");
        wrap.scrollTop = wrap.scrollHeight;
      } else if (evt.type === "emotional") {
        emotional = evt;
      } else if (evt.type === "error") {
        throw new Error(evt.message || "خطا در دریافت پاسخ.");
      }
    }
  }

  return { fullReply, emotional };
}

async function sendChatMessage(message) {
  appendChatMessage("user", message);
  chatHistory.push({ role: "user", content: message });
  const botEl = appendChatMessage("bot", "در حال فکر کردن...", true);

  try {
    const { fullReply, emotional } = await streamChatReplyInto(botEl, message);
    if (!fullReply) {
      botEl.classList.remove("thinking");
      botEl.textContent = "متاسفانه پاسخی دریافت نشد.";
    }
    chatHistory.push({ role: "assistant", content: fullReply || "" });
    if (emotional && emotional.flag) {
      addEmotionalAlert(emotional);
    }
  } catch (e) {
    console.error(e);
    botEl.classList.remove("thinking");
    botEl.textContent = "خطا در ارتباط با سرور.";
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

  $("onbStartBtn").onclick = beginWizardSteps;
  $("onbVoiceBtn").onclick = startVoiceAssistant;
  $("voiceRecordBtn").onclick = toggleVoiceRecording;
  $("voiceBackBtn").onclick = backFromVoiceAssistant;
  $("voiceContinueBtn").onclick = continueFromVoiceAssistant;
  $("onbNextBtn").onclick = onbNext;
  $("onbBackBtn").onclick = onbBack;
}

async function init() {
  wireEvents();
  renderScenarioPresets();
  await fetchProfile();

  if (!profile.onboarded) {
    startOnboarding();
  } else {
    $("profileBody").classList.add("collapsed");
    refreshCoreWidgets();
  }
}

init();
