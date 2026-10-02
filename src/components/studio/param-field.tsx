import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import type { WorkflowParam } from "@/lib/comfy/workflows";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Uploader = (file: File) => Promise<string>;

export function ParamField({ p, value, onChange, upload }: { p: WorkflowParam; value: unknown; onChange: (v: unknown) => void; upload: Uploader }) {
  const label = (
    <div>
      <Label className="text-sm font-semibold">{p.label}{p.required && <span className="text-primary"> *</span>}</Label>
      {p.description && <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>}
    </div>
  );
  switch (p.type) {
    case "file":
      return <div className="space-y-2">{label}<FileField accept={p.accept ?? undefined} value={value as string | undefined} onChange={onChange} upload={upload} /></div>;
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
      return <div className="space-y-2">{label}{p.key.includes("prompt") || p.key.includes("json") ? <Textarea rows={p.key.includes("json") ? 10 : 3} className={p.key.includes("json") ? "font-mono text-xs" : ""} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} /> : <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />}</div>;
  }
}

function FileField({ accept, value, onChange, upload }: { accept?: string | undefined; value?: string | undefined; onChange: (v: string) => void; upload: Uploader }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  async function go(file: File) {
    setBusy(true);
    try {
      onChange(await upload(file));
      if (file.type.startsWith("image/")) setPreview(URL.createObjectURL(file));
      toast.success("Uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-input p-4 transition-colors hover:border-primary/60">
      <input type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && go(e.target.files[0])} />
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

async function postUpload(url: string, fd: FormData, headers?: Record<string, string>) {
  const r = await fetch(url, { method: "POST", body: fd, headers: headers ?? {} });
  const j = (await r.json()) as { name?: string; error?: string };
  if (!r.ok || !j.name) throw new Error(j.error ?? "Upload failed");
  return j.name;
}

export function studioUploader(getToken: () => Promise<string>): Uploader {
  return async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return postUpload("/api/upload", fd, { Authorization: `Bearer ${await getToken()}` });
  };
}

export function appUploader(slug: string): Uploader {
  return async (file) => {
    const fd = new FormData();
    fd.append("slug", slug);
    fd.append("file", file);
    return postUpload("/api/app-upload", fd);
  };
}

/** Portable file format for moving workflows between Aurora Studio and other apps. */
export const PORTABLE_FORMAT = "aurora-studio/workflow";
export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "my-app";
}
