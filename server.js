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
  promptGoal,
  promptScenario,
  promptDecision,
  promptChat,
} from "./prompts.js";

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
    res.json(updated);
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
    const profile = loadProfile();
    const result = await callLLMJSON(promptAssets(profile), { effort: "medium" });
    res.json(result);
  })
);

app.post(
  "/api/widgets/risk",
  handleAsync(async (req, res) => {
    const profile = loadProfile();
    const result = await callLLMJSON(promptRisk(profile), { effort: "medium" });
    res.json(result);
  })
);

app.post(
  "/api/widgets/liquidity",
  handleAsync(async (req, res) => {
    const profile = loadProfile();
    const result = await callLLMJSON(promptLiquidity(profile), { effort: "medium" });
    res.json(result);
  })
);

app.post(
  "/api/widgets/goal",
  handleAsync(async (req, res) => {
    const profile = loadProfile();
    const goal = req.body.goal;
    const result = await callLLMJSON(promptGoal(profile, goal), { effort: "medium" });
    res.json(result);
  })
);

app.post(
  "/api/widgets/scenario",
  handleAsync(async (req, res) => {
    const profile = loadProfile();
    const scenario = req.body.scenario;
    const result = await callLLMJSON(promptScenario(profile, scenario), { effort: "medium" });
    res.json(result);
  })
);

app.post(
  "/api/widgets/decision",
  handleAsync(async (req, res) => {
    const profile = loadProfile();
    const decision = req.body.decision;
    const result = await callLLMJSON(promptDecision(profile, decision), { effort: "medium" });
    res.json(result);
  })
);

app.post(
  "/api/chat",
  handleAsync(async (req, res) => {
    const profile = loadProfile();
    const { message, history } = req.body;
    const result = await callLLMJSON(promptChat(profile, message, history), { effort: "medium" });
    res.json(result);
  })
);

app.listen(PORT, () => {
  console.log(`FinMind server running at http://localhost:${PORT}`);
});
