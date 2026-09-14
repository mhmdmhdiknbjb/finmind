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
 * aggregated across many real users in a deployed (multi-tenant) version of
 * this product, becomes the thing competitors running a bare LLM-wrapper
 * cannot replicate — structured Iranian-household financial-behavior data
 * (which scenarios people actually worry about, how allocation choices
 * relate to age/risk band, how often a recommendation is actually followed).
 *
 * In this single-user local prototype it's necessarily thin (n=1), so
 * getAggregateInsights() is a demonstration of the pipeline, not a claim of
 * a competitive moat yet. Every record is deliberately aggregate/structural
 * — asset *categories* and *percentages*, age/risk *bands*, never raw
 * amounts, names, or other PII — so the same logger is safe to point at a
 * real multi-user deployment later without a schema rewrite.
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

export function logInteraction(type, payload) {
  ensureDataDir();
  const record = { ts: new Date().toISOString(), type, ...payload };
  fs.appendFileSync(FILE, JSON.stringify(record) + "\n", "utf-8");
}

export function logProfileSnapshot(profile) {
  logInteraction("profile_snapshot", {
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
    note: "این خلاصه از داده‌ی همین یک جلسه (n=1) ساخته شده — ارزش واقعی این دیتاست وقتی ظاهر می‌شود که در نسخه‌ی چندکاربره، این رویدادها از کاربران زیادی تجمیع شوند.",
  };
}
