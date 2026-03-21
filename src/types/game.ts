export interface Player {
  id: string;
  name: string;
  isConnected: boolean;
  isCoordinator: boolean;
  cardCount: number;
}

export interface GameState {
  roomCode: string;
  players: Player[];
  level: number;
  lives: number;
  shurikens: number;
  playedCards: number[];
  hand: number[];
  status: 'waiting' | 'playing' | 'level_complete' | 'game_over' | 'victory';
  shurikenVoteActive: boolean;
  shurikenVotes: Record<string, boolean>;
}

export interface GameConfig {
  playerCount: number;
  maxLevels: number;
  startingLives: number;
  startingShurikens: number;
}

export type GameAction =
  | { type: 'CARD_PLAYED'; card: number; playerId: string }
  | { type: 'SHURIKEN_VOTE'; playerId: string; vote: boolean }
  | { type: 'SHURIKEN_USED'; discardedCards: Record<string, number> }
  | { type: 'WRONG_PLAY'; card: number; lowerCards: number[] }
  | { type: 'LEVEL_COMPLETE'; bonusLives: number; bonusShurikens: number }
  | { type: 'GAME_OVER'; reason: 'victory' | 'no_lives' }
  | { type: 'STATE_REQUEST'; playerId: string }
  | { type: 'STATE_RESPONSE'; state: Partial<GameState> }
  | { type: 'PLAYER_JOINED'; player: Player }
  | { type: 'PLAYERS_SYNC'; players: Player[] }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'GAME_STARTED'; config: GameConfig; hands: Record<string, number[]> };
