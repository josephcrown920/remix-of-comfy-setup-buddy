import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Boxes, ListVideo, Images, Settings2, Menu, X, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "./logo";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/generate", label: "Workflows", icon: Boxes },
  { to: "/jobs", label: "Jobs", icon: ListVideo },
  { to: "/gallery", label: "Gallery", icon: Images },
  { to: "/settings", label: "Settings", icon: Settings2 },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };
  const links = (
    <nav className="flex flex-col gap-1">
      {nav.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{ className: "!bg-sidebar-accent !text-primary font-semibold" }}
        >
          <n.icon className="h-4 w-4" />
          {n.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-8 px-2"><Logo /></div>
        {links}
        <button onClick={signOut} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-sidebar-border bg-sidebar/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <button aria-label="Menu" onClick={() => setOpen(!open)} className="rounded-lg p-2">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-[61px] z-20 border-b border-sidebar-border bg-sidebar p-4 md:hidden">
          {links}
          <button onClick={signOut} className="mt-2 flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      )}
      <main className="relative md:pl-60">
        <div className="aurora-ambient" />
        <div className="relative mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-2 text-3xl md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    completed: "bg-primary/15 text-primary",
    running: "bg-secondary/15 text-secondary",
    pending: "bg-warning/15 text-warning",
    failed: "bg-destructive/15 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 font-mono text-xs ${tone[status] ?? tone["cancelled"]}`}>{status}</span>;
}
