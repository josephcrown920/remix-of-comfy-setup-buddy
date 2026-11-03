import { createHash } from "crypto";

const hits = new Map<string, number[]>();

/** Verifies a personal API key (Bearer aur_...) and returns the owner. Rate-limited to 30 requests/min per key. */
export async function authApiKey(request: Request) {
  const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!/^aur_[a-f0-9]{48}$/.test(key)) return { error: Response.json({ error: "Missing or invalid API key" }, { status: 401 }) } as const;
  const hash = createHash("sha256").update(key).digest("hex");
  const now = Date.now();
  const recent = (hits.get(hash) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) return { error: Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } }) } as const;
  recent.push(now); hits.set(hash, recent);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("api_keys").select("id, owner_id").eq("key_hash", hash).maybeSingle();
  if (!data) return { error: Response.json({ error: "Missing or invalid API key" }, { status: 401 }) } as const;
  await supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { userId: data.owner_id as string, supabase: supabaseAdmin } as const;
}

export function absolutize(job: { outputs: { url: string }[] }, request: Request) {
  const origin = new URL(request.url).origin;
  return { ...job, outputs: job.outputs.map((o) => ({ ...o, url: origin + o.url })) };
}
