import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_DATA_DIR = path.join(__dirname, "data", "users");

/**
 * Freezes each "current portfolio state" widget's result (دارایی‌ها/ریسک/
 * نقدینگی) behind a fingerprint of the user's own inputs — asset quantities,
 * self-reported risk tolerance, income/expenses, and the behaviorally-
 * learned delta — deliberately EXCLUDING live market rates. Gold/dollar
 * prices move every few minutes; without this, the exact same portfolio
 * (same grams of gold, same everything the user actually entered) could
 * show a slightly different "ریسک پیشنهادی" on every single page visit just
 * because a live rate ticked, which reads as the system being unstable. As
 * long as the fingerprint is unchanged, the widget keeps serving the same
 * stored numbers; a fresh computation only happens when the user actually
 * changes something, a real behavioral event shifts their effective risk
 * tolerance, or they explicitly ask for a recalculation.
 */

function userDir(userId) {
  return path.join(USERS_DATA_DIR, userId);
}

function file(userId) {
  return path.join(userDir(userId), "widgetSnapshots.json");
}

function ensureUserDir(userId) {
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadAll(userId) {
  ensureUserDir(userId);
  const f = file(userId);
  if (!fs.existsSync(f)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(f, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(userId, all) {
  ensureUserDir(userId);
  fs.writeFileSync(file(userId), JSON.stringify(all, null, 2), "utf-8");
}

/** A stable fingerprint of everything that should be able to change a widget's numbers — NOT live rates. */
export function computeFingerprint(rawProfile, behaviorState) {
  return JSON.stringify({
    assets: rawProfile.assets || [],
    riskTolerance: rawProfile.riskTolerance ?? 5,
    monthlyIncome: rawProfile.monthlyIncome ?? null,
    monthlyExpenses: rawProfile.monthlyExpenses ?? null,
    existingDebt: rawProfile.existingDebt ?? null,
    liquidityNeedNote: rawProfile.liquidityNeedNote || "",
    behaviorDelta: behaviorState?.delta ?? 0,
  });
}

export function loadSnapshot(userId, key) {
  return loadAll(userId)[key] || null;
}

export function saveSnapshot(userId, key, snapshot) {
  const all = loadAll(userId);
  all[key] = snapshot;
  saveAll(userId, all);
}
