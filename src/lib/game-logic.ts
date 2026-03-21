// Game configuration constants
const LEVELS_BY_PLAYER_COUNT: Record<number, number> = {
  2: 12,
  3: 10,
  4: 8,
  5: 6,
  6: 6,
  7: 6,
  8: 6
};

const STARTING_LIVES: Record<number, number> = {
  2: 4,
  3: 3,
  4: 3,
  5: 4,
  6: 4,
  7: 5,
  8: 5
};

const STARTING_SHURIKENS: Record<number, number> = {
  2: 2,
  3: 2,
  4: 1,
  5: 2,
  6: 2,
  7: 3,
  8: 3
};

// Bonus rewards at specific levels
const BONUS_REWARDS: Record<number, { lives: number; shurikens: number }> = {
  2: { lives: 1, shurikens: 0 },
  5: { lives: 1, shurikens: 0 },
  8: { lives: 0, shurikens: 1 }
};

/**
 * Create a shuffled deck of cards (1-100)
 * @returns Shuffled array of card values
 */
export function shuffleDeck(): number[] {
  const deck: number[] = [];
  for (let i = 1; i <= 100; i++) {
    deck.push(i);
  }

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

/**
 * Deal cards to players from the deck
 * @param deck - The deck to deal from
 * @param playerIds - Array of actual player IDs to deal cards to
 * @param cardsPerPlayer - Cards to deal to each player
 * @returns Object mapping player IDs to their hands
 */
export function dealCards(
  deck: number[],
  playerIds: string[],
  cardsPerPlayer: number
): Record<string, number[]> {
  const hands: Record<string, number[]> = {};
  const usedCards = new Set<number>();

  console.log('[dealCards] Dealing to players:', playerIds, 'cards per player:', cardsPerPlayer);
  console.log('[dealCards] Deck size:', deck.length, 'first 10 cards:', deck.slice(0, 10));

  // Deal cards to each player
  let deckIndex = 0;
  for (const playerId of playerIds) {
    const hand: number[] = [];

    for (let j = 0; j < cardsPerPlayer; j++) {
      if (deckIndex < deck.length) {
        const card = deck[deckIndex];
        // Check for duplicates
        if (usedCards.has(card)) {
          console.error(`[dealCards] ERROR: Card ${card} already dealt!`);
        }
        usedCards.add(card);
        hand.push(card);
        deckIndex++;
      }
    }

    // Sort hand in ascending order
    hand.sort((a, b) => a - b);
    hands[playerId] = hand;

    console.log(`[dealCards] Player ${playerId} received hand:`, hand);
  }

  console.log('[dealCards] All hands:', hands);
  console.log('[dealCards] Used cards:', Array.from(usedCards).sort((a, b) => a - b));

  return hands;
}

/**
 * Get the number of maximum levels for a given player count
 * @param playerCount - Number of players
 * @returns Maximum number of levels
 */
export function getMaxLevels(playerCount: number): number {
  if (playerCount < 2 || playerCount > 8) {
    throw new Error(`Invalid player count: ${playerCount}. Must be between 2 and 8.`);
  }
  return LEVELS_BY_PLAYER_COUNT[playerCount];
}

/**
 * Get the starting number of lives for a given player count
 * @param playerCount - Number of players
 * @returns Starting number of lives
 */
export function getStartingLives(playerCount: number): number {
  if (playerCount < 2 || playerCount > 8) {
    throw new Error(`Invalid player count: ${playerCount}. Must be between 2 and 8.`);
  }
  return STARTING_LIVES[playerCount];
}

/**
 * Get the starting number of shurikens for a given player count
 * @param playerCount - Number of players
 * @returns Starting number of shurikens
 */
export function getStartingShurikens(playerCount: number): number {
  if (playerCount < 2 || playerCount > 8) {
    throw new Error(`Invalid player count: ${playerCount}. Must be between 2 and 8.`);
  }
  return STARTING_SHURIKENS[playerCount];
}

/**
 * Check if a card play is valid and return any lower cards
 * @param playedCard - The card being played
 * @param playedCards - Cards already played in current round
 * @param playerHands - All player hands
 * @returns Object with validity flag and array of lower cards
 */
export function checkCardPlay(
  playedCard: number,
  playedCards: number[],
  playerHands: Record<string, number[]>
): { valid: boolean; lowerCards: number[] } {
  const lowerCards: number[] = [];

  // Check if played card is higher than all previously played cards
  const maxPlayedCard = playedCards.length > 0 ? Math.max(...playedCards) : 0;
  if (playedCard <= maxPlayedCard) {
    return { valid: false, lowerCards };
  }

  // Check all player hands for cards lower than the played card
  for (const playerId in playerHands) {
    const hand = playerHands[playerId];
    for (const card of hand) {
      if (card < playedCard && !playedCards.includes(card)) {
        lowerCards.push(card);
      }
    }
  }

  return {
    valid: lowerCards.length === 0,
    lowerCards
  };
}

/**
 * Get bonus rewards for completing a level
 * @param level - The level completed
 * @returns Object with lives and shurikens awarded
 */
export function getBonusRewards(level: number): { lives: number; shurikens: number } {
  return BONUS_REWARDS[level] || { lives: 0, shurikens: 0 };
}

/**
 * Generate a random 4-letter room code
 * @returns Uppercase 4-letter string
 */
export function generateRoomCode(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

/**
 * Generate a unique player ID
 * @returns Unique player ID string
 */
export function createPlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get the number of cards dealt to each player per level
 * @param playerCount - Number of players
 * @returns Cards per player per level
 */
function getCardsPerLevel(playerCount: number): number {
  if (playerCount < 2 || playerCount > 8) {
    throw new Error(`Invalid player count: ${playerCount}. Must be between 2 and 8.`);
  }
  // The Mind deals cards based on player count:
  // 2 players: 100 cards total (50 each)
  // 3 players: 99 cards total (33 each, with remainder distributed)
  // 4 players: 100 cards total (25 each)
  // 5 players: 100 cards total (20 each)
  // 6 players: 96 cards total (16 each)
  // 7 players: 98 cards total (14 each)
  // 8 players: 104 cards total (13 each)
  const cardsPerLevelMap: Record<number, number> = {
    2: 50,
    3: 33,
    4: 25,
    5: 20,
    6: 16,
    7: 14,
    8: 13
  };
  return cardsPerLevelMap[playerCount];
}
