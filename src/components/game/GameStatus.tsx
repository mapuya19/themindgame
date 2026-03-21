import React from 'react';
import { Heart, Star, Target } from 'lucide-react';

interface GameStatusProps {
  level: number;
  lives: number;
  shurikens: number;
  maxLevels: number;
}

export const GameStatus: React.FC<GameStatusProps> = ({
  level,
  lives,
  shurikens,
  maxLevels,
}) => {
  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-[#1a1a2e] rounded-xl">
      {/* Lives */}
      <div className="flex items-center gap-2">
        <Heart className="w-5 h-5 text-[#f4a261]" />
        <div className="flex gap-1">
          {[...Array(Math.max(0, lives))].map((_, i) => (
            <Heart
              key={i}
              className="w-5 h-5 fill-[#f4a261] text-[#f4a261]"
            />
          ))}
          {lives <= 0 && (
            <Heart className="w-5 h-5 text-[#252547]" />
          )}
        </div>
      </div>

      {/* Level */}
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5 text-[#00d9ff]" />
        <div className="text-center">
          <p className="text-sm text-gray-400">Level</p>
          <p className="text-2xl font-bold text-[#00d9ff]">
            {level} <span className="text-sm text-gray-500">/ {maxLevels}</span>
          </p>
        </div>
      </div>

      {/* Shurikens */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {[...Array(Math.max(0, shurikens))].map((_, i) => (
            <Star
              key={i}
              className="w-5 h-5 fill-[#00d9ff] text-[#00d9ff]"
            />
          ))}
          {shurikens <= 0 && (
            <Star className="w-5 h-5 text-[#252547]" />
          )}
        </div>
        <Star className="w-5 h-5 text-[#00d9ff]" />
      </div>
    </div>
  );
};
