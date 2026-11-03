import { describe, expect, it } from "vitest";
import { buildComfyPrompt } from "./prompts";
import { WORKFLOWS } from "./workflows";

describe("preproduction graphs", () => {
  it("registers both runnable templates in the shared catalog", () => {
    expect(WORKFLOWS.some(w => w.id === "previs-shot-drafts")).toBe(true);
    expect(WORKFLOWS.some(w => w.id === "depth-map")).toBe(true);
  });
  it("makes independent portrait drafts rather than a video or identity pipeline", () => {
    const graph = buildComfyPrompt("previs-shot-drafts", { prompt: "garage", batch_size: 4 }) as any;
    expect(graph["4"].inputs).toEqual({ width: 288, height: 512, batch_size: 4 });
    expect(graph["5"].inputs.steps).toBe(12);
    expect(graph["7"].class_type).toBe("SaveImage");
  });
  it("bounds draft batch and steps before submitting", () => {
    const graph = buildComfyPrompt("previs-shot-drafts", { batch_size: 999, steps: -1 }) as any;
    expect(graph["4"].inputs.batch_size).toBe(8);
    expect(graph["5"].inputs.steps).toBe(4);
  });
  it("feeds the uploaded image into the verified depth estimator and saves its result", () => {
    const graph = buildComfyPrompt("depth-map", { source_image: "scene.png" }) as any;
    expect(graph["1"].inputs.image).toBe("scene.png");
    expect(graph["2"].inputs.model).toBe("depth_anything_v2_vitl_fp32.safetensors");
    expect(graph["3"].class_type).toBe("DepthAnything_V2");
    expect(graph["3"].inputs).toEqual({ da_model: ["2", 0], images: ["1", 0] });
    expect(graph["4"].inputs.images).toEqual(["3", 0]);
  });
});