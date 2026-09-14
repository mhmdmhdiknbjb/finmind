import { API_BASE_URL, API_KEY, MODEL } from "./config.js";

// Only reasoning-family models (o-series, gpt-5-*) accept the `reasoning`
// param; sending it to a non-reasoning model like gpt-4o-mini breaks the
// upstream call.
const SUPPORTS_REASONING = /^openai\/(o\d|gpt-5)/.test(MODEL);

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
      ...(SUPPORTS_REASONING ? { reasoning: { effort } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM API error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  return extractOutputText(data);
}

/**
 * Streams a plain-text completion, invoking `onDelta(chunk)` as each token
 * arrives from the Responses API's SSE stream (event type
 * "response.output_text.delta"). Used for the chat widget so the reply
 * appears live/word-by-word instead of popping in all at once when the
 * full response finishes. Resolves with the full concatenated text.
 */
export async function streamLLM(input, { effort = "medium" } = {}, onDelta) {
  const res = await fetch(`${API_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input,
      stream: true,
      ...(SUPPORTS_REASONING ? { reasoning: { effort } } : {}),
    }),
  });
  if (!res.ok || !res.body) {
    const body = res.body ? await res.text() : "";
    throw new Error(`LLM stream API error ${res.status}: ${body.slice(0, 500)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // last (possibly incomplete) line stays in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let evt;
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
        full += evt.delta;
        onDelta(evt.delta);
      }
    }
  }
  return full;
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
