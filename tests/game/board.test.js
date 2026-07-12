import { describe, expect, it } from 'vitest';
import { createRandomBoard } from '../../src/game/board.js';
import { createBoardPorts, createRulesBoard } from '../../src/game/rulesAdapter.js';
import { createBoardTopology } from '../../src/game/topology.js';
import { validateBoard } from '../../src/rules/index.js';

const EXPECTED_TERRAINS = { forest: 4, fields: 4, hills: 3, mountains: 3, pasture: 4, desert: 1 };
const EXPECTED_NUMBERS = { 2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 1 };

function counts(values) {
  return values.reduce((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {});
}

function adjacent(hexA, hexB) {
  return Math.hypot(hexA.world.x - hexB.world.x, hexA.world.z - hexB.world.z) < Math.sqrt(3) + 0.05;
}

describe('generated game board', () => {
  it('uses the intended terrain and number distributions', () => {
    const board = createRandomBoard(42);
    expect(board.hexes).toHaveLength(19);
    expect(counts(board.hexes.map((hex) => hex.terrainId))).toEqual(EXPECTED_TERRAINS);
    expect(counts(board.hexes.filter((hex) => hex.number !== null).map((hex) => hex.number))).toEqual(EXPECTED_NUMBERS);
    const desert = board.hexes.find((hex) => hex.terrainId === 'desert');
    expect(desert.number).toBeNull();
    expect(desert.hasRobber).toBe(true);
  });

  it('never places 6 and 8 next to one another across many seeds', () => {
    for (let seed = 1; seed <= 250; seed += 1) {
      const redHexes = createRandomBoard(seed).hexes.filter((hex) => hex.number === 6 || hex.number === 8);
      for (let first = 0; first < redHexes.length; first += 1) {
        for (let second = first + 1; second < redHexes.length; second += 1) {
          expect(adjacent(redHexes[first], redHexes[second]), `seed ${seed}`).toBe(false);
        }
      }
    }
  });

  it('generates nine valid coastal ports with the intended ratios and resources', () => {
    const board = createRandomBoard(73);
    const topology = createBoardTopology(board.hexes);
    const ports = createBoardPorts(topology, board.seed);
    const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));

    expect(ports).toHaveLength(9);
    expect(ports.filter((port) => port.resource === null && port.ratio === 3)).toHaveLength(4);
    expect(ports.filter((port) => port.resource !== null && port.ratio === 2).map((port) => port.resource).sort())
      .toEqual(['brick', 'hay', 'ore', 'sheep', 'wood']);
    expect(new Set(ports.map((port) => port.edgeId)).size).toBe(9);

    ports.forEach((port) => {
      const [a, b] = port.intersections.map((id) => verticesById.get(id));
      const commonHexes = a.adjacentHexes.filter((hex) => b.adjacentHexes.some((other) => other.hexId === hex.hexId));
      expect(commonHexes).toHaveLength(1);
    });
  });

  it('adapts the generated board into a valid rules board', () => {
    const board = createRandomBoard(101);
    const topology = createBoardTopology(board.hexes);
    const rulesBoard = createRulesBoard(board, topology);
    expect(validateBoard(rulesBoard)).toBe(true);
    expect(Object.keys(rulesBoard.tiles)).toHaveLength(19);
    expect(rulesBoard.ports).toHaveLength(9);
    expect(rulesBoard.tiles[rulesBoard.robberTileId].terrain).toBe('desert');
  });
});
