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
    item.innerHTML = `
      <div class="em-head">
        <div class="em-time">${time}</div>
        <button class="btn btn-ghost btn-small em-ack-btn" type="button">حواسم هست</button>
      </div>
      <div>${alert.reason || ""}</div>
      <div class="em-msg">${alert.message || ""}</div>`;
    item.querySelector(".em-ack-btn").onclick = () => acknowledgeAlert(alert.id, item);
    list.appendChild(item);
  });
}

async function acknowledgeAlert(id, item) {
  item.classList.add("em-item-ack");
  try {
    await fetch(`/api/emotional-alerts/${id}/ack`, { method: "POST" });
  } catch (e) {
    console.error(e);
  }
  item.remove();
  if (!$("emotionalList").children.length) $("emotionalEmpty").classList.remove("hidden");
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
