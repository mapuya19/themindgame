import assert from 'node:assert/strict';
import test from 'node:test';
import { configFor, DECK_SIZE, dealCards } from '../src/game-rules';

test('large-group mode is constrained by the 100-card deck', () => {
  const config = configFor('large');
  assert.deepEqual(
    { min: config.minPlayers, max: config.maxPlayers, levels: config.maxLevels },
    { min: 2, max: 30, levels: 3 },
  );
  assert.ok(config.maxPlayers * config.maxLevels <= DECK_SIZE);
  assert.ok(config.maxPlayers * (config.maxLevels + 1) > DECK_SIZE);
});

test('dealing creates sorted, unique cards for 30 players at level three', () => {
  const playerIds = Array.from({ length: 30 }, (_, index) => `player-${index}`);
  const hands = dealCards(playerIds, 3);
  const allCards = Object.values(hands).flat();
  assert.equal(allCards.length, 90);
  assert.equal(new Set(allCards).size, 90);
  for (const hand of Object.values(hands)) {
    assert.equal(hand.length, 3);
    assert.deepEqual(hand, [...hand].sort((a, b) => a - b));
  }
});

test('dealing rejects a level that exceeds the deck', () => {
  assert.throws(() => dealCards(Array.from({ length: 27 }, (_, index) => String(index)), 4));
});

test('standard mode keeps its per-player progression', () => {
  const twoPlayer = configFor('standard', 2);
  const eightPlayer = configFor('standard', 8);
  assert.equal(twoPlayer.maxLevels, 12);
  assert.equal(eightPlayer.maxLevels, 6);
});
