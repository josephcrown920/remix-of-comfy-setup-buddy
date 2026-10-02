import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mic, Move, Film, ImageIcon } from "lucide-react";
import { Logo } from "@/components/studio/logo";
import { Button } from "@/components/ui/button";
import { heroImage, WORKFLOW_THUMBNAILS } from "@/lib/thumbnails";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aurora — Run ComfyUI workflows without the node graph" },
      { name: "description", content: "Connect your ComfyUI GPU and run lip sync, motion control, image and video workflows from simple forms." },
      { property: "og:title", content: "Aurora — ComfyUI Studio" },
      { property: "og:description", content: "Connect your ComfyUI GPU and run video & image workflows from simple forms." },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Mic, title: "Lip sync", text: "Make a portrait speak any audio clip.", img: WORKFLOW_THUMBNAILS["lip-sync-basic"] },
  { icon: Move, title: "Motion control", text: "Transfer motion from a reference video.", img: WORKFLOW_THUMBNAILS["motion-control-animatediff"] },
  { icon: Film, title: "Video generation", text: "Text-to-video and image-to-video.", img: WORKFLOW_THUMBNAILS["img2vid-stable-video"] },
  { icon: ImageIcon, title: "Cinematic stills", text: "Portraits, landscapes, product shots.", img: WORKFLOW_THUMBNAILS["cinematic-portrait"] },
];

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="aurora-ambient" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <Button asChild variant="outline" className="rounded-xl"><Link to="/auth">Sign in</Link></Button>
      </header>
      <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 md:grid-cols-2 md:pt-20">
        <div>
          <div className="eyebrow">ComfyUI · without the spaghetti</div>
          <h1 className="mt-4 text-5xl leading-[1.05] md:text-6xl">
            Your GPU. <span className="text-primary">Studio-grade</span> video in a few clicks.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            Connect your ComfyUI server, pick a template, fill a short form. Aurora builds the graph, queues it and collects the results.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg"><Link to="/auth">Start creating <ArrowRight /></Link></Button>
          </div>
        </div>
        <div className="panel overflow-hidden p-2">
          <img src={heroImage} alt="AnimateDiff sample frame" className="aspect-[4/3] w-full rounded-2xl object-cover" />
        </div>
      </section>
      <section className="relative mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.title} className="panel overflow-hidden">
            <img src={f.img} alt="" className="h-36 w-full object-cover" loading="lazy" />
            <div className="p-5">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 text-lg">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
