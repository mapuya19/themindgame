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

### Build & Deploy

```bash
npm run build            # Build the Next.js frontend
npm run deploy:worker    # Deploy the Cloudflare Worker
```

## How the Game Works

1. A player creates a room and shares the 4-letter code.
2. 2-8 players join the room.
3. Each round, players are dealt cards (round 1 = 1 card, round 2 = 2, etc.).
4. Players must play their cards in ascending order across all hands -- without talking.
5. Playing a card out of order costs a life. The team shares a pool of lives.
6. Players can unanimously vote to use a Shuriken, which discards each player's lowest card.
7. Clear all levels to win.

## License

MIT
