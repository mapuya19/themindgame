export const DECK_SIZE = 100;

export type GameMode = 'standard' | 'large';

export interface GameConfig {
  mode: GameMode;
  minPlayers: number;
  maxPlayers: number;
  maxLevels: number;
  startingLives: number;
  startingShurikens: number;
  bonusRewards: Record<number, { lives: number; shurikens: number }>;
}

const STANDARD_LEVELS: Record<number, number> = {
  2: 12, 3: 10, 4: 8, 5: 8, 6: 7, 7: 6, 8: 6,
};
const STANDARD_LIVES: Record<number, number> = {
  2: 2, 3: 3, 4: 4, 5: 4, 6: 4, 7: 5, 8: 5,
};
const STANDARD_SHURIKENS: Record<number, number> = {
  2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3,
};
const STANDARD_BONUSES = {
  2: { lives: 0, shurikens: 1 },
  3: { lives: 1, shurikens: 0 },
  5: { lives: 0, shurikens: 1 },
  6: { lives: 1, shurikens: 0 },
  8: { lives: 0, shurikens: 1 },
  9: { lives: 1, shurikens: 0 },
};

export function configFor(mode: GameMode, playerCount?: number): GameConfig {
  if (mode === 'large') {
    return {
      mode,
      minPlayers: 27,
      maxPlayers: 30,
      // 30 × 3 = 90 cards; a fourth level cannot fit in a 1–100 deck.
      maxLevels: 3,
      startingLives: 5,
      startingShurikens: 3,
      bonusRewards: { 2: { lives: 0, shurikens: 1 } },
    };
  }
  const count = playerCount ?? 2;
  return {
    mode,
    minPlayers: 2,
    maxPlayers: 8,
    maxLevels: STANDARD_LEVELS[count] ?? 6,
    startingLives: STANDARD_LIVES[count] ?? 5,
    startingShurikens: STANDARD_SHURIKENS[count] ?? 3,
    bonusRewards: STANDARD_BONUSES,
  };
}

function shuffleDeck(): number[] {
  const deck = Array.from({ length: DECK_SIZE }, (_, index) => index + 1);
  for (let index = deck.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

/** Deals exactly the requested number of unique cards, or rejects the level. */
export function dealCards(playerIds: string[], cardsPerPlayer: number): Record<string, number[]> {
  if (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer < 0 || playerIds.length * cardsPerPlayer > DECK_SIZE) {
    throw new Error('Level exceeds the available deck');
  }
  const deck = shuffleDeck();
  const hands: Record<string, number[]> = {};
  let index = 0;
  for (const playerId of playerIds) {
    hands[playerId] = deck.slice(index, index + cardsPerPlayer).sort((a, b) => a - b);
    index += cardsPerPlayer;
  }
  return hands;
}
