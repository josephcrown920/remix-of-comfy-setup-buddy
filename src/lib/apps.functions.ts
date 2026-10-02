import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WORKFLOWS } from "@/lib/comfy/workflows";
import { buildComfyPrompt } from "@/lib/comfy/prompts";
import { routePrompt } from "@/lib/router.server";
import { fetchComfy, inspectPrompt, signMedia, signRun, verifyRun } from "@/lib/comfy.server";

const appInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, "Link name: 3–50 letters, numbers or dashes"),
  description: z.string().max(600).default(""),
  workflowId: z.string().max(100),
  presetParams: z.record(z.unknown()),
  exposedKeys: z.array(z.string().max(100)).max(40),
  isPublished: z.boolean(),
  allowEmbed: z.boolean(),
});

function shapeApp(a: any) {
  return {
    id: a.id as string, slug: a.slug as string, name: a.name as string, description: a.description as string,
    workflowId: a.workflow_id as string, presetParams: a.preset_params as Record<string, string | number | boolean | null>,
    exposedKeys: a.exposed_keys as string[], isPublished: a.is_published as boolean, allowEmbed: a.allow_embed as boolean,
    createdAt: a.created_at as string,
  };
}
export type WorkflowApp = ReturnType<typeof shapeApp>;

export const listApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("workflow_apps").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(shapeApp);
  });

export const saveApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => appInput.parse(d))
  .handler(async ({ data, context }) => {
    const wf = WORKFLOWS.find((w) => w.id === data.workflowId);
    if (!wf) throw new Error("Unknown workflow");
    const keys = new Set(wf.params.map((p) => p.key));
    const row = {
      owner_id: context.userId, name: data.name, slug: data.slug, description: data.description,
      workflow_id: data.workflowId, preset_params: data.presetParams as any,
      exposed_keys: data.exposedKeys.filter((k) => keys.has(k)), is_published: data.isPublished,
      allow_embed: data.allowEmbed, updated_at: new Date().toISOString(),
    };
    const q = data.id
      ? context.supabase.from("workflow_apps").update(row).eq("id", data.id).select().single()
      : context.supabase.from("workflow_apps").insert(row).select().single();
    const { data: saved, error } = await q;
    if (error) throw new Error(error.code === "23505" ? "That link name is taken — try another." : error.message);
    return shapeApp(saved);
  });

export const deleteApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("workflow_apps").delete().eq("id", data.id);
    return { ok: true };
  });

/** Build the raw ComfyUI API graph so it can be used in ComfyUI or any other tool. */
export const exportComfyGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workflowId: z.string().max(100), params: z.record(z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.workflowId === "custom-workflow") {
      try { return JSON.stringify(JSON.parse(String(data.params["workflow_json"] ?? "{}")), null, 2); }
      catch { throw new Error("That workflow isn't valid JSON."); }
    }
    const { data: s } = await context.supabase.from("user_settings").select("model_assignments").eq("user_id", context.userId).maybeSingle();
    const ckpt = (s?.model_assignments as any)?.workflows?.[data.workflowId]?.checkpoint;
    return JSON.stringify(buildComfyPrompt(data.workflowId, ckpt ? { ...data.params, checkpoint: ckpt } : data.params), null, 2);
  });

// ---------- public (visitors of a shared app) ----------
async function loadPublished(slug: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: app } = await supabaseAdmin.from("workflow_apps").select("*").eq("slug", slug).eq("is_published", true).maybeSingle();
  if (!app) throw new Error("This app isn't available.");
  const wf = WORKFLOWS.find((w) => w.id === app.workflow_id);
  if (!wf) throw new Error("This app's workflow no longer exists.");
  return { admin: supabaseAdmin, app, wf };
}

export const getPublicApp = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().max(60) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { app, wf } = await loadPublished(data.slug);
      const exposed = app.exposed_keys as string[];
      const preset = app.preset_params as Record<string, unknown>;
      return {
        found: true as const, name: app.name as string, description: (app.description as string) || wf.description,
        workflowId: wf.id, workflowName: wf.name, allowEmbed: app.allow_embed as boolean,
        fields: wf.params.filter((p) => exposed.includes(p.key)).map((p) => ({ ...p, defaultValue: (preset[p.key] as any) ?? p.defaultValue ?? null })),
      };
    } catch {
      return { found: false as const };
    }
  });

export const runPublicApp = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ slug: z.string().max(60), values: z.record(z.unknown()) }).parse(d))
  .handler(async ({ data }) => {
    const { admin, app, wf } = await loadPublished(data.slug);
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count: recent } = await admin.from("jobs").select("id", { count: "exact", head: true }).eq("app_id", app.id).gte("created_at", since);
    const { count: active } = await admin.from("jobs").select("id", { count: "exact", head: true }).eq("app_id", app.id).in("status", ["pending", "running"]);
    if ((recent ?? 0) >= 6 || (active ?? 0) >= 4) throw new Error("This app is busy right now — try again in a minute.");

    const exposed = new Set(app.exposed_keys as string[]);
    const params: Record<string, unknown> = { ...(app.preset_params as Record<string, unknown>) };
    for (const [k, v] of Object.entries(data.values)) if (exposed.has(k)) params[k] = typeof v === "string" ? v.slice(0, 4000) : v;
    const missing = wf.params.filter((p) => p.required && (params[p.key] === undefined || params[p.key] === ""));
    if (missing.length) throw new Error(`Still needed: ${missing.map((m) => m.label).join(", ")}`);

    const { data: s } = await admin.from("user_settings").select("*").eq("user_id", app.owner_id).maybeSingle();
    const ckpt = (s?.model_assignments as any)?.workflows?.[data.workflowId]?.checkpoint;
    return JSON.stringify(buildComfyPrompt(data.workflowId, ckpt ? { ...data.params, checkpoint: ckpt } : data.params), null, 2);
  });

// ---------- public (visitors of a shared app) ----------
async function loadPublished(slug: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: app } = await supabaseAdmin.from("workflow_apps").select("*").eq("slug", slug).eq("is_published", true).maybeSingle();
  if (!app) throw new Error("This app isn't available.");
  const wf = WORKFLOWS.find((w) => w.id === app.workflow_id);
  if (!wf) throw new Error("This app's workflow no longer exists.");
  return { admin: supabaseAdmin, app, wf };
}

export const getPublicApp = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().max(60) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { app, wf } = await loadPublished(data.slug);
      const exposed = app.exposed_keys as string[];
      const preset = app.preset_params as Record<string, unknown>;
      return {
        found: true as const, name: app.name as string, description: (app.description as string) || wf.description,
        workflowId: wf.id, workflowName: wf.name, allowEmbed: app.allow_embed as boolean,
        fields: wf.params.filter((p) => exposed.includes(p.key)).map((p) => ({ ...p, defaultValue: (preset[p.key] as any) ?? p.defaultValue ?? null })),
      };
    } catch {
      return { found: false as const };
    }
  });

export const runPublicApp = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ slug: z.string().max(60), values: z.record(z.unknown()) }).parse(d))
  .handler(async ({ data }) => {
    const { admin, app, wf } = await loadPublished(data.slug);
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count: recent } = await admin.from("jobs").select("id", { count: "exact", head: true }).eq("app_id", app.id).gte("created_at", since);
    const { count: active } = await admin.from("jobs").select("id", { count: "exact", head: true }).eq("app_id", app.id).in("status", ["pending", "running"]);
    if ((recent ?? 0) >= 6 || (active ?? 0) >= 4) throw new Error("This app is busy right now — try again in a minute.");

    const exposed = new Set(app.exposed_keys as string[]);
    const params: Record<string, unknown> = { ...(app.preset_params as Record<string, unknown>) };
    for (const [k, v] of Object.entries(data.values)) if (exposed.has(k)) params[k] = typeof v === "string" ? v.slice(0, 4000) : v;
    const missing = wf.params.filter((p) => p.required && (params[p.key] === undefined || params[p.key] === ""));
    if (missing.length) throw new Error(`Still needed: ${missing.map((m) => m.label).join(", ")}`);

    const { data: s } = await admin.from("user_settings").select("*").eq("user_id", app.owner_id).maybeSingle();
    const gpus = ((s?.saved_gpus as any[]) ?? []) as { id: number; label: string; url: string }[];
    const sel = s?.routing_mode === "manual" ? gpus.find((g) => g.id === s?.selected_gpu_id) : undefined;
    const worker = sel ?? (s?.comfy_url ? { id: null, label: "Primary", url: s.comfy_url as string } : gpus[0]);
    if (!worker) throw new Error("The app owner hasn't connected a GPU yet.");
    const ckpt = (s?.model_assignments as any)?.workflows?.[wf.id]?.checkpoint;
    const prompt = buildComfyPrompt(wf.id, ckpt ? { ...params, checkpoint: ckpt } : params);
    const worker = (await routePrompt({
      comfyUrl: (s?.comfy_url as string) ?? "", routingMode: (s?.routing_mode as string) ?? "auto",
      selectedGpuId: (s?.selected_gpu_id as number | null) ?? null, savedGpus: ((s?.saved_gpus as any[]) ?? []),
    }, prompt).catch(() => { throw new Error("The GPU behind this app is offline or busy right now."); })).worker;

    const r = await fetchComfy(worker.url, "/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) })
      .catch(() => { throw new Error("The GPU behind this app is offline."); });
    if (!r.ok) throw new Error(`The GPU rejected this render (HTTP ${r.status}).`);
    const promptId = ((await r.json()) as any).prompt_id ?? null;
    const { data: job, error } = await admin.from("jobs").insert({
      owner_id: app.owner_id, app_id: app.id, workflow_id: wf.id, workflow_name: `${app.name} (app)`, status: "running",
      params: params as any, comfy_prompt_id: promptId, worker_id: worker.id, worker_label: worker.label, worker_url: worker.url,
      progress: 0, started_at: new Date().toISOString(),
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { runId: Number(job.id), token: signRun(Number(job.id)) };
  });

export const checkPublicRun = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ runId: z.number().int(), token: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    if (!verifyRun(data.runId, data.token)) throw new Error("Invalid run");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await admin.from("jobs").select("*").eq("id", data.runId).maybeSingle();
    if (!job) throw new Error("Run not found");
    if (job.comfy_prompt_id && job.worker_url && (job.status === "running" || job.status === "pending")) {
      try {
        const r = await inspectPrompt(job.worker_url, job.comfy_prompt_id);
        if (r.state === "completed" || r.state === "failed") {
          if (r.outputs.length) {
            await admin.from("outputs").delete().eq("job_id", job.id);
            await admin.from("outputs").insert(r.outputs.map((o) => ({ owner_id: job.owner_id, job_id: job.id, filename: o.filename, subfolder: o.subfolder, output_type: o.outputType })));
          }
          await admin.from("jobs").update({ status: r.state, progress: r.state === "completed" ? 100 : job.progress, error_message: r.error, completed_at: new Date().toISOString() }).eq("id", job.id);
          job.status = r.state; job.error_message = r.error;
        }
      } catch { /* GPU temporarily unreachable */ }
    }
    const { data: outs } = await admin.from("outputs").select("id, output_type").eq("job_id", job.id);
    return {
      status: job.status as string, error: (job.error_message as string) ?? null,
      outputs: (outs ?? []).map((o) => ({ id: Number(o.id), outputType: o.output_type as string, url: signMedia(Number(o.id)) })),
    };
  });
