import { API_BASE_URL, API_KEY, MODEL } from "./config.js";

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.length) return data.output_text;
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === "output_text" && c.text) return c.text;
        }
      }
    }
  }
  throw new Error("No output_text found in LLM response: " + JSON.stringify(data).slice(0, 500));
}

export async function callLLM(input, { effort = "medium" } = {}) {
  const res = await fetch(`${API_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input,
      reasoning: { effort },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM API error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  return extractOutputText(data);
}

function stripCodeFence(text) {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
  }
  return t.trim();
}

export function parseJSONLoose(text) {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("Failed to parse JSON from LLM output: " + cleaned.slice(0, 500));
  }
}

export async function callLLMJSON(input, opts = {}) {
  const text = await callLLM(input, opts);
  return parseJSONLoose(text);
}
