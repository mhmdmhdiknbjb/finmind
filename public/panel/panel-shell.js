// Shared sidebar + topbar shell for every panel/chat page. Each page's HTML
// has an empty #panelSidebar and #panelTopbar container and sets
// document.body.dataset.page to one of the keys below; this module fills
// both in, wires the logout button, and redirects to the login page if
// there's no active session.

import { requireUserOrRedirect, logout } from "../common.js";

const NAV_ITEMS = [
  { key: "dashboard", href: "/panel/dashboard.html", icon: "🏠", label: "داشبورد" },
  { key: "profile", href: "/panel/profile.html", icon: "👤", label: "اطلاعات من" },
  { key: "assets", href: "/panel/assets.html", icon: "📊", label: "تحلیل دارایی‌ها" },
  { key: "risk", href: "/panel/risk.html", icon: "🎯", label: "ریسک‌سنجی" },
  { key: "liquidity", href: "/panel/liquidity.html", icon: "💧", label: "نقدینگی" },
  { key: "goals", href: "/panel/goals.html", icon: "🏁", label: "اهداف مالی" },
  { key: "scenario", href: "/panel/scenario.html", icon: "🌪️", label: "شبیه‌ساز سناریو" },
  { key: "decision", href: "/panel/decision.html", icon: "🧭", label: "دستیار قبل از تصمیم" },
  { key: "alerts", href: "/panel/alerts.html", icon: "⚠️", label: "هشدارهای رفتاری", badgeId: "navAlertBadge" },
  { key: "chat", href: "/panel/chat.html", icon: "💬", label: "گفتگو با دستیار" },
];

const PAGE_TITLES = Object.fromEntries(NAV_ITEMS.map((i) => [i.key, i.label]));

function renderSidebar(activeKey) {
  const el = document.getElementById("panelSidebar");
  if (!el) return;
  el.innerHTML = `
    <div class="brand">
      <div class="brand-icon">◈</div>
      <div><h1>فین‌مایند</h1><p>پنل کاربری</p></div>
    </div>
    <nav>
      ${NAV_ITEMS.map(
        (item) => `
        <a class="panel-nav-link${item.key === activeKey ? " active" : ""}" href="${item.href}">
          <span class="nav-ico">${item.icon}</span>
          <span>${item.label}</span>
          ${item.badgeId ? `<span class="panel-nav-badge hidden" id="${item.badgeId}"></span>` : ""}
        </a>`
      ).join("")}
    </nav>
    <div class="panel-sidebar-footer">
      <a class="panel-nav-link" href="/" id="panelHomeLink"><span class="nav-ico">↩</span><span>بازگشت به سایت</span></a>
    </div>
  `;
}

function renderTopbar(activeKey, user) {
  const el = document.getElementById("panelTopbar");
  if (!el) return;
  el.innerHTML = `
    <h2>${PAGE_TITLES[activeKey] || ""}</h2>
    <div class="panel-user">
      <span class="panel-user-name">${user.name}</span>
      <button class="btn btn-ghost btn-small" id="panelLogoutBtn">خروج</button>
    </div>
  `;
  document.getElementById("panelLogoutBtn").onclick = logout;
}

async function renderAlertBadge() {
  const badge = document.getElementById("navAlertBadge");
  if (!badge) return;
  try {
    const res = await fetch("/api/emotional-alerts");
    if (!res.ok) return;
    const data = await res.json();
    const count = (data.alerts || []).length;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove("hidden");
    }
  } catch {
    /* non-critical */
  }
}

export async function initPanelShell(activeKey) {
  const user = await requireUserOrRedirect();
  if (!user) return null;
  renderSidebar(activeKey);
  renderTopbar(activeKey, user);
  renderAlertBadge();
  return user;
}
