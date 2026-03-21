'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useGameStore } from '@/lib/store';
import { GameClient } from '@/lib/ws-client';
import { motion, AnimatePresence } from 'framer-motion';

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams();
  const roomCode = (params.code as string).toUpperCase();
  const searchParams = useSearchParams();
  const isJoining = searchParams.get('join') === '1';

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const clientRef = useRef<GameClient | null>(null);

  const { players, handleServerMessage } = useGameStore();

  // Read localStorage after hydration to avoid server/client mismatch
  useEffect(() => {
    const name = localStorage.getItem('themind-player-name') || '';
    setPlayerName(name);
  }, []);

  useEffect(() => {
    if (!playerName) {
      if (playerName === '') router.push('/');
      return;
    }

    let cancelled = false;

    const client = new GameClient(roomCode);
    clientRef.current = client;

    client.onConnect(() => {
      if (cancelled) return;
      setIsConnected(true);
      setError(null);
      client.send({ type: 'join', name: playerName });
    });

    client.onDisconnect(() => {
      if (cancelled) return;
      setIsConnected(false);
    });

    client.onMessage((msg) => {
      if (cancelled) return;
      handleServerMessage(msg);

      if (msg.type === 'error') {
        setError(msg.message);
      }

      // If we joined via the join form and we're the only player,
      // the room was empty — no one created it. Go back with an error.
      if (msg.type === 'state' && isJoining && msg.state.players.length === 1) {
        cancelled = true;
        client.disconnect();
        router.replace(`/?error=Room+%22${roomCode}%22+not+found`);
        return;
      }

      if (msg.type === 'state' && msg.state.status === 'playing') {
        router.push(`/room/${roomCode}/game`);
      }
    });

    // Small delay lets React Strict Mode's teardown/remount cycle finish
    // before opening the WebSocket, avoiding a wasted connection attempt.
    client.connect();

    return () => {
      cancelled = true;
      client.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, playerName]);

  const handleStartGame = () => {
    clientRef.current?.send({ type: 'start_game' });
  };

  const handleLeaveRoom = () => {
    clientRef.current?.disconnect();
    router.push('/');
  };

  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
  };

  if (!playerName) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-bg-primary via-bg-mid to-bg-primary">
      <AnimatePresence>
        {!isConnected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-star mx-auto mb-4" />
              <p className="text-white text-lg">Connecting...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-2xl">
        <div className="glass-card rounded-2xl p-6 mb-6">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-white mb-2">Lobby</h1>
            <div className="flex items-center justify-center gap-2">
              <span className="text-gray-400">Room Code:</span>
              <button onClick={handleCopyRoomCode}
                className="px-4 py-2 bg-bg-primary/50 border border-white/20 rounded-lg text-accent-star font-bold tracking-widest hover:bg-bg-primary/70 transition-colors">
                {roomCode}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-center text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-center gap-2 mb-6">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400'}`} />
            <span className="text-sm text-gray-400">{isConnected ? 'Connected' : 'Connecting...'}</span>
          </div>

          <div className="space-y-3 mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">Players</h2>
            <AnimatePresence>
              {players.map((player, index) => (
                <motion.div key={player.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: index * 0.1 }}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    player.name === playerName ? 'border-accent-star/30 bg-accent-star/10' : 'border-white/10 bg-bg-primary/30'
                  }`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-bg-primary/50 flex items-center justify-center text-white font-bold">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white font-medium">
                        {player.name}
                        {player.name === playerName && <span className="ml-2 text-accent-star text-sm">(You)</span>}
                      </p>
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${player.connected ? 'bg-green-400' : 'bg-red-400'}`} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="space-y-3">
            <button onClick={handleStartGame} disabled={players.length < 2}
              className={`w-full game-button-primary ${players.length < 2 ? 'opacity-50 cursor-not-allowed' : ''}`}>
              Start Game {players.length < 2 && <span className="ml-2 text-sm opacity-70">(Need 2+ players)</span>}
            </button>
            <button onClick={handleLeaveRoom} className="w-full game-button-secondary">Leave Room</button>
          </div>
        </div>

        <div className="text-center text-sm text-gray-500">
          <p>Any player can start the game once 2+ players have joined</p>
        </div>
      </motion.div>
    </div>
  );
}
