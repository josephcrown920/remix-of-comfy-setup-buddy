import { Music } from "lucide-react";
import { cn } from "@/lib/utils";

export function MediaThumb({ url, type, className, controls = false }: { url: string; type: string; className?: string; controls?: boolean }) {
  const base = cn("w-full overflow-hidden rounded-xl bg-muted object-cover", className);
  if (type === "video") return <video src={url} className={base} muted loop playsInline controls={controls} onMouseEnter={(e) => e.currentTarget.play().catch(() => {})} />;
  if (type === "audio")
    return (
      <div className={cn(base, "flex flex-col items-center justify-center gap-2 p-3")}>
        <Music className="h-6 w-6 text-secondary" />
        <audio src={url} controls className="w-full" />
      </div>
    );
  return <img src={url} alt="" loading="lazy" className={base} />;
}
