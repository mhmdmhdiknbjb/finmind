import { $ } from "../common.js";
import { initPanelShell } from "./panel-shell.js";

let chatHistory = [];

function appendChatMessage(role, text, thinking = false) {
  const wrap = $("chatMessages");
  const div = document.createElement("div");
  div.className = "chat-msg " + (role === "user" ? "chat-msg-user" : "chat-msg-bot") + (thinking ? " thinking" : "");
  div.textContent = text;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

function appendEmotionalBanner(emotional) {
  const wrap = $("chatMessages");
  const div = document.createElement("div");
  div.className = "banner banner-warn";
  div.style.alignSelf = "stretch";
  div.textContent = "⚠ " + (emotional.message || emotional.reason || "این ممکن است یک واکنش هیجانی باشد.");
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
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
      appendEmotionalBanner(emotional);
    }
  } catch (e) {
    console.error(e);
    botEl.classList.remove("thinking");
    botEl.textContent = "خطا در ارتباط با سرور.";
  }
}

async function init() {
  const user = await initPanelShell("chat");
  if (!user) return;
  $("chatForm").onsubmit = (e) => {
    e.preventDefault();
    const input = $("chatInput");
    const msg = input.value.trim();
    if (!msg) return;
    input.value = "";
    sendChatMessage(msg);
  };
}

init();
