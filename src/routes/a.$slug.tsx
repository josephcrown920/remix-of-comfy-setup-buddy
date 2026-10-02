import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Download, Loader2, Play } from "lucide-react";
import { checkPublicRun, getPublicApp, runPublicApp } from "@/lib/apps.functions";
import { ParamField, appUploader } from "@/components/studio/param-field";
import { MediaThumb } from "@/components/studio/media";
import { Logo } from "@/components/studio/logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/a/$slug")({
  validateSearch: z.object({ embed: z.coerce.string().optional() }),
  loader: ({ params }) => getPublicApp({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    const t = loaderData?.found ? `${loaderData.name} — made with Aurora Studio` : "App unavailable — Aurora Studio";
    const desc = loaderData?.found ? loaderData.description : "This workflow app isn't available.";
    return { meta: [
      { title: t }, { name: "description", content: desc },
      { property: "og:title", content: t }, { property: "og:description", content: desc },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ] };
  },
  component: PublicApp,
});

type Run = { runId: number; token: string };

function PublicApp() {
  const app = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { embed } = Route.useSearch();
  const isEmbed = embed === "1" || embed === "true";
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [run, setRun] = useState<Run | null>(null);
  const start = useServerFn(runPublicApp);
  const check = useServerFn(checkPublicRun);
  const upload = useMemo(() => appUploader(slug), [slug]);

  useEffect(() => {
    if (!app.found) return;
    const v: Record<string, unknown> = {};
    for (const f of app.fields) if (f.defaultValue !== null && f.defaultValue !== undefined) v[f.key] = f.defaultValue;
    setValues(v);
  }, [app]);

  const go = useMutation({
    mutationFn: () => start({ data: { slug, values } }),
    onSuccess: (r) => setRun(r),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't start"),
  });
  const status = useQuery({
    queryKey: ["public-run", run?.runId],
    enabled: !!run,
    queryFn: () => check({ data: run! }),
    refetchInterval: (q) => (q.state.data && !["running", "pending"].includes(q.state.data.status) ? false : 3000),
  });

  if (!app.found || (isEmbed && !app.allowEmbed)) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-muted-foreground">This app isn't available.</div>;
  }
  const busy = go.isPending || (!!run && (!status.data || ["running", "pending"].includes(status.data.status)));
  const missing = app.fields.filter((p) => p.required && (values[p.key] === undefined || values[p.key] === ""));

  return (
    <div className={isEmbed ? "p-4" : "min-h-screen px-4 py-10"}>
      <div className="mx-auto max-w-2xl">
        {!isEmbed && <div className="mb-8"><Logo /></div>}
        <div className="panel p-6 md:p-8">
          <div className="eyebrow">{app.workflowName}</div>
          <h1 className="mt-2 text-3xl">{app.name}</h1>
          {app.description && <p className="mt-2 text-muted-foreground">{app.description}</p>}
          <form className="mt-8 space-y-6" onSubmit={(e) => { e.preventDefault(); setRun(null); go.mutate(); }}>
            {app.fields.map((p) => <ParamField key={p.key} p={p} value={values[p.key]} onChange={(v) => setValues((s) => ({ ...s, [p.key]: v }))} upload={upload} />)}
            <Button type="submit" size="lg" className="w-full" disabled={busy || missing.length > 0}>
              {busy ? <Loader2 className="animate-spin" /> : <Play />} {busy ? "Rendering…" : "Generate"}
            </Button>
          </form>
          {run && (
            <div className="mt-8 space-y-4">
              {status.data?.status === "failed" && <p className="text-sm text-destructive">{status.data.error ?? "Render failed."}</p>}
              {status.data?.status === "cancelled" && <p className="text-sm text-muted-foreground">This render was cancelled.</p>}
              {busy && <p className="text-sm text-muted-foreground">Working on it — this can take a minute or more.</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {(status.data?.outputs ?? []).map((o) => (
                  <div key={o.id} className="space-y-2">
                    <MediaThumb url={o.url} type={o.outputType} />
                    <a href={o.url} download className="inline-flex items-center gap-1 text-xs text-primary"><Download className="h-3.5 w-3.5" /> Download</a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Made with Aurora Studio</p>
      </div>
    </div>
  );
}
