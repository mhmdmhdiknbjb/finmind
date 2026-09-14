import { API_BASE_URL, API_KEY } from "./config.js";

/**
 * Server-side speech-to-text for the voice-assistant onboarding, via the
 * same LLM provider/API key already used for chat (ai.parspack.com),
 * model "openai/gpt-4o-transcribe" — a real transcription model, not the
 * browser's built-in (and inconsistently supported) Web Speech API.
 */
export async function transcribeAudio(buffer, mimeType = "audio/webm") {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), "audio.webm");
  form.append("model", "openai/gpt-4o-transcribe");
  form.append("language", "fa");

  const res = await fetch(`${API_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Transcription API error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  return data.text || "";
}
