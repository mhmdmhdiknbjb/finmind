import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const USERS_DATA_DIR = path.join(DATA_DIR, "users");

const DEFAULT_PROFILE = {
  onboarded: false,
  personal: {
    age: null,
    gender: null,
    maritalStatus: null,
    childrenCount: null,
    employmentType: null,
    housingStatus: null,
  },
  riskTolerance: 5,
  investmentExperience: null,
  emotionalRiskReaction: null,
  monthlyIncome: null,
  monthlyExpenses: null,
  existingDebt: null,
  timeHorizonNote: "",
  liquidityNeedNote: "",
  mainGoalDescription: "",
  freeNotes: "",
  assets: [],
  goals: [],
};

function userDir(userId) {
  return path.join(USERS_DATA_DIR, userId);
}

function profileFile(userId) {
  return path.join(userDir(userId), "profile.json");
}

function ensureUserDir(userId) {
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadProfile(userId) {
  ensureUserDir(userId);
  const file = profileFile(userId);
  if (!fs.existsSync(file)) {
    saveProfile(userId, DEFAULT_PROFILE);
    return structuredClone(DEFAULT_PROFILE);
  }
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return { ...structuredClone(DEFAULT_PROFILE), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export function saveProfile(userId, profile) {
  ensureUserDir(userId);
  fs.writeFileSync(profileFile(userId), JSON.stringify(profile, null, 2), "utf-8");
  return profile;
}
