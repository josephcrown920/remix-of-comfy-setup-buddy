import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/studio/logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Aurora Studio" },
      { name: "description", content: "Sign in to run your ComfyUI workflows." },
      { property: "og:title", content: "Sign in — Aurora Studio" },
      { property: "og:description", content: "Sign in to run your ComfyUI workflows." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard" });
        else toast.success("Check your inbox to confirm your email.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast.success("Password reset link sent.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
    else if (!r.redirected) navigate({ to: "/dashboard" });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="aurora-ambient" />
      <div className="panel relative w-full max-w-md p-8">
        <Logo />
        <h1 className="mt-6 text-2xl">{mode === "in" ? "Welcome back" : mode === "up" ? "Create your studio" : "Reset password"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "reset" ? "We'll email you a link to choose a new password." : "Run ComfyUI workflows from a simple form."}
        </p>
        {mode !== "reset" && (
          <>
            <Button variant="outline" className="mt-6 w-full rounded-xl" onClick={google} type="button">Continue with Google</Button>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" /></div>
          </>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "reset" && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
          </Button>
        </form>
        <div className="mt-5 flex justify-between text-sm text-muted-foreground">
          <button className="hover:text-foreground" onClick={() => setMode(mode === "up" ? "in" : "up")}>
            {mode === "up" ? "Have an account? Sign in" : "New here? Create an account"}
          </button>
          {mode === "in" && <button className="hover:text-foreground" onClick={() => setMode("reset")}>Forgot password?</button>}
        </div>
      </div>
    </div>
  );
}
