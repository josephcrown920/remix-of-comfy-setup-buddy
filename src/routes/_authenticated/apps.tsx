import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppWindow, Code2, Copy, Download, ExternalLink, FileUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteApp, listApps, saveApp, type WorkflowApp } from "@/lib/apps.functions";
import { listWorkflows } from "@/lib/studio.functions";
import { PageHeader } from "@/components/studio/shell";
import { ParamField, studioUploader, downloadJson, slugify } from "@/components/studio/param-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/apps")({
  head: () => ({
    meta: [
      { title: "Workflow Apps — Aurora Studio" },
      { name: "description", content: "Turn ComfyUI workflows into shareable mini-apps with a simple form." },
      { property: "og:title", content: "Workflow Apps — Aurora Studio" },
      { property: "og:description", content: "Turn ComfyUI workflows into shareable mini-apps with a simple form." },
    ],
  }),
  component: AppsPage,
});

const APP_FORMAT = "aurora-studio/app";
type Draft = { id?: string; name: string; slug: string; description: string; workflowId: string; presetParams: Record<string, unknown>; exposedKeys: string[]; isPublished: boolean; allowEmbed: boolean };

function appUrl(slug: string) { return `${window.location.origin}/a/${slug}`; }
function embedCode(slug: string) {
  return `<iframe src="${appUrl(slug)}?embed=1" width="100%" height="760" style="border:0;border-radius:16px" allow="clipboard-write"></iframe>`;
}
function copy(text: string, what: string) { navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`)); }

function AppsPage() {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ["apps"], queryFn: useServerFn(listApps) });
  const wfs = useQuery({ queryKey: ["workflows"], queryFn: useServerFn(listWorkflows), staleTime: Infinity });
  const [draft, setDraft] = useState<Draft | null>(null);
  const del = useServerFn(deleteApp);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("aurora-app-draft");
    if (!raw || !wfs.data) return;
    sessionStorage.removeItem("aurora-app-draft");
    try {
      const j = JSON.parse(raw) as { workflowId: string; params: Record<string, unknown> };
      const wf = wfs.data.find((w) => w.id === j.workflowId);
      if (wf) setDraft(newDraft(wf, j.params));
    } catch { /* ignore */ }
  }, [wfs.data]);

  function newDraft(wf: { id: string; name: string; params: { key: string; type: string }[] }, params: Record<string, unknown> = {}): Draft {
    const exposed = wf.params.filter((p) => p.key.includes("prompt") || p.type === "file").map((p) => p.key).slice(0, 3);
    return { name: wf.name, slug: `${slugify(wf.name)}-${Math.random().toString(36).slice(2, 6)}`, description: "", workflowId: wf.id, presetParams: params, exposedKeys: exposed, isPublished: true, allowEmbed: true };
  }

  async function importApp(file: File) {
    try {
      const j = JSON.parse(await file.text()) as any;
      if (j?.format !== APP_FORMAT) throw new Error("That isn't an Aurora app file.");
      setDraft({ name: String(j.name ?? "Imported app"), slug: `${slugify(String(j.name ?? "app"))}-${Math.random().toString(36).slice(2, 6)}`, description: String(j.description ?? ""), workflowId: String(j.workflowId), presetParams: j.presetParams ?? {}, exposedKeys: j.exposedKeys ?? [], isPublished: true, allowEmbed: true });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't read that file"); }
  }

  if (draft) return <Builder draft={draft} workflows={wfs.data ?? []} onDone={() => { setDraft(null); qc.invalidateQueries({ queryKey: ["apps"] }); }} />;

  return (
    <>
      <PageHeader eyebrow="Share" title="Workflow Apps" description="Lock in a workflow's settings, pick what visitors can change, and share it as a simple page or embed it on another site." />
      <div className="mb-6 flex flex-wrap gap-2">
        <Select onValueChange={(id) => { const wf = wfs.data?.find((w) => w.id === id); if (wf) setDraft(newDraft(wf)); }}>
          <SelectTrigger className="w-64 rounded-xl"><Plus className="h-4 w-4" /><SelectValue placeholder="New app from workflow…" /></SelectTrigger>
          <SelectContent>{(wfs.data ?? []).filter((w) => w.id !== "custom-workflow").map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
        </Select>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importApp(f); e.target.value = ""; }} />
        <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp /> Import app file</Button>
      </div>
      {apps.isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : (apps.data ?? []).length === 0 ? (
        <div className="panel p-10 text-center text-muted-foreground">
          <AppWindow className="mx-auto mb-3 h-8 w-8" />No apps yet. Pick a workflow above, or open any workflow and press “Turn into an app”.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(apps.data ?? []).map((a) => (
            <div key={a.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg">{a.name}</h3>
                  <p className="truncate font-mono text-xs text-muted-foreground">/a/{a.slug}</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${a.isPublished ? "border-primary text-primary" : "text-muted-foreground"}`}>{a.isPublished ? "Live" : "Hidden"}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Visitors can change: {a.exposedKeys.length ? a.exposedKeys.join(", ") : "nothing (one-click)"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" asChild><Link to="/a/$slug" params={{ slug: a.slug }} target="_blank"><ExternalLink /> Open</Link></Button>
                <Button size="sm" variant="outline" onClick={() => copy(appUrl(a.slug), "Link")}><Copy /> Link</Button>
                {a.allowEmbed && <Button size="sm" variant="outline" onClick={() => copy(embedCode(a.slug), "Embed code")}><Code2 /> Embed</Button>}
                <Button size="sm" variant="outline" onClick={() => downloadJson(`${a.slug}.aurora-app.json`, { format: APP_FORMAT, version: 1, name: a.name, description: a.description, workflowId: a.workflowId, presetParams: a.presetParams, exposedKeys: a.exposedKeys })}><Download /> Export</Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft({ ...a })}><Pencil /></Button>
                <Button size="sm" variant="ghost" onClick={async () => { if (confirm(`Delete “${a.name}”?`)) { await del({ data: { id: a.id } }); qc.invalidateQueries({ queryKey: ["apps"] }); } }}><Trash2 /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Builder({ draft, workflows, onDone }: { draft: Draft; workflows: { id: string; name: string; params: any[] }[]; onDone: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const wf = workflows.find((w) => w.id === d.workflowId);
  const save = useServerFn(saveApp);
  const upload = useMemo(() => studioUploader(async () => (await supabase.auth.getSession()).data.session?.access_token ?? ""), []);
  const m = useMutation({
    mutationFn: () => save({ data: d }),
    onSuccess: (a: WorkflowApp) => { toast.success("App saved"); copy(appUrl(a.slug), "Link"); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  if (!wf) return <p className="text-muted-foreground">Workflow not found. <button className="underline" onClick={onDone}>Back</button></p>;
  const toggle = (k: string, on: boolean) => setD((s) => ({ ...s, exposedKeys: on ? [...s.exposedKeys, k] : s.exposedKeys.filter((x) => x !== k) }));

  return (
    <>
      <PageHeader eyebrow={`App from ${wf.name}`} title={d.id ? "Edit app" : "New app"} description="Fixed settings are locked in. Ticked fields appear on the app page for visitors to fill in." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="panel space-y-6 p-6">
          {wf.params.map((p) => (
            <div key={p.key} className="rounded-xl border border-border p-4">
              <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={d.exposedKeys.includes(p.key)} onCheckedChange={(v) => toggle(p.key, !!v)} />
                {d.exposedKeys.includes(p.key) ? "Visitors can change this (value below is the starting value)" : "Locked — visitors won't see this"}
              </label>
              <ParamField p={p} value={d.presetParams[p.key] ?? p.defaultValue} onChange={(v) => setD((s) => ({ ...s, presetParams: { ...s.presetParams, [p.key]: v } }))} upload={upload} />
            </div>
          ))}
        </div>
        <div className="panel h-fit space-y-4 p-6">
          <div className="space-y-2"><Label>App name</Label><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Link</Label>
            <div className="flex items-center gap-1 text-sm"><span className="text-muted-foreground">/a/</span><Input value={d.slug} onChange={(e) => setD({ ...d, slug: slugify(e.target.value) })} /></div>
          </div>
          <div className="space-y-2"><Label>Description</Label><Textarea rows={3} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="What this app makes" /></div>
          <div className="flex items-center justify-between"><Label>Published</Label><Switch checked={d.isPublished} onCheckedChange={(v) => setD({ ...d, isPublished: v })} /></div>
          <div className="flex items-center justify-between"><Label>Allow embedding on other sites</Label><Switch checked={d.allowEmbed} onCheckedChange={(v) => setD({ ...d, allowEmbed: v })} /></div>
          <p className="text-xs text-muted-foreground">Renders from your app run on your connected GPU and show up in your Jobs and Gallery.</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending && <Loader2 className="animate-spin" />} Save app</Button>
            <Button variant="ghost" onClick={onDone}>Cancel</Button>
          </div>
        </div>
      </div>
    </>
  );
}
