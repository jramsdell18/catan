import { describe, expect, it } from 'vitest';
import { createRandomBoard } from '../../src/game/board.js';
import { getActivePlayers } from '../../src/game/pieces.js';
import {
  createRulesBoard,
  placementsFromGame,
  resourceHandsFromGame,
} from '../../src/game/rulesAdapter.js';
import { createSetupOrder } from '../../src/game/setupFlow.js';
import { createBoardTopology, getAllowedRoadEdges, getAllowedSettlementVertices } from '../../src/game/topology.js';
import { applyAction, createGame } from '../../src/rules/index.js';

/**
 * End-to-end glue: visual board → topology → rules engine → UI projections.
 * Mirrors the path App.jsx uses without mounting React/Three.
 */
describe('visual board ↔ rules engine integration', () => {
  it('completes a 3-player setup snake using topology-guided legal moves', () => {
    const visualBoard = createRandomBoard(31415);
    const topology = createBoardTopology(visualBoard.hexes);
    const rulesBoard = createRulesBoard(visualBoard, topology);

    const activePlayers = getActivePlayers(3);
    const players = activePlayers.map((player) => ({
      id: player.id,
      name: player.label,
      color: player.id,
    }));

    let game = createGame({ board: rulesBoard, players });
    const order = createSetupOrder(activePlayers, 1);

    // Engine setup order is player array order (seat 1 first), matching createSetupOrder(..., 1)
    expect(order.map((turn) => turn.playerId)).toEqual([
      players[0].id,
      players[1].id,
      players[2].id,
      players[2].id,
      players[1].id,
      players[0].id,
    ]);

    for (const turn of order) {
      expect(game.phase).toBe('setup');
      expect(game.currentPlayerId).toBe(turn.playerId);

      const uiPlacements = placementsFromGame(game);
      const settlementChoices = getAllowedSettlementVertices(topology, uiPlacements);
      // Prefer rules-legal vertices (UI helper only encodes distance, not engine ownership)
      const vertex = settlementChoices.find((choice) => {
        try {
          applyAction(game, {
            type: 'placeSettlement',
            playerId: turn.playerId,
            intersectionId: choice.id,
          });
          return true;
        } catch {
          return false;
        }
      });
      expect(vertex, `no legal settlement for ${turn.playerId}`).toBeTruthy();

      game = applyAction(game, {
        type: 'placeSettlement',
        playerId: turn.playerId,
        intersectionId: vertex.id,
      });

      const afterSettlement = placementsFromGame(game);
      const roadChoices = getAllowedRoadEdges(topology, afterSettlement, vertex.id);
      expect(roadChoices.length).toBeGreaterThan(0);

      game = applyAction(game, {
        type: 'placeRoad',
        playerId: turn.playerId,
        edgeId: roadChoices[0].id,
      });
    }

    expect(game.phase).toBe('roll');
    expect(game.currentPlayerId).toBe(players[0].id);

    const placements = placementsFromGame(game);
    expect(placements.settlements).toHaveLength(6);
    expect(placements.roads).toHaveLength(6);

    // Current rules grant one of each resource on second-round settlements
    const hands = resourceHandsFromGame(game, players);
    for (const hand of hands) {
      expect(hand.cards).toHaveLength(5);
      const resources = hand.cards.map((card) => card.resource).sort();
      expect(resources).toEqual(['brick', 'hay', 'ore', 'sheep', 'wood'].sort());
    }

    // A production roll should leave the game in action phase (or robber/discard on 7)
    game = applyAction(game, {
      type: 'rollDice',
      playerId: players[0].id,
      dice: [2, 3],
    });
    expect(['action', 'discard', 'robber']).toContain(game.phase);
  });

  it('keeps vertex and edge ids identical across UI topology and rules board', () => {
    const visualBoard = createRandomBoard(2718);
    const topology = createBoardTopology(visualBoard.hexes);
    const rulesBoard = createRulesBoard(visualBoard, topology);

    const topologyVertexIds = new Set(topology.vertices.map((vertex) => vertex.id));
    const rulesVertexIds = new Set(Object.keys(rulesBoard.intersections));
    expect(topologyVertexIds).toEqual(rulesVertexIds);

    const topologyEdgeIds = new Set(topology.edges.map((edge) => edge.id));
    const rulesEdgeIds = new Set(Object.keys(rulesBoard.edges));
    expect(topologyEdgeIds).toEqual(rulesEdgeIds);
  });
});
