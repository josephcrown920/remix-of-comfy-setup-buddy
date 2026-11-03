<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture (ComfyUI Studio)
- All ComfyUI calls go through server code (`src/lib/comfy.server.ts`) — the user's GPU URL may embed credentials and must never reach the browser.
- Generated files are served via `/api/media` using short-lived HMAC-signed links (MEDIA_SIGNING_SECRET) because `<img>/<video>` can't send auth headers.
- Workflow catalog and prompt builders in `src/lib/comfy/` are ported verbatim from the original app; edit there, not in pages.
- Preproduction templates and their pure graph builders live in `src/lib/comfy/preproduction.ts`, consumed by the shared catalog and dispatcher so studio, export, and API paths stay consistent.
- Settings are per user (`user_settings`), not global, so each account connects its own GPU.
- Public workflow apps (`/a/$slug`) run on the app owner's GPU via server functions using the admin client after checking `is_published`; visitors poll only their own run with an HMAC run token, and runs are rate-limited per app.
- GPU selection goes through `routePrompt` in `src/lib/router.server.ts` (probe health + required nodes, least-busy wins) so every render path routes the same way.
- AI features (assistant, video agent) call Lovable AI via `src/lib/ai-gateway.server.ts`, server-side only, so prompts and keys never reach the browser.

- Job submission/refresh lives in `src/lib/jobs.server.ts` (`submitJob`, `refreshJobRow`) and is shared by the studio UI, Comfy Dev and the public API so every path routes and bills the same way.
- The public API (`/api/public/v1/*`) authenticates with hashed personal keys (`api_keys`, sha256) via `src/lib/api-auth.server.ts`; raw keys are shown once and never stored.
- The user's Comfy account key is sent only server-side as `extra_data.api_key_comfy_org`; public app runs do not use it, so strangers never spend the owner's Comfy credits.
