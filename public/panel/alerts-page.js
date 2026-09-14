import { $ } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

function renderAlerts(alerts) {
  const list = $("emotionalList");
  list.innerHTML = "";
  if (!alerts.length) {
    $("emotionalEmpty").classList.remove("hidden");
    return;
  }
  $("emotionalEmpty").classList.add("hidden");
  alerts.forEach((alert) => {
    const item = document.createElement("div");
    item.className = "emotional-item";
    const time = alert.at ? new Date(alert.at).toLocaleString("fa-IR") : "";
    item.innerHTML = `<div class="em-time">${time}</div><div>${alert.reason || ""}</div><div class="em-msg">${alert.message || ""}</div>`;
    list.appendChild(item);
  });
}

async function loadAlerts() {
  try {
    const res = await fetch("/api/emotional-alerts");
    const data = await res.json();
    renderAlerts(data.alerts || []);
  } catch (e) {
    console.error(e);
  }
}

async function init() {
  const user = await initPanelShell("alerts");
  if (!user) return;
  loadAlerts();
}

init();
