// ---------------------------------------------------------------------------
// Shared types for the client ↔ server WebSocket protocol
// ---------------------------------------------------------------------------

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  cardCount: number;
}

export interface GameState {
  roomCode: string;
  players: Player[];
  level: number;
  lives: number;
  shurikens: number;
  playedCards: number[];
  discardedCards: number[];
  hand: number[];
  status: 'waiting' | 'playing' | 'level_complete' | 'game_over' | 'victory';
  shurikenVoteActive: boolean;
  shurikenVotes: Record<string, boolean>;
}

// Messages the client sends to the server
export type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'start_game' }
  | { type: 'play_card'; card: number }
  | { type: 'vote_shuriken'; vote: boolean }
  | { type: 'restart_game' };

// Messages the server sends to the client
export type ServerMessage =
  | { type: 'state'; state: GameState }
  | { type: 'error'; message: string }
  | { type: 'card_played'; card: number; playerId: string }
  | { type: 'wrong_play'; card: number; lowerCards: number[]; livesLeft: number }
  | { type: 'level_complete'; level: number; bonusLives: number; bonusShurikens: number }
  | { type: 'game_over'; reason: 'victory' | 'no_lives' }
  | { type: 'shuriken_vote'; playerId: string; vote: boolean }
  | { type: 'shuriken_used'; discardedCards: Record<string, number> }
  | { type: 'player_left'; playerId: string; playerName: string };
