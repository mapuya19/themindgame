'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useGameStore } from '@/lib/store';
import { GameClient } from '@/lib/ws-client';
import { motion, AnimatePresence } from 'framer-motion';

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const roomCode = (params.code as string).toUpperCase();

  const [isConnected, setIsConnected] = useState(false);
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [wrongPlayInfo, setWrongPlayInfo] = useState<{ card: number; lowerCards: number[]; livesLeft: number } | null>(null);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const clientRef = useRef<GameClient | null>(null);

  const {
    hand, playedCards, discardedCards, level, lives, shurikens,
    players, status, shurikenVoteActive, shurikenVotes,
    handleServerMessage,
  } = useGameStore();

  const [playerName, setPlayerName] = useState<string | null>(null);

  // Read localStorage after hydration to avoid server/client mismatch
  useEffect(() => {
    const name = localStorage.getItem('themind-player-name') || '';
    setPlayerName(name);
  }, []);

  // ---- WebSocket connection -----------------------------------------------
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
      // Re-join to restore our identity
      client.send({ type: 'join', name: playerName });
    });

    client.onDisconnect(() => {
      if (cancelled) return;
      setIsConnected(false);
    });

    client.onMessage((msg) => {
      if (cancelled) return;
      handleServerMessage(msg);

      if (msg.type === 'level_complete') {
        setShowLevelComplete(true);
        setTimeout(() => setShowLevelComplete(false), 3000);
      }

      if (msg.type === 'wrong_play') {
        setWrongPlayInfo({ card: msg.card, lowerCards: msg.lowerCards, livesLeft: msg.livesLeft });
        setTimeout(() => setWrongPlayInfo(null), 3000);
      }

      // Navigate back to lobby when game is restarted
      if (msg.type === 'state' && msg.state.status === 'waiting') {
        router.push(`/room/${roomCode}`);
      }
    });

    client.connect();

    return () => {
      cancelled = true;
      client.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, playerName]);

  // ---- handlers -----------------------------------------------------------
  const handleCardPlay = (card: number) => {
    if (status !== 'playing') return;
    clientRef.current?.send({ type: 'play_card', card });
    setSelectedCard(card);
    setTimeout(() => setSelectedCard(null), 500);
  };

  const handleShurikenVote = (vote: boolean) => {
    clientRef.current?.send({ type: 'vote_shuriken', vote });
  };

  const handleLeaveRoom = () => {
    clientRef.current?.disconnect();
    router.push('/');
  };

  const handlePlayAgain = () => {
    clientRef.current?.send({ type: 'restart_game' });
  };

  const isGameOver = status === 'game_over' || status === 'victory';

  if (!playerName) return null;

  return (
    <div className="min-h-screen flex flex-col p-4 bg-gradient-to-br from-bg-primary via-bg-mid to-bg-primary overflow-hidden">
      {/* Reconnecting overlay */}
      <AnimatePresence>
        {!isConnected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
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
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="glass-card rounded-2xl p-8 text-center">
              <h2 className="text-3xl font-bold text-accent-success mb-2">Level Complete!</h2>
              <p className="text-gray-300">Preparing Level {level + 1}...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wrong Play Notification */}
      <AnimatePresence>
        {wrongPlayInfo && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="glass-card rounded-xl p-4 border border-red-500/40 bg-red-900/30 text-center max-w-sm">
              <p className="text-red-400 font-bold mb-1">Wrong Play!</p>
              <p className="text-sm text-gray-300 mb-2">
                Card {wrongPlayInfo.card} was played, but {wrongPlayInfo.lowerCards.length === 1 ? 'card' : 'cards'}{' '}
                <span className="text-red-300 font-semibold">{wrongPlayInfo.lowerCards.join(', ')}</span>{' '}
                {wrongPlayInfo.lowerCards.length === 1 ? 'was' : 'were'} still in play
              </p>
              <p className="text-xs text-accent-life">{wrongPlayInfo.livesLeft} {wrongPlayInfo.livesLeft === 1 ? 'life' : 'lives'} remaining</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over / Victory Modal */}
      <AnimatePresence>
        {isGameOver && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="glass-card rounded-2xl p-8 text-center max-w-md">
              {status === 'victory' ? (
                <>
                  <h2 className="text-4xl font-bold text-accent-star mb-4">Victory!</h2>
                  <p className="text-gray-300 mb-6">You conquered The Mind!</p>
                </>
              ) : (
                <>
                  <h2 className="text-4xl font-bold text-red-400 mb-4">Game Over</h2>
                  <p className="text-gray-300 mb-6">You ran out of lives</p>
                </>
              )}
              <div className="space-y-3">
                <button onClick={handlePlayAgain} className="w-full game-button-primary">Play Again</button>
                <button onClick={handleLeaveRoom} className="w-full game-button-secondary">Leave Room</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rules Modal */}
      <AnimatePresence>
        {showRules && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setShowRules(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="glass-card rounded-2xl p-6 max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">How to Play</h2>
                <button onClick={() => setShowRules(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
              </div>
              <div className="space-y-4 text-sm text-gray-300">
                <div>
                  <h3 className="text-accent-star font-semibold mb-1">Goal</h3>
                  <p>Play all cards in ascending order across all players — without talking or signaling.</p>
                </div>
                <div>
                  <h3 className="text-accent-star font-semibold mb-1">How It Works</h3>
                  <p>Each level, players receive cards (level 1 = 1 card each, level 2 = 2 each, etc.). Everyone plays their lowest card when they <em>feel</em> the time is right. No communication allowed!</p>
                </div>
                <div>
                  <h3 className="text-accent-star font-semibold mb-1">Wrong Play</h3>
                  <p>If you play a card while someone else holds a lower card, the team loses a &#x2764;&#xFE0F; life. All lower cards are discarded.</p>
                </div>
                <div>
                  <h3 className="text-accent-star font-semibold mb-1">Throwing Stars</h3>
                  <p>Any player can propose using a throwing star. If everyone agrees, each player discards their lowest card face-up. Use them wisely!</p>
                </div>
                <div>
                  <h3 className="text-accent-star font-semibold mb-1">Levels &amp; Rewards</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-xs">
                    <p>2 players: 12 levels</p><p>3 players: 10 levels</p>
                    <p>4 players: 8 levels</p><p>&nbsp;</p>
                    <p className="col-span-2 mt-1 text-gray-400">Bonus rewards after completing:</p>
                    <p>Level 2: +1 star</p><p>Level 3: +1 life</p>
                    <p>Level 5: +1 star</p><p>Level 6: +1 life</p>
                    <p>Level 8: +1 star</p><p>Level 9: +1 life</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-accent-star font-semibold mb-1">Victory</h3>
                  <p>Complete all levels to win! Lose all lives and it&apos;s game over.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center">
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Level</p>
            <p className="text-2xl font-bold text-white">{level}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Lives</p>
            <div className="flex gap-1">
              {Array.from({ length: lives }).map((_, i) => (
                <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1 }} className="text-xl">
                  &#x2764;&#xFE0F;
                </motion.div>
              ))}
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Shurikens</p>
            <div className="flex gap-1">
              {Array.from({ length: shurikens }).map((_, i) => (
                <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1 }} className="text-xl">
                  &#11088;
                </motion.div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowRules(true)} className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded border border-white/10 hover:border-white/30">
              Rules
            </button>
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400'}`} />
          </div>
        </div>
      </motion.div>

      {/* Center – Played cards + Discard pile */}
      <div className="flex-1 flex items-center justify-center gap-4 mb-4">
        {/* Played cards pile */}
        <div className="glass-card rounded-2xl p-6 min-w-[200px] min-h-[180px] max-w-[450px] flex-1">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-3 text-center">
            Played Cards ({playedCards.length})
          </p>
          {playedCards.length > 0 ? (
            <div className="flex flex-wrap gap-2 justify-center">
              {playedCards.map((card, index) => (
                <motion.div key={`played-${index}-${card}`}
                  initial={{ scale: 0.8, opacity: 0, y: -30 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                  className="card-small bg-bg-card border border-accent-success/20 text-gray-300">
                  {card}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500 text-sm">Play cards here</p>
            </div>
          )}
        </div>

        {/* Discard pile */}
        {discardedCards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-card rounded-2xl p-6 min-w-[150px] min-h-[180px] max-w-[250px] border border-red-500/20"
          >
            <p className="text-xs text-red-400 uppercase tracking-wider mb-3 text-center">
              Discarded ({discardedCards.length})
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {discardedCards.map((card, index) => (
                <motion.div key={`disc-${index}-${card}`}
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 10, stiffness: 150 }}
                  className="card-small bg-red-900/30 border border-red-500/30 text-red-300">
                  {card}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom – Hand and players */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 glass-card rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Your Hand</h3>
          <div className="flex flex-wrap gap-2 justify-center">
            <AnimatePresence>
              {hand.map((card) => (
                <motion.button key={card} initial={{ scale: 0, y: 50 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0, y: -50 }}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => handleCardPlay(card)} disabled={status !== 'playing'}
                  className={`card bg-bg-card border border-white/20 text-white hover:border-accent-star/50 ${
                    selectedCard === card ? 'border-accent-star' : ''
                  } ${status !== 'playing' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {card}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="glass-card rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Players</h3>
          <div className="space-y-2">
            {players.map((player) => (
              <div key={player.id}
                className={`flex items-center justify-between p-2 rounded ${
                  player.name === playerName ? 'bg-accent-star/10' : 'bg-bg-primary/30'
                }`}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-bg-primary/50 flex items-center justify-center text-xs font-bold text-white">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-white truncate">{player.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${player.connected ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="text-xs text-gray-400">{player.cardCount} cards</span>
                </div>
              </div>
            ))}
          </div>

          {shurikens > 0 && status === 'playing' && !shurikenVoteActive && (
            <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }}
              onClick={() => handleShurikenVote(true)}
              className="w-full mt-3 game-button-secondary">
              Propose Shuriken
            </motion.button>
          )}

          {shurikenVoteActive && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 p-2 bg-accent-star/10 border border-accent-star/30 rounded text-center">
              <p className="text-xs text-gray-400 mb-2">Shuriken vote in progress</p>
              <p className="text-sm text-accent-star mb-2">
                {Object.values(shurikenVotes).filter(Boolean).length} / {players.length}
              </p>
              <div className="flex gap-2">
                <button onClick={() => handleShurikenVote(true)}
                  className="flex-1 px-3 py-1.5 text-sm font-semibold rounded bg-accent-success/20 border border-accent-success/40 text-accent-success hover:bg-accent-success/30 transition-colors">
                  Agree
                </button>
                <button onClick={() => handleShurikenVote(false)}
                  className="flex-1 px-3 py-1.5 text-sm font-semibold rounded bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-colors">
                  Decline
                </button>
              </div>
            </motion.div>
          )}

          <button onClick={handleLeaveRoom} className="w-full mt-3 px-3 py-2 text-xs text-red-400 hover:text-red-300 transition-colors">
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}
