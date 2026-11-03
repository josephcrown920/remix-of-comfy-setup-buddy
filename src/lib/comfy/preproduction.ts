import type { WorkflowDef } from "./workflows";

export const PREPRODUCTION_WORKFLOWS: WorkflowDef[] = [{
  id: "previs-shot-drafts", name: "Previs — Shot Drafts", category: "preproduction", icon: "Clapperboard",
  description: "Rough storyboard frames for the hook: test composition before final rendering. Independent drafts, not identity-locked multi-angle performances. Requires a ComfyUI GPU and an SD 1.5 checkpoint.",
  params: [
    { key: "prompt", label: "Shot direction", type: "text", required: true, defaultValue: "Music video hook performance beside a car in a garage, low-angle medium shot", max: 4000 },
    { key: "checkpoint", label: "Installed SD 1.5 checkpoint", type: "text", required: true, defaultValue: "v1-5-pruned-emaonly.safetensors" },
    { key: "aspect_ratio", label: "Frame", type: "select", defaultValue: "9:16", options: ["9:16", "16:9", "1:1"] },
    { key: "batch_size", label: "Draft count", type: "slider", defaultValue: "4", min: 1, max: 8 },
    { key: "steps", label: "Sampling steps", type: "slider", defaultValue: "12", min: 4, max: 20 },
    { key: "seed", label: "Seed", type: "number", defaultValue: 42, min: 0, max: 2147483647 },
  ],
}];

function bounded(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

export function buildPrevisPrompt(params: Record<string, unknown>) {
  const aspect = String(params.aspect_ratio ?? "9:16");
  const [width, height] = aspect === "16:9" ? [512, 288] : aspect === "1:1" ? [512, 512] : [288, 512];
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: String(params.checkpoint ?? "v1-5-pruned-emaonly.safetensors") } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: `${String(params.prompt ?? "")}, rough monochrome storyboard sketch, clear blocking, cinematic composition, no lettering`, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: "text, watermark, logo, bad anatomy, blurry", clip: ["1", 1] } },
    "4": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: bounded(params.batch_size, 4, 1, 8) } },
    "5": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0], seed: bounded(params.seed, 42, 0, 2147483647), steps: bounded(params.steps, 12, 4, 20), cfg: 7, sampler_name: "euler", scheduler: "normal", denoise: 1 } },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "aurora-previs" } },
  };
}