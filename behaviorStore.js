import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const USERS_DATA_DIR = path.join(DATA_DIR, "users");

/**
 * Phase 4 — Behavioral risk-scoring.
 *
 * A self-reported "risk tolerance: 7/10" slider is a snapshot of what
 * someone *says* about themselves once. This module instead accumulates a
 * log of what the user actually *does* — which decisions they followed
 * through on versus backed out of relative to what was recommended, and
 * whether they reacted emotionally to short-term volatility — and nudges an
 * "effective" risk tolerance away from the stated one accordingly. This is
 * a real (if simple) online-learning update rule, not a static
 * questionnaire, and it starts adjusting from the very first logged event.
 * The log is kept per-user (each account learns from its own behavior only).
 *
 * Each event contributes a bounded nudge to `delta` (added to the
 * self-reported riskTolerance, clamped so a handful of events can't cause
 * runaway drift):
 *   - decision FOLLOWED despite a "پیشنهاد نمی‌شود" recommendation:
 *       revealed tolerance is higher than stated -> nudge up
 *   - decision ABANDONED despite a "پیشنهاد می‌شود" recommendation:
 *       revealed caution is higher than stated -> nudge down
 *   - an emotional/impulsive reaction flagged in chat:
 *       nudge down slightly (protect against overstated risk tolerance
 *       that doesn't hold up under real short-term stress)
 */

const MAX_DELTA = 3;
const NUDGE = {
  decisionFollowedRisky: 0.6,
  decisionAbandonedSafe: -0.6,
  emotionalFlag: -0.3,
  // One-time seed from the onboarding question "how would you react to a
  // 20% drop?" — a self-reported behavioral signal, applied once.
  onboardingSellsImmediately: -1.5,
  onboardingStaysCalm: 1.5,
};

function userDir(userId) {
  return path.join(USERS_DATA_DIR, userId);
}

function file(userId) {
  return path.join(userDir(userId), "behavior.json");
}

function ensureUserDir(userId) {
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load(userId) {
  ensureUserDir(userId);
  const f = file(userId);
  if (!fs.existsSync(f)) return { events: [], delta: 0 };
  try {
    return JSON.parse(fs.readFileSync(f, "utf-8"));
  } catch {
    return { events: [], delta: 0 };
  }
}

function save(userId, state) {
  ensureUserDir(userId);
  fs.writeFileSync(file(userId), JSON.stringify(state, null, 2), "utf-8");
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function logEvent(userId, type, nudgeKey, meta = {}) {
  const state = load(userId);
  const nudge = NUDGE[nudgeKey] || 0;
  state.events.push({ type, nudgeKey, nudge, meta, at: new Date().toISOString() });
  state.delta = clamp(state.delta + nudge, -MAX_DELTA, MAX_DELTA);
  save(userId, state);
  return state;
}

export function getBehaviorState(userId) {
  return load(userId);
}

/** Blends the self-reported riskTolerance with the accumulated behavioral delta. */
export function effectiveRiskTolerance(userId, selfReported) {
  const state = load(userId);
  const base = Number(selfReported) || 5;
  const effective = clamp(base + state.delta, 1, 10);
  return { base, delta: state.delta, effective, eventCount: state.events.length };
}

/** Recent chat messages flagged as an emotional/impulsive reaction, newest first. */
export function getEmotionalEvents(userId) {
  const state = load(userId);
  return state.events
    .filter((e) => e.type === "chat_emotional")
    .map((e) => ({ at: e.at, reason: e.meta?.reason || null, message: e.meta?.message || null }))
    .reverse();
}
