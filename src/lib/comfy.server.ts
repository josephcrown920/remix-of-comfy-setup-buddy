import { createHmac, timingSafeEqual } from "crypto";

/** Reject obviously internal targets so the server can't be used to probe private networks. */
export function validateComfyTarget(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Enter a full address, e.g. https://my-gpu.trycloudflare.com" };
  }
  if (!["http:", "https:"].includes(u.protocol)) return { ok: false, error: "Only http(s) addresses are allowed." };
  const h = u.hostname.toLowerCase();
  const privateHost =
    h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "0.0.0.0" || h === "[::1]" ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  if (privateHost) {
    return { ok: false, error: "Private/local addresses can't be reached from the cloud. Use a public tunnel URL (ngrok, Cloudflare, RunPod proxy)." };
  }
  return { ok: true, url: u.toString().replace(/\/$/, "") };
}

function parseTarget(comfyUrl: string) {
  const u = new URL(comfyUrl);
  const headers: Record<string, string> = {};
  if (u.username || u.password) {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString("base64");
    u.username = "";
    u.password = "";
  }
  return { baseUrl: u.toString().replace(/\/$/, ""), headers };
}

export async function fetchComfy(comfyUrl: string, path: string, init?: RequestInit & { timeoutMs?: number }) {
  const v = validateComfyTarget(comfyUrl);
  if (!v.ok) throw new Error(v.error);
  const { baseUrl, headers } = parseTarget(v.url);
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...headers, "ngrok-skip-browser-warning": "1", ...(init?.headers as Record<string, string> | undefined) },
    signal: init?.signal ?? AbortSignal.timeout(init?.timeoutMs ?? 15000),
  });
}

export function redactUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

function secret() {
  const s = process.env["MEDIA_SIGNING_SECRET"];
  if (!s) throw new Error("MEDIA_SIGNING_SECRET missing");
  return s;
}

export function signMedia(outputId: number, ttlSec = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = createHmac("sha256", secret()).update(`${outputId}.${exp}`).digest("hex");
  return `/api/media?o=${outputId}&e=${exp}&s=${sig}`;
}

export function verifyMedia(outputId: string, exp: string, sig: string) {
  if (!/^\d+$/.test(outputId) || !/^\d+$/.test(exp) || !/^[a-f0-9]{64}$/.test(sig)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  const expected = createHmac("sha256", secret()).update(`${outputId}.${exp}`).digest("hex");
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

type HistoryOutput = { filename: string; subfolder?: string; type?: string };

/** Pull status + outputs for a prompt from ComfyUI's /history and /queue. */
export async function inspectPrompt(comfyUrl: string, promptId: string) {
  const res = await fetchComfy(comfyUrl, `/history/${encodeURIComponent(promptId)}`);
  if (!res.ok) throw new Error(`ComfyUI history failed (${res.status})`);
  const data = (await res.json()) as Record<string, any>;
  const entry = data[promptId];
  if (!entry) {
    const q = await fetchComfy(comfyUrl, "/queue").then((r) => (r.ok ? r.json() : null)).catch(() => null) as any;
    const running = q?.queue_running?.some((i: any[]) => i?.[1] === promptId);
    const pending = q?.queue_pending?.some((i: any[]) => i?.[1] === promptId);
    return { state: running ? "running" : pending ? "pending" : "unknown", outputs: [] as { filename: string; subfolder: string; outputType: string }[], error: null as string | null };
  }
  const statusStr = entry.status?.status_str as string | undefined;
  const outputs: { filename: string; subfolder: string; outputType: string }[] = [];
  for (const nodeOut of Object.values<any>(entry.outputs ?? {})) {
    for (const [kind, list] of Object.entries<any>(nodeOut)) {
      if (!Array.isArray(list)) continue;
      for (const f of list as HistoryOutput[]) {
        if (!f?.filename || (f.type && f.type !== "output")) continue;
        const ext = f.filename.split(".").pop()?.toLowerCase() ?? "";
        const outputType = ["mp4", "webm", "mov", "gif", "webp"].includes(ext) && kind !== "images"
          ? "video"
          : ["mp4", "webm", "mov"].includes(ext) ? "video"
          : ["wav", "mp3", "flac", "ogg"].includes(ext) ? "audio" : "image";
        outputs.push({ filename: f.filename, subfolder: f.subfolder ?? "", outputType });
      }
    }
  }
  let error: string | null = null;
  if (statusStr === "error") {
    const msg = (entry.status?.messages ?? []).find((m: any[]) => m?.[0] === "execution_error")?.[1];
    error = msg?.exception_message ?? "ComfyUI reported an execution error.";
  }
  return { state: statusStr === "error" ? "failed" : entry.status?.completed || outputs.length ? "completed" : "running", outputs, error };
}
