import { createBoard } from '../rules/index.js';

export function createRulesBoard(board, topology) {
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
    ports: [],
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
