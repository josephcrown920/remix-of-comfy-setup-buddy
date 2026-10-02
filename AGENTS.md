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
- Settings are per user (`user_settings`), not global, so each account connects its own GPU.
