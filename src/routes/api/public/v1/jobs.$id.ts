import { createFileRoute } from "@tanstack/react-router";
import { absolutize, authApiKey } from "@/lib/api-auth.server";
import { refreshJobRow } from "@/lib/jobs.server";

// Public API: check a job started with the same key owner's account.
export const Route = createFileRoute("/api/public/v1/jobs/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authApiKey(request);
        if ("error" in auth) return auth.error;
        const id = Number(params.id);
        if (!Number.isInteger(id)) return Response.json({ error: "Bad job id" }, { status: 400 });
        try {
          return Response.json(absolutize(await refreshJobRow(auth.supabase, auth.userId, id), request));
        } catch {
          return Response.json({ error: "Job not found" }, { status: 404 });
        }
      },
    },
  },
});
