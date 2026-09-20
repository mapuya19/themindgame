# AGENTS.md

Guidelines for AI agents working on this codebase.

## Architecture Overview

This is a full-stack TypeScript project with two deployment targets:

1. **Next.js frontend** (`src/`) -- a React 19 app using the App Router, deployed to Vercel or any Node.js host.
2. **Cloudflare Worker** (`worker/`) -- a stateful WebSocket server using Durable Objects, deployed via Wrangler.

The frontend connects to the worker over WebSocket. All authoritative game state lives in the Durable Object; the client holds a projected view via Zustand.

## Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Home page -- create or join a room |
| `src/app/room/[code]/page.tsx` | Room lobby -- players wait here before starting |
| `src/app/room/[code]/game/page.tsx` | Game board -- card play, shuriken voting, level progression |
| `src/lib/store.ts` | Zustand store -- holds client game state, dispatches WS messages |
| `src/lib/ws-client.ts` | `GameClient` class -- WebSocket wrapper with auto-reconnect |
| `src/types/game.ts` | Client-side TypeScript types for the WS protocol |
| `worker/src/game-rules.ts` | Tested deck dealing and standard/large-group configuration |
| `worker/src/index.ts` | Cloudflare Worker + `GameRoom` Durable Object (authoritative game logic) |
| `worker/wrangler.jsonc` | Wrangler configuration (Durable Object bindings, migrations) |

## WebSocket Protocol

Messages are JSON over WebSocket. Types are defined in `src/types/game.ts` (client side) and mirrored in `worker/src/index.ts` (server side).

**Client -> Server:** `join` (with an optional resume token), `start_game`, `play_card`, `vote_shuriken`, `restart_game`, `leave_room`
**Server -> Client:** `joined`, `state`, `error`, `card_played`, `wrong_play`, `level_complete`, `game_over`, `shuriken_vote`, `shuriken_used`, `player_left`

The server sends a full `state` message after every mutation. Event messages (`card_played`, `wrong_play`, etc.) are sent alongside state for animation/notification purposes.

## Conventions

- **No component library.** UI is built inline in page files with Tailwind CSS v4 utility classes.
- **Tailwind v4** uses CSS-first configuration via `src/app/globals.css` (not `tailwind.config.ts`). Custom theme tokens (colors, animations) are defined there with `@theme`.
- **Zustand v5** store in `src/lib/store.ts` manages all client state. Actions call `GameClient.send()` to dispatch messages to the worker.
- **Framer Motion** is used for card animations and transitions.
- **ESLint flat config** in `eslint.config.mjs` extends `eslint-config-next`.

## Game Rules (for context)

- Deck is cards 1-100, shuffled each level.
- Cards per player equals the current level number (level 1 = 1 card, level 5 = 5 cards).
- Standard mode supports 2-8 players (2 players = 12 levels; 8 players = 6 levels).
- Large Group mode supports 27-30 players and has three levels; a fourth cannot fit in a 100-card deck.
- Playing a card when lower cards exist in any hand is a wrong play -- costs 1 life, and all lower cards are discarded.
- Bonus lives/shurikens are awarded at specific level milestones (levels 2, 3, 5, 6, 8, 9).
- Shuriken requires unanimous vote; each player's lowest card is discarded.

## Development

```bash
npm run dev:all       # Start both Next.js and Worker dev servers
npm run build         # Build Next.js
npm run lint          # Lint src/
npm run test          # Run game-rule tests
npm run typecheck:worker # Type-check the Durable Object with TypeScript
npm run deploy:worker # Deploy worker to Cloudflare
```

The worker dev server runs on `http://localhost:8787`. Set `NEXT_PUBLIC_WS_URL=ws://localhost:8787` in `.env.local`.

## Common Pitfalls

- The worker has its own `package.json` and `node_modules`. Always run `npm install` in both the root and `worker/` directories.
- Types are duplicated between `src/types/game.ts` and `worker/src/index.ts` because the worker bundles independently via Wrangler. Keep them in sync manually.
- The Durable Object uses persisted alarm deadlines for level progression, disconnect grace, and cleanup. Don't move those deadlines into in-memory fields: WebSocket hibernation resets them.
- Player identity is the server-issued resume token, never the display name. Do not send tokens in a state broadcast.
- `node_modules/` in both root and `worker/` must be gitignored. Never commit them.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
