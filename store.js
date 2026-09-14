import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const PROFILE_FILE = path.join(DATA_DIR, "profile.json");

const DEFAULT_PROFILE = {
  personal: {
    age: null,
    gender: null,
    maritalStatus: null,
    childrenCount: null,
  },
  riskTolerance: 5,
  monthlyIncome: null,
  monthlyExpenses: null,
  timeHorizonNote: "",
  liquidityNeedNote: "",
  assets: [],
  goals: [],
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadProfile() {
  ensureDataDir();
  if (!fs.existsSync(PROFILE_FILE)) {
    saveProfile(DEFAULT_PROFILE);
    return structuredClone(DEFAULT_PROFILE);
  }
  try {
    const raw = fs.readFileSync(PROFILE_FILE, "utf-8");
    return { ...structuredClone(DEFAULT_PROFILE), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export function saveProfile(profile) {
  ensureDataDir();
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2), "utf-8");
  return profile;
}
