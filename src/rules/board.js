import { RESOURCE_TYPES, TERRAIN_RESOURCE } from './constants.js';

/**
 * A board is deliberately data-driven so the UI/server can use any visual layout.
 * Tiles reference intersection ids, intersections reference edge ids, and edges
 * reference exactly two intersections. Ports live on intersections.
 */
export function createBoard({ tiles, intersections, edges, ports = [], robberTileId }) {
  const board = {
    tiles: Object.fromEntries(tiles.map((tile) => [tile.id, { ...tile }])),
    intersections: Object.fromEntries(
      intersections.map((intersection) => [intersection.id, { ...intersection, building: null }]),
    ),
    edges: Object.fromEntries(edges.map((edge) => [edge.id, { ...edge, road: null }])),
    ports: ports.map((port) => ({ ratio: 3, resource: null, ...port })),
    robberTileId,
  };
  validateBoard(board);
  return board;
}

export function validateBoard(board) {
  if (!board.tiles[board.robberTileId]) throw new Error('Robber must start on an existing tile.');

  for (const tile of Object.values(board.tiles)) {
    if (!(tile.terrain in TERRAIN_RESOURCE)) throw new Error(`Unknown terrain on tile ${tile.id}.`);
    if (tile.terrain === 'desert' && tile.number != null) throw new Error('The desert cannot have a number token.');
    if (tile.terrain !== 'desert' && (tile.number < 2 || tile.number > 12 || tile.number === 7)) {
      throw new Error(`Invalid number token on tile ${tile.id}.`);
    }
    for (const id of tile.intersections) {
      if (!board.intersections[id]) throw new Error(`Tile ${tile.id} references missing intersection ${id}.`);
    }
  }

  for (const edge of Object.values(board.edges)) {
    if (edge.intersections.length !== 2 || edge.intersections.some((id) => !board.intersections[id])) {
      throw new Error(`Edge ${edge.id} must join two existing intersections.`);
    }
  }

  for (const port of board.ports) {
    if (!Array.isArray(port.intersections) || port.intersections.length !== 2) {
      throw new Error('A port must touch two intersections.');
    }
    if (port.intersections.some((id) => !board.intersections[id])) {
      throw new Error('A port references a missing intersection.');
    }
    if (port.resource !== null && !RESOURCE_TYPES.includes(port.resource)) throw new Error('Invalid port resource.');
  }
  return true;
}

export function adjacentIntersectionIds(board, intersectionId) {
  const ids = new Set();
  for (const edge of Object.values(board.edges)) {
    if (edge.intersections.includes(intersectionId)) {
      edge.intersections.filter((id) => id !== intersectionId).forEach((id) => ids.add(id));
    }
  }
  return [...ids];
}

export function incidentEdgeIds(board, intersectionId) {
  return Object.values(board.edges)
    .filter((edge) => edge.intersections.includes(intersectionId))
    .map((edge) => edge.id);
}

export function canPlaceSettlement(board, intersectionId, playerId, requireRoad = true) {
  const intersection = board.intersections[intersectionId];
  if (!intersection || intersection.building) return false;
  if (adjacentIntersectionIds(board, intersectionId).some((id) => board.intersections[id].building)) return false;
  return !requireRoad || incidentEdgeIds(board, intersectionId).some((id) => board.edges[id].road === playerId);
}

export function canPlaceRoad(board, edgeId, playerId, setupIntersectionId = null) {
  const edge = board.edges[edgeId];
  if (!edge || edge.road) return false;
  if (setupIntersectionId) return edge.intersections.includes(setupIntersectionId);

  return edge.intersections.some((intersectionId) => {
    const building = board.intersections[intersectionId].building;
    if (building && building.playerId !== playerId) return false;
    if (building?.playerId === playerId) return true;
    return incidentEdgeIds(board, intersectionId).some((id) => board.edges[id].road === playerId);
  });
}

export function getPlayerPortRatio(board, playerId, resource) {
  let ratio = 4;
  for (const port of board.ports) {
    const ownsPort = port.intersections.some(
      (id) => board.intersections[id]?.building?.playerId === playerId,
    );
    if (ownsPort && (port.resource === null || port.resource === resource)) ratio = Math.min(ratio, port.ratio);
  }
  return ratio;
}

export function cloneBoard(board) {
  return structuredClone(board);
}
