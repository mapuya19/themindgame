'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const FLOATING_CARDS = [7, 23, 42, 56, 71, 88, 14, 35, 63, 91];

// Rotations randomised once at module level. The server and client will
// compute different values, but we use suppressHydrationWarning on the
// motion.div to tell React not to patch up the transform mismatch — these
// are purely decorative background elements.
const CARD_ROTATIONS = FLOATING_CARDS.map(() => ({
  initial: Math.random() * 30 - 15,
  animate: Math.random() * 60 - 30,
  duration: 15 + Math.random() * 10,
}));

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [playerName, setPlayerName] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('themind-player-name') || '' : ''
  );
  const [showJoinForm, setShowJoinForm] = useState(() => !!searchParams.get('error'));
  const [showRules, setShowRules] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinError, setJoinError] = useState(searchParams.get('error') || '');

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    localStorage.setItem('themind-player-name', playerName);
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
    router.push(`/room/${code}`);
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    if (!roomCodeInput.trim() || roomCodeInput.trim().length !== 4) {
      setJoinError('Please enter a 4-letter room code');
      return;
    }
    localStorage.setItem('themind-player-name', playerName);
    router.push(`/room/${roomCodeInput.toUpperCase()}?join=1`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-bg-primary via-bg-mid to-bg-primary relative overflow-hidden">
      {/* Animated floating cards background */}
      <div className="absolute inset-0 pointer-events-none">
        {FLOATING_CARDS.map((num, i) => (
          <motion.div
            key={num}
            suppressHydrationWarning
            className="absolute w-12 h-16 rounded-lg bg-bg-card/30 border border-white/5 flex items-center justify-center text-white/10 text-sm font-bold"
            initial={{
              x: `${10 + (i * 9) % 80}vw`,
              y: '110vh',
              rotate: CARD_ROTATIONS[i].initial,
            }}
            animate={{
              y: '-10vh',
              rotate: CARD_ROTATIONS[i].animate,
            }}
            transition={{
              duration: CARD_ROTATIONS[i].duration,
              repeat: Infinity,
              delay: i * 2.5,
              ease: 'linear',
            }}
          >
            {num}
          </motion.div>
        ))}
      </div>

      {/* Dot grid */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 text-center max-w-2xl w-full"
      >
        {/* Logo area */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-2"
        >
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-accent-star/10 border border-accent-star/30 flex items-center justify-center">
              <span className="text-3xl">&#x1F9E0;</span>
            </div>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-6xl md:text-8xl font-bold text-white mb-3 tracking-tight"
        >
          The Mind
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="text-lg md:text-xl text-gray-400 mb-3 font-light"
        >
          A cooperative card game of intuition and silence
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex items-center justify-center gap-4 mb-10 text-xs text-gray-500"
        >
          <span>2-8 Players</span>
          <span className="w-1 h-1 rounded-full bg-gray-600" />
          <span>Real-time Online</span>
          <span className="w-1 h-1 rounded-full bg-gray-600" />
          <span>No Sign-up</span>
        </motion.div>

        {/* Main card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="glass-card rounded-2xl p-8 max-w-md mx-auto"
        >
          <div className="mb-6">
            <label htmlFor="playerName" className="block text-sm font-medium text-gray-300 mb-2 text-left">
              Your Name
            </label>
            <input
              type="text"
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !showJoinForm) handleCreateRoom(); }}
              placeholder="Enter your name"
              className="w-full px-4 py-3 bg-bg-primary/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent-star focus:ring-1 focus:ring-accent-star/30 transition-all"
            />
          </div>

          <div className="space-y-3">
            <AnimatePresence mode="wait">
              {!showJoinForm ? (
                <motion.div key="create" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="space-y-3">
                  <button onClick={handleCreateRoom} className="w-full game-button-primary">Create Room</button>
                  <button onClick={() => setShowJoinForm(true)} className="w-full game-button-secondary">Join Room</button>
                </motion.div>
              ) : (
                <motion.div key="join" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-3">
                  <div>
                    <label htmlFor="roomCode" className="block text-sm font-medium text-gray-300 mb-2 text-left">Room Code</label>
                    <input type="text" id="roomCode" value={roomCodeInput}
                      onChange={(e) => { setRoomCodeInput(e.target.value.toUpperCase()); setJoinError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleJoinRoom(); }}
                      placeholder="ABCD" maxLength={4}
                      className="w-full px-4 py-3 bg-bg-primary/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent-star focus:ring-1 focus:ring-accent-star/30 transition-all text-center text-2xl font-bold tracking-widest uppercase"
                    />
                    {joinError && (
                      <p className="mt-2 text-sm text-red-400 text-center">{joinError}</p>
                    )}
                  </div>
                  <button onClick={handleJoinRoom} className="w-full game-button-primary">Join</button>
                  <button onClick={() => { setShowJoinForm(false); setJoinError(''); }} className="w-full game-button-secondary">Back</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* How to play link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-6"
        >
          <button onClick={() => setShowRules(true)} className="text-sm text-gray-500 hover:text-accent-star transition-colors underline underline-offset-4 decoration-gray-700 hover:decoration-accent-star/50 min-h-[44px] px-3">
            How to Play
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="text-xs text-gray-600 mt-8"
        >
          Based on the card game by Wolfgang Warsch
        </motion.p>
      </motion.div>

      {/* Rules Modal */}
      <AnimatePresence>
        {showRules && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setShowRules(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card rounded-2xl p-6 max-w-lg mx-4 max-h-[min(80vh,_calc(100dvh_-_4rem))] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">How to Play</h2>
                <button onClick={() => setShowRules(false)} className="text-gray-400 hover:text-white w-11 h-11 flex items-center justify-center text-xl rounded-lg touch-manipulation">&times;</button>
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
                  <p>If you play a card while someone else holds a lower card, the team loses a life. All lower cards are discarded.</p>
                </div>
                <div>
                  <h3 className="text-accent-star font-semibold mb-1">Throwing Stars</h3>
                  <p>Any player can propose using a throwing star. If everyone agrees, each player discards their lowest card face-up.</p>
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
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}
