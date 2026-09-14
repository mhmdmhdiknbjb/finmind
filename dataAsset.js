import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "interactions.jsonl");

/**
 * Phase 5 — the proprietary dataset.
 *
 * This is honestly not a model at all: it's the append-only event log that,
 * aggregated across many real users of this multi-tenant product, becomes
 * the thing competitors running a bare LLM-wrapper cannot replicate —
 * structured Iranian-household financial-behavior data (which scenarios
 * people actually worry about, how allocation choices relate to age/risk
 * band, how often a recommendation is actually followed).
 *
 * Every record is deliberately aggregate/structural — asset *categories*
 * and *percentages*, age/risk *bands*, never raw amounts, names, or other
 * PII — plus a `userId` so per-user behavior can still be traced back if
 * needed, without the aggregate stats themselves ever exposing anyone's
 * actual numbers.
 */

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ageBand(age) {
  if (!age) return "unknown";
  if (age < 25) return "<25";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 60) return "45-59";
  return "60+";
}

export function logInteraction(userId, type, payload) {
  ensureDataDir();
  const record = { ts: new Date().toISOString(), userId, type, ...payload };
  fs.appendFileSync(FILE, JSON.stringify(record) + "\n", "utf-8");
}

export function logProfileSnapshot(userId, profile) {
  logInteraction(userId, "profile_snapshot", {
    ageBand: ageBand(profile.personal?.age),
    riskTolerance: profile.riskTolerance ?? null,
    assetCategoryCount: new Set((profile.assets || []).map((a) => a.category)).size,
  });
}

function readAll() {
  ensureDataDir();
  if (!fs.existsSync(FILE)) return [];
  return fs
    .readFileSync(FILE, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function getAggregateInsights() {
  const records = readAll();
  const byType = {};
  for (const r of records) byType[r.type] = (byType[r.type] || 0) + 1;

  const scenarioCounts = {};
  for (const r of records.filter((r) => r.type === "scenario_run")) {
    scenarioCounts[r.scenarioTitle || "unknown"] = (scenarioCounts[r.scenarioTitle || "unknown"] || 0) + 1;
  }

  const decisionOutcomes = records.filter((r) => r.type === "decision_outcome");
  const followedAgainstAdvice = decisionOutcomes.filter((r) => r.followed && r.recommendation === "پیشنهاد نمی‌شود").length;
  const abandonedSafe = decisionOutcomes.filter((r) => !r.followed && r.recommendation === "پیشنهاد می‌شود").length;

  return {
    totalInteractions: records.length,
    eventsByType: byType,
    mostSimulatedScenarios: Object.entries(scenarioCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, count]) => ({ title, count })),
    decisionBehavior: {
      totalChecked: decisionOutcomes.length,
      followedAgainstAdvice,
      abandonedSafeAdvice: abandonedSafe,
    },
    userCount: new Set(records.map((r) => r.userId).filter(Boolean)).size,
    note: "این خلاصه از تمام کاربران پلتفرم تجمیع شده — هرچه کاربران بیشتری از فین‌مایند استفاده کنند، این دیتاست ارزشمندتر می‌شود.",
  };
}
