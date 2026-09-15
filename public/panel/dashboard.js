import { $ } from "../common.js";
import { initPanelShell } from "./panel-shell.js";
import { iconBadge } from "../icons.js";

const NAV_CARDS = [
  { href: "profile.html", icon: "user", tone: "violet", title: "اطلاعات شخصی و دارایی‌ها", desc: "ویرایش اطلاعات، دارایی‌ها و اهداف پایه‌ات." },
  { href: "assets.html", icon: "chartBar", tone: "indigo", title: "تحلیل ترکیب دارایی‌ها", desc: "مقایسه سبد فعلی با پیشنهاد موتور بهینه‌سازی." },
  { href: "risk.html", icon: "target", tone: "rose", title: "ریسک‌سنجی", desc: "ریسک واقعی سبدت، با یادگیری از رفتار خودت." },
  { href: "liquidity.html", icon: "droplet", tone: "sky", title: "نقدینگی من", desc: "چقدر پول فوری و تا چه بازه‌ای در دسترست هست." },
  { href: "goals.html", icon: "flag", tone: "teal", title: "اهداف مالی", desc: "مسیر رسیدن به هر هدف مالی را بسنج." },
  { href: "scenario.html", icon: "wind", tone: "violet", title: "شبیه‌ساز سناریو", desc: "اثر نوسانات بازار روی دارایی‌هات را ببین." },
  { href: "decision.html", icon: "compass", tone: "amber", title: "دستیار قبل از تصمیم", desc: "قبل از هر تصمیم مالی بزرگ، پیامدش را بسنج." },
  { href: "alerts.html", icon: "alertTriangle", tone: "rose", title: "هشدارهای رفتاری", desc: "تصمیم‌های هیجانی که شناسایی شده‌اند." },
  { href: "chat.html", icon: "chat", tone: "teal", title: "گفتگو با دستیار مالی", desc: "هر سوالی درباره وضعیت مالی‌ات بپرس." },
];

function renderNavGrid() {
  $("dashNavGrid").innerHTML = NAV_CARDS.map(
    (c) => `
    <a class="dash-nav-card" href="${c.href}">
      <div class="dnc-ico">${iconBadge(c.icon, c.tone)}</div>
      <h3>${c.title}</h3>
      <p>${c.desc}</p>
    </a>`
  ).join("");
}

async function init() {
  const user = await initPanelShell("dashboard");
  if (!user) return;

  const res = await fetch("/api/profile");
  const profile = await res.json();

  if (!profile.onboarded) {
    window.location.href = "profile.html";
    return;
  }

  $("dashWelcome").textContent = `خوش اومدی، ${user.name} 👋`;
  const p = profile.personal || {};
  const parts = [];
  if (p.age) parts.push(`${p.age} ساله`);
  if (p.gender) parts.push(p.gender);
  parts.push(`ریسک‌پذیری ${profile.riskTolerance ?? 5}/۱۰`);
  parts.push(`${(profile.assets || []).length} دارایی ثبت‌شده`);
  parts.push(`${(profile.goals || []).length} هدف مالی`);
  $("dashProfileSummary").textContent = parts.join(" — ");

  renderNavGrid();
}

init();
