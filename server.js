import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORT } from "./config.js";
import { loadProfile, saveProfile } from "./store.js";
import { callLLM, callLLMJSON } from "./llm.js";
import { validateExtraction, overdrawn, overdrawnMessage, enforceGoalMarginFraming, answersQuestion, validateText, collectStrings, stripBadSentences, answerFactual, fallbackReply } from "./grounding.js";
import {
  promptAssets,
  promptRisk,
  promptLiquidity,
  promptScenarioQualitative,
  promptScenarioExtract,
  promptScenarioExplain,
  promptGoal,
  promptDecisionExtract,
  promptDecisionExplain,
  promptChatReply,
  promptChatEmotionalCheck,
  promptVoiceExtract,
  categoryLabel,
  buildProfileContext,
} from "./prompts.js";
import { optimizePortfolio, ASSET_ORDER } from "./optimizer.js";
import { evaluateGoal } from "./goalEngine.js";
import { computeLiquidity } from "./liquidityEngine.js";
import { simulateShock } from "./monteCarlo.js";
import { resolveProfileAssets, getLiveRates, applyAssetChanges, normalizeExtractedAssets } from "./assetPricing.js";
import { logEvent, effectiveRiskTolerance, getBehaviorState, getEmotionalEvents, acknowledgeEvent } from "./behaviorStore.js";
import { logInteraction, logProfileSnapshot, getAggregateInsights } from "./dataAsset.js";
import { transcribeAudio } from "./transcribe.js";
import { loadChatHistory, appendChatMessages } from "./chatStore.js";
import { computeFingerprint, loadSnapshot, saveSnapshot } from "./snapshotStore.js";
import { ENGINE_VERSION } from "./marketData.js";
import { dispersionPayload, riskPayload } from "./riskPresenter.js";
import { getNotifications, addNotification, markAllRead } from "./notificationStore.js";
import {
  registerUser,
  verifyLogin,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} from "./auth.js";

/**
 * Profile with live-priced assets AND the behaviour-adjusted risk tolerance attached as `_engineRiskTolerance`, so
 * prompts, the goals engine and the validator all run the engines with the same tolerance (the goals widget and the
 * text on other pages used to be able to disagree by a few months or on feasibility).
 */
// One price snapshot per user for an hour: the gold/dollar tick between two requests used to move "total assets" by a few
// hundred thousand toman from one page to the next. `refresh` (the widgets' force button) takes a new snapshot.
const RATE_PIN_MS = 60 * 60 * 1000;
const ratePins = new Map();

// Persisted to disk (not just kept in memory): a bare in-memory pin is silently forgotten on every server
// restart/crash, so the very first request after a restart re-fetches a fresh live quote — and if gold/USD moved
// even slightly since the last pin, every price-sensitive number derived from that user's holdings (total assets,
// category weights, and therefore the risk score's concentration/cash-erosion terms) shifts, even though nothing
// the user did changed. That produced a real, reported instability: the same risk-tolerance re-tested minutes/
// restarts apart came back with a different score. The file makes the hourly pin survive a restart.
function ratePinFile(userId) {
  return path.join(__dirname, "data", "users", userId, "rate_pin.json");
}
function readRatePinFile(userId) {
  try {
    return JSON.parse(fs.readFileSync(ratePinFile(userId), "utf-8"));
  } catch {
    return null;
  }
}
function writeRatePinFile(userId, pin) {
  try {
    fs.mkdirSync(path.dirname(ratePinFile(userId)), { recursive: true });
    fs.writeFileSync(ratePinFile(userId), JSON.stringify(pin), "utf-8");
  } catch {
    /* the disk copy is only a durability layer; an in-memory pin still works within the same process */
  }
}

async function pinnedRatesFor(userId, refresh) {
  let pin = ratePins.get(userId);
  if (!pin) {
    const onDisk = readRatePinFile(userId);
    if (onDisk) {
      pin = onDisk;
      ratePins.set(userId, pin);
    }
  }
  if (!refresh && pin && Date.now() - pin.at < RATE_PIN_MS) return pin.rates;
  try {
    const rates = await getLiveRates();
    pin = { rates, at: Date.now() };
    ratePins.set(userId, pin);
    writeRatePinFile(userId, pin);
    return rates;
  } catch {
    return pin ? pin.rates : undefined; // no feed: resolveProfileAssets falls back on its own handling
  }
}

async function loadResolvedProfile(userId, { refresh = false } = {}) {
  const profile = await resolveProfileAssets(loadProfile(userId), await pinnedRatesFor(userId, refresh));
  profile._engineRiskTolerance = effectiveRiskTolerance(userId, profile.riskTolerance).effective;
  return profile;
}

/** Blends the profile's self-reported riskTolerance with the behaviorally-learned one (Phase 4) before it reaches the optimizer. */
function profileWithEffectiveRisk(userId, profile) {
  const info = effectiveRiskTolerance(userId, profile.riskTolerance);
  return { profile: { ...profile, riskTolerance: info.effective }, riskInfo: info };
}

/**
 * Wraps a "current portfolio state" widget (دارایی‌ها/ریسک/نقدینگی) with a
 * fingerprint-based cache (see snapshotStore.js): if nothing the user
 * actually controls changed since the last computation, the same stored
 * result is served — live market-rate drift alone never silently changes
 * what's shown. `describeChange(prevResult, nextResult)` may return a
 * {title, message} to record as a notification when a real recomputation
 * produces a different number; return null/undefined to stay silent.
 */
async function withSnapshot(userId, key, force, computeFn, describeChange) {
  const rawProfile = loadProfile(userId);
  const behaviorState = getBehaviorState(userId);
  const fingerprint = computeFingerprint(rawProfile, behaviorState);

  const cached = loadSnapshot(userId, key);
  if (!force && cached && cached.fingerprint === fingerprint) {
    return cached.result;
  }

  const result = await computeFn();

  // a change caused only by a new calculation method (not by the user or the market) is not worth a notification
  if (cached && describeChange && cached.engineVersion === ENGINE_VERSION) {
    const notif = describeChange(cached.result, result);
    if (notif) addNotification(userId, { type: key, ...notif });
  }

  // a result with fallback wording (LLM was down) is served but not cached, so the next visit retries the real text
  if (!result?._degraded) saveSnapshot(userId, key, { fingerprint, result, engineVersion: ENGINE_VERSION, computedAt: new Date().toISOString() });
  return result;
}

// Preset scenario -> deterministic asset-return shock, simulated with real
// statistics (monteCarlo.js) instead of asked to the LLM. Scenarios with no
// tradable-asset shock (e.g. a personal income change) are not listed here
// and fall back to qualitative LLM reasoning.
const PRESET_SHOCKS = {
  usd_up_30: { currency: 0.3 },
  gold_down_20: { gold: -0.2 },
  inflation_spike: { currency: 0.25, gold: 0.2 },
  stock_crash_25: { stock: -0.25 },
  stock_rally_25: { stock: 0.25 },
  rate_hike: { cash: 0.05, stock: -0.05, gold: -0.03 },
};

function allocationArray(weights, total) {
  return ASSET_ORDER.filter((k) => (weights[k] || 0) > 0.0001).map((k) => ({
    category: k,
    label: categoryLabel(k),
    amount: Math.round((weights[k] || 0) * total),
    percent: Math.round((weights[k] || 0) * 1000) / 10,
  }));
}

/**
 * LLM call whose answer is checked against the user's real data before it is used. The model may only explain
 * numbers that exist in the prompt (profile + engine output): an invented amount, or a claim that the user holds an
 * asset class they do not hold, sends the answer back once or twice with the exact problems listed; if it still
 * fails, the offending sentences are cut out instead of shown. `checkCategories:false` for scenario/decision text.
 */
function logDecisionExtraction(userId, entry) {
  // full record of what the user typed and what the model extracted, for diagnosing intermittent misreadings
  try {
    const dir = path.join(__dirname, "data");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "decision_log.jsonl"), JSON.stringify({ at: new Date().toISOString(), userId, ...entry }) + "\n", "utf-8");
  } catch {
    /* logging must never break the request */
  }
}

const GOOD_NEWS = /(کافی\s*است|کمبودی[^.]{0,20}(نمی|نیست)|مشکلی[^.]{0,15}(ندارد|نیست)|مناسب\s*است|کفایت\s*دارد)/;
const NO_TEXT_NOTE = "توضیح متنی هوش مصنوعی الان در دسترس نیست؛ اعداد و نمودارها از موتورهای محاسباتی آمده‌اند و معتبرند. چند دقیقه بعد دوباره تحلیل را اجرا کنید.";
const GROUNDING_ATTEMPTS = 3;
const GROUNDING_DEADLINE_MS = 40000; // a page must never hang for minutes on retries
async function groundedJSON(prompt, profile, { effort = "medium", checkCategories = true, goalFeasible, fallback } = {}) {
  const started = Date.now();
  let feedback = "";
  let last = null;
  let lastVerdict = null;
  for (let i = 0; i < GROUNDING_ATTEMPTS; i++) {
    let result;
    try {
      result = await callLLMJSON(prompt + feedback, { effort, deadlineMs: Math.max(15000, 55000 - (Date.now() - started)) });
    } catch (err) {
      if (last) break; // an earlier answer exists: clean it up below instead of failing
      if (!fallback) throw err;
      // every model failed or returned garbage: the numeric part of the page still works, only the wording is missing
      console.warn(`[grounding] LLM unavailable, sending the deterministic fallback text (${String(err.message).slice(0, 80)})`);
      return { ...fallback(), _degraded: true };
    }
    const verdict = validateText(collectStrings(result).join("\n"), { profile, groundText: prompt, checkCategories, goalFeasible });
    if (verdict.ok) return result;
    last = result;
    lastVerdict = verdict;
    console.warn(`[grounding] attempt ${i + 1} rejected: ${verdict.problems.slice(0, 3).join(" | ")}`);
    if (Date.now() - started > GROUNDING_DEADLINE_MS) break;
    feedback = `

### اصلاح لازم
پاسخ قبلی تو رد شد چون با اطلاعات واقعی کاربر نمی‌خواند:
- ${verdict.problems.slice(0, 5).join("\n- ")}
دوباره بنویس؛ فقط از مبلغ‌ها و دارایی‌های موجود در پروفایل و خروجی موتورها استفاده کن، به دارایی‌هایی که کاربر ندارد اشاره‌ی مالکیتی نکن، با «وضعیت رسیدن به اهداف» و اعداد موتورها مخالفت نکن و جمله‌ها را کوتاه، ساده و به فارسی روان بنویس.`;
  }
  const cleaned = stripBadSentences(last, lastVerdict.badSentences);
  for (const [k, v] of Object.entries(cleaned)) {
    if (typeof v === "string" && !v.trim() && typeof last[k] === "string") cleaned[k] = "توضیح متنی این بخش به‌دلیل نبود اطمینان از انطباق با اطلاعات ثبت‌شده‌ی شما نمایش داده نمی‌شود؛ اعداد بالا از موتورهای محاسباتی آمده‌اند.";
  }
  return cleaned;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function handleAsync(fn) {
  return (req, res) => {
    fn(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: err.message || "خطای داخلی سرور" });
    });
  };
}

/* ---------------- Auth ---------------- */

app.post(
  "/api/auth/register",
  handleAsync(async (req, res) => {
    const { name, email, password } = req.body || {};
    const user = registerUser({ name, email, password });
    const token = createSessionToken(user.id);
    setSessionCookie(res, token);
    res.json({ user });
  })
);

app.post(
  "/api/auth/login",
  handleAsync(async (req, res) => {
    const { email, password } = req.body || {};
    const user = verifyLogin(email, password);
    const token = createSessionToken(user.id);
    setSessionCookie(res, token);
    res.json({ user });
  })
);

app.post("/api/auth/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/* ---------------- Profile ---------------- */

app.get(
  "/api/profile",
  requireAuth,
  handleAsync(async (req, res) => {
    res.json(loadProfile(req.userId));
  })
);

app.post(
  "/api/profile",
  requireAuth,
  handleAsync(async (req, res) => {
    const current = loadProfile(req.userId);
    const updated = { ...current, ...req.body };
    saveProfile(req.userId, updated);
    logProfileSnapshot(req.userId, updated);

    // Onboarding just completed for the first time: seed the behavioral
    // risk model once from the self-reported "how would you react to a
    // 20% drop?" question (Phase 4 — see behaviorStore.js).
    if (!current.onboarded && updated.onboarded) {
      if (updated.emotionalRiskReaction === "می‌فروشم") logEvent(req.userId, "onboarding_seed", "onboardingSellsImmediately", {});
      else if (updated.emotionalRiskReaction === "بی‌تفاوتم یا بیشتر می‌خرم") logEvent(req.userId, "onboarding_seed", "onboardingStaysCalm", {});
    }

    res.json(updated);
  })
);

app.get(
  "/api/live-rates",
  handleAsync(async (req, res) => {
    res.json(await getLiveRates());
  })
);

// Voice-assistant onboarding: the browser records audio and posts the raw
// bytes here; a real transcription model (gpt-4o-transcribe, same provider/
// key as the chat LLM) converts it to Persian text, then promptVoiceExtract
// pulls structure out of what was actually said — it never invents a value
// for something the user didn't mention.
app.post(
  "/api/voice/transcribe",
  requireAuth,
  express.raw({ type: "*/*", limit: "25mb" }),
  handleAsync(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "فایل صوتی دریافت نشد" });
      return;
    }
    const mimeType = req.headers["content-type"] || "audio/webm";
    const text = await transcribeAudio(req.body, mimeType);
    res.json({ text });
  })
);

app.post(
  "/api/voice/extract",
  requireAuth,
  handleAsync(async (req, res) => {
    const transcript = (req.body.transcript || "").trim();
    if (!transcript) {
      res.json({ personal: {}, assets: [], foundKeys: [] });
      return;
    }
    const extracted = await callLLMJSON(promptVoiceExtract(transcript), { effort: "medium" });
    extracted.assets = await normalizeExtractedAssets(extracted.assets);
    res.json(extracted);
  })
);

app.post(
  "/api/goals",
  requireAuth,
  handleAsync(async (req, res) => {
    const profile = loadProfile(req.userId);
    const goal = {
      id: Date.now().toString(36),
      title: req.body.title,
      targetAmount: Number(req.body.targetAmount) || 0,
      targetMonths: Number(req.body.targetMonths) || 0,
      // optional: yearly price growth of what the goal buys (%); empty = the engine's default assumption
      ...(req.body.priceGrowthPercent !== undefined && req.body.priceGrowthPercent !== "" && req.body.priceGrowthPercent !== null && Number.isFinite(Number(req.body.priceGrowthPercent))
        ? { priceGrowthPercent: Math.min(300, Math.max(0, Number(req.body.priceGrowthPercent))) }
        : {}),
    };
    profile.goals = [...(profile.goals || []), goal];
    saveProfile(req.userId, profile);
    res.json(profile);
  })
);

app.delete(
  "/api/goals/:id",
  requireAuth,
  handleAsync(async (req, res) => {
    const profile = loadProfile(req.userId);
    profile.goals = (profile.goals || []).filter((g) => g.id !== req.params.id);
    saveProfile(req.userId, profile);
    res.json(profile);
  })
);

app.post(
  "/api/widgets/assets",
  requireAuth,
  handleAsync(async (req, res) => {
    const result = await withSnapshot(
      req.userId,
      "assets",
      !!req.body?.force,
      async () => {
        const profile = await loadResolvedProfile(req.userId, { refresh: !!req.body?.force });
        const { profile: profileForOpt } = profileWithEffectiveRisk(req.userId, profile);
        const computed = optimizePortfolio(profileForOpt);
        const rawExplanation = await groundedJSON(promptAssets(profile, computed), profile, {
          fallback: () => ({ concentrationWarning: null, strengths: [], weaknesses: [], suggestions: [], summary: NO_TEXT_NOTE }),
        });
        // a wafer-thin-margin goal being "reachable" must never read as a plain strength: enforced here rather than
        // left to the model, since the instruction alone in the prompt was seen to not be followed
        const explanation = enforceGoalMarginFraming(rawExplanation, profile);
        return {
          totalAssets: computed.current.total,
          allocation: allocationArray(computed.current.weights, computed.current.total),
          optimal: allocationArray(computed.optimal.weights, computed.current.total),
          currentStats: {
            expectedReturn: computed.current.expectedReturn,
            volatility: computed.current.volatility,
            liquidityPercent: computed.current.liquidityPercent,
            liquidityTiers: (({ liquidPercent, semiLiquidPercent, illiquidPercent }) => ({ liquidPercent, semiLiquidPercent, illiquidPercent }))(computeLiquidity(profile)),
            riskScore: computed.current.riskScore,
          },
          optimalStats: {
            expectedReturn: computed.optimal.expectedReturn,
            volatility: computed.optimal.volatility,
            liquidityPercent: computed.optimal.liquidityPercent,
            riskScore: computed.optimal.riskScore,
          },
          dispersion: dispersionPayload(computed.current.analysis, computed.optimal.analysis),
          concentrationWarning: explanation.concentrationWarning,
          strengths: explanation.strengths,
          weaknesses: explanation.weaknesses,
          suggestions: explanation.suggestions,
          summary: explanation.summary,
          _degraded: explanation._degraded,
        };
      }
    );
    res.json(result);
  })
);

app.post(
  "/api/widgets/risk",
  requireAuth,
  handleAsync(async (req, res) => {
    const result = await withSnapshot(
      req.userId,
      "risk",
      !!req.body?.force,
      async () => {
        const profile = await loadResolvedProfile(req.userId, { refresh: !!req.body?.force });
        const { profile: profileForOpt, riskInfo } = profileWithEffectiveRisk(req.userId, profile);
        const computed = optimizePortfolio(profileForOpt);
        const explanation = await groundedJSON(promptRisk(profile, computed), profile, {
          fallback: () => ({ reasons: [], behavioralFactors: [], suggestions: [], summary: NO_TEXT_NOTE }),
        });
        return {
          currentRiskScore: computed.current.riskScore,
          suggestedRiskScore: computed.optimal.riskScore,
          difference: computed.optimal.riskScore - computed.current.riskScore,
          riskLevel: computed.current.riskLevel,
          riskToleranceInfo: riskInfo,
          marketRisk: riskPayload(computed.current.analysis, computed.optimal.analysis),
          reasons: explanation.reasons,
          behavioralFactors: explanation.behavioralFactors,
          suggestions: explanation.suggestions,
          summary: explanation.summary,
          _degraded: explanation._degraded,
        };
      },
      (prev, next) => {
        if (prev.currentRiskScore === next.currentRiskScore) return null;
        const dir = next.currentRiskScore > prev.currentRiskScore ? "افزایش" : "کاهش";
        return {
          title: "تغییر ریسک سبد دارایی",
          message: `ریسک فعلی سبد شما از ${prev.currentRiskScore} به ${next.currentRiskScore} از ۱۰۰ ${dir} یافت.`,
        };
      }
    );
    res.json(result);
  })
);

app.post(
  "/api/widgets/liquidity",
  requireAuth,
  handleAsync(async (req, res) => {
    const result = await withSnapshot(req.userId, "liquidity", !!req.body?.force, async () => {
      const profile = await loadResolvedProfile(req.userId, { refresh: !!req.body?.force });
      const computed = computeLiquidity(profile);
      const explanation = await groundedJSON(promptLiquidity(profile, computed), profile, { fallback: () => ({ warnings: [], summary: NO_TEXT_NOTE }) });
      return {
        liquidPercent: computed.liquidPercent,
        semiLiquidPercent: computed.semiLiquidPercent,
        illiquidPercent: computed.illiquidPercent,
        availableByPeriod: computed.availableByPeriod,
        breakdown: computed.breakdown,
        // good news the model put among the warnings (e.g. "the cash buffer is enough") is shown as a note, not as a warning
        warnings: (explanation.warnings || []).filter((w) => !GOOD_NEWS.test(w)),
        notes: (explanation.warnings || []).filter((w) => GOOD_NEWS.test(w)),
        summary: explanation.summary,
        _degraded: explanation._degraded,
      };
    });
    res.json(result);
  })
);

app.post(
  "/api/widgets/goal",
  requireAuth,
  handleAsync(async (req, res) => {
    const profile = await loadResolvedProfile(req.userId);
    const { profile: profileForOpt } = profileWithEffectiveRisk(req.userId, profile);
    const goal = req.body.goal;
    const computed = evaluateGoal(profileForOpt, goal);
    const explanation = await groundedJSON(promptGoal(profile, goal, computed), profile, {
      goalFeasible: computed.feasible,
      fallback: () => ({ suggestedPath: [], risks: [], summary: NO_TEXT_NOTE }),
    });
    res.json({ ...computed, suggestedPath: explanation.suggestedPath, risks: explanation.risks, summary: explanation.summary });
  })
);

app.post(
  "/api/widgets/scenario",
  requireAuth,
  handleAsync(async (req, res) => {
    const profile = await loadResolvedProfile(req.userId);
    const scenario = req.body.scenario || {};
    let shocks = scenario.id && PRESET_SHOCKS[scenario.id] ? PRESET_SHOCKS[scenario.id] : null;
    let scenarioTitle = scenario.title;

    if (!shocks && !scenario.id) {
      const extraction = await callLLMJSON(promptScenarioExtract(scenario.description || scenario.title || ""), {
        effort: "low",
      });
      if (extraction.shocks && Object.keys(extraction.shocks).length) {
        shocks = extraction.shocks;
        scenarioTitle = extraction.scenarioTitle || scenarioTitle;
      }
    }

    if (shocks) {
      const mc = simulateShock(profile, shocks, 8000);
      const explanation = await groundedJSON(promptScenarioExplain(profile, scenarioTitle, mc), profile, {
        checkCategories: false,
        fallback: () => ({ explanation: NO_TEXT_NOTE, recommendation: "" }),
      });
      logInteraction(req.userId, "scenario_run", { scenarioTitle, engine: "monte_carlo", shocks, portfolioChangePercent: mc.portfolio.p50Percent });
      res.json({
        scenarioTitle,
        impactByAsset: mc.impactByAsset.map((a) => ({
          category: a.category,
          label: categoryLabel(a.category),
          changePercent: a.changePercent,
          changeAmount: a.changeAmount,
          p15Percent: Math.round(a.p15 * 1000) / 10,
          p85Percent: Math.round(a.p85 * 1000) / 10,
        })),
        totalPortfolioChangePercent: mc.portfolio.p50Percent,
        totalPortfolioChangeAmount: mc.portfolio.p50Amount,
        confidenceRange: {
          p15Percent: mc.portfolio.p15Percent,
          p85Percent: mc.portfolio.p85Percent,
          p15Amount: mc.portfolio.p15Amount,
          p85Amount: mc.portfolio.p85Amount,
        },
        trials: mc.trials,
        horizonMonths: mc.horizonMonths,
        shockSeveritySd: mc.shockSeveritySd,
        explanation: explanation.explanation,
        recommendation: explanation.recommendation,
      });
    } else {
      const result = await groundedJSON(promptScenarioQualitative(profile, scenario), profile, {
        checkCategories: false,
        fallback: () => ({ scenarioTitle: scenario.title || "", impactByAsset: [], totalPortfolioChangePercent: null, totalPortfolioChangeAmount: null, explanation: NO_TEXT_NOTE, recommendation: "" }),
      });
      logInteraction(req.userId, "scenario_run", { scenarioTitle, engine: "qualitative_llm" });
      res.json(result);
    }
  })
);

app.post(
  "/api/widgets/decision",
  requireAuth,
  handleAsync(async (req, res) => {
    const profile = await loadResolvedProfile(req.userId);
    const decision = req.body.decision;

    // Step 1: LLM turns the free-text decision into structured per-category
    // asset deltas (the one part of this widget that genuinely needs
    // language understanding). Its answer is checked against the user's own text
    // (class named? amount stated?) and retried with the mismatch listed, because
    // it was seen turning «۳۰۰ میلیون از سپرده خرج کنم» into «۲۰۰ میلیون سهام».
    let assetChanges = [];
    let extractionProblems = [];
    let feedback = "";
    for (let i = 0; i < 3; i++) {
      const extraction = await callLLMJSON(promptDecisionExtract(profile, decision) + feedback, { effort: "medium" });
      assetChanges = Array.isArray(extraction.assetChanges) ? extraction.assetChanges : [];
      extractionProblems = validateExtraction(decision.description, decision.amount, assetChanges);
      logDecisionExtraction(req.userId, { description: decision.description, amount: decision.amount || null, attempt: i + 1, assetChanges, problems: extractionProblems });
      if (!extractionProblems.length) break;
      feedback = "\n\n### اصلاح لازم\nاستخراج قبلی تو با متن کاربر نمی‌خواند:\n- " + extractionProblems.join("\n- ") + "\nدوباره استخراج کن؛ فقط دسته‌ها و مبلغ‌هایی که خود کاربر در متن گفته.";
    }
    if (extractionProblems.length) {
      res.json({ infeasible: true, message: "متوجه نشدم دقیقاً چه تصمیمی مدنظر شماست. لطفاً با مبلغ و دارایی مشخص بنویسید، مثلاً «۳۰۰ میلیون از سپرده‌ام را خرج کنم»." });
      return;
    }
    // A decrease larger than what is held is not executable: say so instead of silently clamping it to the balance.
    const over = overdrawn(profile, assetChanges);
    if (over.length) {
      res.json({ infeasible: true, message: overdrawnMessage(over) });
      return;
    }

    // Step 2: apply those deltas to a hypothetical copy of the portfolio and
    // run BOTH the before and after states through the exact same
    // optimizer.js / liquidityEngine.js functions the ریسک‌سنجی and نقدینگی
    // pages use — so this widget can never disagree with them.
    const { profile: beforeForOpt } = profileWithEffectiveRisk(req.userId, profile);
    const beforeOptimized = optimizePortfolio(beforeForOpt);
    const beforeLiquidity = computeLiquidity(profile);

    const afterAssets = await applyAssetChanges(profile, assetChanges, profile._liveRates || undefined);
    const afterProfile = await resolveProfileAssets({ ...profile, assets: afterAssets }, profile._liveRates || undefined);
    const { profile: afterForOpt } = profileWithEffectiveRisk(req.userId, afterProfile);
    const afterOptimized = optimizePortfolio(afterForOpt);
    const afterLiquidity = computeLiquidity(afterProfile);

    const computed = {
      before: { totalAssets: beforeOptimized.current.total, riskScore: beforeOptimized.current.riskScore, liquidPercent: beforeLiquidity.liquidPercent },
      after: { totalAssets: afterOptimized.current.total, riskScore: afterOptimized.current.riskScore, liquidPercent: afterLiquidity.liquidPercent },
    };

    // Step 3: LLM only narrates/recommends based on the numbers computed above.
    const explanation = await groundedJSON(promptDecisionExplain(profile, decision, computed), profile, {
      checkCategories: false,
      fallback: () => ({ decisionSummary: NO_TEXT_NOTE, goalImpact: "", recommendation: null, reasoning: [] }),
    });

    res.json({
      decisionSummary: explanation.decisionSummary,
      before: computed.before,
      after: computed.after,
      goalImpact: explanation.goalImpact,
      recommendation: explanation.recommendation,
      reasoning: explanation.reasoning,
      assetChanges,
    });
  })
);

// Phase 4: revealed preference. The decision widget asks "did you actually
// go through with this?" after showing a recommendation; whether the user
// followed or ignored it nudges the behaviorally-learned risk tolerance.
app.post(
  "/api/behavior/decision-outcome",
  requireAuth,
  handleAsync(async (req, res) => {
    const { followed, recommendation, assetChanges } = req.body;
    let nudgeKey = null;
    if (followed && recommendation === "پیشنهاد نمی‌شود") nudgeKey = "decisionFollowedRisky";
    else if (!followed && recommendation === "پیشنهاد می‌شود") nudgeKey = "decisionAbandonedSafe";
    const state = nudgeKey ? logEvent(req.userId, "decision_outcome", nudgeKey, { followed, recommendation }) : getBehaviorState(req.userId);
    logInteraction(req.userId, "decision_outcome", { followed, recommendation });

    // The user confirmed they actually went through with this decision:
    // apply its structured effect to the real portfolio, not just log it.
    let updatedProfile = null;
    if (followed && Array.isArray(assetChanges) && assetChanges.length) {
      const profile = loadProfile(req.userId);
      profile.assets = await applyAssetChanges(profile, assetChanges);
      saveProfile(req.userId, profile);
      updatedProfile = profile;
    }

    res.json({ ...state, profile: updatedProfile });
  })
);

app.get(
  "/api/emotional-alerts",
  requireAuth,
  handleAsync(async (req, res) => {
    res.json({ alerts: getEmotionalEvents(req.userId) });
  })
);

// "حواسم هست" — dismisses one alert from the list. Does not touch the behavioral risk-tolerance
// nudge that event already caused; that reflects something real the user did.
app.post(
  "/api/emotional-alerts/:id/ack",
  requireAuth,
  handleAsync(async (req, res) => {
    acknowledgeEvent(req.userId, req.params.id);
    res.json({ alerts: getEmotionalEvents(req.userId) });
  })
);

app.get(
  "/api/notifications",
  requireAuth,
  handleAsync(async (req, res) => {
    res.json({ notifications: getNotifications(req.userId) });
  })
);

app.post(
  "/api/notifications/read-all",
  requireAuth,
  handleAsync(async (req, res) => {
    res.json({ notifications: markAllRead(req.userId) });
  })
);

app.get(
  "/api/insights",
  requireAuth,
  handleAsync(async (req, res) => {
    res.json(getAggregateInsights());
  })
);

app.get(
  "/api/chat/history",
  requireAuth,
  handleAsync(async (req, res) => {
    res.json({ messages: loadChatHistory(req.userId) });
  })
);

// Streams the chat reply live (word-by-word) as Server-Sent Events instead
// of waiting for the full LLM response. Each event is a JSON line:
//   {"type":"delta","text":"..."}      — one more chunk of the reply
//   {"type":"emotional",...}           — emotional-reaction check result (sent once, at the end)
//   {"type":"error","message":"..."}   — only if something failed mid-stream
// followed by a final "data: [DONE]\n\n". The emotional check runs
// concurrently with the streamed reply so it doesn't add extra latency.
app.post("/api/chat", requireAuth, (req, res) => {
  (async () => {
    const userId = req.userId;
    const profile = await loadResolvedProfile(userId);
    const { message } = req.body;

    // The server's own persisted history is the source of truth for context
    // (not whatever the client happened to have in memory) — this is what
    // gives the chat real memory across page reloads and later visits, and
    // keeps a lost/cleared client-side state from silently truncating what
    // the assistant remembers.
    const groundText = buildProfileContext(profile);
    // earlier assistant turns that contradict the profile (from before this check existed, or a weak model) are
    // dropped from the context so the model cannot imitate them
    const storedHistory = loadChatHistory(userId);
    const priorHistory = storedHistory.filter(
      (h) => h.role !== "assistant" || validateText(h.content, { profile, groundText, userMessage: "" }).ok
    );
    appendChatMessages(userId, [{ role: "user", content: message, at: new Date().toISOString() }]);

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const emotionalPromise = callLLMJSON(promptChatEmotionalCheck(message, priorHistory), { effort: "low" }).catch(
      () => ({ flag: false, reason: null, message: null })
    );

    // Plain factual questions ("how much gold do I have?") are answered from the profile, not by the model.
    // Everything else is generated, validated against the profile, retried with the problems listed, and only
    // then shown (as a simulated stream, since nothing unvalidated may reach the user).
    let fullReply = answerFactual(profile, message);
    if (!fullReply) {
      const prompt = promptChatReply(profile, message, priorHistory);
      let feedback = "";
      let text = "";
      let verdict = null;
      for (let i = 0; i < GROUNDING_ATTEMPTS; i++) {
        text = (await callLLM(prompt + feedback, { effort: "medium" })).trim();
        verdict = validateText(text, { profile, groundText, userMessage: message });
        if (verdict.ok && !answersQuestion(message, text)) {
          verdict = { ok: false, problems: ["پاسخ به سؤال کاربر مربوط نیست؛ مستقیم به همین پرسش جواب بده: «" + message.slice(0, 200) + "»"], badSentences: [] };
        }
        if (verdict.ok) break;
        console.warn(`[grounding] chat attempt ${i + 1} rejected: ${verdict.problems.slice(0, 3).join(" | ")}`);
        feedback = `

### اصلاح لازم
پاسخ قبلی تو رد شد چون با اطلاعات واقعی کاربر نمی‌خواند:
- ${verdict.problems.slice(0, 5).join("\n- ")}
دوباره و کوتاه‌تر بنویس؛ فقط از «واقعیت‌های قطعی» و پروفایل استفاده کن، عدد یا هدف یا دارایی نساز و مستقیم به همان چیزی که کاربر پرسیده جواب بده.`;
      }
      if (!verdict.ok) {
        const kept = stripBadSentences(text, verdict.badSentences);
        fullReply = verdict.badSentences.length && kept.length >= 40 ? kept : fallbackReply(profile);
      } else {
        fullReply = text;
      }
    }
    for (const chunk of fullReply.match(/\S+\s*/g) || [fullReply]) {
      res.write(`data: ${JSON.stringify({ type: "delta", text: chunk })}

`);
      await new Promise((r) => setTimeout(r, 12));
    }
    appendChatMessages(userId, [{ role: "assistant", content: fullReply, at: new Date().toISOString() }]);

    const emotional = await emotionalPromise;
    if (emotional && emotional.flag) {
      logEvent(userId, "chat_emotional", "emotionalFlag", { reason: emotional.reason, message: emotional.message });
      addNotification(userId, {
        type: "emotional_alert",
        title: "هشدار تصمیم هیجانی",
        message: emotional.message || emotional.reason || "یک پیام شما نشانه‌ی واکنش هیجانی به بازار داشت.",
      });
    }
    res.write(`data: ${JSON.stringify({ type: "emotional", ...emotional })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  })().catch((err) => {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "خطای داخلی سرور" });
    } else {
      try {
        res.write(`data: ${JSON.stringify({ type: "error", message: err.message || "خطای داخلی سرور" })}\n\n`);
      } catch {
        /* ignore */
      }
      res.end();
    }
  });
});

app.listen(PORT, () => {
  console.log(`FinMind server running at http://localhost:${PORT}`);
});
