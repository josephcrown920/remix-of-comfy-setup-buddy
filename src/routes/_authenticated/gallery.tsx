import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { listOutputs } from "@/lib/studio.functions";
import { PageHeader } from "@/components/studio/shell";
import { MediaThumb } from "@/components/studio/media";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/gallery")({
  head: () => ({
    meta: [
      { title: "Gallery — Aurora Studio" },
      { name: "description", content: "Every image, video and audio file your workflows produced." },
      { property: "og:title", content: "Gallery — Aurora Studio" },
      { property: "og:description", content: "Every image, video and audio file your workflows produced." },
    ],
  }),
  component: Gallery,
});

const types = [["", "All"], ["image", "Images"], ["video", "Videos"], ["audio", "Audio"]] as const;

function Gallery() {
  const [type, setType] = useState("");
  const [open, setOpen] = useState<{ url: string; outputType: string; workflowName: string; filename: string } | null>(null);
  const fetchOutputs = useServerFn(listOutputs);
  const q = useQuery({ queryKey: ["outputs", type], queryFn: () => fetchOutputs({ data: type ? { type, limit: 200 } : { limit: 200 } }) });

  return (
    <>
      <PageHeader eyebrow="Library" title="Gallery" />
      <div className="mb-6 flex gap-2">
        {types.map(([v, l]) => (
          <button key={v} onClick={() => setType(v)} className={`rounded-full border px-3 py-1 text-sm ${type === v ? "border-primary text-primary" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      {q.isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : !q.data?.length ? (
        <div className="panel p-10 text-center text-muted-foreground">Nothing here yet — finished renders show up automatically.</div>
      ) : (
        <div className="columns-2 gap-3 md:columns-3 lg:columns-4 [&>*]:mb-3">
          {q.data.map((o) => (
            <button key={o.id} onClick={() => setOpen(o)} className="block w-full break-inside-avoid">
              <MediaThumb url={o.url} type={o.outputType} />
            </button>
          ))}
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-4xl border-border bg-card">
          <DialogTitle>{open?.workflowName}</DialogTitle>
          {open && <MediaThumb url={open.url} type={open.outputType} controls className="max-h-[70vh] object-contain" />}
          {open && <Button asChild variant="outline" className="rounded-xl"><a href={open.url} download={open.filename}><Download /> Download</a></Button>}
        </DialogContent>
      </Dialog>
    </>
  );
}
