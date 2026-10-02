import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, Clapperboard, Loader2, Play, Send, SlidersHorizontal } from "lucide-react";
import { assistantChat, planVideo } from "@/lib/agent.functions";
import { createJob } from "@/lib/studio.functions";
import { PageHeader } from "@/components/studio/shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "Assistant & Video Agent — Aurora Studio" },
      { name: "description", content: "Ask the AI assistant about ComfyUI, or let the video agent plan shots and fill a workflow for you." },
      { property: "og:title", content: "Assistant & Video Agent — Aurora Studio" },
      { property: "og:description", content: "Ask the AI assistant about ComfyUI, or let the video agent plan shots and fill a workflow for you." },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  const [tab, setTab] = useState<"agent" | "chat">("agent");
  return (
    <>
      <PageHeader eyebrow="AI" title="Assistant" description="The video agent turns an idea into a shot plan and a ready-to-run workflow. The chat answers ComfyUI questions." />
      <div className="mb-6 flex gap-2">
        <Button variant={tab === "agent" ? "default" : "outline"} size="sm" onClick={() => setTab("agent")}><Clapperboard /> Video agent</Button>
        <Button variant={tab === "chat" ? "default" : "outline"} size="sm" onClick={() => setTab("chat")}><Bot /> Chat</Button>
      </div>
      {tab === "agent" ? <VideoAgent /> : <Chat />}
    </>
  );
}

const MODES = [
  { id: "cinematic", label: "Cinematic", hint: "16:9 · lens, lighting & camera continuity" },
  { id: "viral", label: "Viral", hint: "9:16 · hook-first, fast cuts, captions" },
  { id: "standard", label: "Standard", hint: "16:9 · balanced storyboard" },
] as const;

function VideoAgent() {
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("cinematic");
  const plan = useServerFn(planVideo);
  const run = useServerFn(createJob);
  const m = useMutation({ mutationFn: () => plan({ data: { idea, mode } }), onError: (e) => toast.error(e instanceof Error ? e.message : "Planning failed") });
  const render = useMutation({
    mutationFn: () => run({ data: { workflowId: m.data!.workflowId, params: m.data!.params } }),
    onSuccess: () => { toast.success("Queued on your GPU"); navigate({ to: "/jobs" }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not queue"),
  });
  const p = m.data;

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="panel h-fit space-y-4 p-6">
        <div className="grid gap-2">
          {MODES.map((x) => (
            <button key={x.id} onClick={() => setMode(x.id)} className={`rounded-xl border p-3 text-left ${mode === x.id ? "border-primary" : "border-border"}`}>
              <div className="font-semibold">{x.label}</div><div className="text-xs text-muted-foreground">{x.hint}</div>
            </button>
          ))}
        </div>
        <Textarea rows={5} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. A lone astronaut finds a glowing flower on Mars" />
        <Button className="w-full" disabled={!idea.trim() || m.isPending} onClick={() => m.mutate()}>{m.isPending ? <Loader2 className="animate-spin" /> : <Clapperboard />} Plan my video</Button>
      </div>
      <div className="space-y-4">
        {!p && !m.isPending && <div className="panel p-10 text-center text-muted-foreground">Your shot board appears here.</div>}
        {m.isPending && <div className="panel flex items-center gap-3 p-10 text-muted-foreground"><Loader2 className="animate-spin" /> The agent is planning…</div>}
        {p && (
          <>
            <div className="panel p-6">
              <div className="eyebrow">{p.mode} · {p.aspectRatio}</div>
              <h2 className="mt-2 text-2xl">{p.title}</h2>
              {p.summary && <p className="mt-1 text-muted-foreground">{p.summary}</p>}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {p.shots.map((s) => (
                <div key={s.order} className="panel p-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="font-mono text-primary">#{s.order} · {s.beat}</span><span>{s.durationSec}s</span></div>
                  <p className="mt-2 text-sm">{s.prompt}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {s.camera && <span className="rounded-full border px-2 py-0.5">{s.camera}</span>}
                    {s.transition && <span className="rounded-full border px-2 py-0.5">→ {s.transition}</span>}
                    {s.caption && <span className="rounded-full border border-primary/50 px-2 py-0.5 text-primary">“{s.caption}”</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="panel space-y-3 p-6">
              <div className="eyebrow">Workflow picked</div>
              <h3 className="text-lg">{p.workflowName}</h3>
              {p.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.notes}</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => render.mutate()} disabled={render.isPending}>{render.isPending ? <Loader2 className="animate-spin" /> : <Play />} Render now</Button>
                <Button variant="outline" onClick={() => { sessionStorage.setItem("aurora-import", JSON.stringify({ workflowId: p.workflowId, params: p.params })); navigate({ to: "/generate", search: { workflow: p.workflowId } }); }}><SlidersHorizontal /> Review settings first</Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type Msg = { role: "user" | "assistant"; content: string };

function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [wfJson, setWfJson] = useState("");
  const [showJson, setShowJson] = useState(false);
  const chat = useServerFn(assistantChat);
  const m = useMutation({
    mutationFn: (history: Msg[]) => chat({ data: { messages: history, ...(wfJson.trim() ? { workflowJson: wfJson } : {}) } }),
    onSuccess: (r) => setMsgs((s) => [...s, { role: "assistant", content: r.reply }]),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Assistant failed"),
  });
  function send() {
    const text = input.trim();
    if (!text || m.isPending) return;
    const next = [...msgs, { role: "user" as const, content: text }].slice(-40);
    setMsgs(next); setInput(""); m.mutate(next);
  }
  return (
    <div className="panel flex flex-col p-4 md:p-6">
      <div className="min-h-[320px] flex-1 space-y-3">
        {msgs.length === 0 && <p className="text-sm text-muted-foreground">Ask anything — “Which template should I use for a talking head?”, “Why is my workflow failing?”</p>}
        {msgs.map((x, i) => (
          <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${x.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}>{x.content}</div>
        ))}
        {m.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>}
      </div>
      {showJson && <Textarea rows={6} className="mt-4 font-mono text-xs" value={wfJson} onChange={(e) => setWfJson(e.target.value)} placeholder="Paste a ComfyUI workflow JSON for the assistant to look at" />}
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowJson(!showJson)}>{showJson ? "Hide JSON" : "Attach JSON"}</Button>
        <Textarea rows={1} className="min-h-10 flex-1" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message the assistant…" />
        <Button type="submit" disabled={!input.trim() || m.isPending}><Send /></Button>
      </form>
    </div>
  );
}
