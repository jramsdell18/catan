/**
 * Board number-token distribution (node:test, not Vitest).
 *
 * Run:  npm run test:rules
 * Or:   node --test tests/board-rules.test.js
 * See tests/README.md
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRandomBoard, HEX_RADIUS } from '../src/game/board.js';

const expectedTokenCounts = new Map([
  [2, 1],
  [3, 2],
  [4, 2],
  [5, 2],
  [6, 2],
  [8, 2],
  [9, 2],
  [10, 2],
  [11, 2],
  [12, 1],
]);

function areHexesAdjacent(hexA, hexB) {
  const distance = Math.hypot(hexA.world.x - hexB.world.x, hexA.world.z - hexB.world.z);

  return distance < Math.sqrt(3) * HEX_RADIUS + 0.05;
}

test('base board number tokens follow Catan distribution and red numbers are not adjacent', () => {
  const board = createRandomBoard(12345);
  const numberedHexes = board.hexes.filter((hex) => hex.number !== null);
  const desertHexes = board.hexes.filter((hex) => hex.terrainId === 'desert');
  const tokenCounts = new Map();

  numberedHexes.forEach((hex) => {
    tokenCounts.set(hex.number, (tokenCounts.get(hex.number) ?? 0) + 1);
  });

  assert.equal(numberedHexes.length, 18);
  assert.equal(desertHexes.length, 1);
  assert.equal(tokenCounts.has(7), false);
  assert.deepEqual(tokenCounts, expectedTokenCounts);

  const redHexes = numberedHexes.filter((hex) => hex.number === 6 || hex.number === 8);

  redHexes.forEach((hex, index) => {
    redHexes.slice(index + 1).forEach((otherHex) => {
      assert.equal(areHexesAdjacent(hex, otherHex), false);
    });
  });
});
