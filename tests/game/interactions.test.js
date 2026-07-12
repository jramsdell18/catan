import { describe, expect, it } from 'vitest';
import { createRandomBoard } from '../../src/game/board.js';
import {
  actionForTarget,
  canAfford,
  describeLogEntry,
  formatCost,
  getBuildAvailability,
  getInteractionMode,
  getLegalTargets,
  INTERACTION_MODES,
} from '../../src/game/interactions.js';
import { createRulesBoard } from '../../src/game/rulesAdapter.js';
import { createBoardTopology } from '../../src/game/topology.js';
import { applyAction, createGame } from '../../src/rules/index.js';

function liveGame() {
  const board = createRandomBoard(2026);
  const topology = createBoardTopology(board.hexes);
  const game = createGame({
    board: createRulesBoard(board, topology),
    players: [
      { id: 'red', name: 'Red', color: '#c84335' },
      { id: 'blue', name: 'Blue', color: '#2f68b8' },
      { id: 'white', name: 'White', color: '#f4f1e8' },
    ],
  });
  return { board, topology, game };
}

describe('board interaction model', () => {
  it('derives required setup modes and legal target types', () => {
    const { board, topology } = liveGame();
    let { game } = liveGame();
    expect(getInteractionMode(game)).toBe(INTERACTION_MODES.PLACE_SETTLEMENT);
    const settlements = getLegalTargets(game, topology, board, getInteractionMode(game));
    expect(settlements.intersections.length).toBeGreaterThan(0);
    expect(settlements.edges).toEqual([]);

    const intersectionId = settlements.intersections[0].id;
    game = applyAction(game, actionForTarget(INTERACTION_MODES.PLACE_SETTLEMENT, game, intersectionId));
    expect(getInteractionMode(game)).toBe(INTERACTION_MODES.PLACE_ROAD);
    const roads = getLegalTargets(game, topology, board, getInteractionMode(game));
    expect(roads.edges.length).toBeGreaterThan(0);
    expect(roads.intersections).toEqual([]);
  });

  it('maps every reusable board mode to an engine command shape', () => {
    const { game } = liveGame();
    expect(actionForTarget(INTERACTION_MODES.PLACE_ROAD, game, 'edge-1')).toMatchObject({
      type: 'placeRoad', edgeId: 'edge-1', playerId: 'red',
    });
    expect(actionForTarget(INTERACTION_MODES.BUILD_CITY, game, 'vertex-1')).toMatchObject({
      type: 'buildCity', intersectionId: 'vertex-1', playerId: 'red',
    });
    expect(actionForTarget(INTERACTION_MODES.MOVE_ROBBER, game, 'hex-1')).toMatchObject({
      type: 'moveRobber', tileId: 'hex-1', playerId: 'red',
    });
  });

  it('describes engine log entries for the user-facing history', () => {
    const { game } = liveGame();
    expect(describeLogEntry({ type: 'placeSettlement', playerId: 'red' }, game.players))
      .toBe('Red placed a settlement.');
  });

  it('reports build affordability, inventory, targets, and readable costs', () => {
    const { game } = liveGame();
    expect(canAfford({ wood: 1, brick: 1 }, { wood: 1, brick: 1 })).toBe(true);
    expect(canAfford({ wood: 1, brick: 0 }, { wood: 1, brick: 1 })).toBe(false);
    expect(formatCost({ wood: 1, brick: 1 })).toBe('1 wood + 1 brick');
    expect(getBuildAvailability(game).road.enabled).toBe(false);

    const actionGame = structuredClone(game);
    actionGame.phase = 'action';
    actionGame.players[0].resources.wood = 1;
    actionGame.players[0].resources.brick = 1;
    expect(getBuildAvailability(actionGame, { road: 2 }).road.enabled).toBe(true);
    expect(getBuildAvailability(actionGame, { road: 0 }).road.reason).toMatch(/No legal road/);
    actionGame.players[0].pieces.roads = 0;
    expect(getBuildAvailability(actionGame, { road: 2 }).road.reason).toMatch(/No road pieces/);
  });
});
