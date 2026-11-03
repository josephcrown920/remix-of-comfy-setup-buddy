import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WORKFLOWS } from "@/lib/comfy/workflows";
import { isModelArkWorkflow, modelArkConfigured } from "@/lib/modelark.server";
import { fetchComfy, redactUrl, signMedia, validateComfyTarget } from "@/lib/comfy.server";
import { loadSettings, pickWorker, refreshJobRow, shapeJob, submitJob } from "@/lib/jobs.server";

type SavedGpu = { id: number; label: string; url: string };
export type StudioJob = ReturnType<typeof shapeJob>;

// ---------- settings ----------
export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await loadSettings(context.supabase, context.userId);
    return {
      comfyUrl: redactUrl(s.comfyUrl),
      hasComfyUrl: !!s.comfyUrl,
      hasComfyOrgKey: !!s.comfyOrgKey,
      routingMode: s.routingMode,
      selectedGpuId: s.selectedGpuId,
      savedGpus: s.savedGpus.map((g) => ({ ...g, url: redactUrl(g.url) })),
    };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      comfyUrl: z.string().max(500).optional(),
      routingMode: z.enum(["auto", "manual"]).optional(),
      selectedGpuId: z.number().int().nullable().optional(),
      comfyOrgKey: z.string().trim().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const cur = await loadSettings(context.supabase, context.userId);
    let comfyUrl = cur.comfyUrl;
    if (data.comfyUrl !== undefined && !data.comfyUrl.includes("****")) {
      if (data.comfyUrl.trim() === "") comfyUrl = "";
      else {
        const v = validateComfyTarget(data.comfyUrl);
        if (!v.ok) throw new Error(v.error);
        comfyUrl = v.url;
      }
    }
    const { error } = await context.supabase.from("user_settings").upsert({
      user_id: context.userId,
      comfy_url: comfyUrl,
      routing_mode: data.routingMode ?? cur.routingMode,
      selected_gpu_id: data.selectedGpuId === undefined ? cur.selectedGpuId : data.selectedGpuId,
      saved_gpus: cur.savedGpus,
      comfy_org_api_key: data.comfyOrgKey === undefined ? cur.comfyOrgKey : data.comfyOrgKey || null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addSavedGpu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ label: z.string().trim().min(1).max(60), url: z.string().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const v = validateComfyTarget(data.url);
    if (!v.ok) throw new Error(v.error);
    const cur = await loadSettings(context.supabase, context.userId);
    const id = Math.max(0, ...cur.savedGpus.map((g) => g.id)) + 1;
    const saved_gpus = [...cur.savedGpus, { id, label: data.label, url: v.url }];
    const { error } = await context.supabase.from("user_settings").upsert({
      user_id: context.userId, comfy_url: cur.comfyUrl, routing_mode: cur.routingMode,
      selected_gpu_id: cur.selectedGpuId, saved_gpus,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const deleteSavedGpu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const cur = await loadSettings(context.supabase, context.userId);
    const { error } = await context.supabase.from("user_settings").upsert({
      user_id: context.userId, comfy_url: cur.comfyUrl, routing_mode: cur.routingMode,
      selected_gpu_id: cur.selectedGpuId === data.id ? null : cur.selectedGpuId,
      saved_gpus: cur.savedGpus.filter((g) => g.id !== data.id),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ComfyUI status ----------
export const getComfyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await loadSettings(context.supabase, context.userId);
    const targets = [
      ...(s.comfyUrl ? [{ id: null as number | null, label: "Primary", url: s.comfyUrl }] : []),
      ...s.savedGpus.map((g) => ({ id: g.id as number | null, label: g.label, url: g.url })),
    ];
    const workers = await Promise.all(
      targets.map(async (t) => {
        try {
          const r = await fetchComfy(t.url, "/system_stats", { timeoutMs: 6000 });
          if (!r.ok) return { id: t.id, label: t.label, online: false, error: `HTTP ${r.status}`, gpu: null, vramFree: null, vramTotal: null, queue: 0 };
          const stats = (await r.json()) as any;
          const dev = stats?.devices?.[0];
          const q = await fetchComfy(t.url, "/queue", { timeoutMs: 6000 }).then((x) => (x.ok ? x.json() : null)).catch(() => null) as any;
          return {
            id: t.id, label: t.label, online: true, error: null,
            gpu: (dev?.name as string) ?? null,
            vramFree: (dev?.vram_free as number) ?? null,
            vramTotal: (dev?.vram_total as number) ?? null,
            queue: (q?.queue_running?.length ?? 0) + (q?.queue_pending?.length ?? 0),
          };
        } catch (e) {
          return { id: t.id, label: t.label, online: false, error: e instanceof Error ? e.message : "Unreachable", gpu: null, vramFree: null, vramTotal: null, queue: 0 };
        }
      }),
    );
    return { configured: targets.length > 0, online: workers.some((w) => w.online), workers };
  });

export const testComfyUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ url: z.string().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    let url = data.url;
    if (url.includes("****")) url = (await loadSettings(context.supabase, context.userId)).comfyUrl;
    const v = validateComfyTarget(url);
    if (!v.ok) return { ok: false, message: v.error };
    try {
      const r = await fetchComfy(v.url, "/system_stats", { timeoutMs: 8000 });
      if (!r.ok) return { ok: false, message: `Server answered with HTTP ${r.status}` };
      const s = (await r.json()) as any;
      return { ok: true, message: `Connected — ${s?.devices?.[0]?.name ?? "ComfyUI"} ready` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Could not reach server" };
    }
  });

export const getComfyModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await loadSettings(context.supabase, context.userId);
    try {
      const w = pickWorker(s);
      const folders = ["checkpoints", "loras", "vae", "upscale_models", "controlnet"];
      const entries = await Promise.all(
        folders.map(async (f) => {
          const r = await fetchComfy(w.url, `/api/models/${f}`).catch(() => null);
          return [f, r && r.ok ? ((await r.json()) as string[]) : []] as const;
        }),
      );
      return { ok: true, models: Object.fromEntries(entries) as Record<string, string[]> };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Unavailable", models: {} as Record<string, string[]> };
    }
  });

// ---------- workflows ----------
export const listWorkflows = createServerFn({ method: "GET" }).handler(async () =>
  WORKFLOWS.filter((w) => w.id !== "modelark-seedream-image" && (!isModelArkWorkflow(w.id) || modelArkConfigured())).map((w) => ({
    id: w.id, name: w.name, description: w.description, category: w.category,
    estimatedTime: (w.estimatedTime as string) ?? null, params: w.params,
  })),
);

// ---------- jobs ----------
export const createJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ workflowId: z.string().max(100), params: z.record(z.unknown()), workerId: z.number().int().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => submitJob(context.supabase, context.userId, data));

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status: z.string().optional(), limit: z.number().int().max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(data.limit ?? 50);
    if (data.status) q = q.eq("status", data.status);
    const { data: jobs, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (jobs ?? []).map((j) => j.id);
    const { data: outs } = ids.length
      ? await context.supabase.from("outputs").select("*").in("job_id", ids)
      : { data: [] as any[] };
    return (jobs ?? []).map((j) => shapeJob(j, (outs ?? []).filter((o) => o.job_id === j.id)));
  });

export const getJobStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("jobs").select("status, created_at").limit(5000);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rows = data ?? [];
    const c = (s: string) => rows.filter((r) => r.status === s).length;
    return {
      total: rows.length, pending: c("pending"), running: c("running"), completed: c("completed"), failed: c("failed"),
      todayCount: rows.filter((r) => new Date(r.created_at) >= today).length,
    };
  });

export const refreshJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => refreshJobRow(context.supabase, context.userId, data.id));

export const cancelJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from("jobs").select("*").eq("id", data.id).maybeSingle();
    if (!job) throw new Error("Job not found");
    if (job.worker_url && job.comfy_prompt_id) {
      await fetchComfy(job.worker_url, "/queue", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delete: [job.comfy_prompt_id] }),
      }).catch(() => null);
      if (job.status === "running") await fetchComfy(job.worker_url, "/interrupt", { method: "POST" }).catch(() => null);
    }
    await context.supabase.from("jobs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

export const deleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("jobs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOutputs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ type: z.string().optional(), limit: z.number().int().max(500).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("outputs").select("*, jobs(workflow_name)").order("created_at", { ascending: false }).limit(data.limit ?? 100);
    if (data.type) q = q.eq("output_type", data.type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((o: any) => ({
      id: Number(o.id), jobId: Number(o.job_id), filename: o.filename as string, outputType: o.output_type as string,
      workflowName: (o.jobs?.workflow_name as string) ?? "", createdAt: o.created_at as string, url: signMedia(Number(o.id)),
    }));
  });

export const listSavedWorkflows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("saved_workflows").select("id, name, json, created_at").order("created_at", { ascending: false });
    return (data ?? []).map((w) => ({ id: Number(w.id), name: w.name, json: w.json, createdAt: w.created_at }));
  });

export const saveWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(120), json: z.string().min(2).max(2_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    try { JSON.parse(data.json); } catch { throw new Error("Workflow isn't valid JSON."); }
    const { error } = await context.supabase.from("saved_workflows").insert({ owner_id: context.userId, name: data.name, json: data.json });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSavedWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("saved_workflows").delete().eq("id", data.id);
    return { ok: true };
  });
