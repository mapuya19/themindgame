'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');

  // Load player name from localStorage on mount
  useEffect(() => {
    const TAB_ID = sessionStorage.getItem('themind-tab-id') || '';
    const savedName = localStorage.getItem(`themind-${TAB_ID}-player-name`);
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }

    const roomCode = useGameStore.getState().createRoom(playerName);
    router.push(`/room/${roomCode}`);
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    if (!roomCodeInput.trim()) {
      alert('Please enter a room code');
      return;
    }

    useGameStore.getState().joinRoom(roomCodeInput.toUpperCase(), playerName);
    router.push(`/room/${roomCodeInput.toUpperCase()}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-bg-primary via-[#12121f] to-bg-primary">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 text-center max-w-2xl w-full"
      >
        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-6xl md:text-8xl font-bold text-white mb-4 tracking-tight"
        >
          The Mind
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-xl md:text-2xl text-gray-400 mb-12 font-light"
        >
          A cooperative card game of intuition and silence
        </motion.p>

        {/* Glass card container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="glass-card rounded-2xl p-8 max-w-md mx-auto"
        >
          {/* Player name input */}
          <div className="mb-6">
            <label htmlFor="playerName" className="block text-sm font-medium text-gray-300 mb-2 text-left">
              Your Name
            </label>
            <input
              type="text"
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 bg-bg-primary/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent-star transition-colors"
            />
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <AnimatePresence mode="wait">
              {!showJoinForm ? (
                <motion.div
                  key="create"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  <button
                    onClick={handleCreateRoom}
                    className="w-full game-button-primary"
                  >
                    Create Room
                  </button>
                  <button
                    onClick={() => setShowJoinForm(true)}
                    className="w-full game-button-secondary"
                  >
                    Join Room
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="join"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  <div>
                    <label htmlFor="roomCode" className="block text-sm font-medium text-gray-300 mb-2 text-left">
                      Room Code
                    </label>
                    <input
                      type="text"
                      id="roomCode"
                      value={roomCodeInput}
                      onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                      placeholder="ABCD"
                      maxLength={4}
                      className="w-full px-4 py-3 bg-bg-primary/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent-star transition-colors text-center text-2xl font-bold tracking-widest uppercase"
                    />
                  </div>
                  <button
                    onClick={handleJoinRoom}
                    className="w-full game-button-primary"
                  >
                    Join
                  </button>
                  <button
                    onClick={() => setShowJoinForm(false)}
                    className="w-full game-button-secondary"
                  >
                    Back
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* How to play hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-sm text-gray-500 mt-8"
        >
          Play cards in ascending order, silently, together.
        </motion.p>
      </motion.div>
    </div>
  );
}
