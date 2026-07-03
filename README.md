# The Code Detective

A live, host-led multiplayer debugging party game for grades 6–12, styled as an 1890s crime gazette. The host runs the pace from their own device; every player joins on their own phone or laptop with a 5-digit case number and sees the full case on their own screen — no projector needed. Each round is a **case file**: a real Python snippet with one seeded bug and the *actual* wrong output it produced. Read the evidence, form a theory, submit the fix — three attempts, scored on fewest attempts plus speed.

Built with Next.js 16 (App Router), PartyKit (real-time rooms), Tailwind CSS v4, and TypeScript throughout.

## How it works

One PartyKit room per game session is the single source of truth: the server drives the phase machine (briefing → evidence lock → investigation → suspense → reveal → docket), grades every submission, and keeps each detective's seat, score, and remaining attempts across reconnects. The Next.js app renders three surfaces — the front page, the host's control desk, and the player experience — all styled as one 1890s broadsheet. Clients only ever render state; they never decide it, and the answer key never enters the client bundle.

## Run it locally

Two terminals:

```bash
npm install
npm run dev:party   # PartyKit room server  -> localhost:1999
npm run dev         # Next.js               -> localhost:3000
```

Open `localhost:3000`, click **Open a Case File** on one screen, then join from a phone (same network: use your machine's LAN IP) or a second browser profile with the case number.

> The player's identity ("detective badge") lives in `localStorage` per room — a second tab in the *same* profile joins as the same player. Use a private window or another device to simulate a second detective.

## Deploy

The two halves deploy independently (see ARCHITECTURE.md → Deployment):

1. **Room server → PartyKit** (Cloudflare):

   ```bash
   npx partykit deploy
   ```

   First run opens a GitHub device login. You get `code-detective.<your-github-username>.partykit.dev`.

2. **Web app → Vercel:** push this repo to GitHub, import it in Vercel, and set one environment variable:

   ```
   NEXT_PUBLIC_PARTYKIT_HOST=code-detective.<your-github-username>.partykit.dev
   ```

   (No protocol prefix. Locally this defaults to `localhost:1999`.)

That's it — the game is live and playable across real phones.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` / `npm run dev:party` | The two local dev servers |
| `npm run build` | Production build of the web app |
| `npm run typecheck` | `tsc --noEmit` over app + server + game modules |
| `npm run deploy:party` | Deploy the room server to PartyKit |

## Adding a case

Cases live in `src/game/cases.ts`, five per tier. The iron rule: **run the snippet** (both buggy and fixed, real Python) and paste the *captured* output — never hand-write outputs; crash cases carry the real traceback sanitized to `crime_scene.py`. Keep it to 10–16 lines, exactly one seeded bug, deterministic, no `input()`, with a kid-relatable story in the comments. MCQ cases need exactly 4 candidate repair lines (decoys must encode real misreadings); free-text cases need an accepted-answers list. `validateBank()` enforces the structural invariants at room creation and refuses to open a room on a malformed bank.
