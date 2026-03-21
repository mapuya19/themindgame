import React from 'react';
import { Wifi, WifiOff, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Player } from '@/types/game';

interface PlayerAvatarProps {
  player: Player;
  isCurrentPlayer?: boolean;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  player,
  isCurrentPlayer = false,
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg transition-all min-w-[200px]',
        isCurrentPlayer ? 'bg-[#252547] ring-2 ring-[#00d9ff]' : 'bg-[#1a1a2e]',
        !player.isConnected && 'opacity-60'
      )}
    >
      <div className="relative">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00d9ff] to-[#68d391] flex items-center justify-center text-[#0f0f1a] font-bold text-lg">
          {player.name.charAt(0).toUpperCase()}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5">
          {player.isConnected ? (
            <div className="w-4 h-4 rounded-full bg-[#68d391] border-2 border-[#0f0f1a]" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-[#f4a261] border-2 border-[#0f0f1a]" />
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {player.isCoordinator && (
            <Crown className="w-4 h-4 text-[#f4a261] flex-shrink-0" />
          )}
          <p
            className={cn(
              'font-medium truncate',
              isCurrentPlayer ? 'text-[#00d9ff]' : 'text-white'
            )}
          >
            {player.name}
            {isCurrentPlayer && ' (You)'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          {player.isConnected ? (
            <>
              <Wifi className="w-3 h-3" />
              <span>Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3" />
              <span>Disconnected</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
