import { API_BASE_URL, API_KEY, MODELS } from "./config.js";

// Only reasoning-family models (o-series, gpt-5-*) accept the `reasoning`
// param; sending it to a non-reasoning model like gpt-4o-mini breaks the
// upstream call.
const supportsReasoning = (model) => /^openai\/(o\d|gpt-5)/.test(model);

const REQUEST_TIMEOUT_MS = 45000;

/**
 * Model fallback. The provider (Parspack) has repeatedly answered "all providers failed" (HTTP 424, or an SSE
 * error event inside a 200 stream) for whole model families while others kept working. A model that fails is
 * skipped for COOLDOWN_MS so one dead model does not add its (up to 20 s) failure delay to every request; if
 * every model is cooling down they are all tried again. Only errors from the LLM call itself trigger a fallback.
 */
const COOLDOWN_MS = 10 * 60 * 1000;
const downUntil = new Map();

function candidateModels() {
  const now = Date.now();
  const up = MODELS.filter((m) => !(downUntil.get(m) > now));
  return up.length ? up : MODELS;
}

async function withFallback(run) {
  let lastErr;
  for (const model of candidateModels()) {
    try {
      const out = await run(model);
      downUntil.delete(model);
      return out;
    } catch (err) {
      lastErr = err;
      downUntil.set(model, Date.now() + COOLDOWN_MS);
      console.warn(`[llm] ${model} failed (${String(err.message).slice(0, 120)}) — trying the next model`);
    }
  }
  throw lastErr;
}

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

async function callOnce(model, input, effort) {
  const res = await fetch(`${API_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input,
      ...(supportsReasoning(model) ? { reasoning: { effort } } : {}),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM API error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  return extractOutputText(data);
}

export async function callLLM(input, { effort = "medium" } = {}) {
  return withFallback((model) => callOnce(model, input, effort));
}

/**
 * Streams a plain-text completion, invoking `onDelta(chunk)` as each token
 * arrives from the Responses API's SSE stream (event type
 * "response.output_text.delta"). Used for the chat widget so the reply
 * appears live/word-by-word instead of popping in all at once when the
 * full response finishes. Resolves with the full concatenated text.
 *
 * A failing model is detected before any text is shown (HTTP error, an SSE `error` event, or an empty stream)
 * and the next model takes over; once text has started flowing an error is thrown, never silently swapped.
 */
export async function streamLLM(input, { effort = "medium" } = {}, onDelta) {
  return withFallback((model) => streamOnce(model, input, effort, onDelta));
}

async function streamOnce(model, input, effort, onDelta) {
  const res = await fetch(`${API_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input,
      stream: true,
      ...(supportsReasoning(model) ? { reasoning: { effort } } : {}),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
      // the provider reports upstream failures as `data: {"error": {...}}` inside an HTTP 200 stream
      if (evt.error) throw new Error(`LLM stream error: ${JSON.stringify(evt.error).slice(0, 300)}`);
      if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
        full += evt.delta;
        onDelta(evt.delta);
      }
    }
  }
  if (!full) throw new Error("LLM stream ended without any text");
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

/**
 * JSON call: an unparseable answer (a weak model echoing the prompt, wrong format) makes THIS call try the next
 * model, but does not put the model on cooldown — that is a quality problem of one answer, not an outage.
 */
export async function callLLMJSON(input, { effort = "medium" } = {}) {
  let lastErr;
  for (const model of candidateModels()) {
    try {
      const parsed = parseJSONLoose(await callOnce(model, input, effort));
      downUntil.delete(model);
      return parsed;
    } catch (err) {
      lastErr = err;
      if (!String(err.message).startsWith("Failed to parse JSON")) downUntil.set(model, Date.now() + COOLDOWN_MS);
      console.warn(`[llm] ${model} failed (${String(err.message).slice(0, 120)}) — trying the next model`);
    }
  }
  throw lastErr;
}
