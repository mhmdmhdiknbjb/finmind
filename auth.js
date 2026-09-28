import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, "session-secret.txt");

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = "fm_session";

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// A stable secret is required so sessions survive a server restart; it is
// generated once on first run and kept out of git alongside the rest of data/.
function getOrCreateSessionSecret() {
  ensureDataDir();
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, "utf-8").trim();
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(SECRET_FILE, secret, "utf-8");
  return secret;
}

const SESSION_SECRET = getOrCreateSessionSecret();

function loadUsers() {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** An error whose message is meant for the end user (already Persian) and whose HTTP status is a 4xx, not a crash.
 * server.js's handleAsync sends these through as-is and hides the message of every other thrown error. */
export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "UserError";
    this.status = status;
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

export function registerUser({ name, email, password }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new UserError("ایمیل معتبر وارد کنید.", 400);
  }
  if (!password || password.length < 6) {
    throw new UserError("رمز عبور باید حداقل ۶ کاراکتر باشد.", 400);
  }
  const users = loadUsers();
  if (users.some((u) => u.email === normalizedEmail)) {
    throw new UserError("این ایمیل قبلاً ثبت‌نام کرده است.", 409);
  }
  const user = {
    id: crypto.randomBytes(9).toString("hex"),
    name: String(name || "").trim() || "کاربر",
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return publicUser(user);
}

export function verifyLogin(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const users = loadUsers();
  const user = users.find((u) => u.email === normalizedEmail);
  if (!user || !verifyPassword(password || "", user.passwordHash)) {
    throw new UserError("ایمیل یا رمز عبور اشتباه است.", 401);
  }
  return publicUser(user);
}

export function getUserById(id) {
  const user = loadUsers().find((u) => u.id === id);
  return user ? publicUser(user) : null;
}

function sign(payload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

export function createSessionToken(userId) {
  const payload = `${userId}.${Date.now()}`;
  return Buffer.from(`${payload}.${sign(payload)}`).toString("base64url");
}

export function verifySessionToken(token) {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return null;
    const [userId, issuedAt, sig] = parts;
    const payload = `${userId}.${issuedAt}`;
    const expected = sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (Date.now() - Number(issuedAt) > SESSION_MAX_AGE_MS) return null;
    return userId;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  });
  return out;
}

export function setSessionCookie(res, token) {
  const maxAgeSec = Math.floor(SESSION_MAX_AGE_MS / 1000);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`);
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

export function requireAuth(req, res, next) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const userId = token ? verifySessionToken(token) : null;
  const user = userId ? getUserById(userId) : null;
  if (!user) {
    res.status(401).json({ error: "ابتدا وارد حساب کاربری خود شوید." });
    return;
  }
  req.userId = user.id;
  req.user = user;
  next();
}
