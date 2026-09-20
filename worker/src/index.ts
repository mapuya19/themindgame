import { DurableObject } from 'cloudflare:workers';
import { configFor, DECK_SIZE, dealCards, type GameConfig, type GameMode } from './game-rules';

const ROOM_CODE_LENGTH = 8;
const MAX_MESSAGE_BYTES = 2_048;
const ACTION_WINDOW_MS = 10_000;
const MAX_ACTIONS_PER_WINDOW = 30;
const DISCONNECT_TIMEOUT = 30_000;
const EMPTY_ROOM_CLEANUP = 60_000;
const GAME_OVER_CLEANUP = 300_000;
const IDLE_ROOM_CLEANUP = 3_600_000;
const MAX_LIVES = 5;
const MAX_SHURIKENS = 3;

type ActiveStatus = 'playing' | 'level_complete';
type RoomStatus = 'waiting' | ActiveStatus | 'paused' | 'game_over' | 'victory';

interface PlayerInfo {
  id: string;
  name: string;
  /** Secret; never included in ClientState. */
  resumeToken: string;
}

interface RoomState {
  version: 2;
  roomCode: string;
  config: GameConfig;
  players: PlayerInfo[];
  /** Immutable for a started game, even if a player later leaves. */
  activePlayerIds: string[];
  level: number;
  lives: number;
  shurikens: number;
  playedCards: number[];
  discardedCards: number[];
  playerHands: Record<string, number[]>;
  status: RoomStatus;
  pausedStatus: ActiveStatus | null;
  shurikenVotes: Record<string, boolean>;
  /** Persisted deadline fields survive Durable Object hibernation. */
  disconnectDeadlines: Record<string, number>;
  levelAdvanceAt: number | null;
  gameOverCleanupAt: number | null;
  idleCleanupAt: number | null;
}

interface ClientState {
  roomCode: string;
  mode: GameMode;
  minPlayers: number;
  maxPlayers: number;
  maxLevels: number;
  players: { id: string; name: string; connected: boolean; cardCount: number }[];
  level: number;
  lives: number;
  shurikens: number;
  playedCards: number[];
  discardedCards: number[];
  hand: number[];
  status: RoomStatus;
  shurikenVoteActive: boolean;
  shurikenVotes: Record<string, boolean>;
}

type ClientMsg =
  | { type: 'join'; name: string; resumeToken?: string }
  | { type: 'start_game' }
  | { type: 'play_card'; card: number }
  | { type: 'vote_shuriken'; vote: boolean }
  | { type: 'restart_game' }
  | { type: 'leave_room' };

type ServerMsg =
  | { type: 'joined'; playerId: string; resumeToken: string }
  | { type: 'state'; state: ClientState }
  | { type: 'error'; message: string }
  | { type: 'card_played'; card: number; playerId: string }
  | { type: 'wrong_play'; card: number; lowerCards: number[]; livesLeft: number }
  | { type: 'level_complete'; level: number; bonusLives: number; bonusShurikens: number }
  | { type: 'game_over'; reason: 'victory' | 'no_lives' | 'player_left' }
  | { type: 'shuriken_vote'; playerId: string; vote: boolean }
  | { type: 'shuriken_used'; discardedCards: Record<string, number> }
  | { type: 'player_left'; playerId: string; playerName: string };

interface SocketAttachment {
  playerId?: string;
  actionWindowStartedAt?: number;
  actionCount?: number;
}

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  ADMIN_SECRET?: string;
  /** Comma-separated production frontend origins. Leave unset only for local development. */
  ALLOWED_ORIGINS?: string;
}

function emptyRoomState(): RoomState {
  return {
    version: 2,
    roomCode: '',
    config: configFor('standard'),
    players: [],
    activePlayerIds: [],
    level: 0,
    lives: 0,
    shurikens: 0,
    playedCards: [],
    discardedCards: [],
    playerHands: {},
    status: 'waiting',
    pausedStatus: null,
    shurikenVotes: {},
    disconnectDeadlines: {},
    levelAdvanceAt: null,
    gameOverCleanupAt: null,
    idleCleanupAt: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseClientMessage(value: unknown): ClientMsg | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'join':
      if (typeof value.name !== 'string') return null;
      if (value.resumeToken !== undefined && typeof value.resumeToken !== 'string') return null;
      return { type: 'join', name: value.name, resumeToken: value.resumeToken };
    case 'start_game':
    case 'restart_game':
    case 'leave_room':
      return { type: value.type };
    case 'play_card':
      return typeof value.card === 'number' && Number.isInteger(value.card)
        ? { type: 'play_card', card: value.card }
        : null;
    case 'vote_shuriken':
      return typeof value.vote === 'boolean' ? { type: 'vote_shuriken', vote: value.vote } : null;
    default:
      return null;
  }
}

function normalizeName(name: string): string | null {
  const normalized = name.trim().replace(/\s+/g, ' ');
  return normalized.length >= 1 && normalized.length <= 24 ? normalized : null;
}

function createToken(): string {
  return crypto.randomUUID();
}

export class GameRoom extends DurableObject<Env> {
  private state = emptyRoomState();
  private initialized = false;

  private async ensureLoaded() {
    if (this.initialized) return;
    this.initialized = true;
    const saved = await this.ctx.storage.get<RoomState>('room');
    if (saved) {
      this.state = this.migrateState(saved);
    }
  }

  /** Gives legacy persisted rooms safe defaults; new rooms are version 2. */
  private migrateState(saved: RoomState): RoomState {
    const legacy = saved as Partial<RoomState>;
    const mode: GameMode = legacy.config?.mode === 'large' ? 'large' : 'standard';
    const count = legacy.players?.length ?? 0;
    const config = legacy.config ?? configFor(mode, count);
    return {
      ...emptyRoomState(),
      ...legacy,
      version: 2,
      config,
      players: (legacy.players ?? []).map(player => ({
        ...player,
        // Legacy sessions must rejoin once; names no longer authenticate them.
        resumeToken: player.resumeToken ?? createToken(),
      })),
      activePlayerIds: legacy.activePlayerIds ?? [],
      playerHands: legacy.playerHands ?? {},
      shurikenVotes: legacy.shurikenVotes ?? {},
      disconnectDeadlines: legacy.disconnectDeadlines ?? {},
      pausedStatus: legacy.pausedStatus ?? null,
      levelAdvanceAt: legacy.levelAdvanceAt ?? null,
      gameOverCleanupAt: legacy.gameOverCleanupAt ?? null,
      idleCleanupAt: legacy.idleCleanupAt ?? null,
    };
  }

  private async saveState() {
    await this.ctx.storage.put('room', this.state);
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname.endsWith('/create')) {
      if (this.state.roomCode) return new Response('Room already exists', { status: 409 });
      const roomCode = url.pathname.split('/').at(-2)?.toUpperCase();
      const mode = url.searchParams.get('mode');
      if (!roomCode || !/^[A-Z2-9]{8}$/.test(roomCode) || (mode !== 'standard' && mode !== 'large')) {
        return new Response('Invalid room', { status: 400 });
      }
      this.state = emptyRoomState();
      this.state.roomCode = roomCode;
      this.state.config = configFor(mode);
      this.state.idleCleanupAt = Date.now() + IDLE_ROOM_CLEANUP;
      await this.saveState();
      await this.scheduleNextAlarm();
      return Response.json({ roomCode, mode }, { status: 201 });
    }

    if (request.method === 'GET' && url.pathname.endsWith('/exists')) {
      return Response.json({ exists: Boolean(this.state.roomCode) });
    }

    if (request.method === 'DELETE' && url.pathname.endsWith('/purge')) {
      for (const ws of this.ctx.getWebSockets()) ws.close(1012, 'Room purged');
      await this.ctx.storage.deleteAll();
      this.state = emptyRoomState();
      this.initialized = true;
      return Response.json({ purged: true });
    }

    if (!this.state.roomCode) return new Response('Room not found', { status: 404 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    await this.scheduleNextAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.ensureLoaded();
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) {
      this.send(ws, { type: 'error', message: 'Invalid message' });
      return;
    }
    if (this.isRateLimited(ws)) {
      this.send(ws, { type: 'error', message: 'Too many actions; slow down' });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      this.send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }
    const msg = parseClientMessage(parsed);
    if (!msg) {
      this.send(ws, { type: 'error', message: 'Invalid message' });
      return;
    }

    const playerId = this.getPlayerId(ws);
    switch (msg.type) {
      case 'join':
        await this.handleJoin(ws, msg.name, msg.resumeToken);
        break;
      case 'start_game':
        if (playerId) await this.handleStartGame(ws, playerId);
        else this.send(ws, { type: 'error', message: 'Join the room first' });
        break;
      case 'play_card':
        if (playerId) await this.handlePlayCard(playerId, msg.card);
        else this.send(ws, { type: 'error', message: 'Join the room first' });
        break;
      case 'vote_shuriken':
        if (playerId) await this.handleShurikenVote(playerId, msg.vote);
        else this.send(ws, { type: 'error', message: 'Join the room first' });
        break;
      case 'restart_game':
        if (playerId) await this.handleRestartGame(ws, playerId);
        else this.send(ws, { type: 'error', message: 'Join the room first' });
        break;
      case 'leave_room':
        if (playerId) await this.removePlayer(playerId);
        else this.send(ws, { type: 'error', message: 'Join the room first' });
        break;
    }
  }

  async webSocketClose(ws: WebSocket) {
    await this.ensureLoaded();
    const playerId = this.getPlayerId(ws);
    if (playerId && this.state.players.some(player => player.id === playerId) && !this.isPlayerConnected(playerId)) {
      this.state.disconnectDeadlines[playerId] = Date.now() + DISCONNECT_TIMEOUT;
      if (this.state.activePlayerIds.includes(playerId) && this.isActiveGame()) {
        this.state.pausedStatus = this.state.status as ActiveStatus;
        this.state.status = 'paused';
      }
    }
    if (!this.hasConnectedPlayers()) this.state.idleCleanupAt = Date.now() + IDLE_ROOM_CLEANUP;
    await this.saveState();
    this.broadcastState();
    await this.scheduleNextAlarm();
  }

  private attachment(ws: WebSocket): SocketAttachment {
    return (ws.deserializeAttachment() as SocketAttachment | null) ?? {};
  }

  private getPlayerId(ws: WebSocket): string | null {
    return this.attachment(ws).playerId ?? null;
  }

  private isRateLimited(ws: WebSocket): boolean {
    const now = Date.now();
    const attachment = this.attachment(ws);
    if (!attachment.actionWindowStartedAt || now - attachment.actionWindowStartedAt >= ACTION_WINDOW_MS) {
      attachment.actionWindowStartedAt = now;
      attachment.actionCount = 1;
    } else {
      attachment.actionCount = (attachment.actionCount ?? 0) + 1;
    }
    ws.serializeAttachment(attachment);
    return attachment.actionCount > MAX_ACTIONS_PER_WINDOW;
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Closed sockets can race with a broadcast.
    }
  }

  private broadcast(msg: ServerMsg) {
    for (const ws of this.ctx.getWebSockets()) {
      if (this.getPlayerId(ws)) this.send(ws, msg);
    }
  }

  private broadcastState() {
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.getPlayerId(ws);
      if (playerId) this.send(ws, { type: 'state', state: this.buildClientState(playerId) });
    }
  }

  private buildClientState(forPlayerId: string): ClientState {
    const config = this.state.config;
    return {
      roomCode: this.state.roomCode,
      mode: config.mode,
      minPlayers: config.minPlayers,
      maxPlayers: config.maxPlayers,
      maxLevels: config.maxLevels,
      players: this.state.players.map(player => ({
        id: player.id,
        name: player.name,
        connected: this.isPlayerConnected(player.id),
        cardCount: this.state.playerHands[player.id]?.length ?? 0,
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

  private isPlayerConnected(playerId: string): boolean {
    return this.ctx.getWebSockets().some(ws => this.getPlayerId(ws) === playerId);
  }

  private hasConnectedPlayers(): boolean {
    return this.ctx.getWebSockets().some(ws => this.getPlayerId(ws) !== null);
  }

  private allActivePlayersConnected(): boolean {
    return this.state.activePlayerIds.every(playerId => this.isPlayerConnected(playerId));
  }

  private isActiveGame(): boolean {
    return this.state.status === 'playing' || this.state.status === 'level_complete';
  }

  private markRoomActive() {
    this.state.idleCleanupAt = null;
  }

  private async handleJoin(ws: WebSocket, nameInput: string, resumeToken?: string) {
    const name = normalizeName(nameInput);
    if (!name) {
      this.send(ws, { type: 'error', message: 'Name must be 1–24 characters' });
      return;
    }

    if (resumeToken) {
      const existing = this.state.players.find(player => player.resumeToken === resumeToken);
      if (!existing) {
        this.send(ws, { type: 'error', message: 'Invalid or expired session' });
        return;
      }
      ws.serializeAttachment({ ...this.attachment(ws), playerId: existing.id });
      delete this.state.disconnectDeadlines[existing.id];
      this.markRoomActive();
      if (this.state.status === 'paused' && this.allActivePlayersConnected()) {
        this.state.status = this.state.pausedStatus ?? 'playing';
        this.state.pausedStatus = null;
      }
      await this.saveState();
      this.send(ws, { type: 'joined', playerId: existing.id, resumeToken: existing.resumeToken });
      this.broadcastState();
      await this.scheduleNextAlarm();
      return;
    }

    if (this.state.status !== 'waiting') {
      this.send(ws, { type: 'error', message: 'The game has already started' });
      return;
    }
    if (this.state.players.length >= this.state.config.maxPlayers) {
      this.send(ws, { type: 'error', message: 'This room is full' });
      return;
    }
    if (this.state.players.some(player => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      this.send(ws, { type: 'error', message: 'That name is already in use in this room' });
      return;
    }

    const player: PlayerInfo = { id: crypto.randomUUID(), name, resumeToken: createToken() };
    this.state.players.push(player);
    ws.serializeAttachment({ ...this.attachment(ws), playerId: player.id });
    delete this.state.disconnectDeadlines[player.id];
    this.markRoomActive();
    await this.saveState();
    this.send(ws, { type: 'joined', playerId: player.id, resumeToken: player.resumeToken });
    this.broadcastState();
    await this.scheduleNextAlarm();
  }

  private async handleStartGame(ws: WebSocket, playerId: string) {
    if (!this.state.players.some(player => player.id === playerId)) {
      this.send(ws, { type: 'error', message: 'Invalid player session' });
      return;
    }
    if (this.state.status !== 'waiting') {
      this.send(ws, { type: 'error', message: 'Game already started' });
      return;
    }
    const playerCount = this.state.players.length;
    if (!this.state.players.every(player => this.isPlayerConnected(player.id))) {
      this.send(ws, { type: 'error', message: 'Wait for all listed players to reconnect before starting' });
      return;
    }
    const baseConfig = configFor(this.state.config.mode, playerCount);
    if (playerCount < baseConfig.minPlayers || playerCount > baseConfig.maxPlayers) {
      this.send(ws, { type: 'error', message: `Need ${baseConfig.minPlayers}–${baseConfig.maxPlayers} players` });
      return;
    }

    this.state.config = baseConfig;
    this.state.activePlayerIds = this.state.players.map(player => player.id);
    this.state.level = 1;
    this.state.lives = baseConfig.startingLives;
    this.state.shurikens = baseConfig.startingShurikens;
    this.state.playedCards = [];
    this.state.discardedCards = [];
    this.state.shurikenVotes = {};
    this.state.status = 'playing';
    this.state.pausedStatus = null;
    this.state.playerHands = dealCards(this.state.activePlayerIds, 1);

    await this.saveState();
    this.broadcastState();
  }

  private async handleRestartGame(ws: WebSocket, playerId: string) {
    if (!this.state.players.some(player => player.id === playerId)) {
      this.send(ws, { type: 'error', message: 'Invalid player session' });
      return;
    }
    if (this.state.status !== 'game_over' && this.state.status !== 'victory') {
      this.send(ws, { type: 'error', message: 'The current game cannot be restarted yet' });
      return;
    }
    this.state.level = 0;
    this.state.lives = 0;
    this.state.shurikens = 0;
    this.state.playedCards = [];
    this.state.discardedCards = [];
    this.state.playerHands = {};
    this.state.activePlayerIds = [];
    this.state.shurikenVotes = {};
    this.state.status = 'waiting';
    this.state.pausedStatus = null;
    this.state.levelAdvanceAt = null;
    this.state.gameOverCleanupAt = null;

    await this.saveState();
    this.broadcastState();
    await this.scheduleNextAlarm();
  }

  private async dealNextLevel() {
    const nextLevel = this.state.level + 1;
    this.state.level = nextLevel;
    this.state.playedCards = [];
    this.state.discardedCards = [];
    this.state.shurikenVotes = {};
    this.state.status = 'playing';
    this.state.pausedStatus = null;
    this.state.levelAdvanceAt = null;
    this.state.playerHands = dealCards(this.state.activePlayerIds, nextLevel);
    await this.saveState();
    this.broadcastState();
  }

  private async handlePlayCard(playerId: string, card: number) {
    if (this.state.status !== 'playing' || !this.state.activePlayerIds.includes(playerId)) return;
    if (card < 1 || card > DECK_SIZE) return;
    const hand = this.state.playerHands[playerId];
    if (!hand?.includes(card)) return;

    const lowerCards = Object.values(this.state.playerHands)
      .flat()
      .filter(otherCard => otherCard < card)
      .sort((a, b) => a - b);

    if (lowerCards.length > 0) {
      this.state.lives--;
      this.state.playerHands[playerId] = hand.filter(handCard => handCard !== card);
      this.state.discardedCards.push(...lowerCards);
      const lowerSet = new Set(lowerCards);
      for (const id of this.state.activePlayerIds) {
        this.state.playerHands[id] = (this.state.playerHands[id] ?? []).filter(handCard => !lowerSet.has(handCard));
      }
      this.state.playedCards.push(card);

      if (this.state.lives <= 0) {
        await this.finishGame('no_lives');
        return;
      }
      this.broadcast({ type: 'wrong_play', card, lowerCards, livesLeft: this.state.lives });
      await this.checkLevelComplete();
      return;
    }

    this.state.playerHands[playerId] = hand.filter(handCard => handCard !== card);
    this.state.playedCards.push(card);
    this.broadcast({ type: 'card_played', card, playerId });
    await this.checkLevelComplete();
  }

  private async checkLevelComplete() {
    const allDone = this.state.activePlayerIds.every(playerId => (this.state.playerHands[playerId] ?? []).length === 0);
    if (!allDone) {
      await this.saveState();
      this.broadcastState();
      return;
    }

    const bonus = this.state.config.bonusRewards[this.state.level] ?? { lives: 0, shurikens: 0 };
    this.state.lives = Math.min(this.state.lives + bonus.lives, MAX_LIVES);
    this.state.shurikens = Math.min(this.state.shurikens + bonus.shurikens, MAX_SHURIKENS);

    if (this.state.level >= this.state.config.maxLevels) {
      await this.finishGame('victory');
      return;
    }

    this.state.status = 'level_complete';
    this.state.levelAdvanceAt = Date.now() + 3_000;
    this.broadcast({ type: 'level_complete', level: this.state.level, bonusLives: bonus.lives, bonusShurikens: bonus.shurikens });
    await this.saveState();
    this.broadcastState();
    await this.scheduleNextAlarm();
  }

  private async handleShurikenVote(playerId: string, vote: boolean) {
    if (this.state.status !== 'playing' || this.state.shurikens <= 0 || !this.state.activePlayerIds.includes(playerId)) return;
    this.state.shurikenVotes[playerId] = vote;
    this.broadcast({ type: 'shuriken_vote', playerId, vote });

    const allVotedYes = this.state.activePlayerIds.every(id => this.state.shurikenVotes[id] === true);
    if (!allVotedYes) {
      await this.saveState();
      this.broadcastState();
      return;
    }

    this.state.shurikens--;
    const discardedCards: Record<string, number> = {};
    for (const id of this.state.activePlayerIds) {
      const hand = this.state.playerHands[id] ?? [];
      if (hand.length) {
        const lowest = hand[0];
        discardedCards[id] = lowest;
        this.state.playerHands[id] = hand.slice(1);
      }
    }
    this.state.shurikenVotes = {};
    this.broadcast({ type: 'shuriken_used', discardedCards });
    await this.checkLevelComplete();
  }

  private async finishGame(reason: 'victory' | 'no_lives' | 'player_left') {
    this.state.status = reason === 'victory' ? 'victory' : 'game_over';
    this.state.pausedStatus = null;
    this.state.levelAdvanceAt = null;
    this.state.gameOverCleanupAt = Date.now() + GAME_OVER_CLEANUP;
    this.broadcast({ type: 'game_over', reason });
    await this.saveState();
    this.broadcastState();
    await this.scheduleNextAlarm();
  }

  private async removePlayer(playerId: string) {
    const player = this.state.players.find(candidate => candidate.id === playerId);
    if (!player) return;
    const wasActivePlayer = this.state.activePlayerIds.includes(playerId);
    const discardedHand = this.state.playerHands[playerId] ?? [];
    delete this.state.disconnectDeadlines[playerId];
    this.state.players = this.state.players.filter(candidate => candidate.id !== playerId);
    this.state.activePlayerIds = this.state.activePlayerIds.filter(id => id !== playerId);
    delete this.state.playerHands[playerId];
    delete this.state.shurikenVotes[playerId];
    this.state.discardedCards.push(...discardedHand);
    this.broadcast({ type: 'player_left', playerId, playerName: player.name });

    if (this.state.players.length === 0) {
      await this.ctx.storage.deleteAll();
      this.state = emptyRoomState();
      return;
    }

    // Leaving is a forfeit: discard that hand and continue with the remaining
    // roster. The configured level progression stays fixed at game start.
    if (wasActivePlayer && !['game_over', 'victory'].includes(this.state.status)) {
      if (this.state.activePlayerIds.length < 2) {
        await this.finishGame('player_left');
        return;
      }
      if (this.state.status === 'paused' && this.allActivePlayersConnected()) {
        this.state.status = this.state.pausedStatus ?? 'playing';
        this.state.pausedStatus = null;
      }
      if (this.state.status === 'playing') {
        await this.checkLevelComplete();
        return;
      }
    }
    await this.saveState();
    this.broadcastState();
  }

  private async scheduleNextAlarm() {
    const deadlines = [
      ...Object.values(this.state.disconnectDeadlines),
      this.state.levelAdvanceAt,
      this.state.gameOverCleanupAt,
      this.state.idleCleanupAt,
    ].filter((value): value is number => value !== null && value !== undefined);
    if (!deadlines.length) return;
    const next = Math.min(...deadlines);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || next < current || current < Date.now()) await this.ctx.storage.setAlarm(next);
  }

  async alarm() {
    await this.ensureLoaded();
    const now = Date.now();

    for (const [playerId, deadline] of Object.entries(this.state.disconnectDeadlines)) {
      if (deadline <= now && !this.isPlayerConnected(playerId)) await this.removePlayer(playerId);
      else if (this.isPlayerConnected(playerId)) delete this.state.disconnectDeadlines[playerId];
    }

    if (this.state.gameOverCleanupAt !== null && now >= this.state.gameOverCleanupAt && (this.state.status === 'game_over' || this.state.status === 'victory')) {
      await this.ctx.storage.deleteAll();
      this.state = emptyRoomState();
      return;
    }

    if (this.state.idleCleanupAt !== null && now >= this.state.idleCleanupAt && !this.hasConnectedPlayers()) {
      await this.ctx.storage.deleteAll();
      this.state = emptyRoomState();
      return;
    }

    if (this.state.levelAdvanceAt !== null && now >= this.state.levelAdvanceAt && this.state.status === 'level_complete') {
      await this.dealNextLevel();
      return;
    }

    await this.saveState();
    await this.scheduleNextAlarm();
  }
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  const configured = env.ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
  if (!configured.length) return origin ?? '*';
  return origin && configured.includes(origin) ? origin : null;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Upgrade, X-Admin-Secret',
    'Vary': 'Origin',
  };
}

function randomRoomCode(): string {
  // 32 symbols means every byte maps uniformly via its low five bits.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, byte => alphabet[byte & 31]).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    if (request.method === 'OPTIONS') {
      return origin ? new Response(null, { headers: corsHeaders(origin) }) : new Response('Forbidden', { status: 403 });
    }
    // A browser always supplies Origin for cross-origin fetches/WebSockets.
    // Permit non-browser administrative requests with no Origin header.
    if (request.headers.get('Origin') && !origin) return new Response('Forbidden', { status: 403 });

    const respond = (body: BodyInit | null, init: ResponseInit = {}) =>
      new Response(body, { ...init, headers: { ...corsHeaders(origin ?? '*'), ...(init.headers ?? {}) } });

    if (request.method === 'POST' && url.pathname === '/rooms') {
      if (!origin) return new Response('Forbidden', { status: 403 });
      let mode: GameMode = 'standard';
      try {
        const body = await request.json() as { mode?: unknown };
        if (body.mode === 'large') mode = 'large';
        else if (body.mode !== undefined && body.mode !== 'standard') return respond('Invalid mode', { status: 400 });
      } catch {
        return respond('Invalid JSON', { status: 400 });
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const roomCode = randomRoomCode();
        const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomCode));
        const created = await stub.fetch(new Request(`${url.origin}/room/${roomCode}/create?mode=${mode}`, { method: 'POST' }));
        if (created.status === 201) return respond(JSON.stringify({ roomCode, mode }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return respond('Could not create room', { status: 503 });
    }

    const purgeMatch = url.pathname.match(/^\/admin\/purge\/([A-Z2-9]{8})$/i);
    if (purgeMatch && request.method === 'DELETE') {
      if (!env.ADMIN_SECRET || request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
        return respond('Unauthorized', { status: 401 });
      }
      const roomCode = purgeMatch[1].toUpperCase();
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomCode));
      const result = await stub.fetch(new Request(`${url.origin}/room/${roomCode}/purge`, { method: 'DELETE' }));
      return respond(await result.text(), { status: result.status, headers: { 'Content-Type': 'application/json' } });
    }

    const match = url.pathname.match(/^\/room\/([A-Z2-9]{8})$/i);
    if (!match) return respond('Not found', { status: 404 });
    const roomCode = match[1].toUpperCase();
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomCode));
    const upgrade = request.headers.get('Upgrade')?.toLowerCase();

    if (request.method === 'GET' && upgrade !== 'websocket') {
      const result = await stub.fetch(new Request(`${url.origin}/room/${roomCode}/exists`, { method: 'GET' }));
      return respond(await result.text(), { status: result.status, headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method !== 'GET') return respond('Method not allowed', { status: 405 });
    if (upgrade !== 'websocket') return respond('Expected WebSocket upgrade', { status: 426 });
    if (!origin) return new Response('Forbidden', { status: 403 });
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
