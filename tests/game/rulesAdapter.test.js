import { describe, expect, it } from 'vitest';
import { createRandomBoard } from '../../src/game/board.js';
import { getActivePlayers } from '../../src/game/pieces.js';
import {
  createRulesBoard,
  placementsFromGame,
  resourceHandsFromGame,
} from '../../src/game/rulesAdapter.js';
import { createBoardTopology } from '../../src/game/topology.js';
import {
  applyAction,
  canPlaceSettlement,
  createGame,
  TERRAIN_RESOURCE,
  validateBoard,
} from '../../src/rules/index.js';

function liveBoard(seed = 2026) {
  const board = createRandomBoard(seed);
  const topology = createBoardTopology(board.hexes);
  const rulesBoard = createRulesBoard(board, topology);
  return { board, topology, rulesBoard };
}

describe('createRulesBoard', () => {
  it('produces a rules board that validates and places the robber on the desert', () => {
    const { board, rulesBoard } = liveBoard(11);

    expect(validateBoard(rulesBoard)).toBe(true);
    expect(rulesBoard.robberTileId).toBe(board.hexes.find((hex) => hex.hasRobber).hexId);
    expect(rulesBoard.tiles[rulesBoard.robberTileId].terrain).toBe('desert');
    expect(rulesBoard.tiles[rulesBoard.robberTileId].number).toBeNull();
  });

  it('maps every visual hex to a rules tile with matching terrain, number, and vertices', () => {
    const { board, topology, rulesBoard } = liveBoard(22);

    expect(Object.keys(rulesBoard.tiles)).toHaveLength(board.hexes.length);
    expect(Object.keys(rulesBoard.intersections)).toHaveLength(topology.vertices.length);
    expect(Object.keys(rulesBoard.edges)).toHaveLength(topology.edges.length);

    for (const hex of board.hexes) {
      const tile = rulesBoard.tiles[hex.hexId];
      expect(tile).toBeDefined();
      expect(tile.terrain).toBe(hex.terrainId);
      expect(tile.number).toBe(hex.number);
      expect(tile.intersections).toHaveLength(6);

      for (const vertexId of tile.intersections) {
        const vertex = topology.vertices.find((item) => item.id === vertexId);
        expect(vertex.adjacentHexes.some((item) => item.hexId === hex.hexId)).toBe(true);
      }
    }
  });

  it('maps visual edges onto rules edges with the same endpoint ids', () => {
    const { topology, rulesBoard } = liveBoard(33);

    for (const edge of topology.edges) {
      expect(rulesBoard.edges[edge.id].intersections).toEqual(edge.vertexIds);
      expect(rulesBoard.edges[edge.id].road).toBeNull();
    }
  });

  it('uses terrain ids the rules engine understands', () => {
    const { rulesBoard } = liveBoard(44);
    for (const tile of Object.values(rulesBoard.tiles)) {
      expect(tile.terrain in TERRAIN_RESOURCE).toBe(true);
    }
  });

  it('can start a rules game and accept a legal setup settlement', () => {
    const { rulesBoard } = liveBoard(55);
    const players = [
      { id: 'red', name: 'Red', color: 'red' },
      { id: 'blue', name: 'Blue', color: 'blue' },
      { id: 'white', name: 'White', color: 'white' },
    ];
    let game = createGame({ board: rulesBoard, players });

    const freeVertex = Object.keys(game.board.intersections).find((id) =>
      canPlaceSettlement(game.board, id, 'red', false),
    );
    expect(freeVertex).toBeTruthy();

    game = applyAction(game, {
      type: 'placeSettlement',
      playerId: 'red',
      intersectionId: freeVertex,
    });
    expect(game.board.intersections[freeVertex].building).toEqual({
      type: 'settlement',
      playerId: 'red',
    });
  });
});

describe('placementsFromGame', () => {
  it('returns empty collections when game is null', () => {
    expect(placementsFromGame(null)).toEqual({ settlements: [], roads: [], cities: [] });
    expect(placementsFromGame(undefined)).toEqual({ settlements: [], roads: [], cities: [] });
  });

  it('projects rules buildings and roads into UI placement records', () => {
    const { rulesBoard, topology } = liveBoard(66);
    const players = [
      { id: 'red', name: 'Red', color: 'red' },
      { id: 'blue', name: 'Blue', color: 'blue' },
      { id: 'white', name: 'White', color: 'white' },
    ];
    let game = createGame({ board: rulesBoard, players });

    const vertexId = topology.vertices[0].id;
    const edgeId = topology.vertices[0].edgeIds[0];

    game = applyAction(game, { type: 'placeSettlement', playerId: 'red', intersectionId: vertexId });
    game = applyAction(game, { type: 'placeRoad', playerId: 'red', edgeId });

    // Force a city for projection coverage without full mid-game setup
    game = structuredClone(game);
    game.board.intersections[vertexId].building = { type: 'city', playerId: 'red' };

    const placements = placementsFromGame(game);
    expect(placements.cities).toEqual([
      { id: `city-${vertexId}`, playerId: 'red', vertexId },
    ]);
    expect(placements.settlements).toEqual([]);
    expect(placements.roads).toEqual([{ id: `road-${edgeId}`, playerId: 'red', edgeId }]);
  });

  it('splits settlements and cities by building type', () => {
    const { rulesBoard } = liveBoard(77);
    const game = createGame({
      board: rulesBoard,
      players: [
        { id: 'a', name: 'A', color: 'red' },
        { id: 'b', name: 'B', color: 'blue' },
        { id: 'c', name: 'C', color: 'white' },
      ],
    });
    const mutated = structuredClone(game);
    const ids = Object.keys(mutated.board.intersections);
    mutated.board.intersections[ids[0]].building = { type: 'settlement', playerId: 'a' };
    mutated.board.intersections[ids[2]].building = { type: 'city', playerId: 'b' };

    const placements = placementsFromGame(mutated);
    expect(placements.settlements).toHaveLength(1);
    expect(placements.cities).toHaveLength(1);
    expect(placements.settlements[0].playerId).toBe('a');
    expect(placements.cities[0].playerId).toBe('b');
  });
});

describe('resourceHandsFromGame', () => {
  const uiPlayers = getActivePlayers(3).map((player) => ({
    id: player.id,
    name: player.label,
    color: player.id,
  }));

  it('returns empty card lists when game is null', () => {
    const hands = resourceHandsFromGame(null, uiPlayers);
    expect(hands).toHaveLength(3);
    expect(hands.every((hand) => hand.cards.length === 0)).toBe(true);
  });

  it('expands resource counts into individual card objects', () => {
    const { rulesBoard } = liveBoard(88);
    const game = createGame({
      board: rulesBoard,
      players: uiPlayers.map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
      })),
    });
    const mutated = structuredClone(game);
    mutated.players[0].resources = { wood: 2, brick: 1, ore: 0, hay: 0, sheep: 0 };

    const hands = resourceHandsFromGame(mutated, uiPlayers);
    const redHand = hands.find((hand) => hand.playerId === uiPlayers[0].id);
    expect(redHand.cards).toHaveLength(3);
    expect(redHand.cards.filter((card) => card.resource === 'wood')).toHaveLength(2);
    expect(redHand.cards.filter((card) => card.resource === 'brick')).toHaveLength(1);
    expect(redHand.cards.map((card) => card.id)).toEqual([
      `${uiPlayers[0].id}-wood-0`,
      `${uiPlayers[0].id}-wood-1`,
      `${uiPlayers[0].id}-brick-0`,
    ]);
  });
});
