import { createFileRoute } from "@tanstack/react-router";
import { fetchComfy, verifyMedia } from "@/lib/comfy.server";

// Streams a generated file from the ComfyUI server that produced it.
// Access is granted by a short-lived signature issued to the file's owner.
export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const p = new URL(request.url).searchParams;
        const o = p.get("o") ?? "", e = p.get("e") ?? "", s = p.get("s") ?? "";
        if (!verifyMedia(o, e, s)) return new Response("Link expired", { status: 403 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: out } = await supabaseAdmin.from("outputs").select("filename, subfolder, jobs(worker_url)").eq("id", Number(o)).maybeSingle();
        const workerUrl = (out as any)?.jobs?.worker_url as string | undefined;
        if (!out || !workerUrl) return new Response("Not found", { status: 404 });
        const path = `/view?filename=${encodeURIComponent(out.filename)}&subfolder=${encodeURIComponent(out.subfolder)}&type=output`;
        try {
          const headers: Record<string, string> = {};
          const range = request.headers.get("range");
          if (range) headers["Range"] = range;
          const r = await fetchComfy(workerUrl, path, { headers, timeoutMs: 60000 });
          if (!r.ok && r.status !== 206) return new Response("File unavailable on the GPU server", { status: r.status });
          const h = new Headers();
          for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) {
            const v = r.headers.get(k);
            if (v) h.set(k, v);
          }
          h.set("cache-control", "private, max-age=3600");
          return new Response(r.body, { status: r.status, headers: h });
        } catch {
          return new Response("GPU server unreachable", { status: 502 });
        }
      },
    },
  },
});
