import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plug, Plus, Trash2 } from "lucide-react";
import { addSavedGpu, deleteSavedGpu, getComfyModels, getSettings, testComfyUrl, updateSettings } from "@/lib/studio.functions";
import { PageHeader } from "@/components/studio/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Aurora Studio" },
      { name: "description", content: "Connect your ComfyUI GPU servers and choose how jobs are routed." },
      { property: "og:title", content: "Settings — Aurora Studio" },
      { property: "og:description", content: "Connect your ComfyUI GPU servers and choose how jobs are routed." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: useServerFn(getSettings) });
  const save = useServerFn(updateSettings);
  const test = useServerFn(testComfyUrl);
  const add = useServerFn(addSavedGpu);
  const remove = useServerFn(deleteSavedGpu);
  const models = useQuery({ queryKey: ["models"], queryFn: useServerFn(getComfyModels), enabled: !!settings.data?.hasComfyUrl || !!settings.data?.savedGpus.length });

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [gpuLabel, setGpuLabel] = useState("");
  const [gpuUrl, setGpuUrl] = useState("");
  useEffect(() => { if (settings.data) setUrl(settings.data.comfyUrl); }, [settings.data]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    setBusy(null);
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["comfy-status"] });
  };

  if (settings.isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
  const s = settings.data!;
  return (
    <>
      <PageHeader eyebrow="Configuration" title="Settings" description="Point Aurora at your ComfyUI server. Use a public address — a Cloudflare/ngrok tunnel or your RunPod proxy URL." />

      <section className="panel p-6 md:p-8">
        <h2 className="text-lg">Primary ComfyUI server</h2>
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <Input placeholder="https://your-gpu.trycloudflare.com" value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono text-sm" />
          <Button variant="outline" className="rounded-xl" disabled={!url || busy === "test"} onClick={() => run("test", async () => {
            const r = await test({ data: { url } });
            if (!r.ok) throw new Error(r.message);
            toast.success(r.message);
          })}>{busy === "test" ? <Loader2 className="animate-spin" /> : <Plug />} Test</Button>
          <Button disabled={busy === "save"} onClick={() => run("save", () => save({ data: { comfyUrl: url } }), "Saved")}>Save</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Password-protected tunnels work too: https://user:pass@host</p>
      </section>

      <section className="panel mt-6 p-6 md:p-8">
        <h2 className="text-lg">Extra GPU servers</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add more ComfyUI machines and choose whether jobs go to the primary server or a specific one.</p>
        <ul className="mt-4 space-y-2">
          {s.savedGpus.map((g) => (
            <li key={g.id} className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
              <div className="min-w-0"><div className="text-sm font-medium">{g.label}</div><div className="truncate font-mono text-xs text-muted-foreground">{g.url}</div></div>
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => run("rm", () => remove({ data: { id: g.id } }), "Removed")}><Trash2 /></Button>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <Input placeholder="Label (e.g. RunPod 4090)" value={gpuLabel} onChange={(e) => setGpuLabel(e.target.value)} />
          <Input placeholder="https://…" value={gpuUrl} onChange={(e) => setGpuUrl(e.target.value)} className="font-mono text-sm" />
          <Button variant="outline" className="rounded-xl" disabled={!gpuLabel || !gpuUrl} onClick={() => run("add", async () => { await add({ data: { label: gpuLabel, url: gpuUrl } }); setGpuLabel(""); setGpuUrl(""); }, "GPU added")}><Plus /> Add</Button>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Routing</Label>
            <Select value={s.routingMode} onValueChange={(v) => run("route", () => save({ data: { routingMode: v as "auto" | "manual" } }))}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatic — primary server</SelectItem>
                <SelectItem value="manual">Always use a chosen GPU</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {s.routingMode === "manual" && (
            <div className="space-y-1.5">
              <Label>Chosen GPU</Label>
              <Select value={s.selectedGpuId != null ? String(s.selectedGpuId) : ""} onValueChange={(v) => run("sel", () => save({ data: { selectedGpuId: Number(v) } }))}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>{s.savedGpus.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
      </section>

      <section className="panel mt-6 p-6 md:p-8">
        <h2 className="text-lg">Installed models</h2>
        {!models.data ? (
          <p className="mt-2 text-sm text-muted-foreground">{models.isFetching ? "Loading…" : "Connect a server to see its models."}</p>
        ) : !models.data.ok ? (
          <p className="mt-2 text-sm text-destructive">{models.data.error}</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {Object.entries(models.data.models).map(([folder, list]) => (
              <div key={folder}>
                <div className="eyebrow">{folder} · {list.length}</div>
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto font-mono text-xs text-muted-foreground">
                  {list.length ? list.map((m) => <li key={m} className="truncate">{m}</li>) : <li>None</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
