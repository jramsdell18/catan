import { canPlaceRoad, canPlaceSettlement } from '../rules/index.js';

export const INTERACTION_MODES = Object.freeze({
  PLACE_ROAD: 'placeRoad',
  PLACE_SETTLEMENT: 'placeSettlement',
  BUILD_CITY: 'buildCity',
  MOVE_ROBBER: 'moveRobber',
});

export const INTERACTION_LABELS = Object.freeze({
  placeRoad: 'Select a legal edge for the road.',
  placeSettlement: 'Select a legal intersection for the settlement.',
  buildCity: 'Select one of your settlements to upgrade.',
  moveRobber: 'Select a different hex for the robber.',
});

export function getInteractionMode(game, requestedMode = null) {
  if (!game) return null;
  if (game.phase === 'setup') {
    return game.setupSettlementId ? INTERACTION_MODES.PLACE_ROAD : INTERACTION_MODES.PLACE_SETTLEMENT;
  }
  return requestedMode;
}

export function getLegalTargets(game, topology, board, mode) {
  const empty = { intersections: [], edges: [], hexes: [] };
  if (!game || !mode) return empty;

  if (mode === INTERACTION_MODES.PLACE_SETTLEMENT) {
    const isSetup = game.phase === 'setup';
    return {
      ...empty,
      intersections: topology.vertices.filter((vertex) =>
        canPlaceSettlement(game.board, vertex.id, game.currentPlayerId, !isSetup),
      ),
    };
  }

  if (mode === INTERACTION_MODES.PLACE_ROAD) {
    const setupIntersectionId = game.phase === 'setup' ? game.setupSettlementId : null;
    return {
      ...empty,
      edges: topology.edges.filter((edge) =>
        canPlaceRoad(game.board, edge.id, game.currentPlayerId, setupIntersectionId),
      ),
    };
  }

  if (mode === INTERACTION_MODES.BUILD_CITY) {
    return {
      ...empty,
      intersections: topology.vertices.filter((vertex) => {
        const building = game.board.intersections[vertex.id]?.building;
        return building?.type === 'settlement' && building.playerId === game.currentPlayerId;
      }),
    };
  }

  if (mode === INTERACTION_MODES.MOVE_ROBBER) {
    return {
      ...empty,
      hexes: board.hexes.filter((hex) => hex.hexId !== game.board.robberTileId),
    };
  }

  return empty;
}

export function actionForTarget(mode, game, targetId) {
  const base = { type: mode, playerId: game.currentPlayerId };
  if (mode === INTERACTION_MODES.PLACE_ROAD) return { ...base, edgeId: targetId };
  if (mode === INTERACTION_MODES.PLACE_SETTLEMENT || mode === INTERACTION_MODES.BUILD_CITY) {
    return { ...base, intersectionId: targetId };
  }
  if (mode === INTERACTION_MODES.MOVE_ROBBER) return { ...base, tileId: targetId };
  return null;
}

const ACTION_LABELS = Object.freeze({
  placeSettlement: 'placed a settlement',
  placeRoad: 'placed a road',
  buildCity: 'built a city',
  rollDice: 'rolled the dice',
  discard: 'discarded resources',
  moveRobber: 'moved the robber',
  buyDevelopment: 'bought a development card',
  playDevelopment: 'played a development card',
  maritimeTrade: 'completed a maritime trade',
  offerTrade: 'offered a trade',
  acceptTrade: 'accepted a trade',
  cancelTrade: 'cancelled a trade',
  endTurn: 'ended their turn',
});

export function describeAction(type) {
  return ACTION_LABELS[type] ?? type;
}

export function describeLogEntry(entry, players) {
  const player = players.find((item) => item.id === entry.playerId);
  return `${player?.name ?? player?.label ?? 'Game'} ${describeAction(entry.type)}.`;
}
