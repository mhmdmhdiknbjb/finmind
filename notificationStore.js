import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_DATA_DIR = path.join(__dirname, "data", "users");

// In-app notification center: a real change in the user's risk score, or a
// newly-flagged emotional decision, gets recorded here so the panel's bell
// icon can surface it — not just silently shown once on whichever page
// happened to compute it.
const MAX_NOTIFICATIONS = 100;

function userDir(userId) {
  return path.join(USERS_DATA_DIR, userId);
}

function file(userId) {
  return path.join(userDir(userId), "notifications.json");
}

function ensureUserDir(userId) {
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getNotifications(userId) {
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

function save(userId, list) {
  ensureUserDir(userId);
  fs.writeFileSync(file(userId), JSON.stringify(list, null, 2), "utf-8");
}

export function addNotification(userId, { type, title, message }) {
  const list = getNotifications(userId);
  list.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    type,
    title,
    message,
    at: new Date().toISOString(),
    read: false,
  });
  save(userId, list.slice(0, MAX_NOTIFICATIONS));
}

export function markAllRead(userId) {
  const list = getNotifications(userId).map((n) => (n.read ? n : { ...n, read: true }));
  save(userId, list);
  return list;
}
