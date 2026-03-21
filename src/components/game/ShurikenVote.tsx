import React from 'react';
import { motion } from 'framer-motion';
import { Star, ThumbsUp, ThumbsDown, Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PlayerAvatar } from '@/components/room/PlayerAvatar';
import { Player } from '@/types/game';

interface ShurikenVoteProps {
  active: boolean;
  votes: Record<string, boolean>;
  players: Player[];
  shurikens: number;
  onVote: (vote: boolean) => void;
  currentPlayerId: string;
}

export const ShurikenVote: React.FC<ShurikenVoteProps> = ({
  active,
  votes,
  players,
  shurikens,
  onVote,
  currentPlayerId,
}) => {
  const voteCount = Object.values(votes).filter(Boolean).length;
  const totalPlayers = players.length;
  const requiredVotes = Math.ceil(totalPlayers / 2);
  const hasVoted = votes[currentPlayerId] !== undefined;

  return (
    <div className="space-y-4">
      {/* Shuriken Display */}
      <div className="flex items-center justify-center gap-2 p-4 bg-[#1a1a2e] rounded-xl">
        <div className="flex items-center gap-1">
          {[...Array(shurikens)].map((_, i) => (
            <Star key={i} className="w-6 h-6 fill-[#00d9ff] text-[#00d9ff]" />
          ))}
          {shurikens === 0 && (
            <Star className="w-6 h-6 text-[#252547]" />
          )}
        </div>
        <span className="text-gray-400 font-medium">
          {shurikens} shuriken{shurikens !== 1 ? 's' : ''} remaining
        </span>
      </div>

      {/* Vote UI */}
      {active && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          {/* Vote Status */}
          <div className="flex items-center justify-center gap-2">
            <Timer className="w-5 h-5 text-[#f4a261]" />
            <p className="text-white font-medium">
              Vote to use a shuriken ({voteCount}/{requiredVotes} required)
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#0f0f1a] rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full bg-[#00d9ff] transition-all duration-300"
              initial={{ width: 0 }}
              animate={{ width: `${(voteCount / requiredVotes) * 100}%` }}
            />
          </div>

          {/* Vote Buttons */}
          {!hasVoted && (
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => onVote(true)}
                variant="primary"
                size="md"
                className="min-h-[44px]"
              >
                <ThumbsUp className="w-4 h-4 mr-2" />
                Yes
              </Button>
              <Button
                onClick={() => onVote(false)}
                variant="secondary"
                size="md"
                className="min-h-[44px]"
              >
                <ThumbsDown className="w-4 h-4 mr-2" />
                No
              </Button>
            </div>
          )}

          {/* Player Votes */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {players.map((player) => {
              const vote = votes[player.id];
              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-2 bg-[#0f0f1a] rounded-lg"
                >
                  <span className="text-sm text-gray-300 truncate flex-1 mr-2">
                    {player.name}
                  </span>
                  {vote === true && (
                    <ThumbsUp className="w-4 h-4 text-[#68d391] flex-shrink-0" />
                  )}
                  {vote === false && (
                    <ThumbsDown className="w-4 h-4 text-[#f4a261] flex-shrink-0" />
                  )}
                  {vote === undefined && (
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      Waiting...
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
