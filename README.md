# The Code Detective

A live, host-led multiplayer debugging party game for grades 6–12, styled as an 1890s crime gazette. The host runs the pace from their own device; every player joins on their own phone or laptop with a 5-digit case number and sees the full case on their own screen — no projector needed. Each round is a **case file**: a real Python snippet with one seeded bug and the *actual* wrong output it produced. Read the evidence, form a theory, submit the fix — three attempts, scored on fewest attempts plus speed.

Built with Next.js 16 (App Router), partyserver on Cloudflare Durable Objects (real-time rooms, partysocket on the client), Tailwind CSS v4, and TypeScript throughout.

## How it works

One PartyKit room per game session is the single source of truth: the server drives the phase machine (briefing → evidence lock → investigation → suspense → reveal → docket), grades every submission, and keeps each detective's seat, score, and remaining attempts across reconnects. The Next.js app renders three surfaces — the front page, the host's control desk, and the player experience — all styled as one 1890s broadsheet. Clients only ever render state; they never decide it, and the answer key never enters the client bundle.

## Run it locally

Two terminals:

```bash
npm install
npm run dev:party   # realtime room server  -> localhost:1999
npm run dev         # Next.js               -> localhost:3000
```

Open `localhost:3000`, click **Open a Case File** on one screen, then join from a phone (same network: use your machine's LAN IP) or a second browser profile with the case number.

> The player's identity ("detective badge") lives in `localStorage` per room — a second tab in the *same* profile joins as the same player. Use a private window or another device to simulate a second detective.

## Deploy — fully online, no local commands

Both halves deploy straight from this GitHub repo; every push to `main` redeploys both.

1. **Room server → Cloudflare Workers** (free plan works — the Durable Object uses a SQLite-backed class):
   - [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Workers → Import a repository** → connect GitHub and pick this repo.
   - Cloudflare reads `wrangler.jsonc`; keep the default deploy command (`npx wrangler deploy`) and deploy.
   - Copy the worker URL host, e.g. `code-detective.<your-subdomain>.workers.dev`.

2. **Web app → Vercel:** import this repo at [vercel.com](https://vercel.com) (defaults are fine) and set one environment variable before deploying:

   ```text
   NEXT_PUBLIC_PARTYKIT_HOST=code-detective.<your-subdomain>.workers.dev
   ```

   No protocol prefix, no trailing slash. Locally this defaults to `localhost:1999`.

That's it — the game is live and playable across real phones. (The realtime layer is [partyserver](https://github.com/cloudflare/partykit) on your own Cloudflare account; the hosted partykit.dev platform is at capacity and no longer accepts new deployments.)

## Scripts

| Command | Does |
|---|---|
| `npm run dev` / `npm run dev:party` | The two local dev servers (Next on 3000, worker on 1999) |
| `npm run build` | Production build of the web app |
| `npm run typecheck` | `tsc --noEmit` over app + server + game modules |
| `npm run deploy:party` | Deploy the room server to Cloudflare Workers (`wrangler deploy`) |

## Adding a case

Cases live in `src/game/cases.ts`, five per tier. The iron rule: **run the snippet** (both buggy and fixed, real Python) and paste the *captured* output — never hand-write outputs; crash cases carry the real traceback sanitized to `crime_scene.py`. Keep it to 10–16 lines, exactly one seeded bug, deterministic, no `input()`, with a kid-relatable story in the comments. MCQ cases need exactly 4 candidate repair lines (decoys must encode real misreadings); free-text cases need an accepted-answers list. `validateBank()` enforces the structural invariants at room creation and refuses to open a room on a malformed bank.
