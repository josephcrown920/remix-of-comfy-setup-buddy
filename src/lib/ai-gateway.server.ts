import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const AI_MODEL = "google/gemini-3-flash-preview";

/** Lovable AI Gateway provider; create one per request. */
export function aiProvider() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured.");
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
}

export function friendlyAiError(e: unknown): Error {
  const status = (e as any)?.statusCode ?? (e as any)?.status;
  if (status === 429) return new Error("The assistant is busy — wait a moment and try again.");
  if (status === 402) return new Error("AI credits are used up. Add credits in your workspace billing to keep using the assistant.");
  return new Error("The assistant couldn't answer. Please try again.");
}
