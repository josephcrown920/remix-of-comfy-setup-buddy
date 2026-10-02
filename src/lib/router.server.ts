import { fetchComfy } from "@/lib/comfy.server";

export type Worker = { id: number | null; label: string; url: string };
type Settings = { comfyUrl: string; routingMode: string; selectedGpuId: number | null; savedGpus: { id: number; label: string; url: string }[] };

export type Probe = { worker: Worker; reachable: boolean; load: number; missingNodes: string[]; gpu: string | null; error: string | null };

function requiredNodes(prompt: Record<string, unknown>) {
  return [...new Set(Object.values(prompt).map((n: any) => n?.class_type).filter((c): c is string => typeof c === "string" && !!c))];
}

export async function probeWorker(worker: Worker, nodes: string[] = []): Promise<Probe> {
  try {
    const [sys, q, info] = await Promise.all([
      fetchComfy(worker.url, "/system_stats", { timeoutMs: 8000 }),
      fetchComfy(worker.url, "/queue", { timeoutMs: 8000 }),
      nodes.length ? fetchComfy(worker.url, "/object_info", { timeoutMs: 12000 }) : Promise.resolve(null),
    ]);
    if (!sys.ok) throw new Error(`HTTP ${sys.status}`);
    const s = (await sys.json()) as any;
    const qu = q.ok ? ((await q.json()) as any) : {};
    let missing: string[] = [];
    if (info?.ok) {
      const oi = (await info.json()) as Record<string, unknown>;
      missing = nodes.filter((n) => !(n in oi));
    }
    return { worker, reachable: true, load: (qu.queue_running?.length ?? 0) + (qu.queue_pending?.length ?? 0), missingNodes: missing, gpu: s?.devices?.[0]?.name ?? null, error: null };
  } catch (e) {
    return { worker, reachable: false, load: 0, missingNodes: [], gpu: null, error: e instanceof Error ? e.message : "Unreachable" };
  }
}

export function allWorkers(s: Settings): Worker[] {
  return [
    ...(s.comfyUrl ? [{ id: null, label: "Primary", url: s.comfyUrl }] : []),
    ...s.savedGpus.map((g) => ({ id: g.id, label: g.label, url: g.url })),
  ];
}

/**
 * Comfy router: picks the GPU for a prompt. Manual mode (or an explicit worker) pins one GPU;
 * auto mode probes every saved GPU, skips offline ones and ones missing the workflow's nodes,
 * and sends the job to the least busy healthy server.
 */
export async function routePrompt(s: Settings, prompt: Record<string, unknown>, workerId?: number): Promise<Probe> {
  const workers = allWorkers(s);
  if (!workers.length) throw new Error("No ComfyUI server configured. Add one in Settings.");
  const pinned = workerId ?? (s.routingMode === "manual" ? s.selectedGpuId ?? undefined : undefined);
  const candidates = pinned != null ? workers.filter((w) => w.id === pinned) : workers;
  if (!candidates.length) throw new Error("The chosen GPU is no longer saved. Pick another in Settings.");
  const nodes = requiredNodes(prompt);
  const probes = await Promise.all(candidates.map((w) => probeWorker(w, nodes)));
  const healthy = probes.filter((p) => p.reachable && p.missingNodes.length === 0).sort((a, b) => a.load - b.load);
  if (healthy[0]) return healthy[0];
  const incompatible = probes.find((p) => p.reachable && p.missingNodes.length);
  if (incompatible) throw new Error(`${incompatible.worker.label} is missing ComfyUI nodes this workflow needs: ${incompatible.missingNodes.join(", ")}.`);
  throw new Error(pinned != null ? "The chosen GPU isn't reachable. Start ComfyUI or pick another GPU in Settings." : "No GPU is reachable right now. Start ComfyUI on at least one server and retry.");
}
