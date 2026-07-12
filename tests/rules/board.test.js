import { describe, expect, it } from 'vitest';
import {
  adjacentIntersectionIds,
  canPlaceRoad,
  canPlaceSettlement,
  createBoard,
  getPlayerPortRatio,
  incidentEdgeIds,
  validateBoard,
} from '../../src/rules/index.js';
import { buildFixtureBoard } from './fixtures.js';

describe('createBoard / validateBoard', () => {
  it('builds a valid fixture board with robber on desert', () => {
    const board = buildFixtureBoard();
    expect(board.robberTileId).toBe('t-desert');
    expect(board.tiles['t-desert'].terrain).toBe('desert');
    expect(Object.keys(board.intersections)).toHaveLength(16);
    expect(Object.keys(board.edges)).toHaveLength(15);
    expect(validateBoard(board)).toBe(true);
  });

  it('rejects robber on a missing tile', () => {
    expect(() =>
      createBoard({
        tiles: [{ id: 't1', terrain: 'forest', number: 6, intersections: ['v0', 'v1'] }],
        intersections: [{ id: 'v0' }, { id: 'v1' }],
        edges: [{ id: 'e0', intersections: ['v0', 'v1'] }],
        robberTileId: 'missing',
      }),
    ).toThrow(/Robber must start/);
  });

  it('rejects desert with a number token', () => {
    expect(() =>
      createBoard({
        tiles: [{ id: 't1', terrain: 'desert', number: 6, intersections: ['v0'] }],
        intersections: [{ id: 'v0' }],
        edges: [],
        robberTileId: 't1',
      }),
    ).toThrow(/desert cannot have a number/);
  });

  it('rejects invalid number tokens', () => {
    expect(() =>
      createBoard({
        tiles: [{ id: 't1', terrain: 'forest', number: 7, intersections: ['v0'] }],
        intersections: [{ id: 'v0' }],
        edges: [],
        robberTileId: 't1',
      }),
    ).toThrow(/Invalid number token/);
  });

  it('rejects unknown terrain', () => {
    expect(() =>
      createBoard({
        tiles: [{ id: 't1', terrain: 'volcano', number: 6, intersections: ['v0'] }],
        intersections: [{ id: 'v0' }],
        edges: [],
        robberTileId: 't1',
      }),
    ).toThrow(/Unknown terrain/);
  });

  it('rejects edges that do not join two intersections', () => {
    expect(() =>
      createBoard({
        tiles: [{ id: 't1', terrain: 'desert', number: null, intersections: ['v0'] }],
        intersections: [{ id: 'v0' }],
        edges: [{ id: 'e0', intersections: ['v0'] }],
        robberTileId: 't1',
      }),
    ).toThrow(/must join two existing intersections/);
  });
});

describe('topology helpers', () => {
  it('lists adjacent intersections along the path', () => {
    const board = buildFixtureBoard();
    expect(adjacentIntersectionIds(board, 'v0').sort()).toEqual(['v1']);
    expect(adjacentIntersectionIds(board, 'v5').sort()).toEqual(['v4', 'v6']);
  });

  it('lists incident edges', () => {
    const board = buildFixtureBoard();
    expect(incidentEdgeIds(board, 'v0')).toEqual(['e0']);
    expect(incidentEdgeIds(board, 'v3').sort()).toEqual(['e2', 'e3']);
  });
});

describe('canPlaceSettlement', () => {
  it('allows empty intersection during setup without a road', () => {
    const board = buildFixtureBoard();
    expect(canPlaceSettlement(board, 'v0', 'p1', false)).toBe(true);
  });

  it('blocks occupied intersections', () => {
    const board = buildFixtureBoard();
    board.intersections.v0.building = { type: 'settlement', playerId: 'p1' };
    expect(canPlaceSettlement(board, 'v0', 'p2', false)).toBe(false);
  });

  it('enforces the distance rule against adjacent buildings', () => {
    const board = buildFixtureBoard();
    board.intersections.v0.building = { type: 'settlement', playerId: 'p1' };
    expect(canPlaceSettlement(board, 'v1', 'p2', false)).toBe(false);
    expect(canPlaceSettlement(board, 'v2', 'p2', false)).toBe(true);
  });

  it('requires a connecting road outside setup', () => {
    const board = buildFixtureBoard();
    expect(canPlaceSettlement(board, 'v2', 'p1', true)).toBe(false);
    board.edges.e1.road = 'p1';
    expect(canPlaceSettlement(board, 'v2', 'p1', true)).toBe(true);
  });
});

describe('canPlaceRoad', () => {
  it('allows setup road only on edges touching the new settlement', () => {
    const board = buildFixtureBoard();
    expect(canPlaceRoad(board, 'e0', 'p1', 'v0')).toBe(true);
    expect(canPlaceRoad(board, 'e2', 'p1', 'v0')).toBe(false);
  });

  it('blocks already occupied edges', () => {
    const board = buildFixtureBoard();
    board.edges.e0.road = 'p1';
    expect(canPlaceRoad(board, 'e0', 'p2', 'v0')).toBe(false);
  });

  it('allows extension from own settlement or road network', () => {
    const board = buildFixtureBoard();
    board.intersections.v0.building = { type: 'settlement', playerId: 'p1' };
    expect(canPlaceRoad(board, 'e0', 'p1', null)).toBe(true);

    board.edges.e0.road = 'p1';
    expect(canPlaceRoad(board, 'e1', 'p1', null)).toBe(true);
  });
});

describe('getPlayerPortRatio', () => {
  it('defaults to 4:1 without a port settlement', () => {
    const board = buildFixtureBoard();
    expect(getPlayerPortRatio(board, 'p1', 'wood')).toBe(4);
  });

  it('uses generic 3:1 when player owns a 3:1 port', () => {
    const board = buildFixtureBoard();
    board.intersections.v0.building = { type: 'settlement', playerId: 'p1' };
    expect(getPlayerPortRatio(board, 'p1', 'brick')).toBe(3);
  });

  it('uses resource-specific 2:1 when player owns that port', () => {
    const board = buildFixtureBoard();
    board.intersections.v14.building = { type: 'settlement', playerId: 'p1' };
    expect(getPlayerPortRatio(board, 'p1', 'wood')).toBe(2);
    expect(getPlayerPortRatio(board, 'p1', 'brick')).toBe(4);
  });
});
