import latentsync from "@/assets/thumbnails/latentsync.jpg";
import mimicmotion from "@/assets/thumbnails/mimicmotion.jpg";
import cinematicPortrait from "@/assets/thumbnails/cinematic-portrait.jpg";
import svd from "@/assets/thumbnails/svd.jpg";
import reelLoop from "@/assets/thumbnails/reel-loop.jpg";
import productSwap from "@/assets/thumbnails/product-swap.jpg";
import performer from "@/assets/thumbnails/perform-anywhere-performer.jpeg";
import vehicle from "@/assets/thumbnails/perform-anywhere-vehicle.jpeg";
import animatediff from "@/assets/thumbnails/animatediff.jpg";
import sdxl from "@/assets/thumbnails/sdxl-image.jpg";
import filmGrade from "@/assets/thumbnails/film-grade.jpg";
import slowmo from "@/assets/thumbnails/slowmo-upscale.jpg";
import epic from "@/assets/thumbnails/epic-landscape.jpg";
import talking from "@/assets/thumbnails/talking-avatar.jpg";
import blogHero from "@/assets/thumbnails/blog-hero.jpg";

export const WORKFLOW_THUMBNAILS: Record<string, string> = {
  "lip-sync-basic": latentsync,
  "motion-control-animatediff": mimicmotion,
  "seedance-reference-motion": cinematicPortrait,
  "seedance-camera-path": svd,
  "seedance-vertical-social": reelLoop,
  "seedance-product-reveal": productSwap,
  "perform-anywhere-angles": performer,
  "perform-anywhere-motion": vehicle,
  "video-generation-txt2vid": animatediff,
  "img2vid-stable-video": svd,
  "custom-workflow": sdxl,
  "cinematic-film-grade": filmGrade,
  "cinematic-portrait": cinematicPortrait,
  "cinematic-slowmo-upscale": slowmo,
  "cinematic-epic-landscape": epic,
  "content-reel-loop": reelLoop,
  "content-product-swap": productSwap,
  "content-talking-avatar": talking,
  "content-blog-hero": blogHero,
};

export const heroImage = animatediff;
