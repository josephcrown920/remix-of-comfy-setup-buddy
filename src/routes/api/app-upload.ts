import { createFileRoute } from "@tanstack/react-router";
import { fetchComfy } from "@/lib/comfy.server";

const MAX_BYTES = 50 * 1024 * 1024;

// Lets visitors of a published workflow app upload an input file to the app owner's GPU.
export const Route = createFileRoute("/api/app-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const len = Number(request.headers.get("content-length"));
        if (Number.isFinite(len) && len > MAX_BYTES) return Response.json({ error: "File must be 50 MB or smaller." }, { status: 413 });
        const form = await request.formData();
        const slug = String(form.get("slug") ?? "").slice(0, 60);
        const file = form.get("file");
        if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
        if (file.size > MAX_BYTES) return Response.json({ error: "File must be 50 MB or smaller." }, { status: 413 });
        if (!/^(image|video|audio)\//.test(file.type)) return Response.json({ error: "Only images, video or audio." }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: app } = await supabaseAdmin.from("workflow_apps").select("owner_id").eq("slug", slug).eq("is_published", true).maybeSingle();
        if (!app) return Response.json({ error: "App not available" }, { status: 404 });
        const { data: s } = await supabaseAdmin.from("user_settings").select("comfy_url, saved_gpus").eq("user_id", app.owner_id).maybeSingle();
        const url = s?.comfy_url || (s?.saved_gpus as any[] | undefined)?.[0]?.url;
        if (!url) return Response.json({ error: "This app's GPU isn't connected." }, { status: 400 });

        const isAudio = file.type.startsWith("audio/");
        const fd = new FormData();
        fd.append("image", file, `app-${crypto.randomUUID().slice(0, 8)}-${file.name.replace(/[^\w.-]/g, "_").slice(-60)}`);
        if (isAudio) fd.append("subfolder", "audio");
        try {
          const r = await fetchComfy(url, "/upload/image", { method: "POST", body: fd, timeoutMs: 120000 });
          if (!r.ok) return Response.json({ error: `Upload failed (${r.status})` }, { status: 502 });
          const d = (await r.json()) as { name: string; subfolder?: string };
          const sub = d.subfolder || (isAudio ? "audio" : "");
          return Response.json({ name: sub ? `${sub}/${d.name}` : d.name });
        } catch {
          return Response.json({ error: "The app's GPU is offline." }, { status: 502 });
        }
      },
    },
  },
});
