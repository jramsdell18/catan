import { describe, expect, it } from 'vitest';
import { createRandomBoard } from '../../src/game/board.js';
import { getActivePlayers } from '../../src/game/pieces.js';
import { createStartingResourceCards } from '../../src/game/resources.js';
import { createBoardTopology } from '../../src/game/topology.js';
import { TERRAIN_TYPES } from '../../src/game/terrain.js';

describe('createStartingResourceCards', () => {
  it('returns empty hands until setup is complete', () => {
    const players = getActivePlayers(3);
    const board = createRandomBoard(3);
    const topology = createBoardTopology(board.hexes);

    for (const status of ['placing', 'ready', null, undefined]) {
      const hands = createStartingResourceCards(players, topology, { settlements: [] }, status);
      expect(hands.every((hand) => hand.cards.length === 0)).toBe(true);
    }
  });

  it('grants one card per productive terrain on the second-round settlement', () => {
    const players = getActivePlayers(3);
    const board = createRandomBoard(15);
    const topology = createBoardTopology(board.hexes);

    // Prefer a vertex that touches at least one non-desert hex
    const vertex =
      topology.vertices.find((item) =>
        item.adjacentHexes.some((hex) => TERRAIN_TYPES[hex.terrainId]?.resource),
      ) ?? topology.vertices[0];

    const placements = {
      settlements: [
        { playerId: players[0].id, vertexId: topology.vertices[5].id, setupRound: 1 },
        { playerId: players[0].id, vertexId: vertex.id, setupRound: 2 },
        { playerId: players[1].id, vertexId: topology.vertices[10].id, setupRound: 2 },
      ],
    };

    const hands = createStartingResourceCards(players, topology, placements, 'complete');
    const first = hands.find((hand) => hand.playerId === players[0].id);
    const expectedResources = vertex.adjacentHexes
      .map((hex) => TERRAIN_TYPES[hex.terrainId]?.resource)
      .filter(Boolean);

    expect(first.cards.map((card) => card.resource)).toEqual(expectedResources);
    expect(first.cards.every((card) => card.id.startsWith(`${players[0].id}-starting-card-`))).toBe(
      true,
    );

    // Players without a round-2 settlement get nothing
    const third = hands.find((hand) => hand.playerId === players[2].id);
    expect(third.cards).toEqual([]);
  });

  it('skips desert when awarding starting cards', () => {
    const players = getActivePlayers(1);
    const board = createRandomBoard(21);
    const topology = createBoardTopology(board.hexes);
    const desertVertex = topology.vertices.find((vertex) =>
      vertex.adjacentHexes.some((hex) => hex.terrainId === 'desert'),
    );

    if (!desertVertex) {
      // Unlikely on a full board, but keep the suite robust
      return;
    }

    const hands = createStartingResourceCards(
      players,
      topology,
      {
        settlements: [{ playerId: players[0].id, vertexId: desertVertex.id, setupRound: 2 }],
      },
      'complete',
    );

    const cards = hands[0].cards;
    const productiveCount = desertVertex.adjacentHexes.filter(
      (hex) => TERRAIN_TYPES[hex.terrainId]?.resource,
    ).length;
    expect(cards).toHaveLength(productiveCount);
    expect(cards.every((card) => card.resource !== null)).toBe(true);
  });
});
