import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WORKFLOWS } from "@/lib/comfy/workflows";
import { askAi } from "@/lib/ai-gateway.server";

const AGENT_WORKFLOWS = WORKFLOWS.filter((w) => !String(w.id).startsWith("modelark") && w.id !== "perform-anywhere-seedance" && w.id !== "custom-workflow");

const catalog = () =>
  AGENT_WORKFLOWS.map((w) => `- ${w.id} (${w.category}): ${w.name} — ${w.description}\n  fields: ${w.params.map((p) => `${p.key}:${p.type}${p.options ? `[${p.options.join("|")}]` : ""}${p.min != null ? ` ${p.min}-${p.max}` : ""}`).join(", ")}`).join("\n");

const STUDIO_CONTEXT = () => `You are the built-in assistant of Aurora Studio, a beginner-friendly web app that drives the user's own ComfyUI GPU server(s).
Pages: Dashboard, Workflows (templates + custom ComfyUI JSON), Apps (share a workflow as a mini-app), Assistant, Jobs, Gallery, Settings (connect GPU servers, routing: auto picks the healthiest least-busy GPU that has the needed nodes; manual pins one).
Workflow templates:
${catalog()}
Guidelines: speak plainly for beginners; keep answers short and actionable; use markdown lists. ComfyUI API workflows are JSON graphs where each node has class_type and inputs, and ["3", 0] means output 0 of node 3. If no GPU is connected, point them to Settings. A free 16 GB T4 can't run heavy video models — suggest lighter templates.`;

export const assistantChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(40),
      workflowJson: z.string().max(100_000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const system = STUDIO_CONTEXT() + (data.workflowJson ? `\n\nThe user is editing this workflow JSON:\n\`\`\`json\n${data.workflowJson.slice(0, 8000)}\n\`\`\`` : "");
    return { reply: await askAi(system, data.messages) };
  });

type Shot = { order: number; beat: string; prompt: string; durationSec: number; camera: string; transition: string; caption: string };

const MODE_GUIDE = {
  cinematic: "Cinematic mode: 16:9, ~15s, 3 beats (establishing atmosphere, character/focus beat, climax/reveal), lens/camera/lighting continuity, slow push-ins, parallax, dissolves and match cuts.",
  viral: "Viral mode: 9:16, ~9s, hook-first: thumb-stop hook (≤2s), fast core beat, call-to-action; rapid cuts, speed ramps, punchy on-screen captions.",
  standard: "Standard mode: balanced 16:9 storyboard, ~10s, 2–3 clear beats.",
} as const;

/** Video agent: plans shots for an idea and picks + fills the best workflow template. */
export const planVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ idea: z.string().trim().min(1).max(4000), mode: z.enum(["cinematic", "viral", "standard"]) }).parse(d))
  .handler(async ({ data }) => {
    const system = `${STUDIO_CONTEXT()}

You are acting as the video agent. ${MODE_GUIDE[data.mode]}
Plan the shots, then choose the ONE template above that best executes the idea and fill its fields (prompts, sizes, frames, etc.). Only use field keys listed for that template; for file fields leave them out and tell the user what to upload.
Reply with ONLY a JSON object, no prose, no code fences:
{"title": string, "summary": string, "aspectRatio": string, "shots": [{"order": number, "beat": string, "prompt": string, "durationSec": number, "camera": string, "transition": string, "caption": string}], "workflowId": string, "params": object, "notes": string}
Keep 2–5 shots. "notes" explains in plain language what you picked and what the user still needs to do.`;
    const raw = await askAi(system, [{ role: "user", content: data.idea }], "medium");
    let plan: any;
    try { plan = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); }
    catch { throw new Error("The agent returned an unusable plan. Try rephrasing your idea."); }
    const wf = AGENT_WORKFLOWS.find((w) => w.id === plan?.workflowId) ?? AGENT_WORKFLOWS.find((w) => w.category === "video") ?? AGENT_WORKFLOWS[0]!;
    const params: Record<string, string | number | boolean> = {};
    for (const p of wf.params) {
      const v = plan?.params?.[p.key];
      if (p.type === "file" || v === undefined || v === null) continue;
      if (typeof v === "number" || typeof v === "boolean") params[p.key] = typeof v === "number" && p.max != null ? Math.min(Math.max(v, p.min ?? v), p.max) : v;
      else if (typeof v === "string") { if (!p.options || p.options.includes(v)) params[p.key] = v.slice(0, 4000); }
    }
    const shots: Shot[] = (Array.isArray(plan?.shots) ? plan.shots : []).slice(0, 6).map((s: any, i: number) => ({
      order: i + 1, beat: String(s?.beat ?? `Shot ${i + 1}`).slice(0, 80), prompt: String(s?.prompt ?? "").slice(0, 1000),
      durationSec: Math.min(Math.max(Number(s?.durationSec) || 3, 1), 30), camera: String(s?.camera ?? "").slice(0, 80),
      transition: String(s?.transition ?? "").slice(0, 60), caption: String(s?.caption ?? "").slice(0, 120),
    }));
    return {
      mode: data.mode, title: String(plan?.title ?? "Video plan").slice(0, 120), summary: String(plan?.summary ?? "").slice(0, 600),
      aspectRatio: String(plan?.aspectRatio ?? (data.mode === "viral" ? "9:16" : "16:9")).slice(0, 10), shots,
      workflowId: wf.id, workflowName: wf.name, params, notes: String(plan?.notes ?? "").slice(0, 1500),
    };
  });
