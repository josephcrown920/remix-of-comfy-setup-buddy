import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Code2, Copy, ExternalLink, KeyRound, Loader2, MonitorPlay, Play, Search, Trash2, XCircle } from "lucide-react";
import { createApiKey, deleteApiKey, inspectWorkflow, listApiKeys, listEditors } from "@/lib/dev.functions";
import { createJob } from "@/lib/studio.functions";
import { PageHeader } from "@/components/studio/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/dev")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Comfy Dev — Aurora Studio" },
      { name: "description", content: "Test any ComfyUI workflow, open the live ComfyUI editor, and manage API keys for your own apps." },
      { property: "og:title", content: "Comfy Dev — Aurora Studio" },
      { property: "og:description", content: "Test any ComfyUI workflow, open the live ComfyUI editor, and manage API keys for your own apps." },
    ],
  }),
  component: DevPage,
});

type Tab = "test" | "editor" | "api";

function DevPage() {
  const [tab, setTab] = useState<Tab>("test");
  return (
    <>
      <PageHeader eyebrow="Developer" title="Comfy Dev" description="Test raw ComfyUI workflows, work in the live ComfyUI editor, and let other apps start renders with your API key." />
      <div className="mb-6 flex flex-wrap gap-2">
        <Button size="sm" variant={tab === "test" ? "default" : "outline"} onClick={() => setTab("test")}><Code2 /> Workflow tester</Button>
        <Button size="sm" variant={tab === "editor" ? "default" : "outline"} onClick={() => setTab("editor")}><MonitorPlay /> Live editor</Button>
        <Button size="sm" variant={tab === "api" ? "default" : "outline"} onClick={() => setTab("api")}><KeyRound /> API</Button>
      </div>
      {tab === "test" && <Tester />}
      {tab === "editor" && <Editor />}
      {tab === "api" && <Api />}
    </>
  );
}

function Tester() {
  const navigate = useNavigate();
  const [json, setJson] = useState("");
  const [name, setName] = useState("");
  const inspect = useServerFn(inspectWorkflow);
  const run = useServerFn(createJob);
  const check = useMutation({ mutationFn: () => inspect({ data: { json } }), onError: (e) => toast.error(e instanceof Error ? e.message : "Check failed") });
  const go = useMutation({
    mutationFn: () => run({ data: { workflowId: "custom-workflow", params: { workflow_json: json, name: name || "Dev test" } } }),
    onSuccess: () => { toast.success("Queued"); navigate({ to: "/jobs" }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not queue"),
  });
  const r = check.data;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="panel space-y-3 p-6">
        <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea rows={18} className="font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} placeholder="Paste a ComfyUI workflow exported with Workflow → Export (API)" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!json.trim() || check.isPending} onClick={() => check.mutate()}>{check.isPending ? <Loader2 className="animate-spin" /> : <Search />} Check against my GPUs</Button>
          <Button disabled={!json.trim() || go.isPending} onClick={() => go.mutate()}>{go.isPending ? <Loader2 className="animate-spin" /> : <Play />} Run</Button>
        </div>
      </div>
      <div className="panel h-fit space-y-4 p-6">
        {!r && <p className="text-sm text-muted-foreground">Check shows every node in the workflow and whether each GPU has them installed.</p>}
        {r && (
          <>
            <div className="eyebrow">{r.nodeCount} nodes</div>
            {r.usesPaidNodes && <p className="text-sm">{r.hasComfyOrgKey ? "Paid Comfy nodes will bill your Comfy credits." : "This uses paid Comfy nodes — add your Comfy account key in Settings."}</p>}
            <ul className="space-y-2">
              {r.workers.length === 0 && <li className="text-sm text-muted-foreground">No GPU saved yet. Add one in Settings.</li>}
              {r.workers.map((w) => (
                <li key={w.label} className="rounded-xl bg-muted p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    {w.reachable && !w.missingNodes.length ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    {w.label}{w.gpu ? ` · ${w.gpu}` : ""}
                  </div>
                  {!w.reachable && <div className="mt-1 text-xs text-muted-foreground">Offline: {w.error}</div>}
                  {w.missingNodes.length > 0 && <div className="mt-1 text-xs text-destructive">Missing: {w.missingNodes.join(", ")}</div>}
                  {w.reachable && <div className="mt-1 text-xs text-muted-foreground">{w.load} in queue</div>}
                </li>
              ))}
            </ul>
            <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">All nodes</summary>
              <ul className="mt-2 space-y-0.5 font-mono">{r.nodes.map((n) => <li key={n.id}>#{n.id} {n.type}{n.title ? ` — ${n.title}` : ""}</li>)}</ul>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function Editor() {
  const editors = useQuery({ queryKey: ["editors"], queryFn: useServerFn(listEditors) });
  const [pick, setPick] = useState(0);
  if (editors.isLoading) return <Loader2 className="animate-spin text-muted-foreground" />;
  const list = editors.data ?? [];
  if (!list.length) return <div className="panel p-10 text-center text-muted-foreground">Add a ComfyUI server in Settings to open its editor here.</div>;
  const cur = list[Math.min(pick, list.length - 1)]!;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {list.map((e, i) => <Button key={i} size="sm" variant={i === pick ? "default" : "outline"} onClick={() => setPick(i)}>{e.label}</Button>)}
        {cur.url && <Button size="sm" variant="ghost" asChild><a href={cur.url} target="_blank" rel="noreferrer"><ExternalLink /> Open in new tab</a></Button>}
      </div>
      {cur.url
        ? <iframe title="ComfyUI editor" src={cur.url} className="panel h-[78vh] w-full" />
        : <div className="panel p-10 text-center text-muted-foreground">This server's address has a password in it, so it can't be shown in the browser safely. Open ComfyUI directly from your GPU provider.</div>}
      <p className="text-xs text-muted-foreground">Build in ComfyUI, then Workflow → Export (API) and paste it in the Workflow tester or import it on the Workflows page.</p>
    </div>
  );
}

function Api() {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: useServerFn(listApiKeys) });
  const create = useServerFn(createApiKey);
  const del = useServerFn(deleteApiKey);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const make = useMutation({
    mutationFn: () => create({ data: { name } }),
    onSuccess: (r) => { setFresh(r.key); setName(""); qc.invalidateQueries({ queryKey: ["api-keys"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const sample = `curl -X POST ${origin}/api/public/v1/run \\
  -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" \\
  -d '{"workflowId":"perform-anywhere-angles","params":{"prompt":"..."}}'

curl ${origin}/api/public/v1/jobs/JOB_ID -H "Authorization: Bearer YOUR_KEY"`;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="panel space-y-4 p-6">
        <h2 className="text-lg">Your API keys</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) make.mutate(); }}>
          <Input placeholder="Key name, e.g. My website" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim() || make.isPending}>Create</Button>
        </form>
        {fresh && (
          <div className="rounded-xl border border-primary p-3 text-sm">
            <div className="mb-1 font-medium">Copy this key now — it won't be shown again.</div>
            <div className="flex items-center gap-2"><code className="flex-1 break-all text-xs">{fresh}</code>
              <Button size="icon" variant="ghost" aria-label="Copy" onClick={() => navigator.clipboard.writeText(fresh).then(() => toast.success("Copied"))}><Copy /></Button></div>
          </div>
        )}
        <ul className="space-y-2">
          {(keys.data ?? []).map((k) => (
            <li key={k.id} className="flex items-center justify-between rounded-xl bg-muted px-4 py-3 text-sm">
              <div><div className="font-medium">{k.name}</div><div className="font-mono text-xs text-muted-foreground">{k.prefix}… · {k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}</div></div>
              <Button size="icon" variant="ghost" aria-label="Delete key" onClick={() => del({ data: { id: k.id } }).then(() => qc.invalidateQueries({ queryKey: ["api-keys"] }))}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel space-y-3 p-6">
        <h2 className="text-lg">How to use it</h2>
        <p className="text-sm text-muted-foreground">Any app can start a render on your GPUs with your key, then check the job until it's done. Results come back as download links that work for one hour. Limit: 30 requests a minute per key.</p>
        <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs">{sample}</pre>
      </div>
    </div>
  );
}
