import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Clock, Loader2, Play, Download, FileJson, AppWindow, FileUp } from "lucide-react";
import { createJob, listWorkflows } from "@/lib/studio.functions";
import { exportComfyGraph } from "@/lib/apps.functions";
import { ParamField, studioUploader, downloadJson, PORTABLE_FORMAT } from "@/components/studio/param-field";
import type { WorkflowParam } from "@/lib/comfy/workflows";
import { PageHeader } from "@/components/studio/shell";
import { Button } from "@/components/ui/button";
import { WORKFLOW_THUMBNAILS } from "@/lib/thumbnails";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/generate")({
  validateSearch: z.object({ workflow: z.string().optional(), category: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Workflows — Aurora Studio" },
      { name: "description", content: "Pick a ComfyUI template and render it on your GPU." },
      { property: "og:title", content: "Workflows — Aurora Studio" },
      { property: "og:description", content: "Pick a ComfyUI template and render it on your GPU." },
    ],
  }),
  component: Generate,
});

function prettyCategory(c: string) {
  return c.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function Generate() {
  const { workflow: selectedId, category } = Route.useSearch();
  const navigate = useNavigate({ from: "/generate" });
  const wfs = useQuery({ queryKey: ["workflows"], queryFn: useServerFn(listWorkflows), staleTime: Infinity });
  const categories = useMemo(() => Array.from(new Set((wfs.data ?? []).map((w) => w.category))), [wfs.data]);
  const selected = wfs.data?.find((w) => w.id === selectedId);

  if (selected) return <WorkflowForm wf={selected} onBack={() => navigate({ search: {} })} />;

  const list = (wfs.data ?? []).filter((w) => !category || w.category === category);
  return (
    <>
      <PageHeader eyebrow="Templates" title="Workflows" description="Pick a template — Aurora builds the ComfyUI graph for you." />
      <ImportButton onOpen={(id) => navigate({ search: { workflow: id } })} />
      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => navigate({ search: {} })} className={`rounded-full border px-3 py-1 text-sm ${!category ? "border-primary text-primary" : "text-muted-foreground"}`}>All</button>
        {categories.map((c) => (
          <button key={c} onClick={() => navigate({ search: { category: c } })} className={`rounded-full border px-3 py-1 text-sm ${category === c ? "border-primary text-primary" : "text-muted-foreground"}`}>
            {prettyCategory(c)}
          </button>
        ))}
      </div>
      {wfs.isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((w) => (
            <button key={w.id} onClick={() => navigate({ search: { workflow: w.id } })} className="panel group overflow-hidden text-left transition-colors hover:border-primary/60">
              <img src={WORKFLOW_THUMBNAILS[w.id] ?? WORKFLOW_THUMBNAILS["custom-workflow"]} alt="" className="h-40 w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              <div className="p-5">
                <div className="eyebrow">{prettyCategory(w.category)}</div>
                <h3 className="mt-2 text-lg">{w.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{w.description}</p>
                {w.estimatedTime && <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {w.estimatedTime}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

type Wf = { id: string; name: string; description: string; category: string; params: WorkflowParam[] };

function defaults(params: WorkflowParam[]) {
  const v: Record<string, unknown> = {};
  for (const p of params) if (p.defaultValue !== null && p.defaultValue !== undefined) v[p.key] = p.defaultValue;
  return v;
}

function WorkflowForm({ wf, onBack }: { wf: Wf; onBack: () => void }) {
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<string, unknown>>(() => defaults(wf.params));
  useEffect(() => {
    const raw = sessionStorage.getItem("aurora-import");
    if (!raw) return;
    sessionStorage.removeItem("aurora-import");
    try {
      const j = JSON.parse(raw) as { workflowId: string; params: Record<string, unknown> };
      if (j.workflowId === wf.id) { setValues((v) => ({ ...v, ...j.params })); toast.success("Imported settings loaded"); }
    } catch { /* ignore */ }
  }, [wf.id]);
  const graph = useServerFn(exportComfyGraph);
  const upload = useMemo(() => studioUploader(async () => (await supabase.auth.getSession()).data.session?.access_token ?? ""), []);
  async function exportGraph() {
    try { downloadJson(`${wf.id}-comfyui-api.json`, await graph({ data: { workflowId: wf.id, params: values } })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
  }
  const submit = useServerFn(createJob);
  const mutation = useMutation({
    mutationFn: () => submit({ data: { workflowId: wf.id, params: values } }),
    onSuccess: () => {
      toast.success("Queued on your GPU");
      navigate({ to: "/jobs" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not queue job"),
  });
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));
  const missing = wf.params.filter((p) => p.required && (values[p.key] === undefined || values[p.key] === ""));

  return (
    <>
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All workflows</button>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="panel p-6 md:p-8">
          <div className="eyebrow">{prettyCategory(wf.category)}</div>
          <h1 className="mt-2 text-3xl">{wf.name}</h1>
          <p className="mt-2 text-muted-foreground">{wf.description}</p>
          <form className="mt-8 space-y-6" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
            {wf.params.map((p) => <ParamField key={p.key} p={p} value={values[p.key]} onChange={(v) => set(p.key, v)} upload={upload} />)}
            <Button type="submit" size="lg" disabled={mutation.isPending || missing.length > 0} className="w-full md:w-auto">
              {mutation.isPending ? <Loader2 className="animate-spin" /> : <Play />} Render
            </Button>
            {missing.length > 0 && <p className="text-xs text-muted-foreground">Still needed: {missing.map((m) => m.label).join(", ")}</p>}
          </form>
        </div>
        <div className="space-y-4">
          <img src={WORKFLOW_THUMBNAILS[wf.id] ?? WORKFLOW_THUMBNAILS["custom-workflow"]} alt="" className="panel hidden w-full object-cover lg:block lg:max-h-[360px]" />
          <div className="panel space-y-2 p-5">
            <div className="eyebrow">Share &amp; port</div>
            <Button variant="secondary" className="w-full justify-start" onClick={() => { sessionStorage.setItem("aurora-app-draft", JSON.stringify({ workflowId: wf.id, params: values })); navigate({ to: "/apps" }); }}><AppWindow /> Turn into an app</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => downloadJson(`${wf.id}.aurora.json`, { format: PORTABLE_FORMAT, version: 1, workflowId: wf.id, name: wf.name, params: values })}><Download /> Export settings file</Button>
            <Button variant="outline" className="w-full justify-start" onClick={exportGraph}><FileJson /> Export ComfyUI graph</Button>
            <p className="text-xs text-muted-foreground">The ComfyUI graph opens in ComfyUI (Load → API format) or any app that talks to ComfyUI.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function ImportButton({ onOpen }: { onOpen: (workflowId: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  async function read(file: File) {
    try {
      const j = JSON.parse(await file.text()) as any;
      if (j?.format === PORTABLE_FORMAT && typeof j.workflowId === "string") {
        sessionStorage.setItem("aurora-import", JSON.stringify({ workflowId: j.workflowId, params: j.params ?? {} }));
        return onOpen(j.workflowId);
      }
      if (j?.format === "aurora-studio/app" && typeof j.workflowId === "string") {
        sessionStorage.setItem("aurora-import", JSON.stringify({ workflowId: j.workflowId, params: j.presetParams ?? {} }));
        return onOpen(j.workflowId);
      }
      if (Array.isArray(j?.nodes)) throw new Error("That's a ComfyUI editor file. In ComfyUI use Workflow → Export (API) and import that instead.");
      if (j && typeof j === "object" && Object.values(j).some((n: any) => n?.class_type)) {
        sessionStorage.setItem("aurora-import", JSON.stringify({ workflowId: "custom-workflow", params: { workflow_json: JSON.stringify(j, null, 2) } }));
        return onOpen("custom-workflow");
      }
      throw new Error("Unrecognised workflow file.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file");
    }
  }
  return (
    <div className="mb-4">
      <input ref={ref} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()}><FileUp /> Import workflow file</Button>
      <span className="ml-3 text-xs text-muted-foreground">Accepts Aurora files or ComfyUI API-format JSON.</span>
    </div>
  );
}
