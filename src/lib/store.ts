import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameState, Player, GameAction, GameConfig } from '@/types/game';
import {
  shuffleDeck,
  dealCards,
  getMaxLevels,
  getStartingLives,
  getStartingShurikens,
  checkCardPlay,
  getBonusRewards,
  generateRoomCode,
  createPlayerId
} from './game-logic';

// Generate or retrieve tab ID for isolated storage per browser tab
// Lazy initialization to avoid SSR issues
let cachedTabId: string | null = null;

function getTabId(): string {
  if (typeof window === 'undefined') {
    return 'ssr-tab';
  }
  if (!cachedTabId) {
    let tabId = sessionStorage.getItem('themind-tab-id');
    if (!tabId) {
      tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('themind-tab-id', tabId);
    }
    cachedTabId = tabId;
  }
  return cachedTabId;
}

// Storage keys are tab-specific so multiple players can play from same browser
const getStorageKey = (key: string) => `themind-${getTabId()}-${key}`;

const SESSION_KEYS = {
  PLAYER_ID: getStorageKey('player-id'),
  PLAYER_NAME: getStorageKey('player-name'),
  ROOM_CODE: getStorageKey('room-code'),
  IS_COORDINATOR: getStorageKey('is-coordinator')
};

interface StoreState extends GameState {
  // Session persistence (not in Zustand persist, use localStorage directly)
  playerId: string | null;
  playerName: string | null;
  isCoordinator: boolean;

  // Coordinator-only state (not persisted)
  playerHands: Record<string, number[]>;
  deck: number[];

  // Actions (return action to broadcast, or null if no action needed)
  createRoom: (playerName: string) => string; // returns roomCode
  joinRoom: (roomCode: string, playerName: string) => void;
  leaveRoom: () => void;

  // Coordinator actions
  startGame: () => GameAction | null;
  dealLevel: () => GameAction | null;

  // Player actions
  playCard: (card: number) => GameAction | null;
  voteShuriken: (vote: boolean) => GameAction | null;

  // Game event handlers
  handleAction: (action: GameAction) => void;

  // Sync
  syncState: (partialState: Partial<GameState>) => void;

  // Reconnection
  restoreSession: () => boolean;
  clearSession: () => void;
}

export const useGameStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      roomCode: '',
      players: [],
      level: 0,
      lives: 0,
      shurikens: 0,
      playedCards: [],
      hand: [],
      status: 'waiting',
      shurikenVoteActive: false,
      shurikenVotes: {},
      playerId: null,
      playerName: null,
      isCoordinator: false,
      playerHands: {},
      deck: [],

      createRoom: (playerName: string) => {
        const roomCode = generateRoomCode();
        const playerId = createPlayerId();

        const player: Player = {
          id: playerId,
          name: playerName,
          isConnected: true,
          isCoordinator: true,
          cardCount: 0
        };

        // Store session data
        localStorage.setItem(SESSION_KEYS.PLAYER_ID, playerId);
        localStorage.setItem(SESSION_KEYS.PLAYER_NAME, playerName);
        localStorage.setItem(SESSION_KEYS.ROOM_CODE, roomCode);
        localStorage.setItem(SESSION_KEYS.IS_COORDINATOR, 'true');

        set({
          roomCode,
          playerId,
          playerName,
          isCoordinator: true,
          players: [player],
          status: 'waiting'
        });

        return roomCode;
      },

      joinRoom: (roomCode: string, playerName: string) => {
        const playerId = createPlayerId();

        const player: Player = {
          id: playerId,
          name: playerName,
          isConnected: true,
          isCoordinator: false,
          cardCount: 0
        };

        // Store session data
        localStorage.setItem(SESSION_KEYS.PLAYER_ID, playerId);
        localStorage.setItem(SESSION_KEYS.PLAYER_NAME, playerName);
        localStorage.setItem(SESSION_KEYS.ROOM_CODE, roomCode);
        localStorage.setItem(SESSION_KEYS.IS_COORDINATOR, 'false');

        set({
          roomCode,
          playerId,
          playerName,
          isCoordinator: false,
          status: 'waiting'
        });

        // Note: The coordinator will handle adding the player to the players list
        // via the PLAYER_JOINED action
      },

      leaveRoom: () => {
        const state = get();

        // Clear session data
        localStorage.removeItem(SESSION_KEYS.PLAYER_ID);
        localStorage.removeItem(SESSION_KEYS.PLAYER_NAME);
        localStorage.removeItem(SESSION_KEYS.ROOM_CODE);
        localStorage.removeItem(SESSION_KEYS.IS_COORDINATOR);

        set({
          roomCode: '',
          players: [],
          level: 0,
          lives: 0,
          shurikens: 0,
          playedCards: [],
          hand: [],
          status: 'waiting',
          shurikenVoteActive: false,
          shurikenVotes: {},
          playerId: null,
          playerName: null,
          isCoordinator: false,
          playerHands: {},
          deck: []
        });
      },

      startGame: () => {
        const state = get();

        if (!state.isCoordinator) {
          console.error('Only coordinator can start the game');
          return null;
        }

        const playerCount = state.players.length;
        const playerIds = state.players.map(p => p.id);
        const maxLevels = getMaxLevels(playerCount);
        const startingLives = getStartingLives(playerCount);
        const startingShurikens = getStartingShurikens(playerCount);

        console.log('[startGame] Starting game with players:', state.players);

        // Initialize deck
        const deck = shuffleDeck();
        console.log('[startGame] Deck shuffled, size:', deck.length);

        // Deal level 1
        const cardsPerPlayer = 1;
        const hands = dealCards(deck, playerIds, cardsPerPlayer);
        console.log('[startGame] Hands dealt:', hands);

        // Update player card counts
        const updatedPlayers = state.players.map(player => ({
          ...player,
          cardCount: hands[player.id]?.length || 0
        }));

        // Set this player's hand
        const myHand = hands[state.playerId!] || [];
        console.log('[startGame] My hand:', myHand, 'for player:', state.playerId);

        const config: GameConfig = {
          playerCount,
          maxLevels,
          startingLives,
          startingShurikens
        };

        set({
          level: 1,
          lives: startingLives,
          shurikens: startingShurikens,
          playedCards: [],
          hand: myHand,
          status: 'playing',
          players: updatedPlayers,
          playerHands: hands,
          deck
        });

        console.log('[startGame] State updated, playerHands:', hands);

        // Return action to broadcast
        return {
          type: 'GAME_STARTED',
          config,
          hands
        };
      },

      dealLevel: () => {
        const state = get();

        if (!state.isCoordinator) {
          console.error('Only coordinator can deal levels');
          return null;
        }

        if (state.level === 0) {
          console.error('Game not started');
          return null;
        }

        const playerIds = state.players.map(p => p.id);
        const cardsPerPlayer = state.level;

        console.log('[dealLevel] Dealing level', state.level, 'to players:', playerIds);

        // Deal cards for current level
        const hands = dealCards(state.deck, playerIds, cardsPerPlayer);
        console.log('[dealLevel] New hands dealt:', hands);

        // Update player card counts
        const updatedPlayers = state.players.map(player => ({
          ...player,
          cardCount: (state.playerHands[player.id]?.length || 0) + (hands[player.id]?.length || 0)
        }));

        // Merge new hands with existing hands
        const mergedHands: Record<string, number[]> = {};
        for (const playerId in state.playerHands) {
          mergedHands[playerId] = [
            ...(state.playerHands[playerId] || []),
            ...(hands[playerId] || [])
          ].sort((a, b) => a - b);
        }

        // Update this player's hand
        const myHand = mergedHands[state.playerId!] || [];
        console.log('[dealLevel] My merged hand:', myHand);

        set({
          hand: myHand,
          playedCards: [],
          status: 'playing',
          players: updatedPlayers,
          playerHands: mergedHands
        });

        return null;
      },

      playCard: (card: number) => {
        const state = get();
        console.log('[store] playCard called with card:', card, 'isCoordinator:', state.isCoordinator);

        if (!state.playerId) {
          console.error('Player not in game');
          return null;
        }

        if (state.isCoordinator) {
          // Coordinator processes the play
          const { valid, lowerCards } = checkCardPlay(card, state.playedCards, state.playerHands);

          if (!valid) {
            console.log('[store] Invalid card play, losing a life');
            // Wrong play - lose a life
            const newLives = state.lives - 1;
            const gameOver = newLives === 0;

            set({
              lives: newLives,
              status: gameOver ? 'game_over' : 'playing'
            });

            if (gameOver) {
              // Broadcast GAME_OVER action
              return {
                type: 'GAME_OVER',
                reason: 'no_lives' as const
              };
            } else {
              // Broadcast WRONG_PLAY action
              return {
                type: 'WRONG_PLAY',
                card,
                lowerCards
              };
            }
          }

          console.log('[store] Valid card play');
          // Valid play - update state
          const updatedHands = { ...state.playerHands };
          updatedHands[state.playerId!] = updatedHands[state.playerId!]?.filter(c => c !== card) || [];

          const newPlayedCards = [...state.playedCards, card];
          const newHand = state.hand.filter(c => c !== card);

          // Check if level is complete (all cards played)
          const allCardsPlayed = Object.values(updatedHands).every(hand => hand.length === 0);

          if (allCardsPlayed) {
            const maxLevels = getMaxLevels(state.players.length);
            const isLastLevel = state.level === maxLevels;
            const bonusRewards = getBonusRewards(state.level);

            if (isLastLevel) {
              set({
                hand: newHand,
                playedCards: newPlayedCards,
                status: 'victory',
                playerHands: updatedHands
              });

              // Broadcast GAME_OVER action with victory
              return {
                type: 'GAME_OVER',
                reason: 'victory' as const
              };
            } else {
              set({
                hand: newHand,
                playedCards: newPlayedCards,
                status: 'level_complete',
                lives: state.lives + bonusRewards.lives,
                shurikens: state.shurikens + bonusRewards.shurikens,
                playerHands: updatedHands
              });

              // Broadcast LEVEL_COMPLETE action
              return {
                type: 'LEVEL_COMPLETE',
                bonusLives: bonusRewards.lives,
                bonusShurikens: bonusRewards.shurikens
              };
            }
          } else {
            set({
              hand: newHand,
              playedCards: newPlayedCards,
              status: 'playing',
              playerHands: updatedHands
            });

            // Broadcast CARD_PLAYED action
            return {
              type: 'CARD_PLAYED',
              card,
              playerId: state.playerId
            };
          }
        } else {
          // Non-coordinator sends CARD_PLAYED action to coordinator (broadcasts via WebSocket)
          return {
            type: 'CARD_PLAYED',
            card,
            playerId: state.playerId
          };
        }
      },

      voteShuriken: (vote: boolean) => {
        const state = get();

        if (!state.playerId) {
          console.error('Player not in game');
          return null;
        }

        const updatedVotes = {
          ...state.shurikenVotes,
          [state.playerId]: vote
        };

        set({
          shurikenVotes: updatedVotes
        });

        // If coordinator, check if shuriken vote is complete
        if (state.isCoordinator) {
          const playerCount = state.players.filter(p => p.isConnected).length;
          const voteCount = Object.values(updatedVotes).filter(v => v === true).length;
          const voteThreshold = Math.ceil(playerCount / 2);

          if (voteCount >= voteThreshold) {
            // Shuriken vote passed - use shuriken
            if (state.shurikens > 0) {
              // Discard lowest card from each player
              const discardedCards: Record<string, number> = {};
              const updatedHands = { ...state.playerHands };

              for (const playerId in updatedHands) {
                const hand = updatedHands[playerId];
                if (hand && hand.length > 0) {
                  const lowestCard = Math.min(...hand);
                  discardedCards[playerId] = lowestCard;
                  updatedHands[playerId] = hand.filter(c => c !== lowestCard);
                }
              }

              const newHand = updatedHands[state.playerId!] || [];

              set({
                shurikens: state.shurikens - 1,
                shurikenVoteActive: false,
                shurikenVotes: {},
                hand: newHand,
                playerHands: updatedHands
              });

              // Broadcast SHURIKEN_USED action
              return {
                type: 'SHURIKEN_USED',
                discardedCards
              };
            }
          }
        } else {
          // Non-coordinator sends vote to coordinator
          // The action would be: { type: 'SHURIKEN_VOTE', playerId: state.playerId, vote }
          return {
            type: 'SHURIKEN_VOTE',
            playerId: state.playerId,
            vote
          };
        }

        return null;
      },

      handleAction: (action: GameAction) => {
        const state = get();

        switch (action.type) {
          case 'PLAYER_JOINED': {
            if (state.isCoordinator) {
              // Add player and broadcast updated players list
              const playerExists = state.players.some(p => p.id === action.player.id);
              const updatedPlayers = playerExists
                ? state.players
                : [...state.players, action.player];

              set({
                players: updatedPlayers
              });

              // Broadcast PLAYERS_SYNC action with updated player list
              // This will be sent via WebSocket to all players
            } else {
              // Non-coordinator players should receive PLAYERS_SYNC instead
              console.warn('Non-coordinator received PLAYER_JOINED, should receive PLAYERS_SYNC');
            }
            break;
          }

          case 'PLAYERS_SYNC': {
            set({
              players: action.players
            });
            break;
          }

          case 'PLAYER_LEFT': {
            const updatedPlayers = state.players.filter(p => p.id !== action.playerId);
            set({
              players: updatedPlayers
            });
            break;
          }

          case 'GAME_STARTED': {
            console.log('[GAME_STARTED] Received action with config:', action.config);
            console.log('[GAME_STARTED] Hands in action:', action.hands);
            console.log('[GAME_STARTED] My playerId:', state.playerId);
            console.log('[GAME_STARTED] My hand from action:', action.hands[state.playerId!]);

            const myHand = action.hands[state.playerId!] || [];
            console.log('[GAME_STARTED] Setting hand to:', myHand);

            set({
              level: 1,
              lives: action.config.startingLives,
              shurikens: action.config.startingShurikens,
              playedCards: [],
              hand: myHand,
              status: 'playing'
            });
            break;
          }

          case 'CARD_PLAYED': {
            console.log('[store] CARD_PLAYED action received:', action);
            console.log('[store] My playerId:', state.playerId);
            console.log('[store] Action playerId:', action.playerId);

            // Update playedCards
            const newPlayedCards = [...state.playedCards, action.card];

            // If this card is from the current player, remove it from their hand
            let newHand = state.hand;
            if (action.playerId === state.playerId) {
              console.log('[store] Card is from current player, removing from hand');
              newHand = state.hand.filter(c => c !== action.card);
            } else {
              console.log('[store] Card is from another player');
            }

            set({
              playedCards: newPlayedCards,
              hand: newHand
            });
            break;
          }

          case 'SHURIKEN_VOTE': {
            const updatedVotes = {
              ...state.shurikenVotes,
              [action.playerId]: action.vote
            };
            set({
              shurikenVotes: updatedVotes
            });
            break;
          }

          case 'SHURIKEN_USED': {
            const updatedHand = state.hand.filter(c => c !== action.discardedCards[state.playerId!]);
            set({
              shurikens: state.shurikens - 1,
              shurikenVoteActive: false,
              shurikenVotes: {},
              hand: updatedHand
            });
            break;
          }

          case 'WRONG_PLAY': {
            const newLives = state.lives - 1;
            const gameOver = newLives === 0;
            set({
              lives: newLives,
              status: gameOver ? 'game_over' : 'playing'
            });
            break;
          }

          case 'LEVEL_COMPLETE': {
            set({
              lives: state.lives + action.bonusLives,
              shurikens: state.shurikens + action.bonusShurikens,
              status: 'level_complete'
            });
            break;
          }

          case 'GAME_OVER': {
            set({
              status: action.reason === 'victory' ? 'victory' : 'game_over'
            });
            break;
          }

          case 'STATE_RESPONSE': {
            set({
              ...action.state
            });
            break;
          }

          case 'STATE_REQUEST': {
            // Coordinator responds with current state
            if (state.isCoordinator) {
              // Send STATE_RESPONSE action back
            }
            break;
          }

          default: {
            console.warn('Unknown action type:', action);
          }
        }
      },

      syncState: (partialState: Partial<GameState>) => {
        set(partialState);
      },

      restoreSession: () => {
        const playerId = localStorage.getItem(SESSION_KEYS.PLAYER_ID);
        const playerName = localStorage.getItem(SESSION_KEYS.PLAYER_NAME);
        const roomCode = localStorage.getItem(SESSION_KEYS.ROOM_CODE);
        const isCoordinator = localStorage.getItem(SESSION_KEYS.IS_COORDINATOR) === 'true';

        if (playerId && playerName && roomCode) {
          set({
            playerId,
            playerName,
            roomCode,
            isCoordinator
          });
          return true;
        }

        return false;
      },

      clearSession: () => {
        localStorage.removeItem(SESSION_KEYS.PLAYER_ID);
        localStorage.removeItem(SESSION_KEYS.PLAYER_NAME);
        localStorage.removeItem(SESSION_KEYS.ROOM_CODE);
        localStorage.removeItem(SESSION_KEYS.IS_COORDINATOR);

        set({
          playerId: null,
          playerName: null,
          isCoordinator: false
        });
      }
    }),
    {
      name: 'themind-storage',
      partialize: (state) => ({
        roomCode: state.roomCode,
        playerId: state.playerId,
        playerName: state.playerName,
        isCoordinator: state.isCoordinator,
        // Game state for persistence
        level: state.level,
        lives: state.lives,
        shurikens: state.shurikens,
        playedCards: state.playedCards,
        hand: state.hand,
        status: state.status,
        players: state.players,
        shurikenVoteActive: state.shurikenVoteActive,
        shurikenVotes: state.shurikenVotes
      })
    }
  )
);
