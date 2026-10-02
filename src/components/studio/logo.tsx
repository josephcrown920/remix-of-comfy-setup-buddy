import { Aperture } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow">
        <Aperture className="h-5 w-5" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight">Aurora</div>
          <div className="eyebrow !text-[0.6rem]">ComfyUI Studio</div>
        </div>
      )}
    </div>
  );
}
