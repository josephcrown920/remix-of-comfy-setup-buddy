import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { absolutize, authApiKey } from "@/lib/api-auth.server";
import { submitJob } from "@/lib/jobs.server";

const Body = z.object({
  workflowId: z.string().max(100),
  params: z.record(z.unknown()).default({}),
  workerId: z.number().int().optional(),
});

// Public API: start a render on the key owner's GPUs. POST { workflowId, params }
export const Route = createFileRoute("/api/public/v1/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authApiKey(request);
        if ("error" in auth) return auth.error;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Body must be { workflowId, params }" }, { status: 400 });
        try {
          const job = await submitJob(auth.supabase, auth.userId, parsed.data);
          return Response.json(absolutize(job, request), { status: 201 });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "Could not start the job" }, { status: 400 });
        }
      },
    },
  },
});
