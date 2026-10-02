import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Trash2, Ban, Loader2 } from "lucide-react";
import { cancelJob, deleteJob, listJobs, refreshJob } from "@/lib/studio.functions";
import { PageHeader, StatusPill } from "@/components/studio/shell";
import { MediaThumb } from "@/components/studio/media";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "Jobs — Aurora Studio" },
      { name: "description", content: "Track every ComfyUI render: status, progress and results." },
      { property: "og:title", content: "Jobs — Aurora Studio" },
      { property: "og:description", content: "Track every ComfyUI render: status, progress and results." },
    ],
  }),
  component: Jobs,
});

const filters = ["all", "running", "pending", "completed", "failed", "cancelled"] as const;

function Jobs() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const fetchJobs = useServerFn(listJobs);
  const refresh = useServerFn(refreshJob);
  const del = useServerFn(deleteJob);
  const cancel = useServerFn(cancelJob);
  const qc = useQueryClient();
  const jobs = useQuery({
    queryKey: ["jobs", filter],
    queryFn: () => fetchJobs({ data: filter === "all" ? {} : { status: filter } }),
  });

  const active = (jobs.data ?? []).filter((j) => j.status === "running" || j.status === "pending");
  const activeKey = active.map((j) => j.id).join(",");
  useEffect(() => {
    if (!activeKey) return;
    const t = setInterval(async () => {
      await Promise.all(activeKey.split(",").map((id) => refresh({ data: { id: Number(id) } }).catch(() => null)));
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["outputs"] });
    }, 4000);
    return () => clearInterval(t);
  }, [activeKey, refresh, qc]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast.success(msg); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    qc.invalidateQueries({ queryKey: ["jobs"] });
  };

  return (
    <>
      <PageHeader eyebrow="Queue" title="Jobs" description="Running jobs update automatically every few seconds." action={<Button variant="outline" className="rounded-xl" onClick={() => jobs.refetch()}><RefreshCw /> Refresh</Button>} />
      <div className="mb-6 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-sm capitalize ${filter === f ? "border-primary text-primary" : "text-muted-foreground"}`}>{f}</button>
        ))}
      </div>
      {jobs.isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : !jobs.data?.length ? (
        <div className="panel p-10 text-center">
          <p className="text-muted-foreground">No jobs yet.</p>
          <Button asChild className="mt-4"><Link to="/generate">Start a render</Link></Button>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.data.map((j) => (
            <div key={j.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-base">{j.workflowName}</h3>
                    <StatusPill status={j.status} />
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    #{j.id} · {new Date(j.createdAt).toLocaleString()} {j.workerLabel && `· ${j.workerLabel}`}
                  </div>
                </div>
                <div className="flex gap-1">
                  {(j.status === "running" || j.status === "pending") && (
                    <Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => act(() => cancel({ data: { id: j.id } }), "Cancelled")}><Ban /></Button>
                  )}
                  <Button size="icon" variant="ghost" aria-label="Check status" onClick={() => act(() => refresh({ data: { id: j.id } }), "Updated")}><RefreshCw /></Button>
                  <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => act(() => del({ data: { id: j.id } }), "Deleted")}><Trash2 /></Button>
                </div>
              </div>
              {j.status === "running" && <Progress value={j.progress || 15} className="mt-4 h-1.5" />}
              {j.status === "pending" && <p className="mt-3 text-xs text-warning">Waiting — your GPU server couldn't be reached when this was queued.</p>}
              {j.errorMessage && <p className="mt-3 text-sm text-destructive">{j.errorMessage}</p>}
              {j.outputs.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {j.outputs.map((o) => <MediaThumb key={o.id} url={o.url} type={o.outputType} controls className="aspect-video" />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
