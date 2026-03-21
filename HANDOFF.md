# The Mind - Online Card Game

## Project Status

### What's Working ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Room creation/joining | ✅ Working | 4-letter room codes, tab-specific storage |
| Player visibility | ✅ Working | Players see each other in lobby |
| Game start | ✅ Working | Coordinator can start, all players redirect |
| Card dealing | ⚠️ Debugging | Players getting same card - see Issue #1 |
| Card play sync | ✅ Working | Cards broadcast to all players |
| Level progression | ⚠️ Partial | Broadcast logic in place, needs testing |
| Game over | ⚠️ Partial | Broadcast logic in place, needs testing |
| Refresh persistence | ✅ Working | Zustand persist saves game state |
| Reconnection | ⚠️ Partial | Session restores, needs full state sync |
| Shuriken voting | ⚠️ Partial | UI exists, voting logic needs testing |
| Mobile UI | ✅ Working | Touch-friendly, responsive design |

### Architecture

```
Stack:
- Next.js 15 + React 19 + TypeScript
- itty-sockets (WebSocket via itty.ws relay)
- Zustand (state management with persistence)
- Tailwind CSS (zen dark theme)
- Framer Motion (animations)

Pattern: Coordinator Authority
- One player is "coordinator" (room creator)
- Coordinator validates all game actions
- Coordinator broadcasts state updates
- Other players request actions, coordinator decides
```

## Issue #1: Players Receiving Same Card 🚨 ACTIVE

**Problem:** When game starts, both players receive the same card value.

**Debugging Added:**
- `[dealCards]` logs in `src/lib/game-logic.ts` now track:
  - Deck size and first 10 cards
  - Duplicate detection with Set
  - All hands dealt
  - Used cards list

**Check in browser console:**
```
[dealCards] Deck size: 100 first 10 cards: [23, 67, 12, 89, ...]
[dealCards] Player player_xxx received hand: [23]
[dealCards] Player player_yyy received hand: [67]
```

**Likely Causes:**
1. `shuffleDeck()` not actually shuffling (Math.random issue?)
2. `dealCards()` using same deck index for both players
3. State update race condition
4. Deck being recreated between deals

**Files to investigate:**
- `src/lib/game-logic.ts` - `shuffleDeck()`, `dealCards()`
- `src/lib/store.ts` - `startGame()` (line ~186)
- `src/app/room/[code]/page.tsx` - `handleStartGame()` (line ~147)

## Issue #2: Critical Missing Broadcasts (Fixed but Verify)

**Previously:** Actions were logged but never broadcast.

**Fixed:** Store methods now return actions, pages broadcast them.

**Verify these work:**
- [ ] `GAME_STARTED` - All players get hands
- [ ] `CARD_PLAYED` - All players see card in center
- [ ] `LEVEL_COMPLETE` - All players see level complete screen
- [ ] `GAME_OVER` - All players see victory/defeat

## Issue #3: Coordinator Disconnect

**Problem:** If coordinator leaves, game cannot continue.

**Not Implemented:**
- Coordinator election/migration
- State handoff to new coordinator
- Player promotion logic

**Future Enhancement:**
```typescript
// When coordinator disconnects:
// 1. Detect via heartbeat timeout
// 2. Elect new coordinator (oldest connected player)
// 3. New coordinator requests state from all players
// 4. Reconstruct game state, continue
```

## Issue #4: Race Conditions

**Potential Issues:**
1. Two players play cards simultaneously - order undefined
2. Shuriken votes at exact same moment
3. Level complete detection during card play

**Mitigation:**
- The Mind is slow-paced, races are rare
- Could add sequence numbers if needed
- Could add "pending" state for card plays

## File Structure

```
src/
├── app/
│   ├── page.tsx              # Landing (create/join)
│   ├── layout.tsx            # Root layout
│   ├── room/[code]/
│   │   ├── page.tsx          # Lobby (player list, start game)
│   │   └── game/
│   │       └── page.tsx      # Active game (cards, play)
│   └── globals.css           # Tailwind + custom styles
├── components/
│   ├── game/
│   │   ├── Card.tsx          # Individual card
│   │   ├── Hand.tsx          # Player's hand
│   │   ├── PlayedCards.tsx   # Center pile
│   │   ├── ShurikenVote.tsx  # Shuriken voting UI
│   │   ├── BreathingPulse.tsx# Sync animation
│   │   └── GameStatus.tsx    # Level/lives/stars
│   ├── room/
│   │   ├── Lobby.tsx         # Waiting room
│   │   └── PlayerAvatar.tsx  # Player display
│   └── ui/
│       └── Button.tsx        # Reusable button
├── lib/
│   ├── game-logic.ts         # Deck, dealing, rules
│   ├── store.ts              # Zustand store
│   ├── itty-client.ts        # WebSocket wrapper
│   └── utils.ts              # cn() helper
└── types/
    └── game.ts               # TypeScript interfaces
```

## Key Code Patterns

### Store Action Pattern
```typescript
// Store method returns action for broadcast
playCard(card: number): GameAction | null {
  // ... validation logic ...
  return { type: 'CARD_PLAYED', card, playerId };
}

// Page broadcasts it
const action = store.playCard(card);
if (action && gameClientRef.current) {
  gameClientRef.current.send(action);
}
```

### Tab-Specific Storage
```typescript
// Each tab gets unique ID via sessionStorage
// localStorage keys prefixed with tab ID
// Result: multiple players can use same browser
const getStorageKey = (key: string) => `themind-${getTabId()}-${key}`;
```

### WebSocket Message Flow
```
Player A (non-coord)          Coordinator
     |                             |
     |--- CARD_PLAYED ------------>|
     |                             | (validates)
     |<-- CARD_PLAYED (broadcast)--|
     |                             | (updates state)
```

## Environment Variables

None required - itty.ws is a free public relay.

For production with custom relay:
```
NEXT_PUBLIC_ITTY_WS_URL=wss://your-relay.com
```

## Testing Checklist

### Basic Flow
- [ ] Create room
- [ ] Join with second player (different name)
- [ ] Both see each other in lobby
- [ ] Coordinator clicks Start
- [ ] Both redirect to game
- [ ] **Both have DIFFERENT cards** ← Issue #1
- [ ] Player 1 plays card - appears in center for both
- [ ] Player 2 plays card - appears in center for both
- [ ] Level completes when all cards played
- [ ] Next level deals (more cards)

### Edge Cases
- [ ] Refresh mid-game - hand restored?
- [ ] Coordinator refresh - can they continue?
- [ ] Shuriken vote - unanimous?
- [ ] Wrong play - life lost?
- [ ] Game over - victory/defeat shown?

### Multi-Tab (Same Browser)
- [ ] Tab 1: Create room
- [ ] Tab 2: Join room
- [ ] Both have different player IDs
- [ ] Game works normally

## Next Steps (Priority Order)

### P0 - Game-Breaking
1. **Fix card dealing** - Players getting same card
2. **Verify all broadcasts work** - GAME_STARTED, CARD_PLAYED, LEVEL_COMPLETE, GAME_OVER
3. **Test full game flow** - Level 1 through victory

### P1 - Important
4. **Coordinator disconnect handling** - Elect new coordinator
5. **Periodic state heartbeat** - Sync every 5 seconds
6. **Shuriken voting completion** - Test and fix edge cases

### P2 - Polish
7. **Sound effects** - Optional zen sounds
8. **Animations** - Card fly, level transition
9. **Game statistics** - Win/loss tracking
10. **Spectator mode** - Join mid-game to watch

## Deployment

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build for production
npm run build

# Deploy to Vercel
vercel --name themindgame
```

## Debugging Tips

**Enable console logging:**
All key files have `[file]` prefixed console logs. Filter with:
```
[dealCards]
[startGame]
[GAME_STARTED]
[CARD_PLAYED]
[store]
```

**Check WebSocket connection:**
Look for `[WebSocket]` logs:
```
[WebSocket] Connected!
[WebSocket] Sending: CARD_PLAYED
[WebSocket] Raw message: {...}
```

**Check state in React DevTools:**
- `useGameStore` hook shows current state
- `hand` - player's cards
- `playedCards` - center pile
- `playerHands` - all players' cards (coordinator only)

## Resources

- Original game: https://boardgamegeek.com/boardgame/244992/the-mind
- itty-sockets: https://github.com/kwhitley/itty-sockets
- itty.ws: Free WebSocket relay service
