import { DurableObject } from "cloudflare:workers";

// ---------------------------------------------------------------------------
// Shared game logic (same file used by Next.js client)
// We inline the needed functions here since Wrangler bundles from worker/src/
// and can't import from ../src/lib/game-logic.ts cleanly.
// ---------------------------------------------------------------------------

const LEVELS_BY_PLAYER_COUNT: Record<number, number> = {
  2: 12, 3: 10, 4: 8, 5: 8, 6: 7, 7: 6, 8: 6,
};
const STARTING_LIVES: Record<number, number> = {
  2: 2, 3: 3, 4: 4, 5: 4, 6: 4, 7: 5, 8: 5,
};
const STARTING_SHURIKENS: Record<number, number> = {
  2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3,
};
const BONUS_REWARDS: Record<number, { lives: number; shurikens: number }> = {
  2: { lives: 0, shurikens: 1 },
  3: { lives: 1, shurikens: 0 },
  5: { lives: 0, shurikens: 1 },
  6: { lives: 1, shurikens: 0 },
  8: { lives: 0, shurikens: 1 },
  9: { lives: 1, shurikens: 0 },
};
const MAX_LIVES = 5;
const MAX_SHURIKENS = 3;

function shuffleDeck(): number[] {
  const deck: number[] = [];
  for (let i = 1; i <= 100; i++) deck.push(i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealCards(playerIds: string[], cardsPerPlayer: number): Record<string, number[]> {
  const deck = shuffleDeck();
  const hands: Record<string, number[]> = {};
  let idx = 0;
  for (const pid of playerIds) {
    const hand: number[] = [];
    for (let j = 0; j < cardsPerPlayer; j++) {
      if (idx < deck.length) hand.push(deck[idx++]);
    }
    hand.sort((a, b) => a - b);
    hands[pid] = hand;
  }
  return hands;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlayerInfo {
  id: string;
  name: string;
}

interface RoomState {
  players: PlayerInfo[];
  level: number;
  lives: number;
  shurikens: number;
  playedCards: number[];
  discardedCards: number[];
  playerHands: Record<string, number[]>;
  status: "waiting" | "playing" | "level_complete" | "game_over" | "victory";
  shurikenVotes: Record<string, boolean>;
}

// Messages: client → server
type ClientMsg =
  | { type: "join"; name: string }
  | { type: "start_game" }
  | { type: "play_card"; card: number }
  | { type: "vote_shuriken"; vote: boolean }
  | { type: "restart_game" };

// Messages: server → client (sent per-player, hand is player-specific)
type ServerMsg =
  | { type: "state"; state: ClientState }
  | { type: "error"; message: string }
  | { type: "card_played"; card: number; playerId: string }
  | { type: "wrong_play"; card: number; lowerCards: number[]; livesLeft: number }
  | { type: "level_complete"; level: number; bonusLives: number; bonusShurikens: number }
  | { type: "game_over"; reason: "victory" | "no_lives" }
  | { type: "shuriken_vote"; playerId: string; vote: boolean }
  | { type: "shuriken_used"; discardedCards: Record<string, number> }
  | { type: "player_left"; playerId: string; playerName: string };

interface ClientState {
  roomCode: string;
  players: { id: string; name: string; connected: boolean; cardCount: number }[];
  level: number;
  lives: number;
  shurikens: number;
  playedCards: number[];
  discardedCards: number[];
  hand: number[];
  status: RoomState["status"];
  shurikenVoteActive: boolean;
  shurikenVotes: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
}

// ---------------------------------------------------------------------------
// Durable Object: GameRoom
// ---------------------------------------------------------------------------

export class GameRoom extends DurableObject<Env> {
  private state: RoomState = {
    players: [],
    level: 0,
    lives: 0,
    shurikens: 0,
    playedCards: [],
    discardedCards: [],
    playerHands: {},
    status: "waiting",
    shurikenVotes: {},
  };
  private initialized = false;

  /** Maps playerId → timestamp when their disconnect timeout fires */
  private disconnectTimers: Map<string, number> = new Map();

  /** How long to wait before removing a disconnected player (ms) */
  private static readonly DISCONNECT_TIMEOUT = 30_000;

  /** How long to wait before cleaning up an empty room (ms) */
  private static readonly EMPTY_ROOM_CLEANUP = 60_000;

  /** How long after game over/victory before storage is cleaned up (ms) */
  private static readonly GAME_OVER_CLEANUP = 300_000; // 5 minutes

  /** Timestamp when the finished-game cleanup alarm should fire, or null */
  private gameOverCleanupAt: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  // Restore state from storage on first access
  private async ensureLoaded() {
    if (this.initialized) return;
    this.initialized = true;
    const saved = await this.ctx.storage.get<RoomState>("room");
    if (saved) {
      this.state = saved;
    }
  }

  // Persist state after every mutation
  private async saveState() {
    await this.ctx.storage.put("room", this.state);
  }

  // ---- WebSocket lifecycle ------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();

    // Accept WebSocket — the Upgrade header is always present on the
    // Worker→DO internal hop when the browser initiated a WS connection.
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.ensureLoaded();
    if (typeof message !== "string") return;

    let msg: ClientMsg;
    try {
      msg = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    const playerId = this.getPlayerId(ws);

    switch (msg.type) {
      case "join":
        await this.handleJoin(ws, msg.name);
        break;
      case "start_game":
        await this.handleStartGame(ws);
        break;
      case "play_card":
        if (!playerId) return;
        await this.handlePlayCard(playerId, msg.card);
        break;
      case "vote_shuriken":
        if (!playerId) return;
        await this.handleShurikenVote(playerId, msg.vote);
        break;
      case "restart_game":
        await this.handleRestartGame();
        break;
    }
  }

  async webSocketClose(ws: WebSocket) {
    const playerId = this.getPlayerId(ws);
    if (playerId) {
      // Schedule removal after timeout
      const removeAt = Date.now() + GameRoom.DISCONNECT_TIMEOUT;
      this.disconnectTimers.set(playerId, removeAt);
      await this.scheduleNextAlarm();

      // Broadcast updated connection status immediately
      this.broadcastState();
    }
  }

  // ---- Helpers ------------------------------------------------------------

  private getPlayerId(ws: WebSocket): string | null {
    const att = ws.deserializeAttachment() as { playerId?: string } | null;
    return att?.playerId ?? null;
  }

  private getPlayerWs(playerId: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      if (this.getPlayerId(ws) === playerId) return ws;
    }
    return null;
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // connection may be closed
    }
  }

  private broadcast(msg: ServerMsg, exclude?: string) {
    for (const ws of this.ctx.getWebSockets()) {
      const pid = this.getPlayerId(ws);
      if (pid && pid !== exclude) {
        this.send(ws, msg);
      }
    }
  }

  private broadcastState() {
    for (const ws of this.ctx.getWebSockets()) {
      const pid = this.getPlayerId(ws);
      if (pid) {
        this.send(ws, { type: "state", state: this.buildClientState(pid) });
      }
    }
  }

  private buildClientState(forPlayerId: string): ClientState {
    const connectedIds = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const pid = this.getPlayerId(ws);
      if (pid) connectedIds.add(pid);
    }

    return {
      roomCode: this.ctx.id.toString().slice(-4).toUpperCase(),
      players: this.state.players.map(p => ({
        id: p.id,
        name: p.name,
        connected: connectedIds.has(p.id),
        cardCount: this.state.playerHands[p.id]?.length ?? 0,
      })),
      level: this.state.level,
      lives: this.state.lives,
      shurikens: this.state.shurikens,
      playedCards: this.state.playedCards,
      discardedCards: this.state.discardedCards,
      hand: this.state.playerHands[forPlayerId] ?? [],
      status: this.state.status,
      shurikenVoteActive: Object.keys(this.state.shurikenVotes).length > 0,
      shurikenVotes: this.state.shurikenVotes,
    };
  }

  // ---- Game actions -------------------------------------------------------

  private async handleJoin(ws: WebSocket, name: string) {
    // Generate player ID
    const playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    ws.serializeAttachment({ playerId });

    // Check if this name already exists (reconnecting)
    const existing = this.state.players.find(p => p.name === name);
    if (existing) {
      // Reconnect: reuse their player ID and cancel any pending removal
      ws.serializeAttachment({ playerId: existing.id });
      this.disconnectTimers.delete(existing.id);
    } else {
      this.state.players.push({ id: playerId, name });
    }

    await this.saveState();
    this.broadcastState();
  }

  private async handleStartGame(ws: WebSocket) {
    const playerCount = this.state.players.length;
    if (playerCount < 2 || playerCount > 8) {
      this.send(ws, { type: "error", message: "Need 2-8 players" });
      return;
    }
    if (this.state.status !== "waiting") {
      this.send(ws, { type: "error", message: "Game already started" });
      return;
    }

    this.state.level = 1;
    this.state.lives = STARTING_LIVES[playerCount];
    this.state.shurikens = STARTING_SHURIKENS[playerCount];
    this.state.playedCards = [];
    this.state.discardedCards = [];
    this.state.shurikenVotes = {};
    this.state.status = "playing";

    const playerIds = this.state.players.map(p => p.id);
    this.state.playerHands = dealCards(playerIds, 1);

    await this.saveState();
    this.broadcastState();
  }

  private async handleRestartGame() {
    this.state.level = 0;
    this.state.lives = 0;
    this.state.shurikens = 0;
    this.state.playedCards = [];
    this.state.discardedCards = [];
    this.state.playerHands = {};
    this.state.shurikenVotes = {};
    this.state.status = "waiting";

    await this.saveState();
    this.broadcastState();
  }

  private async dealNextLevel() {
    const nextLevel = this.state.level + 1;
    const playerIds = this.state.players.map(p => p.id);

    this.state.level = nextLevel;
    this.state.playedCards = [];
    this.state.discardedCards = [];
    this.state.shurikenVotes = {};
    this.state.status = "playing";
    this.state.playerHands = dealCards(playerIds, nextLevel);

    await this.saveState();
    this.broadcastState();
  }

  private async handlePlayCard(playerId: string, card: number) {
    if (this.state.status !== "playing") return;

    const hand = this.state.playerHands[playerId];
    if (!hand || !hand.includes(card)) return;

    // Check for lower cards in any player's hand
    const lowerCards: number[] = [];
    for (const pid in this.state.playerHands) {
      for (const c of this.state.playerHands[pid]) {
        if (c < card) lowerCards.push(c);
      }
    }

    if (lowerCards.length > 0) {
      // Wrong play — lose a life
      this.state.lives--;

      // Remove played card from player's hand
      this.state.playerHands[playerId] = hand.filter(c => c !== card);
      // Remove all lower cards from everyone's hands and add to discard pile
      lowerCards.sort((a, b) => a - b);
      this.state.discardedCards.push(...lowerCards);
      for (const pid in this.state.playerHands) {
        this.state.playerHands[pid] = this.state.playerHands[pid].filter(
          c => !lowerCards.includes(c)
        );
      }
      this.state.playedCards.push(card);

      if (this.state.lives <= 0) {
        this.state.status = "game_over";
        this.broadcast({ type: "game_over", reason: "no_lives" });
        await this.saveState();
        this.broadcastState();
        await this.scheduleGameOverCleanup();
        return;
      }

      this.broadcast({ type: "wrong_play", card, lowerCards, livesLeft: this.state.lives });

      // Check if all cards are gone (wrong play can empty all hands)
      await this.checkLevelComplete();
      return;
    }

    // Valid play
    this.state.playerHands[playerId] = hand.filter(c => c !== card);
    this.state.playedCards.push(card);

    // Broadcast the card landing
    this.broadcast({ type: "card_played", card, playerId });

    // Check if all cards are played
    await this.checkLevelComplete();
  }

  private async checkLevelComplete() {
    const allDone = Object.values(this.state.playerHands).every(h => h.length === 0);

    if (allDone) {
      const maxLevels = LEVELS_BY_PLAYER_COUNT[this.state.players.length] ?? 12;
      const bonus = BONUS_REWARDS[this.state.level] ?? { lives: 0, shurikens: 0 };

      this.state.lives = Math.min(this.state.lives + bonus.lives, MAX_LIVES);
      this.state.shurikens = Math.min(this.state.shurikens + bonus.shurikens, MAX_SHURIKENS);

      if (this.state.level >= maxLevels) {
        this.state.status = "victory";
        this.broadcast({ type: "game_over", reason: "victory" });
        await this.saveState();
        this.broadcastState();
        await this.scheduleGameOverCleanup();
      } else {
        this.state.status = "level_complete";
        this.broadcast({
          type: "level_complete",
          level: this.state.level,
          bonusLives: bonus.lives,
          bonusShurikens: bonus.shurikens,
        });
        await this.saveState();
        this.broadcastState();

        // Auto-deal next level after 3 seconds
        await this.ctx.storage.setAlarm(Date.now() + 3000);
      }
    } else {
      await this.saveState();
      this.broadcastState();
    }
  }

  private async handleShurikenVote(playerId: string, vote: boolean) {
    if (this.state.status !== "playing" || this.state.shurikens <= 0) return;

    this.state.shurikenVotes[playerId] = vote;
    this.broadcast({ type: "shuriken_vote", playerId, vote });

    // Check if all connected players voted yes
    const connectedIds = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const pid = this.getPlayerId(ws);
      if (pid) connectedIds.add(pid);
    }

    const allVotedYes = [...connectedIds].every(
      pid => this.state.shurikenVotes[pid] === true
    );

    if (allVotedYes && connectedIds.size >= 2) {
      // Use shuriken: discard lowest card from each player
      this.state.shurikens--;
      const discardedCards: Record<string, number> = {};

      for (const pid in this.state.playerHands) {
        const hand = this.state.playerHands[pid];
        if (hand.length > 0) {
          const lowest = Math.min(...hand);
          discardedCards[pid] = lowest;
          this.state.playerHands[pid] = hand.filter(c => c !== lowest);
        }
      }

      this.state.shurikenVotes = {};
      this.broadcast({ type: "shuriken_used", discardedCards });

      // Shuriken discard could empty all hands
      await this.checkLevelComplete();
      return;
    }

    await this.saveState();
    this.broadcastState();
  }

  // ---- Alarm (handles both level deal and disconnect/cleanup timers) ------

  /**
   * Schedule the next alarm for the earliest pending event.
   * Durable Objects only support one alarm at a time, so we pick the soonest.
   */
  private async scheduleNextAlarm() {
    let earliest: number | null = null;

    // Level auto-advance alarm
    if (this.state.status === "level_complete") {
      // The level-complete alarm is set directly in checkLevelComplete;
      // we don't override it here — just find the soonest overall.
    }

    // Disconnect timers
    for (const time of this.disconnectTimers.values()) {
      if (earliest === null || time < earliest) earliest = time;
    }

    // Game-over cleanup timer
    if (this.gameOverCleanupAt !== null) {
      if (earliest === null || this.gameOverCleanupAt < earliest) {
        earliest = this.gameOverCleanupAt;
      }
    }

    if (earliest !== null) {
      // Only set if it's sooner than any existing alarm
      const current = await this.ctx.storage.getAlarm();
      if (current === null || earliest < current) {
        await this.ctx.storage.setAlarm(earliest);
      }
    }
  }

  /** Schedule storage cleanup 5 minutes after game over/victory */
  private async scheduleGameOverCleanup() {
    this.gameOverCleanupAt = Date.now() + GameRoom.GAME_OVER_CLEANUP;
    await this.scheduleNextAlarm();
  }

  /**
   * Remove a player from the room. In the lobby, just delete them.
   * Mid-game, discard their hand and check for level completion / game over.
   */
  private async removePlayer(playerId: string) {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    const playerName = player.name;

    // Remove from player list
    this.state.players = this.state.players.filter(p => p.id !== playerId);

    // Clean up their game state
    const discardedHand = this.state.playerHands[playerId] ?? [];
    if (discardedHand.length > 0) {
      this.state.discardedCards.push(...discardedHand);
    }
    delete this.state.playerHands[playerId];
    delete this.state.shurikenVotes[playerId];

    // Notify remaining players
    this.broadcast({ type: "player_left", playerId, playerName });

    // If no players left, clean up the room entirely
    if (this.state.players.length === 0) {
      await this.ctx.storage.deleteAll();
      this.initialized = false;
      return;
    }

    // If mid-game and only 1 player remains, end the game
    if (this.state.status === "playing" && this.state.players.length < 2) {
      this.state.status = "game_over";
      this.broadcast({ type: "game_over", reason: "no_lives" });
      await this.saveState();
      this.broadcastState();
      await this.scheduleGameOverCleanup();
      return;
    }

    // If mid-game, discarding this player's hand may complete the level
    if (this.state.status === "playing") {
      await this.checkLevelComplete();
      return;
    }

    await this.saveState();
    this.broadcastState();
  }

  async alarm() {
    await this.ensureLoaded();
    const now = Date.now();

    // Process disconnect timers
    const expired: string[] = [];
    for (const [playerId, time] of this.disconnectTimers) {
      if (time <= now) expired.push(playerId);
    }
    for (const playerId of expired) {
      this.disconnectTimers.delete(playerId);
      // Only remove if they're still disconnected (no active WebSocket)
      const stillConnected = this.ctx.getWebSockets().some(
        ws => this.getPlayerId(ws) === playerId
      );
      if (!stillConnected) {
        await this.removePlayer(playerId);
      }
    }

    // Handle level auto-advance
    if (this.state.status === "level_complete") {
      await this.dealNextLevel();
    }

    // Handle game-over storage cleanup
    if (
      this.gameOverCleanupAt !== null &&
      now >= this.gameOverCleanupAt &&
      (this.state.status === "game_over" || this.state.status === "victory")
    ) {
      this.gameOverCleanupAt = null;
      await this.ctx.storage.deleteAll();
      this.initialized = false;
      return;
    }

    // If there are remaining timers, schedule the next alarm
    await this.scheduleNextAlarm();
  }
}

// ---------------------------------------------------------------------------
// Worker: routes WebSocket connections to the correct Durable Object
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for the Next.js frontend
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Upgrade",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Route: /room/:code — proxy to Durable Object by room code
    const match = url.pathname.match(/^\/room\/([A-Z0-9]{4})$/i);
    if (match) {
      const roomCode = match[1].toUpperCase();

      // Only forward WebSocket upgrade requests to the Durable Object
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response(JSON.stringify({ room: roomCode, hint: "Use WebSocket to connect" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const id = env.GAME_ROOM.idFromName(roomCode);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
} satisfies ExportedHandler<Env>;
