import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";

export const AI_MODEL = "openai/gpt-6-astra";

/** One-shot Lovable AI call (streamed, consumed server-side) returning the final text. */
export async function askAi(system: string, messages: ModelMessage[], effort: "low" | "medium" = "low") {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured.");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  let failure: unknown = null;
  const result = streamText({
    model: provider.responses(AI_MODEL),
    system,
    messages,
    onError: ({ error }) => { failure = error; },
    providerOptions: {
      openai: { store: false, forceReasoning: true, reasoningEffort: effort, reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
    },
  });
  let text = "";
  try { text = await result.text; } catch (e) { failure = e; }
  if (failure) throw friendlyAiError(failure);
  if (!text.trim()) throw new Error("The assistant returned an empty answer. Please try again.");
  return text;
}

export function friendlyAiError(e: unknown): Error {
  const status = (e as any)?.statusCode ?? (e as any)?.status ?? (e as any)?.cause?.statusCode;
  if (status === 429) return new Error("The assistant is busy — wait a moment and try again.");
  if (status === 402) return new Error("AI credits are used up. Add credits in your workspace billing to keep using the assistant.");
  console.error("AI call failed", e);
  return new Error("The assistant couldn't answer. Please try again.");
}
