import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers } from 'lucide-react';

interface PlayedCardsProps {
  cards: number[];
}

export const PlayedCards: React.FC<PlayedCardsProps> = ({ cards }) => {
  // Show last 6 played cards, with the most recent on top
  const visibleCards = cards.slice(-6).reverse();

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Card Stack */}
      <div className="relative w-20 h-28 flex items-center justify-center">
        <AnimatePresence mode="popLayout">
          {visibleCards.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full bg-[#1a1a2e] rounded-xl border-2 border-dashed border-[#252547] flex items-center justify-center"
            >
              <Layers className="w-8 h-8 text-[#252547]" />
            </motion.div>
          ) : (
            visibleCards.map((card, index) => {
              const stackOffset = index * 8;
              return (
                <motion.div
                  key={`${card}-${cards.length - visibleCards.length + index}`}
                  initial={{
                    x: 200,
                    y: -100,
                    rotate: Math.random() * 30 - 15,
                    opacity: 0,
                  }}
                  animate={{
                    x: 0,
                    y: -stackOffset,
                    rotate: Math.random() * 10 - 5,
                    opacity: 1,
                  }}
                  exit={{
                    x: -200,
                    y: 100,
                    rotate: Math.random() * 30 - 15,
                    opacity: 0,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 25,
                  }}
                  className="absolute w-16 h-24 bg-gradient-to-br from-white to-gray-100 rounded-xl flex items-center justify-center font-bold text-2xl text-[#0f0f1a] shadow-lg"
                  style={{
                    zIndex: visibleCards.length - index,
                  }}
                >
                  {card}
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Total Count */}
      <div className="flex items-center gap-2 text-gray-400">
        <Layers className="w-4 h-4" />
        <span className="text-sm">
          {cards.length} card{cards.length !== 1 ? 's' : ''} played
        </span>
      </div>
    </div>
  );
};
