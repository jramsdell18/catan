import { createBoard } from '../rules/index.js';

const PORT_TYPES = [null, null, null, null, 'wood', 'brick', 'ore', 'hay', 'sheep'];

function seededShuffle(items, seed) {
  const result = [...items];
  let state = Number(seed) || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state ^ (state >>> 15), 1 | state) + 0x6d2b79f5) | 0;
    const swapIndex = (state >>> 0) % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createBoardPorts(topology, seed = 1) {
  const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));
  const boundaryEdges = topology.edges
    .filter((edge) => {
      const [a, b] = edge.vertexIds.map((id) => verticesById.get(id));
      const bHexIds = new Set(b.adjacentHexes.map((hex) => hex.hexId));
      return a.adjacentHexes.filter((hex) => bHexIds.has(hex.hexId)).length === 1;
    })
    .sort((edgeA, edgeB) => Math.atan2(edgeA.z, edgeA.x) - Math.atan2(edgeB.z, edgeB.x));

  const offset = (Number(seed) >>> 0) % boundaryEdges.length;
  const portTypes = seededShuffle(PORT_TYPES, seed);

  return portTypes.map((resource, index) => {
    const boundaryIndex = (offset + Math.floor((index * boundaryEdges.length) / portTypes.length)) % boundaryEdges.length;
    const edge = boundaryEdges[boundaryIndex];
    return {
      id: `port-${index + 1}`,
      edgeId: edge.id,
      intersections: [...edge.vertexIds],
      ratio: resource ? 2 : 3,
      resource,
    };
  });
}

export function createRulesBoard(board, topology, ports = createBoardPorts(topology, board.seed)) {
  const tiles = board.hexes.map((hex) => ({
    id: hex.hexId,
    terrain: hex.terrainId,
    number: hex.number,
    intersections: topology.vertices
      .filter((vertex) => vertex.adjacentHexes.some((item) => item.hexId === hex.hexId))
      .map((vertex) => vertex.id),
  }));

  return createBoard({
    tiles,
    intersections: topology.vertices.map((vertex) => ({ id: vertex.id })),
    edges: topology.edges.map((edge) => ({ id: edge.id, intersections: edge.vertexIds })),
    ports,
    robberTileId: board.hexes.find((hex) => hex.hasRobber)?.hexId,
  });
}

export function placementsFromGame(game) {
  if (!game) return { settlements: [], roads: [], cities: [] };

  const settlements = [];
  const cities = [];
  Object.values(game.board.intersections).forEach((intersection) => {
    if (!intersection.building) return;
    const placement = {
      id: `${intersection.building.type}-${intersection.id}`,
      playerId: intersection.building.playerId,
      vertexId: intersection.id,
    };
    (intersection.building.type === 'city' ? cities : settlements).push(placement);
  });

  const roads = Object.values(game.board.edges)
    .filter((edge) => edge.road)
    .map((edge) => ({ id: `road-${edge.id}`, playerId: edge.road, edgeId: edge.id }));

  return { settlements, roads, cities };
}

export function resourceHandsFromGame(game, players) {
  return players.map((player) => ({
    playerId: player.id,
    cards: game
      ? Object.entries(game.players.find((item) => item.id === player.id)?.resources ?? {}).flatMap(
          ([resource, count]) =>
            Array.from({ length: count }, (_, index) => ({
              id: `${player.id}-${resource}-${index}`,
              resource,
            })),
        )
      : [],
  }));
}

export function playerInventoriesFromGame(game, players) {
  return players.map((player) => {
    const pieces = game?.players.find((item) => item.id === player.id)?.pieces;
    return {
      playerId: player.id,
      road: pieces?.roads ?? 15,
      settlement: pieces?.settlements ?? 5,
      city: pieces?.cities ?? 4,
    };
  });
}
