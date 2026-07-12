import { TERRAIN_TYPES } from './terrain.js';

export function createStartingResourceCards(players, topology, placements, setupStatus) {
  if (setupStatus !== 'complete') {
    return players.map((player) => ({ playerId: player.id, cards: [] }));
  }

  return players.map((player) => {
    const secondSettlement = placements.settlements.find(
      (settlement) => settlement.playerId === player.id && settlement.setupRound === 2,
    );

    if (!secondSettlement) {
      return { playerId: player.id, cards: [] };
    }

    const vertex = topology.vertices.find((item) => item.id === secondSettlement.vertexId);
    const cards =
      vertex?.adjacentHexes
        .map((hex) => TERRAIN_TYPES[hex.terrainId])
        .filter((terrain) => terrain?.resource)
        .map((terrain, index) => ({
          id: `${player.id}-starting-card-${index + 1}`,
          resource: terrain.resource,
        })) ?? [];

    return {
      playerId: player.id,
      cards,
    };
  });
}
