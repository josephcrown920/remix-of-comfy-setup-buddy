import { WORKFLOWS } from "@/lib/comfy/workflows";
import { buildComfyPrompt } from "@/lib/comfy/prompts";
import { routePrompt } from "@/lib/router.server";
import { ARK_PREFIX, createSeedanceTask, getSeedanceTask, isModelArkWorkflow } from "@/lib/modelark.server";
import { fetchComfy, inspectPrompt, signMedia } from "@/lib/comfy.server";

type SavedGpu = { id: number; label: string; url: string };

export async function loadSettings(supabase: any, userId: string) {
  const { data } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  return {
    comfyUrl: (data?.comfy_url as string) ?? "",
    routingMode: (data?.routing_mode as string) ?? "auto",
    selectedGpuId: (data?.selected_gpu_id as number | null) ?? null,
    savedGpus: ((data?.saved_gpus as SavedGpu[]) ?? []) as SavedGpu[],
    modelAssignments: (data?.model_assignments as any) ?? {},
    comfyOrgKey: (data?.comfy_org_api_key as string | null) ?? null,
  };
}
export type LoadedSettings = Awaited<ReturnType<typeof loadSettings>>;

/** Pick the ComfyUI server for a job: explicit worker, selected worker, or primary URL. */
export function pickWorker(s: LoadedSettings, workerId?: number) {
  const id = workerId ?? (s.routingMode === "manual" ? s.selectedGpuId ?? undefined : undefined);
  const gpu = id != null ? s.savedGpus.find((g) => g.id === id) : undefined;
  if (gpu) return { id: gpu.id, label: gpu.label, url: gpu.url };
  if (s.comfyUrl) return { id: null, label: "Primary", url: s.comfyUrl };
  if (s.savedGpus[0]) return { ...s.savedGpus[0] };
  throw new Error("No ComfyUI server configured. Add one in Settings.");
}

export function shapeJob(job: any, outputs: any[]) {
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

/** ComfyUI /prompt body. The Comfy account key lets paid partner (API) nodes bill the user's Comfy credits. */
export function promptBody(prompt: Record<string, unknown>, comfyOrgKey: string | null) {
  return JSON.stringify(comfyOrgKey ? { prompt, extra_data: { api_key_comfy_org: comfyOrgKey } } : { prompt });
}

function parsePromptJson(raw: unknown) {
  if (typeof raw !== "string") throw new Error("Paste a ComfyUI API-format workflow.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("That workflow isn't valid JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Workflow must be an API-format prompt object.");
  return parsed as Record<string, unknown>;
}

/** Shared by the studio UI, the developer page and the public API so every path routes and bills the same way. */
export async function submitJob(supabase: any, userId: string, input: { workflowId: string; params: Record<string, unknown>; workerId?: number; appId?: string | null }) {
  const s = await loadSettings(supabase, userId);
  if (isModelArkWorkflow(input.workflowId)) {
    const wf = WORKFLOWS.find((w) => w.id === input.workflowId)!;
    const w = pickWorker(s, input.workerId);
    const taskId = await createSeedanceTask(wf.id, input.params, w.url);
    const { data: job, error } = await supabase.from("jobs").insert({
      owner_id: userId, workflow_id: wf.id, workflow_name: wf.name, status: "running",
      params: input.params as any, comfy_prompt_id: ARK_PREFIX + taskId, worker_id: null,
      worker_label: "Seedance (ModelArk)", worker_url: w.url, progress: 0, started_at: new Date().toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    return shapeJob(job, []);
  }
  let name: string;
  let prompt: Record<string, unknown>;
  if (input.workflowId === "custom-workflow") {
    prompt = parsePromptJson(input.params["workflow_json"]);
    name = typeof input.params["name"] === "string" && input.params["name"] ? String(input.params["name"]).slice(0, 120) : "Custom Workflow";
  } else {
    const wf = WORKFLOWS.find((w) => w.id === input.workflowId);
    if (!wf) throw new Error("Unknown workflow");
    name = wf.name;
    const ckpt = s.modelAssignments?.workflows?.[wf.id]?.checkpoint;
    prompt = buildComfyPrompt(wf.id, ckpt ? { ...input.params, checkpoint: ckpt } : input.params);
  }
  const worker = (await routePrompt(s, prompt, input.workerId)).worker;
  let promptId: string | null = null;
  let status = "pending";
  try {
    const r = await fetchComfy(worker.url, "/prompt", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: promptBody(prompt, s.comfyOrgKey),
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
    owner_id: userId, workflow_id: input.workflowId, workflow_name: name, status,
    params: input.params as any, comfy_prompt_id: promptId, worker_id: worker.id,
    worker_label: worker.label, worker_url: worker.url, progress: 0,
    started_at: promptId ? new Date().toISOString() : null,
    ...(input.appId ? { app_id: input.appId } : {}),
  }).select().single();
  if (error) throw new Error(error.message);
  return shapeJob(job, []);
}

/** Pull fresh status from ComfyUI/ModelArk, store outputs, return the job. Caller must already scope to the owner. */
export async function refreshJobRow(supabase: any, userId: string, id: number) {
  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).eq("owner_id", userId).maybeSingle();
  if (!job) throw new Error("Job not found");
  if (job.comfy_prompt_id && job.worker_url && (job.status === "running" || job.status === "pending")) {
    try {
      const isArk = String(job.comfy_prompt_id).startsWith(ARK_PREFIX);
      const r = isArk
        ? await (async () => {
            const tid = String(job.comfy_prompt_id).slice(ARK_PREFIX.length);
            const t = await getSeedanceTask(tid);
            return { state: t.state, error: t.error, outputs: t.state === "completed" ? [{ filename: tid, subfolder: "modelark", outputType: "video" }] : [] };
          })()
        : await inspectPrompt(job.worker_url, job.comfy_prompt_id);
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
  const { data: fresh } = await supabase.from("jobs").select("*").eq("id", id).single();
  const { data: outs } = await supabase.from("outputs").select("*").eq("job_id", id);
  return shapeJob(fresh, outs ?? []);
}
