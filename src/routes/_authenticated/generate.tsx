import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Clock, Loader2, Upload, CheckCircle2, Play } from "lucide-react";
import { createJob, listWorkflows } from "@/lib/studio.functions";
import type { WorkflowParam } from "@/lib/comfy/workflows";
import { PageHeader } from "@/components/studio/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
            {wf.params.map((p) => <Field key={p.key} p={p} value={values[p.key]} onChange={(v) => set(p.key, v)} />)}
            <Button type="submit" size="lg" disabled={mutation.isPending || missing.length > 0} className="w-full md:w-auto">
              {mutation.isPending ? <Loader2 className="animate-spin" /> : <Play />} Render
            </Button>
            {missing.length > 0 && <p className="text-xs text-muted-foreground">Still needed: {missing.map((m) => m.label).join(", ")}</p>}
          </form>
        </div>
        <img src={WORKFLOW_THUMBNAILS[wf.id] ?? WORKFLOW_THUMBNAILS["custom-workflow"]} alt="" className="panel hidden w-full object-cover lg:block lg:max-h-[480px]" />
      </div>
    </>
  );
}

function Field({ p, value, onChange }: { p: WorkflowParam; value: unknown; onChange: (v: unknown) => void }) {
  const label = (
    <div>
      <Label className="text-sm font-semibold">{p.label}{p.required && <span className="text-primary"> *</span>}</Label>
      {p.description && <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>}
    </div>
  );
  switch (p.type) {
    case "file":
      return <div className="space-y-2">{label}<FileField accept={p.accept ?? undefined} value={value as string | undefined} onChange={onChange} /></div>;
    case "textarea":
    case "json":
      return <div className="space-y-2">{label}<Textarea rows={p.type === "json" ? 10 : 4} className="font-mono text-xs" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
    case "select":
      return (
        <div className="space-y-2">{label}
          <Select value={String(value ?? "")} onValueChange={onChange}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>{(p.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      );
    case "slider": {
      const n = Number(value ?? p.min ?? 0);
      return (
        <div className="space-y-3">
          <div className="flex items-end justify-between">{label}<span className="font-mono text-sm text-primary">{n}</span></div>
          <Slider min={p.min ?? 0} max={p.max ?? 100} step={1} value={[n]} onValueChange={([v]) => onChange(v)} />
        </div>
      );
    }
    case "number":
      return <div className="space-y-2">{label}<Input type="number" min={p.min ?? undefined} max={p.max ?? undefined} value={(value as string | number) ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} /></div>;
    case "boolean":
      return <div className="flex items-center justify-between gap-4">{label}<Switch checked={!!value && value !== "false"} onCheckedChange={onChange} /></div>;
    default:
      return <div className="space-y-2">{label}{p.key.includes("prompt") ? <Textarea rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} /> : <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />}</div>;
  }
}

function FileField({ accept, value, onChange }: { accept?: string | undefined; value?: string | undefined; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd, headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      const j = (await r.json()) as { name?: string; error?: string };
      if (!r.ok || !j.name) throw new Error(j.error ?? "Upload failed");
      onChange(j.name);
      if (file.type.startsWith("image/")) setPreview(URL.createObjectURL(file));
      toast.success("Uploaded to your GPU");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-input p-4 transition-colors hover:border-primary/60">
      <input type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {preview ? <img src={preview} alt="" className="h-14 w-14 rounded-lg object-cover" /> : (
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : value ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
        </div>
      )}
      <div className="min-w-0 text-sm">
        <div className="font-medium">{busy ? "Uploading…" : value ? "Replace file" : "Choose a file"}</div>
        <div className="truncate text-xs text-muted-foreground">{value ?? accept ?? "Any file"}</div>
      </div>
    </label>
  );
}
