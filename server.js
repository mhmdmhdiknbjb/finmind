import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORT } from "./config.js";
import { loadProfile, saveProfile } from "./store.js";
import { callLLMJSON } from "./llm.js";
import {
  promptAssets,
  promptRisk,
  promptLiquidity,
  promptScenarioQualitative,
  promptScenarioExtract,
  promptScenarioExplain,
  promptGoal,
  promptDecision,
  promptChat,
  categoryLabel,
} from "./prompts.js";
import { optimizePortfolio, ASSET_ORDER } from "./optimizer.js";
import { computeLiquidity } from "./liquidityEngine.js";
import { simulateShock } from "./monteCarlo.js";
import { resolveProfileAssets, getLiveRates } from "./assetPricing.js";
import { logEvent, effectiveRiskTolerance, getBehaviorState } from "./behaviorStore.js";
import { logInteraction, logProfileSnapshot, getAggregateInsights } from "./dataAsset.js";

/** Blends the profile's self-reported riskTolerance with the behaviorally-learned one (Phase 4) before it reaches the optimizer. */
function profileWithEffectiveRisk(profile) {
  const info = effectiveRiskTolerance(profile.riskTolerance);
  return { profile: { ...profile, riskTolerance: info.effective }, riskInfo: info };
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function handleAsync(fn) {
  return (req, res) => {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message || "خطای داخلی سرور" });
    });
  };
}

app.get(
  "/api/profile",
  handleAsync(async (req, res) => {
    res.json(loadProfile());
  })
);

app.post(
  "/api/profile",
  handleAsync(async (req, res) => {
    const current = loadProfile();
    const updated = { ...current, ...req.body };
    saveProfile(updated);
    logProfileSnapshot(updated);
    res.json(updated);
  })
);

app.get(
  "/api/live-rates",
  handleAsync(async (req, res) => {
    res.json(await getLiveRates());
  })
);

app.post(
  "/api/goals",
  handleAsync(async (req, res) => {
    const profile = loadProfile();
    const goal = {
      id: Date.now().toString(36),
      title: req.body.title,
      targetAmount: Number(req.body.targetAmount) || 0,
      targetMonths: Number(req.body.targetMonths) || 0,
    };
    profile.goals = [...(profile.goals || []), goal];
    saveProfile(profile);
    res.json(profile);
  })
);

app.delete(
  "/api/goals/:id",
  handleAsync(async (req, res) => {
    const profile = loadProfile();
    profile.goals = (profile.goals || []).filter((g) => g.id !== req.params.id);
    saveProfile(profile);
    res.json(profile);
  })
);

app.post(
  "/api/widgets/assets",
  handleAsync(async (req, res) => {
    const profile = await resolveProfileAssets(loadProfile());
    const { profile: profileForOpt } = profileWithEffectiveRisk(profile);
    const computed = optimizePortfolio(profileForOpt);
    const explanation = await callLLMJSON(promptAssets(profile, computed), { effort: "medium" });

    res.json({
      totalAssets: computed.current.total,
      allocation: allocationArray(computed.current.weights, computed.current.total),
      optimal: allocationArray(computed.optimal.weights, computed.current.total),
      currentStats: {
        expectedReturn: computed.current.expectedReturn,
        volatility: computed.current.volatility,
        liquidityPercent: computed.current.liquidityPercent,
      },
      optimalStats: {
        expectedReturn: computed.optimal.expectedReturn,
        volatility: computed.optimal.volatility,
        liquidityPercent: computed.optimal.liquidityPercent,
      },
      concentrationWarning: explanation.concentrationWarning,
      strengths: explanation.strengths,
      weaknesses: explanation.weaknesses,
      suggestions: explanation.suggestions,
      summary: explanation.summary,
    });
  })
);

app.post(
  "/api/widgets/risk",
  handleAsync(async (req, res) => {
    const profile = await resolveProfileAssets(loadProfile());
    const { profile: profileForOpt, riskInfo } = profileWithEffectiveRisk(profile);
    const computed = optimizePortfolio(profileForOpt);
    const explanation = await callLLMJSON(promptRisk(profile, computed), { effort: "medium" });
    res.json({
      currentRiskScore: computed.current.riskScore,
      suggestedRiskScore: computed.optimal.riskScore,
      difference: computed.optimal.riskScore - computed.current.riskScore,
      riskLevel: computed.current.riskLevel,
      riskToleranceInfo: riskInfo,
      reasons: explanation.reasons,
      behavioralFactors: explanation.behavioralFactors,
      suggestions: explanation.suggestions,
      summary: explanation.summary,
    });
  })
);

app.post(
  "/api/widgets/liquidity",
  handleAsync(async (req, res) => {
    const profile = await resolveProfileAssets(loadProfile());
    const computed = computeLiquidity(profile);
    const explanation = await callLLMJSON(promptLiquidity(profile, computed), { effort: "medium" });
    res.json({
      liquidPercent: computed.liquidPercent,
      semiLiquidPercent: computed.semiLiquidPercent,
      illiquidPercent: computed.illiquidPercent,
      availableByPeriod: computed.availableByPeriod,
      breakdown: computed.breakdown,
      warnings: explanation.warnings,
      summary: explanation.summary,
    });
  })
);

app.post(
  "/api/widgets/goal",
  handleAsync(async (req, res) => {
    const profile = await resolveProfileAssets(loadProfile());
    const goal = req.body.goal;
    const result = await callLLMJSON(promptGoal(profile, goal), { effort: "medium" });
    res.json(result);
  })
);

app.post(
  "/api/widgets/scenario",
  handleAsync(async (req, res) => {
    const profile = await resolveProfileAssets(loadProfile());
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
      const explanation = await callLLMJSON(promptScenarioExplain(profile, scenarioTitle, mc), { effort: "medium" });
      logInteraction("scenario_run", { scenarioTitle, engine: "monte_carlo", shocks, portfolioChangePercent: mc.portfolio.p50Percent });
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
        explanation: explanation.explanation,
        recommendation: explanation.recommendation,
      });
    } else {
      const result = await callLLMJSON(promptScenarioQualitative(profile, scenario), { effort: "medium" });
      logInteraction("scenario_run", { scenarioTitle, engine: "qualitative_llm" });
      res.json(result);
    }
  })
);

app.post(
  "/api/widgets/decision",
  handleAsync(async (req, res) => {
    const profile = await resolveProfileAssets(loadProfile());
    const decision = req.body.decision;
    const result = await callLLMJSON(promptDecision(profile, decision), { effort: "medium" });
    res.json(result);
  })
);

// Phase 4: revealed preference. The decision widget asks "did you actually
// go through with this?" after showing a recommendation; whether the user
// followed or ignored it nudges the behaviorally-learned risk tolerance.
app.post(
  "/api/behavior/decision-outcome",
  handleAsync(async (req, res) => {
    const { followed, recommendation } = req.body;
    let nudgeKey = null;
    if (followed && recommendation === "پیشنهاد نمی‌شود") nudgeKey = "decisionFollowedRisky";
    else if (!followed && recommendation === "پیشنهاد می‌شود") nudgeKey = "decisionAbandonedSafe";
    const state = nudgeKey ? logEvent("decision_outcome", nudgeKey, { followed, recommendation }) : getBehaviorState();
    logInteraction("decision_outcome", { followed, recommendation });
    res.json(state);
  })
);

app.get(
  "/api/insights",
  handleAsync(async (req, res) => {
    res.json(getAggregateInsights());
  })
);

app.post(
  "/api/chat",
  handleAsync(async (req, res) => {
    const profile = await resolveProfileAssets(loadProfile());
    const { message, history } = req.body;
    const result = await callLLMJSON(promptChat(profile, message, history), { effort: "medium" });
    if (result.emotional && result.emotional.flag) {
      logEvent("chat_emotional", "emotionalFlag", { reason: result.emotional.reason });
    }
    res.json(result);
  })
);

app.listen(PORT, () => {
  console.log(`FinMind server running at http://localhost:${PORT}`);
});
