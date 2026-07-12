import { createTerrainDeck, summarizeTerrain } from './terrain.js';

const BOARD_ROWS = [
  { row: -2, qStart: 0, count: 3 },
  { row: -1, qStart: -1, count: 4 },
  { row: 0, qStart: -2, count: 5 },
  { row: 1, qStart: -2, count: 4 },
  { row: 2, qStart: -2, count: 3 },
];

export const HEX_RADIUS = 1;

const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export const BOARD_SLOTS = BOARD_ROWS.flatMap((rowConfig, rowIndex) =>
  Array.from({ length: rowConfig.count }, (_, colIndex) => {
    const q = rowConfig.qStart + colIndex;
    const r = rowConfig.row;

    return {
      id: `slot-${rowIndex}-${colIndex}`,
      q,
      r,
      rowIndex,
      colIndex,
      world: {
        x: (colIndex - (rowConfig.count - 1) / 2) * Math.sqrt(3) * HEX_RADIUS,
        z: (rowIndex - 2) * 1.5 * HEX_RADIUS,
      },
    };
  }),
);

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function createRandomBoard(seed = Date.now()) {
  const random = mulberry32(seed);
  const terrainDeck = shuffle(createTerrainDeck(), random);
  const numberTokens = shuffle(NUMBER_TOKENS, random);
  let numberIndex = 0;
  const hexes = BOARD_SLOTS.map((slot, index) => {
    const terrain = terrainDeck[index];
    const isDesert = terrain.terrainId === 'desert';

    return {
      ...slot,
      hexId: `hex-${index + 1}`,
      terrainId: terrain.terrainId,
      terrainPieceId: terrain.id,
      number: isDesert ? null : numberTokens[numberIndex++],
      hasRobber: isDesert,
    };
  });

  return {
    seed,
    hexes,
    summary: summarizeTerrain(hexes),
  };
}
