import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_DATA_DIR = path.join(__dirname, "data", "users");

// The conversation is persisted per-user so it survives a page reload, a
// browser close, or logging in again later — "حافظه" for the chat widget,
// and a record the user can come back and re-read. Bounded so a very long
// history can't grow the file (or the prompt context) without limit.
const MAX_MESSAGES = 300;

function userDir(userId) {
  return path.join(USERS_DATA_DIR, userId);
}

function file(userId) {
  return path.join(userDir(userId), "chat.json");
}

function ensureUserDir(userId) {
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadChatHistory(userId) {
  ensureUserDir(userId);
  const f = file(userId);
  if (!fs.existsSync(f)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(f, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Appends one or more {role, content, at} messages and returns the updated (trimmed) history. */
export function appendChatMessages(userId, messages) {
  const history = loadChatHistory(userId);
  const next = [...history, ...messages].slice(-MAX_MESSAGES);
  ensureUserDir(userId);
  fs.writeFileSync(file(userId), JSON.stringify(next, null, 2), "utf-8");
  return next;
}
