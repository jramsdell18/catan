import { HEX_RADIUS } from './board.js';

const VERTEX_START_ANGLE = Math.PI / 6;
const KEY_PRECISION = 1000;

function positionKey(position) {
  return `${Math.round(position.x * KEY_PRECISION)},${Math.round(position.z * KEY_PRECISION)}`;
}

function edgeKey(vertexAId, vertexBId) {
  return [vertexAId, vertexBId].sort().join('|');
}

function getHexVertexPositions(hex) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = VERTEX_START_ANGLE + (index * Math.PI) / 3;

    return {
      x: hex.world.x + Math.cos(angle) * HEX_RADIUS,
      z: hex.world.z + Math.sin(angle) * HEX_RADIUS,
    };
  });
}

export function createBoardTopology(hexes) {
  const verticesByKey = new Map();
  const edgesByKey = new Map();

  hexes.forEach((hex) => {
    const vertexPositions = getHexVertexPositions(hex);
    const vertexIds = vertexPositions.map((position) => {
      const key = positionKey(position);

      if (!verticesByKey.has(key)) {
        verticesByKey.set(key, {
          id: `vertex-${verticesByKey.size + 1}`,
          x: position.x,
          z: position.z,
          adjacentHexes: new Set(),
          neighborIds: new Set(),
          edgeIds: new Set(),
        });
      }

      verticesByKey.get(key).adjacentHexes.add({
        hexId: hex.hexId,
        terrainId: hex.terrainId,
      });

      return verticesByKey.get(key).id;
    });

    vertexIds.forEach((vertexId, index) => {
      const nextVertexId = vertexIds[(index + 1) % vertexIds.length];
      const key = edgeKey(vertexId, nextVertexId);

      if (!edgesByKey.has(key)) {
        edgesByKey.set(key, {
          id: `edge-${edgesByKey.size + 1}`,
          vertexIds: [vertexId, nextVertexId],
        });
      }
    });
  });

  const vertices = [...verticesByKey.values()];
  const verticesById = new Map(vertices.map((vertex) => [vertex.id, vertex]));

  const edges = [...edgesByKey.values()].map((edge) => {
    const [vertexAId, vertexBId] = edge.vertexIds;
    const vertexA = verticesById.get(vertexAId);
    const vertexB = verticesById.get(vertexBId);

    vertexA.neighborIds.add(vertexBId);
    vertexB.neighborIds.add(vertexAId);
    vertexA.edgeIds.add(edge.id);
    vertexB.edgeIds.add(edge.id);

    return {
      ...edge,
      x: (vertexA.x + vertexB.x) / 2,
      z: (vertexA.z + vertexB.z) / 2,
      rotation: Math.atan2(vertexB.x - vertexA.x, vertexB.z - vertexA.z),
      length: Math.hypot(vertexB.x - vertexA.x, vertexB.z - vertexA.z),
    };
  });

  return {
    vertices: vertices.map((vertex) => ({
      ...vertex,
      adjacentHexes: [...vertex.adjacentHexes],
      neighborIds: [...vertex.neighborIds],
      edgeIds: [...vertex.edgeIds],
    })),
    edges,
  };
}

export function getAllowedSettlementVertices(topology, placements) {
  const occupiedVertexIds = new Set(placements.settlements.map((settlement) => settlement.vertexId));

  return topology.vertices.filter((vertex) => {
    if (occupiedVertexIds.has(vertex.id)) {
      return false;
    }

    return vertex.neighborIds.every((neighborId) => !occupiedVertexIds.has(neighborId));
  });
}

export function getAllowedRoadEdges(topology, placements, activeSettlementVertexId) {
  const occupiedEdgeIds = new Set(placements.roads.map((road) => road.edgeId));

  return topology.edges.filter(
    (edge) => edge.vertexIds.includes(activeSettlementVertexId) && !occupiedEdgeIds.has(edge.id),
  );
}
