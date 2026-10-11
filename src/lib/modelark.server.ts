// BytePlus ModelArk (hosted Seedance) — ported from the original app's lib/modelark.ts.
// Server-only: reads MODELARK_API_KEY and never exposes it to the browser.
import { fetchComfy } from "@/lib/comfy.server";

const BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";
export const MODELARK_DEFAULT_MODEL = "dreamina-seedance-2-5-260628";
export const MODELARK_WORKFLOWS = new Set(["perform-anywhere-seedance", "modelark-seedance-reference-video"]);
export const ARK_PREFIX = "ark:";
type Kind = "image" | "video" | "audio";

export function isModelArkWorkflow(id: string) {
  return MODELARK_WORKFLOWS.has(id);
}
export function modelArkConfigured() {
  return Boolean(process.env.MODELARK_API_KEY?.trim());
}

function key() {
  const k = process.env.MODELARK_API_KEY?.trim();
  if (!k) throw new Error("Seedance isn't set up yet — the ModelArk key is missing.");
  return k;
}

async function ark(path: string, init: RequestInit = {}) {
  return fetch(`${process.env.MODELARK_BASE_URL || BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(120_000),
  });
}

function filename(v: unknown, label: string) {
  const f = String(v ?? "").trim();
  if (!f || f.length > 255 || f.includes("\0") || /[\\/]/.test(f) || f === "." || f === "..") {
    throw new Error(`${label} is missing or invalid.`);
  }
  return f;
}

async function readInput(workerUrl: string, name: string, kind: Kind) {
  for (const sub of kind === "audio" ? ["audio", ""] : [""]) {
    const q = new URLSearchParams({ filename: name, subfolder: sub, type: "input" });
    const r = await fetchComfy(workerUrl, `/view?${q}`, { timeoutMs: 120_000 } as any);
    if (r.ok) {
      const ct = r.headers.get("content-type") || "application/octet-stream";
      return { bytes: new Uint8Array(await r.arrayBuffer()), contentType: ct };
    }
  }
  throw new Error(`Couldn't read the uploaded ${kind} from your GPU server.`);
}

function ext(ct: string, kind: Kind) {
  const n = ct.toLowerCase();
  if (n.includes("jpeg")) return "jpg";
  if (n.includes("webp")) return "webp";
  if (n.includes("wav")) return "wav";
  if (n.includes("quicktime")) return "mov";
  if (n.includes("mpeg")) return kind === "audio" ? "mp3" : "mp4";
  return kind === "image" ? "png" : kind === "audio" ? "mp3" : "mp4";
}

async function uploadFile(bytes: Uint8Array, name: string, contentType: string, model?: string) {
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: contentType }), name);
  fd.append("purpose", "user_data");
  fd.append("expire_at", String(Math.floor(Date.now() / 1000) + 7 * 86400));
  if (model && contentType.startsWith("video/")) fd.append("preprocess_configs", JSON.stringify({ video: { model, fps: 2 } }));
  const r = await ark("/files", { method: "POST", body: fd });
  const p = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(`Seedance file upload failed (${r.status}): ${p.error?.message || "unknown error"}`);
  if (p.status === "failed" || !p.download_url) throw new Error(`Seedance couldn't prepare ${name}.`);
  return p.download_url as string;
}

export async function createSeedanceTask(workflowId: string, params: Record<string, unknown>, workerUrl: string) {
  const model = String(params.model || process.env.MODELARK_SEEDANCE_MODEL || MODELARK_DEFAULT_MODEL).trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(model)) throw new Error("The Seedance model ID is invalid.");
  const img = filename(params.source_image, "Opening image");
  const vid = filename(params.source_video, "Performance video");
  const end = params.end_image ? filename(params.end_image, "Closing image") : "";
  const aud = params.source_audio ? filename(params.source_audio, "Reference audio") : "";
  if (workflowId === "modelark-seedance-reference-video" && (!end || !aud)) {
    throw new Error("Seedance Reference Video needs opening and closing images, a reference video, and reference audio.");
  }
  const [a, b, c, d] = await Promise.all([
    readInput(workerUrl, img, "image"),
    end ? readInput(workerUrl, end, "image") : null,
    readInput(workerUrl, vid, "video"),
    aud ? readInput(workerUrl, aud, "audio") : null,
  ]);
  const [imgUrl, endUrl, vidUrl, audUrl] = await Promise.all([
    uploadFile(a.bytes, `opening-frame.${ext(a.contentType, "image")}`, a.contentType),
    b ? uploadFile(b.bytes, `closing-frame.${ext(b.contentType, "image")}`, b.contentType) : null,
    uploadFile(c.bytes, `reference-video.${ext(c.contentType, "video")}`, c.contentType, model),
    d ? uploadFile(d.bytes, `reference-audio.${ext(d.contentType, "audio")}`, d.contentType) : null,
  ]);
  const prompt = String(params.motion_context || params.prompt ||
    "Transfer the performance movement naturally onto the performer in the reference image. Preserve identity, wardrobe, lighting, and camera composition.").trim();
  if (prompt.length > 4000) throw new Error("Direction must be under 4,000 characters.");
  const ratio = String(params.ratio ?? params.aspect_ratio ?? "16:9");
  if (!["16:9", "9:16", "1:1"].includes(ratio)) throw new Error("Aspect ratio must be 16:9, 9:16, or 1:1.");
  const resolution = String(params.resolution ?? "720p");
  if (!["480p", "720p", "1080p"].includes(resolution)) throw new Error("Resolution must be 480p, 720p, or 1080p.");
  const content: any[] = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: imgUrl }, role: "reference_image" },
  ];
  if (endUrl) content.push({ type: "image_url", image_url: { url: endUrl }, role: "reference_image" });
  content.push({ type: "video_url", video_url: { url: vidUrl }, role: "reference_video" });
  if (audUrl) content.push({ type: "audio_url", audio_url: { url: audUrl }, role: "reference_audio" });
  const r = await ark("/contents/generations/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, content, resolution, ratio,
      duration: Math.min(Math.max(Number(params.duration ?? 5), 2), 15),
      generate_audio: params.generate_audio === true || params.generate_audio === "true",
      watermark: false, camera_fixed: false,
    }),
  });
  const p = (await r.json().catch(() => ({}))) as any;
  if (!r.ok || !p.id) throw new Error(`Seedance request failed (${r.status}): ${p.error?.message || "unknown error"}`);
  return p.id as string;
}

export async function getSeedanceTask(taskId: string) {
  const r = await ark(`/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const p = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(`Seedance status check failed (${r.status})`);
  const s = String(p.status ?? "").toLowerCase();
  const state = s === "succeeded" ? "completed" : s === "failed" || s === "cancelled" || s === "expired" ? "failed" : "running";
  return { state, videoUrl: (p.content?.video_url as string) ?? null, error: (p.error?.message as string) ?? null };
}

export async function streamSeedanceVideo(taskId: string, range?: string | null) {
  const t = await getSeedanceTask(taskId);
  if (!t.videoUrl) throw new Error("Video not ready");
  const u = new URL(t.videoUrl);
  if (u.protocol !== "https:" || /^(localhost|127\.|::1)|\.local$/i.test(u.hostname)) throw new Error("Unsafe video URL");
  return fetch(u, { headers: range ? { Range: range } : {}, signal: AbortSignal.timeout(120_000) });
}
