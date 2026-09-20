// Shared client ↔ server WebSocket protocol. Keep this file in lockstep with
// worker/src/index.ts until it is extracted into a separately built package.

export type GameMode = 'standard' | 'large';
export type RoomStatus =
  | 'waiting'
  | 'playing'
  | 'paused'
  | 'level_complete'
  | 'game_over'
  | 'victory';

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  cardCount: number;
}

export interface GameState {
  roomCode: string;
  mode: GameMode;
  minPlayers: number;
  maxPlayers: number;
  maxLevels: number;
  players: Player[];
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

export type ClientMessage =
  | { type: 'join'; name: string; resumeToken?: string }
  | { type: 'start_game' }
  | { type: 'play_card'; card: number }
  | { type: 'vote_shuriken'; vote: boolean }
  | { type: 'restart_game' }
  | { type: 'leave_room' }
  | { type: 'continue_without_disconnected' };

export type ServerMessage =
  | { type: 'joined'; playerId: string; resumeToken: string }
  | { type: 'state'; state: GameState }
  | { type: 'error'; message: string }
  | { type: 'card_played'; card: number; playerId: string }
  | { type: 'wrong_play'; card: number; lowerCards: number[]; livesLeft: number }
  | { type: 'level_complete'; level: number; bonusLives: number; bonusShurikens: number }
  | { type: 'game_over'; reason: 'victory' | 'no_lives' | 'player_left' }
  | { type: 'shuriken_vote'; playerId: string; vote: boolean }
  | { type: 'shuriken_used'; discardedCards: Record<string, number> }
  | { type: 'player_left'; playerId: string; playerName: string };
