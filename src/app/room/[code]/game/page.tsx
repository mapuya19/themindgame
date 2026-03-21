'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useGameStore } from '@/lib/store';
import { GameClient } from '@/lib/itty-client';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameAction } from '@/types/game';

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const roomCode = params.code as string;

  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [shurikenVoting, setShurikenVoting] = useState(false);
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [isCoordinator, setIsCoordinator] = useState(false);

  const {
    playerId,
    playerName,
    hand,
    playedCards,
    level,
    lives,
    shurikens,
    players,
    status,
    shurikenVoteActive,
    shurikenVotes,
    isCoordinator: storeIsCoordinator,
    restoreSession,
    clearSession,
    playCard,
    voteShuriken,
    handleAction
  } = useGameStore();

  // Debug logging for hand
  useEffect(() => {
    console.log('[GamePage] Current hand:', hand);
    console.log('[GamePage] Player ID:', playerId);
    console.log('[GamePage] Status:', status);
    setIsCoordinator(storeIsCoordinator);
  }, [hand, playerId, status, storeIsCoordinator]);

  const cardContainerRef = useRef<HTMLDivElement>(null);
  const gameClientRef = useRef<GameClient | null>(null);

  useEffect(() => {
    // Try to restore session
    const restored = restoreSession();

    if (!restored || !playerId || !playerName) {
      router.push('/');
      return;
    }

    // Validate room code matches
    if (useGameStore.getState().roomCode !== roomCode) {
      router.push('/');
      return;
    }

    // Connect to WebSocket
    const connectWebSocket = () => {
      try {
        const client = new GameClient(roomCode, playerId);
        gameClientRef.current = client;

        client.onConnect(() => {
          setIsConnected(true);
          setIsReconnecting(false);

          const state = useGameStore.getState();

          // Send PLAYER_JOINED action so coordinator knows about this player
          gameClientRef.current?.send({
            type: 'PLAYER_JOINED',
            player: {
              id: playerId,
              name: playerName,
              isConnected: true,
              isCoordinator: state.isCoordinator,
              cardCount: 0
            }
          } as GameAction);

          // Request current state from coordinator
          gameClientRef.current?.send({
            type: 'STATE_REQUEST',
            playerId
          } as GameAction);
        });

        client.onDisconnect(() => {
          setIsConnected(false);
          setIsReconnecting(true);

          // Attempt to reconnect after 2 seconds
          setTimeout(() => {
            if (gameClientRef.current) {
              connectWebSocket();
            }
          }, 2000);
        });

        client.onMessage((action: GameAction) => {
          console.log('[GamePage] Received action:', action.type, action);

          // Handle STATE_REQUEST - coordinator responds with current state
          if (action.type === 'STATE_REQUEST' && useGameStore.getState().isCoordinator) {
            if (gameClientRef.current) {
              const state = useGameStore.getState();
              const stateResponse: GameAction = {
                type: 'STATE_RESPONSE',
                state: {
                  roomCode: state.roomCode,
                  players: state.players,
                  level: state.level,
                  lives: state.lives,
                  shurikens: state.shurikens,
                  playedCards: state.playedCards,
                  hand: state.hand, // This is just the coordinator's hand, players will use their own
                  status: state.status,
                  shurikenVoteActive: state.shurikenVoteActive,
                  shurikenVotes: state.shurikenVotes
                }
              };
              console.log('[GamePage] Sending STATE_RESPONSE:', stateResponse);
              gameClientRef.current.send(stateResponse);
            }
            return;
          }

          handleAction(action);

          // Handle level complete
          if (action.type === 'LEVEL_COMPLETE') {
            setShowLevelComplete(true);
            setTimeout(() => {
              setShowLevelComplete(false);
            }, 3000);
          }

          // Handle game over
          if (action.type === 'GAME_OVER') {
            setTimeout(() => {
              if (action.reason === 'victory') {
                router.push(`/room/${roomCode}/game?victory=true`);
              }
            }, 2000);
          }
        });

        client.connect();
      } catch (err) {
        console.error('Connection error:', err);
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (gameClientRef.current) {
        gameClientRef.current.disconnect();
      }
    };
  }, [roomCode, playerId, playerName, restoreSession, handleAction, router, storeIsCoordinator]);

  // Heartbeat: periodically request state sync
  useEffect(() => {
    if (!isConnected || !playerId || isCoordinator) {
      // Coordinators don't need to request state, they are the source of truth
      return;
    }

    console.log('[GamePage] Starting heartbeat for state sync');

    // Request state immediately on connection
    const requestState = () => {
      if (gameClientRef.current) {
        const action: GameAction = {
          type: 'STATE_REQUEST',
          playerId
        };
        console.log('[GamePage] Sending STATE_REQUEST');
        gameClientRef.current.send(action);
      }
    };

    // Initial request
    requestState();

    // Then request every 5 seconds
    const heartbeatInterval = setInterval(requestState, 5000);

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [isConnected, playerId, isCoordinator]);

  const handleCardPlay = (card: number) => {
    if (status !== 'playing') return;

    console.log('[GamePage] handleCardPlay called with card:', card, 'playerId:', playerId);

    // Call store method to update local state and get action to broadcast
    const action = playCard(card);

    if (action && gameClientRef.current) {
      console.log('[GamePage] Broadcasting action from store:', action);
      gameClientRef.current.send(action);
    } else if (action) {
      console.error('[GamePage] Cannot send action: client not available');
    }

    setSelectedCard(card);

    // Animate card flying to center
    setTimeout(() => {
      setSelectedCard(null);
    }, 500);
  };

  const handleShurikenVote = (vote: boolean) => {
    console.log('[GamePage] handleShurikenVote called with vote:', vote);

    // Call store method to update local state and get action to broadcast
    const action = voteShuriken(vote);

    if (action && gameClientRef.current) {
      console.log('[GamePage] Broadcasting action from store:', action);
      gameClientRef.current.send(action);
    } else if (action) {
      console.error('[GamePage] Cannot send action: client not available');
    }

    setShurikenVoting(true);
    setTimeout(() => {
      setShurikenVoting(false);
    }, 1000);
  };

  const handleLeaveRoom = () => {
    clearSession();
    router.push('/');
  };

  const handlePlayAgain = () => {
    router.push(`/room/${roomCode}`);
  };

  // Check for victory/defeat states
  const isVictory = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('victory') === 'true';
  const isGameOver = status === 'game_over' || status === 'victory' || isVictory;

  return (
    <div className="min-h-screen flex flex-col p-4 bg-gradient-to-br from-bg-primary via-[#12121f] to-bg-primary overflow-hidden">
      {/* Reconnecting overlay */}
      <AnimatePresence>
        {isReconnecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-star mx-auto mb-4" />
              <p className="text-white text-lg">Reconnecting...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level Complete Modal */}
      <AnimatePresence>
        {showLevelComplete && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <div className="glass-card rounded-2xl p-8 text-center">
              <h2 className="text-3xl font-bold text-accent-success mb-2">Level Complete!</h2>
              <p className="text-gray-300">Preparing Level {level + 1}...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over / Victory Modal */}
      <AnimatePresence>
        {isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <div className="glass-card rounded-2xl p-8 text-center max-w-md">
              {isVictory || status === 'victory' ? (
                <>
                  <h2 className="text-4xl font-bold text-accent-star mb-4">🎉 Victory!</h2>
                  <p className="text-gray-300 mb-6">You conquered The Mind!</p>
                </>
              ) : (
                <>
                  <h2 className="text-4xl font-bold text-red-400 mb-4">Game Over</h2>
                  <p className="text-gray-300 mb-6">You ran out of lives</p>
                </>
              )}
              <div className="space-y-3">
                <button
                  onClick={handlePlayAgain}
                  className="w-full game-button-primary"
                >
                  Play Again
                </button>
                <button
                  onClick={handleLeaveRoom}
                  className="w-full game-button-secondary"
                >
                  Leave Room
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar - Game status */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-xl p-4 mb-4"
      >
        <div className="flex justify-between items-center">
          {/* Level */}
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Level</p>
            <p className="text-2xl font-bold text-white">{level}</p>
          </div>

          {/* Lives */}
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Lives</p>
            <div className="flex gap-1">
              {Array.from({ length: lives }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="w-6 h-6 rounded-full bg-accent-life"
                />
              ))}
            </div>
          </div>

          {/* Shurikens */}
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Shurikens</p>
            <div className="flex gap-1">
              {Array.from({ length: shurikens }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="text-xl"
                >
                  ⭐
                </motion.div>
              ))}
            </div>
          </div>

          {/* Connection status */}
          <div className="text-center">
            <div
              className={`w-3 h-3 rounded-full ${
                isConnected ? 'bg-green-400' : 'bg-yellow-400'
              }`}
            />
          </div>
        </div>
      </motion.div>

      {/* Center - Played cards */}
      <div className="flex-1 flex items-center justify-center mb-4">
        <div className="relative">
          {/* Breathing pulse effect */}
          {playedCards.length > 0 && (
            <motion.div
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute inset-0 rounded-full bg-accent-star/20 blur-xl"
            />
          )}

          {/* Played cards pile */}
          <div className="relative glass-card rounded-2xl p-8 min-w-[200px] min-h-[280px] flex items-center justify-center">
            {playedCards.length > 0 ? (
              <div className="relative">
                {playedCards.slice(-3).map((card, index) => (
                  <motion.div
                    key={card}
                    initial={{ scale: 0.8, opacity: 0, y: -50 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{
                      type: 'spring',
                      damping: 12,
                      stiffness: 200,
                      delay: index * 0.05,
                    }}
                    className="absolute"
                    style={{
                      transform: `translateX(${index * 8}px)`,
                      zIndex: index,
                    }}
                  >
                    <div className="card bg-bg-card border border-white/20 text-white">
                      {card}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Play cards here</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom section - Hand and players */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Player hand */}
        <div className="md:col-span-3 glass-card rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Your Hand</h3>
          <div className="flex flex-wrap gap-2 justify-center">
            <AnimatePresence>
              {hand.map((card) => (
                <motion.button
                  key={card}
                  initial={{ scale: 0, y: 50 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0, y: -50 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleCardPlay(card)}
                  disabled={status !== 'playing'}
                  className={`card bg-bg-card border border-white/20 text-white hover:border-accent-star/50 ${
                    status !== 'playing' ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {card}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Players list */}
        <div className="glass-card rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Players</h3>
          <div className="space-y-2">
            {players.map((player) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-2 rounded ${
                  player.id === playerId ? 'bg-accent-star/10' : 'bg-bg-primary/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-bg-primary/50 flex items-center justify-center text-xs font-bold text-white">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-white truncate">
                    {player.name}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      player.isConnected ? 'bg-green-400' : 'bg-red-400'
                    }`}
                  />
                  <span className="text-xs text-gray-400">
                    {player.cardCount} cards
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Shuriken vote button */}
          {shurikens > 0 && status === 'playing' && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              onClick={() => handleShurikenVote(true)}
              disabled={shurikenVoteActive}
              className={`w-full mt-3 game-button-secondary ${
                shurikenVoteActive ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              ⭐ Use Shuriken
            </motion.button>
          )}

          {/* Shuriken vote progress */}
          {shurikenVoteActive && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 p-2 bg-bg-primary/50 rounded text-center"
            >
              <p className="text-xs text-gray-400">
                Shuriken vote in progress...
              </p>
              <p className="text-sm text-accent-star">
                {Object.values(shurikenVotes).filter(v => v).length} / {players.length}
              </p>
            </motion.div>
          )}

          {/* Leave button */}
          <button
            onClick={handleLeaveRoom}
            className="w-full mt-3 px-3 py-2 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}
