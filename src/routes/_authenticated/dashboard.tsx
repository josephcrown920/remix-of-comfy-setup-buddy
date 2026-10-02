import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Cpu, CheckCircle2, Loader2, XCircle, Plus } from "lucide-react";
import { getComfyStatus, getJobStats, listOutputs } from "@/lib/studio.functions";
import { PageHeader } from "@/components/studio/shell";
import { MediaThumb } from "@/components/studio/media";
import { Button } from "@/components/ui/button";
import { WORKFLOW_THUMBNAILS } from "@/lib/thumbnails";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Aurora Studio" },
      { name: "description", content: "Server status, job stats and your latest renders." },
      { property: "og:title", content: "Dashboard — Aurora Studio" },
      { property: "og:description", content: "Server status, job stats and your latest renders." },
    ],
  }),
  component: Dashboard,
});

const quick = [
  { id: "lip-sync-basic", label: "Lip Sync" },
  { id: "motion-control-animatediff", label: "Motion Control" },
  { id: "img2vid-stable-video", label: "Image to Video" },
  { id: "cinematic-portrait", label: "Cinematic Portrait" },
];

function Dashboard() {
  const status = useQuery({ queryKey: ["comfy-status"], queryFn: useServerFn(getComfyStatus), refetchInterval: 20000 });
  const stats = useQuery({ queryKey: ["job-stats"], queryFn: useServerFn(getJobStats) });
  const fetchOutputs = useServerFn(listOutputs);
  const outputs = useQuery({ queryKey: ["outputs", "recent"], queryFn: () => fetchOutputs({ data: { limit: 8 } }) });

  const s = stats.data;
  return (
    <>
      <PageHeader eyebrow="Overview" title="Studio dashboard" action={<Button asChild><Link to="/generate"><Plus /> New render</Link></Button>} />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel p-6 md:col-span-1">
          <div className="flex items-center justify-between">
            <div className="eyebrow">GPU servers</div>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </div>
          {status.isLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</div>
          ) : !status.data?.configured ? (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">No ComfyUI server connected yet.</p>
              <Button asChild variant="outline" size="sm" className="mt-3 rounded-xl"><Link to="/settings">Connect a server</Link></Button>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {status.data.workers.map((w) => (
                <li key={`${w.id}-${w.label}`} className="flex items-start gap-3">
                  {w.online ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 text-destructive" />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{w.label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {w.online ? `${w.gpu ?? "GPU"} · ${w.queue} in queue` : w.error}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel grid grid-cols-2 gap-6 p-6 md:col-span-2 md:grid-cols-4">
          {[
            ["Today", s?.todayCount],
            ["Running", (s?.running ?? 0) + (s?.pending ?? 0)],
            ["Completed", s?.completed],
            ["Failed", s?.failed],
          ].map(([label, v]) => (
            <div key={label as string}>
              <div className="eyebrow">{label}</div>
              <div className="mt-2 text-4xl font-bold">{v ?? "—"}</div>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mb-4 mt-10 text-xl">Quick start</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {quick.map((q) => (
          <Link key={q.id} to="/generate" search={{ workflow: q.id }} className="panel group overflow-hidden">
            <img src={WORKFLOW_THUMBNAILS[q.id]} alt="" className="h-28 w-full object-cover transition-transform group-hover:scale-105" />
            <div className="p-4 text-sm font-semibold">{q.label}</div>
          </Link>
        ))}
      </div>

      <div className="mb-4 mt-10 flex items-center justify-between">
        <h2 className="text-xl">Recent outputs</h2>
        <Link to="/gallery" className="text-sm text-primary">View gallery</Link>
      </div>
      {outputs.data?.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {outputs.data.map((o) => <MediaThumb key={o.id} url={o.url} type={o.outputType} className="aspect-square" />)}
        </div>
      ) : (
        <div className="panel p-8 text-center text-sm text-muted-foreground">Your renders will appear here.</div>
      )}
    </>
  );
}
