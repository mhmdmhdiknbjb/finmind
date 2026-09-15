// Shared sidebar + topbar shell for every panel/chat page. Each page's HTML
// has an empty #panelSidebar and #panelTopbar container and sets
// document.body.dataset.page to one of the keys below; this module fills
// both in, wires the logout button, and redirects to the login page if
// there's no active session.

import { requireUserOrRedirect, logout } from "../common.js";
import { iconBadge, ICONS } from "../icons.js";

const NAV_ITEMS = [
  { key: "dashboard", href: "/panel/dashboard.html", icon: "dashboard", tone: "indigo", label: "داشبورد" },
  { key: "profile", href: "/panel/profile.html", icon: "user", tone: "violet", label: "اطلاعات من" },
  { key: "assets", href: "/panel/assets.html", icon: "chartBar", tone: "indigo", label: "تحلیل دارایی‌ها" },
  { key: "risk", href: "/panel/risk.html", icon: "target", tone: "rose", label: "ریسک‌سنجی" },
  { key: "liquidity", href: "/panel/liquidity.html", icon: "droplet", tone: "sky", label: "نقدینگی" },
  { key: "goals", href: "/panel/goals.html", icon: "flag", tone: "teal", label: "اهداف مالی" },
  { key: "scenario", href: "/panel/scenario.html", icon: "wind", tone: "violet", label: "شبیه‌ساز سناریو" },
  { key: "decision", href: "/panel/decision.html", icon: "compass", tone: "amber", label: "دستیار قبل از تصمیم" },
  { key: "alerts", href: "/panel/alerts.html", icon: "alertTriangle", tone: "rose", label: "هشدارهای رفتاری", badgeId: "navAlertBadge" },
  { key: "chat", href: "/panel/chat.html", icon: "chat", tone: "teal", label: "گفتگو با دستیار" },
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
          <span class="nav-ico">${iconBadge(item.icon, item.tone, "sm")}</span>
          <span>${item.label}</span>
          ${item.badgeId ? `<span class="panel-nav-badge hidden" id="${item.badgeId}"></span>` : ""}
        </a>`
      ).join("")}
    </nav>
    <div class="panel-sidebar-footer">
      <a class="panel-nav-link" href="/" id="panelHomeLink"><span class="nav-ico">${iconBadge("arrowLeft", "indigo", "sm")}</span><span>بازگشت به سایت</span></a>
    </div>
  `;
}

function renderTopbar(activeKey, user) {
  const el = document.getElementById("panelTopbar");
  if (!el) return;
  el.innerHTML = `
    <h2>${PAGE_TITLES[activeKey] || ""}</h2>
    <div class="panel-user">
      <div class="notif-bell-wrap" id="notifBellWrap">
        <button class="notif-bell" id="notifBellBtn" type="button" aria-label="اعلان‌ها">
          ${ICONS.bell}<span class="notif-badge hidden" id="notifBadge"></span>
        </button>
        <div class="notif-dropdown hidden" id="notifDropdown">
          <div class="notif-dropdown-head">اعلان‌ها</div>
          <div class="notif-list" id="notifList"></div>
        </div>
      </div>
      <span class="panel-user-name">${user.name}</span>
      <button class="btn btn-ghost btn-small" id="panelLogoutBtn">خروج</button>
    </div>
  `;
  document.getElementById("panelLogoutBtn").onclick = logout;
}

/* ---------------- Notifications ---------------- */

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "همین الان";
  if (min < 60) return `${min} دقیقه پیش`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ساعت پیش`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} روز پیش`;
  return new Date(iso).toLocaleDateString("fa-IR");
}

const NOTIF_ICON = { risk: ["target", "rose"], emotional_alert: ["alertTriangle", "rose"] };

function renderNotifList(notifications) {
  const list = document.getElementById("notifList");
  if (!list) return;
  if (!notifications.length) {
    list.innerHTML = '<div class="notif-empty">اعلانی نداری</div>';
    return;
  }
  list.innerHTML = notifications
    .map((n) => {
      const [icon, tone] = NOTIF_ICON[n.type] || ["bell", "indigo"];
      return `
      <div class="notif-item${n.read ? "" : " unread"}">
        <div class="notif-item-ico">${iconBadge(icon, tone, "sm")}</div>
        <div>
          <div class="notif-item-title">${n.title || ""}</div>
          <div class="notif-item-msg">${n.message || ""}</div>
          <div class="notif-item-time">${relativeTime(n.at)}</div>
        </div>
      </div>`;
    })
    .join("");
}

function updateBadge(count) {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? "9+" : count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

async function initNotificationBell() {
  const wrap = document.getElementById("notifBellWrap");
  const btn = document.getElementById("notifBellBtn");
  const dropdown = document.getElementById("notifDropdown");
  if (!wrap || !btn || !dropdown) return;

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) return (await res.json()).notifications || [];
    } catch {
      /* non-critical */
    }
    return null;
  }

  // Initial badge on load.
  const initial = await fetchNotifications();
  if (initial) updateBadge(initial.filter((n) => !n.read).length);

  // A widget computed on THIS same page load (e.g. the risk score) can
  // create a notification seconds after this initial fetch already ran —
  // an LLM call is slow enough that it easily outlasts it — so re-fetch
  // fresh every time the bell is actually opened rather than trusting a
  // stale snapshot from page-load time. A light poll also keeps the badge
  // itself current while the tab just sits open.
  const poll = setInterval(async () => {
    if (!dropdown.classList.contains("hidden")) return; // don't fight an open dropdown
    const fresh = await fetchNotifications();
    if (fresh) updateBadge(fresh.filter((n) => !n.read).length);
  }, 30000);
  window.addEventListener("beforeunload", () => clearInterval(poll));

  btn.onclick = async (e) => {
    e.stopPropagation();
    const opening = dropdown.classList.contains("hidden");
    if (!opening) {
      dropdown.classList.add("hidden");
      return;
    }
    const fresh = (await fetchNotifications()) || [];
    renderNotifList(fresh);
    dropdown.classList.remove("hidden");
    if (fresh.some((n) => !n.read)) {
      updateBadge(0);
      try {
        await fetch("/api/notifications/read-all", { method: "POST" });
      } catch {
        /* non-critical */
      }
    } else {
      updateBadge(0);
    }
  };

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) dropdown.classList.add("hidden");
  });
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
  initNotificationBell();
  return user;
}
