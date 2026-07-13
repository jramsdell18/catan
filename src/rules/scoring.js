import { VICTORY_POINTS_TO_WIN } from './constants.js';
import { incidentEdgeIds } from './board.js';

function roadLengthFrom(board, playerId, intersectionId, usedEdges) {
  const building = board.intersections[intersectionId].building;
  if (usedEdges.size > 0 && building && building.playerId !== playerId) return 0;

  let best = 0;
  for (const edgeId of incidentEdgeIds(board, intersectionId)) {
    const edge = board.edges[edgeId];
    if (edge.road !== playerId || usedEdges.has(edgeId)) continue;
    const next = edge.intersections.find((id) => id !== intersectionId);
    const branch = new Set(usedEdges);
    branch.add(edgeId);
    best = Math.max(best, 1 + roadLengthFrom(board, playerId, next, branch));
  }
  return best;
}

export function longestRoadLength(board, playerId) {
  return Math.max(
    0,
    ...Object.values(board.intersections).map((intersection) =>
      roadLengthFrom(board, playerId, intersection.id, new Set()),
    ),
  );
}

export function recalculateAwards(state) {
  const lengths = Object.fromEntries(state.players.map((p) => [p.id, longestRoadLength(state.board, p.id)]));
  const maxRoad = Math.max(0, ...Object.values(lengths));
  const roadLeaders = state.players.filter((p) => lengths[p.id] === maxRoad);
  // Longest Road requires length ≥ 5 and a sole leader; ties keep the current holder
  // only if they are still tied for the lead at length ≥ 5.
  if (maxRoad < 5) {
    state.longestRoadPlayerId = null;
  } else if (roadLeaders.length === 1) {
    state.longestRoadPlayerId = roadLeaders[0].id;
  } else if (!roadLeaders.some((p) => p.id === state.longestRoadPlayerId)) {
    state.longestRoadPlayerId = null;
  }

  const maxKnights = Math.max(0, ...state.players.map((p) => p.playedKnights));
  const armyLeaders = state.players.filter((p) => p.playedKnights === maxKnights);
  if (maxKnights < 3) {
    state.largestArmyPlayerId = null;
  } else if (armyLeaders.length === 1) {
    state.largestArmyPlayerId = armyLeaders[0].id;
  } else if (!armyLeaders.some((p) => p.id === state.largestArmyPlayerId)) {
    state.largestArmyPlayerId = null;
  }
}

/**
 * Public scoreboard points: buildings + awards. Does not include unrevealed VP cards.
 */
export function publicVictoryPoints(state, playerId) {
  const buildings = Object.values(state.board.intersections).filter((i) => i.building?.playerId === playerId);
  return (
    buildings.reduce((sum, i) => sum + (i.building.type === 'city' ? 2 : 1), 0) +
    (state.longestRoadPlayerId === playerId ? 2 : 0) +
    (state.largestArmyPlayerId === playerId ? 2 : 0)
  );
}

export function victoryPointCardCount(state, playerId) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return player?.developmentCards.filter((card) => card.type === 'victoryPoint').length ?? 0;
}

/**
 * Breakdown used by scoreboard UI and tests. Private total includes hidden VP cards.
 */
export function getScoreBreakdown(state, playerId) {
  const buildings = Object.values(state.board.intersections).filter((i) => i.building?.playerId === playerId);
  const settlements = buildings.filter((i) => i.building.type === 'settlement').length;
  const cities = buildings.filter((i) => i.building.type === 'city').length;
  const victoryPointCards = victoryPointCardCount(state, playerId);
  const longestRoad = state.longestRoadPlayerId === playerId ? 2 : 0;
  const largestArmy = state.largestArmyPlayerId === playerId ? 2 : 0;
  const buildingPoints = settlements + cities * 2;
  const publicTotal = buildingPoints + longestRoad + largestArmy;

  return {
    playerId,
    settlements,
    cities,
    settlementPoints: settlements,
    cityPoints: cities * 2,
    longestRoad,
    largestArmy,
    victoryPointCards,
    longestRoadLength: longestRoadLength(state.board, playerId),
    publicTotal,
    privateTotal: publicTotal + victoryPointCards,
  };
}

export function visibleVictoryPoints(state, playerId) {
  return getScoreBreakdown(state, playerId).privateTotal;
}

export function hasWon(state, playerId) {
  return state.currentPlayerId === playerId && visibleVictoryPoints(state, playerId) >= VICTORY_POINTS_TO_WIN;
}

