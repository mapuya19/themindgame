'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useGameStore } from '@/lib/store';
import { GameClient } from '@/lib/itty-client';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameAction, GameConfig } from '@/types/game';

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams();
  const roomCode = (params.code as string).toUpperCase();

  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gameClientRef = useRef<GameClient | null>(null);

  const {
    playerId,
    playerName,
    isCoordinator,
    players,
    status,
    restoreSession,
    clearSession,
    handleAction,
    startGame
  } = useGameStore();

  useEffect(() => {
    // Try to restore session
    const restored = restoreSession();

    if (!restored || !playerId || !playerName) {
      router.push('/');
      return;
    }

    // Validate room code matches
    if (useGameStore.getState().roomCode !== roomCode) {
      setError('Room code mismatch. Please rejoin.');
      return;
    }

    // Connect to WebSocket
    let gameClient: GameClient | null = null;

    const connectWebSocket = () => {
      try {
        gameClient = new GameClient(roomCode, playerId);
        gameClientRef.current = gameClient;

        gameClient.onConnect(() => {
          setIsConnected(true);
          setIsReconnecting(false);
          setError(null);

          const state = useGameStore.getState();

          // Send PLAYER_JOINED action so coordinator knows about this player
          gameClient?.send({
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
          gameClient?.send({
            type: 'STATE_REQUEST',
            playerId
          } as GameAction);
        });

        gameClient.onDisconnect(() => {
          setIsConnected(false);
          setIsReconnecting(true);
          setError('Disconnected. Reconnecting...');

          // Attempt to reconnect after 2 seconds
          setTimeout(() => {
            if (gameClient) {
              connectWebSocket();
            }
          }, 2000);
        });

        gameClient.onMessage((action: GameAction) => {
          const state = useGameStore.getState();

          // If coordinator receives STATE_REQUEST, respond with current state
          if (action.type === 'STATE_REQUEST' && state.isCoordinator) {
            gameClient?.send({
              type: 'PLAYERS_SYNC',
              players: state.players
            } as GameAction);
            return;
          }

          // If coordinator receives PLAYER_JOINED, broadcast updated player list
          if (action.type === 'PLAYER_JOINED' && state.isCoordinator) {
            // Add player first via handleAction
            handleAction(action);

            // Get updated players list and broadcast to all
            const updatedPlayers = useGameStore.getState().players;
            gameClient?.send({
              type: 'PLAYERS_SYNC',
              players: updatedPlayers
            } as GameAction);
            return;
          }

          handleAction(action);

          // Redirect to game when started
          if (action.type === 'GAME_STARTED') {
            setTimeout(() => {
              router.push(`/room/${roomCode}/game`);
            }, 500);
          }
        });

        gameClient.connect();
      } catch (err) {
        setError('Failed to connect to game server');
        console.error('Connection error:', err);
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (gameClient) {
        gameClient.disconnect();
      }
    };
  }, [roomCode, playerId, playerName, restoreSession, handleAction, router]);

  const handleStartGame = () => {
    if (isCoordinator && gameClientRef.current) {
      console.log('[handleStartGame] Starting game from lobby');

      // Call store method to update local state and get action to broadcast
      const action = startGame();

      if (action && gameClientRef.current) {
        console.log('[handleStartGame] Broadcasting action from store:', action);
        gameClientRef.current.send(action);
      } else if (action) {
        console.error('[handleStartGame] Cannot send action: client not available');
      }

      router.push(`/room/${roomCode}/game`);
    }
  };

  const handleLeaveRoom = () => {
    clearSession();
    router.push('/');
  };

  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
  };

  if (error && !isReconnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Error</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={handleLeaveRoom}
            className="game-button-primary"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-bg-primary via-[#12121f] to-bg-primary">
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

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        {/* Room info card */}
        <div className="glass-card rounded-2xl p-6 mb-6">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-white mb-2">Lobby</h1>
            <div className="flex items-center justify-center gap-2">
              <span className="text-gray-400">Room Code:</span>
              <button
                onClick={handleCopyRoomCode}
                className="px-4 py-2 bg-bg-primary/50 border border-white/20 rounded-lg text-accent-star font-bold tracking-widest hover:bg-bg-primary/70 transition-colors"
              >
                {roomCode}
              </button>
            </div>
          </div>

          {/* Connection status */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400'}`} />
            <span className="text-sm text-gray-400">
              {isConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>

          {/* Players list */}
          <div className="space-y-3 mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">Players</h2>
            <AnimatePresence>
              {players.map((player, index) => (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    player.id === playerId
                      ? 'border-accent-star/30 bg-accent-star/10'
                      : 'border-white/10 bg-bg-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-bg-primary/50 flex items-center justify-center text-white font-bold">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white font-medium">
                        {player.name}
                        {player.id === playerId && (
                          <span className="ml-2 text-accent-star text-sm">(You)</span>
                        )}
                      </p>
                      {player.isCoordinator && (
                        <span className="text-xs text-gray-400">Coordinator</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        player.isConnected ? 'bg-green-400' : 'bg-red-400'
                      }`}
                    />
                    {player.isCoordinator && (
                      <span className="text-xs text-accent-star">👑</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            {isCoordinator && (
              <button
                onClick={handleStartGame}
                disabled={players.length < 2}
                className={`w-full game-button-primary ${
                  players.length < 2 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                Start Game
                {players.length < 2 && (
                  <span className="ml-2 text-sm opacity-70">(Need 2+ players)</span>
                )}
              </button>
            )}
            <button
              onClick={handleLeaveRoom}
              className="w-full game-button-secondary"
            >
              Leave Room
            </button>
          </div>
        </div>

        {/* Game info */}
        <div className="text-center text-sm text-gray-500">
          <p>The game will start when the coordinator clicks &ldquo;Start Game&rdquo;</p>
        </div>
      </motion.div>
    </div>
  );
}
