import { canPlaceRoad, canPlaceSettlement } from '../rules/index.js';
import { BUILDING_COSTS } from '../rules/constants.js';

export const INTERACTION_MODES = Object.freeze({
  PLACE_ROAD: 'placeRoad',
  PLACE_SETTLEMENT: 'placeSettlement',
  BUILD_CITY: 'buildCity',
  MOVE_ROBBER: 'moveRobber',
  ROAD_BUILDING: 'roadBuilding',
});

export const INTERACTION_LABELS = Object.freeze({
  placeRoad: 'Select a legal edge for the road.',
  placeSettlement: 'Select a legal intersection for the settlement.',
  buildCity: 'Select one of your settlements to upgrade.',
  moveRobber: 'Select a different hex for the robber.',
  roadBuilding: 'Select one or two connected edges for free roads.',
});

export function getInteractionMode(game, requestedMode = null) {
  if (!game) return null;
  if (game.phase === 'setup') {
    return game.setupSettlementId ? INTERACTION_MODES.PLACE_ROAD : INTERACTION_MODES.PLACE_SETTLEMENT;
  }
  if (game.phase === 'robber') return INTERACTION_MODES.MOVE_ROBBER;
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

  if (mode === INTERACTION_MODES.PLACE_ROAD || mode === INTERACTION_MODES.ROAD_BUILDING) {
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

export function getEligibleRobberVictims(game, tileId) {
  if (!game?.board.tiles[tileId]) return [];
  const ids = new Set(
    game.board.tiles[tileId].intersections
      .map((id) => game.board.intersections[id].building?.playerId)
      .filter((id) => id && id !== game.currentPlayerId),
  );
  return game.players.filter((player) =>
    ids.has(player.id) && Object.values(player.resources).reduce((sum, amount) => sum + amount, 0) > 0,
  );
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
  rejectTrade: 'rejected a trade',
  endTurn: 'ended their turn',
});

export function describeAction(type) {
  return ACTION_LABELS[type] ?? type;
}

export function describeLogEntry(entry, players) {
  const player = players.find((item) => item.id === entry.playerId);
  return `${player?.name ?? player?.label ?? 'Game'} ${describeAction(entry.type)}.`;
}

export function canAfford(resources, cost) {
  return Object.entries(cost).every(([resource, amount]) => (resources?.[resource] ?? 0) >= amount);
}

export function getBuildAvailability(game, targetCounts = {}) {
  const player = game?.players.find((item) => item.id === game.currentPlayerId);
  const isActionPhase = game?.phase === 'action';
  const availability = (pieceKey, cost, targetKey) => {
    const remaining = player?.pieces[pieceKey] ?? 0;
    const affordable = canAfford(player?.resources, cost);
    const hasTarget = (targetCounts[targetKey] ?? 1) > 0;
    let reason = '';
    if (!isActionPhase) reason = 'Available during the action phase.';
    else if (remaining < 1) reason = `No ${targetKey} pieces remaining.`;
    else if (!affordable) reason = `Requires ${formatCost(cost)}.`;
    else if (!hasTarget) reason = `No legal ${targetKey} locations are available.`;
    return { enabled: Boolean(isActionPhase && remaining > 0 && affordable && hasTarget), cost, remaining, reason };
  };
  return {
    road: availability('roads', BUILDING_COSTS.road, 'road'),
    settlement: availability('settlements', BUILDING_COSTS.settlement, 'settlement'),
    city: availability('cities', BUILDING_COSTS.city, 'city'),
  };
}

export function formatCost(cost) {
  return Object.entries(cost).map(([resource, amount]) => `${amount} ${resource}`).join(' + ');
}

export function findRoadPlanToSettlement(game, topology, maxRoads = 6) {
  if (!game || game.phase !== 'action') return [];
  const playerId = game.currentPlayerId;

  function search(board, path) {
    const canBuildNow = topology.vertices.some((vertex) =>
      canPlaceSettlement(board, vertex.id, playerId, true),
    );
    if (canBuildNow) return path;
    if (path.length >= maxRoads) return null;

    const candidates = topology.edges.filter((edge) => canPlaceRoad(board, edge.id, playerId));
    for (const edge of candidates) {
      const nextBoard = structuredClone(board);
      nextBoard.edges[edge.id].road = playerId;
      const result = search(nextBoard, [...path, edge.id]);
      if (result) return result;
    }
    return null;
  }

  return search(game.board, []) ?? [];
}
