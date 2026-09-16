// Auto-advancing tabbed showcase for the homepage "features" section: a
// vertical tab list drives a live preview panel, cycling on its own unless
// the user hovers or clicks a tab.
const AUTO_ADVANCE_MS = 4500;

const FEATURES = [
  {
    hex: "#22d3ee",
    title: "بهینه‌سازی سبد سرمایه‌گذاری با الگوریتم‌های QP",
    desc: "با روش‌های برنامه‌ریزی درجه دوم، بهترین ترکیب دارایی را برای ریسک و بازده هدف شما پیدا می‌کنیم.",
    stat: "قطعی",
    statLabel: "خروجی محاسبه‌ی ریاضی دقیق، نه حدس یک مدل زبانی",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>',
  },
  {
    hex: "#c084fc",
    title: "شبیه‌سازی سناریوها بر اساس داده‌های واقعی",
    desc: "هزاران مسیر ممکن بازار را روی داده‌های واقعی شبیه‌سازی می‌کنیم تا تصمیم آگاهانه‌تری بگیری.",
    stat: "۸۰۰۰",
    statLabel: "تکرار در هر شبیه‌سازی سناریو",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>',
  },
  {
    hex: "#fb923c",
    title: "تحلیل ریسک و مدیریت نوسانات",
    desc: "نوسانات هر دارایی را می‌سنجیم و نقاط آسیب‌پذیر پرتفوی را پیش از وقوع نشان می‌دهیم.",
    stat: "۰-۱۰۰",
    statLabel: "مقیاس امتیاز ریسک سبد دارایی",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/><path d="M12 8v4"/><path d="M12 15h.01"/></svg>',
  },
  {
    hex: "#f472b6",
    title: "پیش‌بینی بازدهی با مدل‌های پیشرفته",
    desc: "با مدل‌های آماری پیشرفته، بازدهی محتمل هر دارایی را برای افق زمانی‌ات تخمین می‌زنیم.",
    stat: "MPT",
    statLabel: "بر پایه‌ی نظریه‌ی مدرن پرتفوی (میانگین-واریانس)",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 6 13.5 15.5l-5-5L1 18"/><path d="M17 6h6v6"/></svg>',
  },
  {
    hex: "#2dd4bf",
    title: "یادگیری رفتار کاربر و بهبود تصمیم‌ها",
    desc: "با هر تصمیم، فین‌مایند رفتار مالی‌ات را بهتر می‌شناسد و پیشنهادها را شخصی‌تر می‌کند.",
    stat: "مستمر",
    statLabel: "یادگیری از رفتار شما",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3.5 3.5 0 0 0 8 18a2.5 2.5 0 0 0 4-2V6a2 2 0 0 0-3-2Z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3.5 3.5 0 0 1 16 18a2.5 2.5 0 0 1-4-2"/></svg>',
  },
  {
    hex: "#60a5fa",
    title: "دسته‌بندی نقدشوندگی دارایی‌ها",
    desc: "هر دارایی در یکی از سه دسته‌ی نقد سریع، نیمه‌نقد یا غیرنقد قرار می‌گیرد و دقیقاً می‌بینی چقدر پول تا ۱ ماه، ۳ ماه و ۱ سال آینده در دسترست هست.",
    stat: "۳",
    statLabel: "دسته‌ی نقدشوندگی: نقد سریع، نیمه‌نقد، غیرنقد",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3c4 5 7 8.5 7 12a7 7 0 1 1-14 0c0-3.5 3-7 7-12Z"/></svg>',
  },
  {
    hex: "#fb923c",
    title: "پیشنهادهای هوشمند بر اساس شرایط بازار",
    desc: "با تغییر شرایط بازار، پیشنهادهای به‌روز و متناسب با موقعیت دریافت می‌کنی.",
    stat: "لحظه‌ای",
    statLabel: "نرخ لحظه‌ای طلا، ارز و رمزارز از بازار آزاد ایران",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a6 6 0 0 0-4 10.5c.7.6 1 1.4 1 2.5h6c0-1.1.3-1.9 1-2.5A6 6 0 0 0 12 2Z"/></svg>',
  },
  {
    hex: "#34d399",
    title: "مدیریت اهداف مالی کوتاه‌مدت و بلندمدت",
    desc: "برای هر هدف، از خرید خودرو تا بازنشستگی، مسیر مالی مشخصی می‌سازیم.",
    stat: "نامحدود",
    statLabel: "تعداد اهداف مالی",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
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

    document.getElementById("fpStat").innerHTML = `
      <div class="features-stat-box" style="background:${f.hex}1a;color:${f.hex};">${f.stat}</div>
      <div>
        <h4>${f.statLabel}</h4>
        <p>مرتبط با ${f.title.split(" ").slice(0, 3).join(" ")}</p>
      </div>
    `;
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
