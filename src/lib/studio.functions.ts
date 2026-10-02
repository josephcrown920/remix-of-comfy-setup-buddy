import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WORKFLOWS } from "@/lib/comfy/workflows";
import { buildComfyPrompt } from "@/lib/comfy/prompts";
import { routePrompt } from "@/lib/router.server";
import { fetchComfy, inspectPrompt, redactUrl, signMedia, validateComfyTarget } from "@/lib/comfy.server";

type SavedGpu = { id: number; label: string; url: string };

async function loadSettings(supabase: any, userId: string) {
  const { data } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  return {
    comfyUrl: (data?.comfy_url as string) ?? "",
    routingMode: (data?.routing_mode as string) ?? "auto",
    selectedGpuId: (data?.selected_gpu_id as number | null) ?? null,
    savedGpus: ((data?.saved_gpus as SavedGpu[]) ?? []) as SavedGpu[],
    modelAssignments: (data?.model_assignments as any) ?? {},
  };
}

/** Pick the ComfyUI server for a job: explicit worker, selected worker, or primary URL. */
function pickWorker(s: Awaited<ReturnType<typeof loadSettings>>, workerId?: number) {
  const id = workerId ?? (s.routingMode === "manual" ? s.selectedGpuId ?? undefined : undefined);
  const gpu = id != null ? s.savedGpus.find((g) => g.id === id) : undefined;
  if (gpu) return { id: gpu.id, label: gpu.label, url: gpu.url };
  if (s.comfyUrl) return { id: null, label: "Primary", url: s.comfyUrl };
  if (s.savedGpus[0]) return { ...s.savedGpus[0] };
  throw new Error("No ComfyUI server configured. Add one in Settings.");
}

function shapeJob(job: any, outputs: any[]) {
  return {
    id: Number(job.id),
    workflowId: job.workflow_id as string,
    workflowName: job.workflow_name as string,
    status: job.status as string,
    params: job.params as Record<string, string | number | boolean | null>,
    progress: (job.progress as number) ?? 0,
    errorMessage: (job.error_message as string) ?? null,
    workerLabel: (job.worker_label as string) ?? null,
    createdAt: job.created_at as string,
    completedAt: (job.completed_at as string) ?? null,
    outputs: outputs.map((o) => ({
      id: Number(o.id),
      filename: o.filename as string,
      outputType: o.output_type as string,
      url: signMedia(Number(o.id)),
    })),
  };
}
export type StudioJob = ReturnType<typeof shapeJob>;

// ---------- settings ----------
export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await loadSettings(context.supabase, context.userId);
    return {
      comfyUrl: redactUrl(s.comfyUrl),
      hasComfyUrl: !!s.comfyUrl,
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
  WORKFLOWS.filter((w) => !String(w.id).startsWith("modelark") && w.id !== "perform-anywhere-seedance").map((w) => ({
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
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const s = await loadSettings(supabase, userId);
    let name: string;
    let prompt: Record<string, unknown>;
    if (data.workflowId === "custom-workflow") {
      const raw = data.params["workflow_json"];
      if (typeof raw !== "string") throw new Error("Paste a ComfyUI API-format workflow.");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new Error("That workflow isn't valid JSON."); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Workflow must be an API-format prompt object.");
      prompt = parsed as Record<string, unknown>;
      name = "Custom Workflow";
    } else {
      const wf = WORKFLOWS.find((w) => w.id === data.workflowId);
      if (!wf) throw new Error("Unknown workflow");
      name = wf.name;
      const ckpt = s.modelAssignments?.workflows?.[wf.id]?.checkpoint;
      prompt = buildComfyPrompt(wf.id, ckpt ? { ...data.params, checkpoint: ckpt } : data.params);
    }
    const worker = (await routePrompt(s, prompt, data.workerId)).worker;
    let promptId: string | null = null;
    let status = "pending";
    try {
      const r = await fetchComfy(worker.url, "/prompt", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`ComfyUI rejected the workflow (HTTP ${r.status}): ${t.slice(0, 400)}`);
      }
      promptId = ((await r.json()) as any).prompt_id ?? null;
      status = "running";
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("ComfyUI rejected")) throw e;
    }
    const { data: job, error } = await supabase.from("jobs").insert({
      owner_id: userId, workflow_id: data.workflowId, workflow_name: name, status,
      params: data.params as any, comfy_prompt_id: promptId, worker_id: worker.id,
      worker_label: worker.label, worker_url: worker.url, progress: 0,
      started_at: promptId ? new Date().toISOString() : null,
    }).select().single();
    if (error) throw new Error(error.message);
    return shapeJob(job, []);
  });

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
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: job } = await supabase.from("jobs").select("*").eq("id", data.id).maybeSingle();
    if (!job) throw new Error("Job not found");
    if (job.comfy_prompt_id && job.worker_url && (job.status === "running" || job.status === "pending")) {
      try {
        const r = await inspectPrompt(job.worker_url, job.comfy_prompt_id);
        if (r.state === "completed" || r.state === "failed") {
          if (r.outputs.length) {
            await supabase.from("outputs").delete().eq("job_id", job.id);
            await supabase.from("outputs").insert(
              r.outputs.map((o) => ({ owner_id: userId, job_id: job.id, filename: o.filename, subfolder: o.subfolder, output_type: o.outputType })),
            );
          }
          await supabase.from("jobs").update({
            status: r.state, progress: r.state === "completed" ? 100 : job.progress,
            error_message: r.error, completed_at: new Date().toISOString(),
          }).eq("id", job.id);
        } else if (r.state === "running" && job.status !== "running") {
          await supabase.from("jobs").update({ status: "running" }).eq("id", job.id);
        }
      } catch {
        // ComfyUI temporarily unreachable — keep current state.
      }
    }
    const { data: fresh } = await supabase.from("jobs").select("*").eq("id", data.id).single();
    const { data: outs } = await supabase.from("outputs").select("*").eq("job_id", data.id);
    return shapeJob(fresh, outs ?? []);
  });

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
