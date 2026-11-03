import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allWorkers, probeWorker } from "@/lib/router.server";
import { loadSettings } from "@/lib/jobs.server";

/** Accepts only ComfyUI API-format prompts (not the editor nodes/links format). */
function parseApiPrompt(raw: string) {
  let j: any;
  try { j = JSON.parse(raw); } catch { throw new Error("That isn't valid JSON."); }
  if (j && Array.isArray(j.nodes)) throw new Error("This is the editor format. In ComfyUI use Workflow → Export (API) and paste that file instead.");
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("Paste an API-format ComfyUI workflow.");
  return j as Record<string, any>;
}

export const inspectWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ json: z.string().min(2).max(2_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const prompt = parseApiPrompt(data.json);
    const nodes = Object.entries(prompt).map(([id, n]) => ({ id, type: String(n?.class_type ?? "?"), title: (n?._meta?.title as string) ?? null }));
    const types = [...new Set(nodes.map((n) => n.type))];
    const s = await loadSettings(context.supabase, context.userId);
    const workers = await Promise.all(allWorkers(s).map((w) => probeWorker(w, types)));
    return {
      nodeCount: nodes.length,
      nodes,
      usesPaidNodes: types.some((t) => /api|partner/i.test(t)),
      hasComfyOrgKey: !!s.comfyOrgKey,
      workers: workers.map((p) => ({ label: p.worker.label, reachable: p.reachable, load: p.load, gpu: p.gpu, missingNodes: p.missingNodes, error: p.error })),
    };
  });

/** Live editor: only GPUs whose address has no password can be shown in the browser. */
export const listEditors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await loadSettings(context.supabase, context.userId);
    return allWorkers(s).map((w) => {
      let u: URL | null = null;
      try { u = new URL(w.url); } catch { /* ignore */ }
      const locked = !u || !!u.username || !!u.password;
      return { label: w.label, url: locked ? null : u!.toString().replace(/\/$/, "") };
    });
  });

// ---------- personal API keys ----------
export const hashApiKey = (k: string) => createHash("sha256").update(k).digest("hex");

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("api_keys").select("id, name, prefix, created_at, last_used_at").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((k) => ({ id: Number(k.id), name: k.name, prefix: k.prefix, createdAt: k.created_at, lastUsedAt: k.last_used_at }));
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const key = "aur_" + randomBytes(24).toString("hex");
    const { error } = await context.supabase.from("api_keys").insert({ owner_id: context.userId, name: data.name, key_hash: hashApiKey(key), prefix: key.slice(0, 10) });
    if (error) throw new Error(error.message);
    return { key };
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("api_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
