import { describe, expect, it } from 'vitest';
import { createRandomBoard, BOARD_SLOTS, HEX_RADIUS } from '../../src/game/board.js';
import {
  createBoardTopology,
  getAllowedRoadEdges,
  getAllowedSettlementVertices,
} from '../../src/game/topology.js';

describe('createBoardTopology', () => {
  it('builds the standard Catan intersection/path counts for a full board', () => {
    const board = createRandomBoard(42);
    const topology = createBoardTopology(board.hexes);

    expect(board.hexes).toHaveLength(19);
    expect(BOARD_SLOTS).toHaveLength(19);
    // Base-game island: 54 intersections, 72 paths
    expect(topology.vertices).toHaveLength(54);
    expect(topology.edges).toHaveLength(72);
  });

  it('gives every hex exactly six unique vertices and every edge two vertices', () => {
    const board = createRandomBoard(7);
    const topology = createBoardTopology(board.hexes);

    for (const hex of board.hexes) {
      const touching = topology.vertices.filter((vertex) =>
        vertex.adjacentHexes.some((item) => item.hexId === hex.hexId),
      );
      expect(touching).toHaveLength(6);
    }

    for (const edge of topology.edges) {
      expect(edge.vertexIds).toHaveLength(2);
      expect(edge.vertexIds[0]).not.toBe(edge.vertexIds[1]);
      expect(edge.length).toBeGreaterThan(0);
      expect(Number.isFinite(edge.rotation)).toBe(true);
    }
  });

  it('shares vertices between adjacent hexes and keeps neighbor/edge links consistent', () => {
    const board = createRandomBoard(99);
    const topology = createBoardTopology(board.hexes);
    const byId = Object.fromEntries(topology.vertices.map((vertex) => [vertex.id, vertex]));

    for (const edge of topology.edges) {
      const [a, b] = edge.vertexIds;
      expect(byId[a].neighborIds).toContain(b);
      expect(byId[b].neighborIds).toContain(a);
      expect(byId[a].edgeIds).toContain(edge.id);
      expect(byId[b].edgeIds).toContain(edge.id);
    }

    // Interior vertices touch up to 3 hexes; all vertices touch at least 1
    for (const vertex of topology.vertices) {
      expect(vertex.adjacentHexes.length).toBeGreaterThanOrEqual(1);
      expect(vertex.adjacentHexes.length).toBeLessThanOrEqual(3);
      expect(vertex.neighborIds.length).toBeGreaterThanOrEqual(2);
      expect(vertex.neighborIds.length).toBeLessThanOrEqual(3);
    }
  });

  it('uses stable vertex and edge ids for the same hex layout', () => {
    const board = createRandomBoard(123);
    const first = createBoardTopology(board.hexes);
    const second = createBoardTopology(board.hexes);

    expect(first.vertices.map((v) => v.id)).toEqual(second.vertices.map((v) => v.id));
    expect(first.edges.map((e) => e.id)).toEqual(second.edges.map((e) => e.id));
    expect(first.vertices.map((v) => [v.x, v.z])).toEqual(second.vertices.map((v) => [v.x, v.z]));
  });

  it('places vertices on the hex perimeter at HEX_RADIUS', () => {
    const board = createRandomBoard(1);
    const topology = createBoardTopology(board.hexes);
    const centerHex = board.hexes[0];
    const verts = topology.vertices.filter((vertex) =>
      vertex.adjacentHexes.some((item) => item.hexId === centerHex.hexId),
    );

    for (const vertex of verts) {
      const distance = Math.hypot(vertex.x - centerHex.world.x, vertex.z - centerHex.world.z);
      expect(distance).toBeCloseTo(HEX_RADIUS, 5);
    }
  });
});

describe('getAllowedSettlementVertices', () => {
  it('allows every vertex on an empty board', () => {
    const board = createRandomBoard(5);
    const topology = createBoardTopology(board.hexes);
    const allowed = getAllowedSettlementVertices(topology, { settlements: [], roads: [], cities: [] });
    expect(allowed).toHaveLength(topology.vertices.length);
  });

  it('blocks a occupied vertex and its neighbors (distance rule preview)', () => {
    const board = createRandomBoard(5);
    const topology = createBoardTopology(board.hexes);
    const target = topology.vertices[0];
    const allowed = getAllowedSettlementVertices(topology, {
      settlements: [{ vertexId: target.id, playerId: 'red' }],
      roads: [],
      cities: [],
    });

    const allowedIds = new Set(allowed.map((vertex) => vertex.id));
    expect(allowedIds.has(target.id)).toBe(false);
    for (const neighborId of target.neighborIds) {
      expect(allowedIds.has(neighborId)).toBe(false);
    }
    expect(allowed.length).toBe(topology.vertices.length - 1 - target.neighborIds.length);
  });
});

describe('getAllowedRoadEdges', () => {
  it('returns only empty edges incident to the active settlement vertex', () => {
    const board = createRandomBoard(5);
    const topology = createBoardTopology(board.hexes);
    const vertex = topology.vertices.find((item) => item.edgeIds.length >= 2);
    const allowed = getAllowedRoadEdges(
      topology,
      { settlements: [], roads: [], cities: [] },
      vertex.id,
    );

    expect(allowed.length).toBe(vertex.edgeIds.length);
    expect(allowed.every((edge) => edge.vertexIds.includes(vertex.id))).toBe(true);
  });

  it('excludes edges that already have a road', () => {
    const board = createRandomBoard(5);
    const topology = createBoardTopology(board.hexes);
    const vertex = topology.vertices[0];
    const blockedEdgeId = vertex.edgeIds[0];
    const allowed = getAllowedRoadEdges(
      topology,
      {
        settlements: [],
        roads: [{ edgeId: blockedEdgeId, playerId: 'red' }],
        cities: [],
      },
      vertex.id,
    );

    expect(allowed.every((edge) => edge.id !== blockedEdgeId)).toBe(true);
    expect(allowed).toHaveLength(vertex.edgeIds.length - 1);
  });
});
