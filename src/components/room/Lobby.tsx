import React from 'react';
import { Copy, Users, Play, DoorOpen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PlayerAvatar } from './PlayerAvatar';
import { Player } from '@/types/game';

interface LobbyProps {
  roomCode: string;
  players: Player[];
  isCoordinator: boolean;
  onStartGame: () => void;
  onLeave: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  roomCode,
  players,
  isCoordinator,
  onStartGame,
  onLeave,
}) => {
  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
  };

  const connectedPlayers = players.filter((p) => p.isConnected);
  const canStartGame = connectedPlayers.length >= 2;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f0f1a] p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-white mb-2">The Mind</h1>
          <p className="text-gray-400">Synchronize your minds to play cards in ascending order</p>
        </div>

        {/* Room Code */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-center gap-3">
            <p className="text-gray-400 font-medium">Room Code:</p>
            <div className="flex items-center gap-2">
              <p className="text-3xl font-mono font-bold text-[#00d9ff] tracking-wider">
                {roomCode}
              </p>
              <button
                onClick={handleCopyCode}
                className="p-2 rounded-lg hover:bg-[#252547] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Copy room code"
              >
                <Copy className="w-5 h-5 text-[#00d9ff]" />
              </button>
            </div>
          </div>
          <p className="text-center text-sm text-gray-500">
            Share this code with other players to join
          </p>
        </div>

        {/* Players List */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#00d9ff]" />
              <h2 className="text-xl font-semibold text-white">Players</h2>
            </div>
            <p className="text-gray-400">
              {connectedPlayers.length} of {players.length} connected
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {players.map((player) => (
              <PlayerAvatar key={player.id} player={player} />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          {isCoordinator && (
            <Button
              onClick={onStartGame}
              disabled={!canStartGame}
              variant="primary"
              size="lg"
              className="flex-1"
            >
              <Play className="w-5 h-5 mr-2" />
              Start Game
            </Button>
          )}
          <Button
            onClick={onLeave}
            variant="danger"
            size="lg"
            className={isCoordinator ? 'sm:flex-none' : 'flex-1'}
          >
            <DoorOpen className="w-5 h-5 mr-2" />
            Leave Room
          </Button>
        </div>

        {/* Helper Text */}
        {!canStartGame && isCoordinator && (
          <p className="text-center text-sm text-[#f4a261]">
            Need at least 2 connected players to start
          </p>
        )}
      </div>
    </div>
  );
};
