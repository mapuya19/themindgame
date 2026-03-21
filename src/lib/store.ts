import { create } from 'zustand';
import type { GameState, ServerMessage } from '@/types/game';

// ---------------------------------------------------------------------------
// The store is now display-only. All game logic lives on the Cloudflare
// Durable Object server. The store just holds the latest state snapshot
// received from the server.
// ---------------------------------------------------------------------------

interface StoreState extends GameState {
  // Local-only (not from server)
  playerName: string | null;
  // Transient UI state for animations
  lastEvent: ServerMessage | null;

  // Actions
  setPlayerName: (name: string) => void;
  applyServerState: (state: GameState) => void;
  handleServerMessage: (msg: ServerMessage) => void;
  clearLastEvent: () => void;
  reset: () => void;
}

const INITIAL_STATE: GameState = {
  roomCode: '',
  players: [],
  level: 0,
  lives: 0,
  shurikens: 0,
  playedCards: [],
  discardedCards: [],
  hand: [],
  status: 'waiting',
  shurikenVoteActive: false,
  shurikenVotes: {},
};

export const useGameStore = create<StoreState>()((set) => ({
  ...INITIAL_STATE,
  playerName: null,
  lastEvent: null,

  setPlayerName: (name: string) => {
    set({ playerName: name });
    if (typeof window !== 'undefined') {
      localStorage.setItem('themind-player-name', name);
    }
  },

  applyServerState: (state: GameState) => {
    set(state);
  },

  handleServerMessage: (msg: ServerMessage) => {
    switch (msg.type) {
      case 'state':
        set(msg.state);
        break;
      case 'wrong_play':
      case 'card_played':
      case 'shuriken_used':
      case 'level_complete':
      case 'game_over':
        // Store the event for UI animations, then auto-clear
        set({ lastEvent: msg });
        break;
      default:
        break;
    }
  },

  clearLastEvent: () => {
    set({ lastEvent: null });
  },

  reset: () => {
    set({ ...INITIAL_STATE, playerName: null, lastEvent: null });
  },
}));
