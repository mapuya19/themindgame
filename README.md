# The Mind

A real-time cooperative card game where players must play cards 1-100 in ascending order without communicating. Based on the physical card game by Wolfgang Warsch.

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript
- **Styling:** Tailwind CSS v4, Framer Motion
- **State:** Zustand v5 with WebSocket sync
- **Backend:** Cloudflare Workers with Durable Objects
- **Tooling:** ESLint, PostCSS, Wrangler

## Project Structure

```
├── src/
│   ├── app/                  # Next.js pages (App Router)
│   │   ├── page.tsx          # Home / create-or-join lobby
│   │   └── room/[code]/
│   │       ├── page.tsx      # Room lobby (waiting for players)
│   │       └── game/page.tsx # Game board
│   ├── lib/
│   │   ├── store.ts          # Zustand store (game state + WebSocket actions)
│   │   └── ws-client.ts      # WebSocket client wrapper
│   └── types/
│       └── game.ts           # Shared TypeScript types for the WS protocol
├── worker/
│   ├── src/index.ts          # Cloudflare Worker + Durable Object (game server)
│   ├── wrangler.jsonc        # Wrangler config
│   └── package.json
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A Cloudflare account (for deploying the worker)

### Install

```bash
npm install
cd worker && npm install
```

### Development

```bash
# Run both the Next.js dev server and the Wrangler dev server:
npm run dev:all

# Or run them separately:
npm run dev          # Next.js on http://localhost:3000
npm run dev:worker   # Worker on http://localhost:8787
```

Set `NEXT_PUBLIC_WS_URL` in `.env.local` to point at the worker:

```
NEXT_PUBLIC_WS_URL=ws://localhost:8787
```

For production, set these Worker secrets/variables before deployment:

```bash
cd worker
npx wrangler secret put ADMIN_SECRET
npx wrangler secret put ALLOWED_ORIGINS # e.g. https://your-app.example
```

`ALLOWED_ORIGINS` is a comma-separated allow-list. It may be omitted only for local development.

### Build & Deploy

```bash
npm run build            # Build the Next.js frontend
npm run test             # Run deterministic game-rule tests
npm run typecheck:worker # Type-check the Durable Object
npm run deploy:worker    # Deploy the Cloudflare Worker
```

## How the Game Works

1. A player creates a room and shares the server-generated 8-character code.
2. 2-8 players join Standard mode, or 2-30 players join Large Group mode.
3. Each round, players are dealt cards (round 1 = 1 card, round 2 = 2, etc.).
4. Players must play their cards in ascending order across all hands -- without talking.
5. Playing a card out of order costs a life. The team shares a pool of lives.
6. Players can unanimously vote to use a Shuriken, which discards each player's lowest card.
7. Clear all levels to win.

### Modes

- **Standard:** 2-8 players, with the original progression adapted for this app.
- **Large Group:** 2-30 players and exactly three levels. This lets a group of any size use the short-format rules; at 30 players, a fourth level would require more than the 100-card deck.

The roster locks at game start. A temporary disconnect pauses the game for up to 30 seconds and can be resumed with the player session stored in that browser. An explicit leave (or an expired disconnect) forfeits that player's hand and the remaining players continue with the already selected level progression.

## License

MIT
