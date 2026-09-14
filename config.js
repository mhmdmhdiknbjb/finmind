import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

export const API_BASE_URL = process.env.FINMIND_API_BASE_URL || "https://ai.parspack.com/v1";
export const API_KEY = process.env.FINMIND_API_KEY || "";
export const MODEL = "openai/gpt-4o-mini-2024-07-18";
export const PORT = process.env.PORT || 4173;

if (!API_KEY) {
  console.warn("هشدار: FINMIND_API_KEY تنظیم نشده است. فایل .env را بر اساس .env.example بسازید.");
}
