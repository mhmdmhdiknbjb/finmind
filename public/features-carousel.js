// Auto-advancing tabbed showcase for the homepage "features" section: a
// vertical tab list drives a live preview panel, cycling on its own unless
// the user hovers or clicks a tab.
const AUTO_ADVANCE_MS = 4500;

const FEATURES = [
  {
    hex: "#22d3ee",
    title: "تحلیل ترکیب دارایی‌ها",
    desc: "سبد فعلی‌ات با موتور بهینه‌سازی پرتفوی (QP) مقایسه می‌شود؛ نقاط قوت و ضعف، هشدار تمرکز بیش‌ازحد روی یک دارایی، و بازده و ریسک مورد انتظار هرکدام به‌طور دقیق نشانت داده می‌شود.",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M12 20V4M20 20v-6"/></svg>',
  },
  {
    hex: "#f87171",
    title: "ریسک‌سنجی واقعی",
    desc: "ریسک سبدت روی مقیاس ۰ تا ۱۰۰ محاسبه و با سطح پیشنهادی مقایسه می‌شود؛ رفتار واقعی‌ات در تصمیم‌های قبلی هم روی این عدد اثر می‌گذارد.",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/></svg>',
  },
  {
    hex: "#60a5fa",
    title: "نقدینگی من",
    desc: "هر دارایی در یکی از سه دسته‌ی نقد سریع، نیمه‌نقد یا غیرنقد قرار می‌گیرد، و می‌بینی دقیقاً چقدر پول تا ۱ ماه، ۳ ماه و ۱ سال آینده در دسترست هست.",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3c4 5 7 8.5 7 12a7 7 0 1 1-14 0c0-3.5 3-7 7-12Z"/></svg>',
  },
  {
    hex: "#2dd4bf",
    title: "اهداف مالی",
    desc: "هر هدفی که ثبت کنی — خرید خانه، مهاجرت، ازدواج — پس‌انداز ماهانه‌ی لازم و توان پس‌انداز فعلی‌ات محاسبه می‌شود و مسیر رسیدن به آن روشن می‌شود.",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M5 3v18"/><path d="M5 4h11l-2.5 3.5L16 11H5"/></svg>',
  },
  {
    hex: "#c084fc",
    title: "شبیه‌ساز سناریو",
    desc: "با ۸۰۰۰ بار تکرار شبیه‌سازی مونت‌کارلو می‌بینی اگر دلار، طلا یا بورس نوسان کند، دقیقاً چقدر و با چه بازه‌ی اطمینانی روی دارایی‌هایت اثر می‌گذارد.",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 13h15a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 18h9a2.5 2.5 0 1 1-2.5 2.5"/></svg>',
  },
  {
    hex: "#fb923c",
    title: "دستیار قبل از تصمیم",
    desc: "پیش از هر تصمیم مالی بزرگ، وضعیت دارایی، ریسک، نقدینگی و اهدافت را قبل و بعد از آن تصمیم کنار هم می‌بینی و یک توصیه‌ی روشن می‌گیری.",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-4 6-2-4 6-2Z"/></svg>',
  },
  {
    hex: "#f87171",
    title: "هشدار تصمیم‌های هیجانی",
    desc: "اگر پیامی به دستیار نشانه‌ی واکنش هیجانی یا آنی به یک نوسان کوتاه‌مدت باشد، به‌موقع هشدار می‌دهد و آن را در صفحه‌ی مخصوص خودش ثبت می‌کند.",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2 20h20L12 4Z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>',
  },
  {
    hex: "#2dd4bf",
    title: "گفتگوی زنده با دستیار مالی",
    desc: "هر سوالی درباره‌ی وضعیت مالی‌ات بپرسی، پاسخ دقیق و شخصی‌سازی‌شده را زنده و کلمه‌به‌کلمه می‌گیری، نه بعد از چند ثانیه انتظار یک‌جا.",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4V5Z"/></svg>',
  },
];

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
function toPersianDigits(n) {
  return String(n).replace(/\d/g, (d) => PERSIAN_DIGITS[d]);
}

export function initFeaturesCarousel() {
  const wrap = document.getElementById("featuresInteractive");
  const tabsEl = document.getElementById("featuresTabs");
  if (!wrap || !tabsEl) return;

  let active = 0;
  let paused = false;
  let timer = null;

  function render() {
    const f = FEATURES[active];

    tabsEl.innerHTML = FEATURES.map((ff, i) => `
      <button type="button" class="features-tab${i === active ? " active" : ""}" data-index="${i}">
        <span class="features-tab-row">
          <span class="features-tab-ico" style="background:${i === active ? ff.hex + "22" : "rgba(255,255,255,0.05)"};color:${i === active ? ff.hex : "#64748b"};">${ff.icon}</span>
          <span class="features-tab-title">${ff.title}</span>
        </span>
        <span class="features-tab-bar">${i === active ? `<span class="features-tab-fill${paused ? " paused" : ""}" style="background:${ff.hex};animation-duration:${AUTO_ADVANCE_MS}ms;"></span>` : ""}</span>
      </button>
    `).join("");
    tabsEl.querySelectorAll(".features-tab").forEach((btn) => {
      btn.addEventListener("click", () => selectTab(Number(btn.dataset.index)));
    });

    document.getElementById("fpGlow").style.background = f.hex;
    document.getElementById("fpBody").innerHTML = `
      <div class="features-preview-num" style="color:${f.hex}">${toPersianDigits(active + 1)}</div>
      <div class="features-preview-content">
        <div class="features-preview-ico" style="background:${f.hex}1a;color:${f.hex};">${f.icon}</div>
        <h3>${f.title}</h3>
        <p>${f.desc}</p>
      </div>
    `;
    document.getElementById("fpDots").innerHTML = FEATURES.map((ff, i) => `
      <span class="${i === active ? "active" : ""}" style="${i === active ? `background-color:${f.hex}` : ""}"></span>
    `).join("");
  }

  function selectTab(i) {
    active = i;
    render();
    restartTimer();
  }

  function restartTimer() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (paused) return;
      active = (active + 1) % FEATURES.length;
      render();
    }, AUTO_ADVANCE_MS);
  }

  wrap.addEventListener("mouseenter", () => {
    paused = true;
    const fill = tabsEl.querySelector(".features-tab-fill");
    if (fill) fill.classList.add("paused");
  });
  wrap.addEventListener("mouseleave", () => {
    paused = false;
    const fill = tabsEl.querySelector(".features-tab-fill");
    if (fill) fill.classList.remove("paused");
  });

  render();
  restartTimer();
}
