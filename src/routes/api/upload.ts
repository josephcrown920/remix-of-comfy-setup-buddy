import { createFileRoute } from "@tanstack/react-router";
import { fetchComfy } from "@/lib/comfy.server";

const MAX_BYTES = 100 * 1024 * 1024;

// Uploads an input file (image/video/audio) to the signed-in user's ComfyUI server.
export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
        if (!token) return Response.json({ error: "Sign in required" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: u } = await supabaseAdmin.auth.getUser(token);
        if (!u.user) return Response.json({ error: "Sign in required" }, { status: 401 });
        const len = Number(request.headers.get("content-length"));
        if (Number.isFinite(len) && len > MAX_BYTES) return Response.json({ error: "File must be 100 MB or smaller." }, { status: 413 });

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
        if (file.size > MAX_BYTES) return Response.json({ error: "File must be 100 MB or smaller." }, { status: 413 });

        const { data: s } = await supabaseAdmin.from("user_settings").select("comfy_url, saved_gpus").eq("user_id", u.user.id).maybeSingle();
        const url = s?.comfy_url || (s?.saved_gpus as any[] | undefined)?.[0]?.url;
        if (!url) return Response.json({ error: "Add a ComfyUI server in Settings first." }, { status: 400 });

        const isAudio = file.type.startsWith("audio/");
        const fd = new FormData();
        fd.append("image", file, file.name);
        fd.append("overwrite", "true");
        if (isAudio) fd.append("subfolder", "audio");
        try {
          const r = await fetchComfy(url, "/upload/image", { method: "POST", body: fd, timeoutMs: 120000 });
          if (!r.ok) return Response.json({ error: `ComfyUI upload failed (${r.status})` }, { status: 502 });
          const d = (await r.json()) as { name: string; subfolder?: string };
          const sub = d.subfolder || (isAudio ? "audio" : "");
          return Response.json({ name: sub ? `${sub}/${d.name}` : d.name });
        } catch (e) {
          return Response.json({ error: `Could not reach ComfyUI: ${e instanceof Error ? e.message : ""}` }, { status: 502 });
        }
      },
    },
  },
});
