import React from 'react';
import { Card } from './Card';
import { cn } from '@/lib/utils';

interface HandProps {
  cards: number[];
  onPlayCard: (card: number) => void;
  disabled?: boolean;
}

export const Hand: React.FC<HandProps> = ({
  cards,
  onPlayCard,
  disabled = false,
}) => {
  // Sort cards ascending
  const sortedCards = [...cards].sort((a, b) => a - b);

  return (
    <div
      className={cn(
        'flex flex-wrap justify-center gap-2 p-4 bg-[#1a1a2e] rounded-xl',
        disabled && 'opacity-50'
      )}
    >
      {sortedCards.map((card, index) => (
        <Card
          key={`${card}-${index}`}
          value={card}
          onClick={() => onPlayCard(card)}
          disabled={disabled}
          size="lg"
          animate
        />
      ))}
      {sortedCards.length === 0 && (
        <p className="text-gray-400 text-sm">No cards in hand</p>
      )}
    </div>
  );
};
