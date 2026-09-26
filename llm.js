import { API_BASE_URL, API_KEY, MODELS } from "./config.js";

// Only reasoning-family models (o-series, gpt-5-*) accept the `reasoning`
// param; sending it to a non-reasoning model like gpt-4o-mini breaks the
// upstream call.
const supportsReasoning = (model) => /^openai\/(o\d|gpt-5)/.test(model);

const REQUEST_TIMEOUT_MS = 30000;

// Output cap sent as `max_output_tokens`. Without an explicit cap the provider's default cut long Persian JSON in the
// middle of a sentence ("... از 45,000,000 تومان به 31,500,") and the answer could not be parsed. Reasoning models
// spend part of the cap on hidden reasoning, so they get more room.
const MAX_OUT_TOKENS = 3500;
const MAX_OUT_TOKENS_REASONING = 8000;
const outCap = (model, boost = 1) => (supportsReasoning(model) ? MAX_OUT_TOKENS_REASONING : MAX_OUT_TOKENS) * boost;

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

/** One non-streamed call. Resolves {text, truncated}: truncated = the model stopped because it hit the output cap. */
async function callRaw(model, input, effort, boost = 1) {
  const res = await fetch(`${API_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input,
      max_output_tokens: outCap(model, boost),
      ...(supportsReasoning(model) ? { reasoning: { effort } } : {}),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM API error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const truncated = data.status === "incomplete" && /max_(output_)?tokens|length/.test(JSON.stringify(data.incomplete_details || ""));
  return { text: extractOutputText(data), truncated };
}

async function callOnce(model, input, effort) {
  return (await callRaw(model, input, effort)).text;
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
      max_output_tokens: outCap(model),
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

/**
 * Best-effort repair of JSON that was cut off mid-way (output cap, dropped connection): closes an open string, drops a
 * dangling key or comma and closes every open bracket. Fields after the cut are simply missing.
 */
export function repairTruncatedJSON(text) {
  const t = stripCodeFence(text);
  const start = t.indexOf("{");
  if (start === -1) throw new Error("no JSON object to repair");
  let out = t.slice(start);
  const stack = [];
  let inStr = false;
  let esc = false;
  for (const ch of out) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (esc) out = out.slice(0, -1);
  if (inStr) {
    // the cut string is a half sentence: keep only its complete sentences (if it has none, keep it and close it)
    const open = out.lastIndexOf('"');
    const tail = out.slice(open + 1);
    const cut = Math.max(tail.lastIndexOf(". "), tail.lastIndexOf("؟"), tail.lastIndexOf("! "), tail.endsWith(".") ? tail.length - 1 : -1);
    out = cut > 0 ? out.slice(0, open + 1) + tail.slice(0, cut + 1) : out;
    out += '"';
  }
  out = out.replace(/,\s*$/, "").replace(/,?\s*"[^"]*"\s*:\s*$/, "");
  while (stack.length) out += stack.pop() === "{" ? "}" : "]";
  return JSON.parse(out);
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
export async function callLLMJSON(input, { effort = "medium", deadlineMs = 50000 } = {}) {
  let lastErr;
  const started = Date.now();
  for (const model of candidateModels()) {
    // do not start another model once the time budget is spent: the caller (a page waiting for this) must not hang
    if (lastErr && Date.now() - started > deadlineMs) break;
    try {
      let raw = await callRaw(model, input, effort);
      if (raw.truncated) {
        console.warn(`[llm] ${model} output hit the token cap — retrying with a larger cap`);
        raw = await callRaw(model, input, effort, 2);
      }
      let parsed;
      try {
        parsed = parseJSONLoose(raw.text);
      } catch (parseErr) {
        // a still-truncated answer is repaired (missing tail fields) rather than failing the whole request
        // the provider does not always flag a cut-off answer: text that stops without a closing bracket is repaired too
        if (!raw.truncated && /[}\]]\s*(`{3})?\s*$/.test(raw.text)) throw parseErr; // looks complete: a real format problem
        parsed = repairTruncatedJSON(raw.text);
      }
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
