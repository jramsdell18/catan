import { describe, expect, it } from 'vitest';
import {
  createPlayerInventories,
  getActivePlayers,
  NEUTRAL_PIECE_TYPES,
  PLAYER_COLORS,
  PLAYER_PIECE_TYPES,
} from '../../src/game/pieces.js';

describe('getActivePlayers', () => {
  it('returns the first N colors with 1-based seats', () => {
    const players = getActivePlayers(4);
    expect(players).toHaveLength(4);
    expect(players.map((player) => player.id)).toEqual(
      PLAYER_COLORS.slice(0, 4).map((color) => color.id),
    );
    expect(players.map((player) => player.seat)).toEqual([1, 2, 3, 4]);
  });

  it('supports up to the full color roster', () => {
    expect(getActivePlayers(PLAYER_COLORS.length)).toHaveLength(PLAYER_COLORS.length);
    expect(getActivePlayers(2)).toHaveLength(2);
  });
});

describe('createPlayerInventories', () => {
  it('starts at piece maxima with no placements', () => {
    const players = getActivePlayers(3);
    const inventories = createPlayerInventories(players, {
      roads: [],
      settlements: [],
      cities: [],
    });

    expect(inventories).toEqual(
      players.map((player) => ({
        playerId: player.id,
        road: PLAYER_PIECE_TYPES.road.maxPerPlayer,
        settlement: PLAYER_PIECE_TYPES.settlement.maxPerPlayer,
        city: PLAYER_PIECE_TYPES.city.maxPerPlayer,
      })),
    );
  });

  it('subtracts placed pieces per player', () => {
    const players = getActivePlayers(2);
    const [p1, p2] = players;
    const inventories = createPlayerInventories(players, {
      roads: [
        { playerId: p1.id, edgeId: 'e1' },
        { playerId: p1.id, edgeId: 'e2' },
        { playerId: p2.id, edgeId: 'e3' },
      ],
      settlements: [
        { playerId: p1.id, vertexId: 'v1' },
        { playerId: p2.id, vertexId: 'v2' },
      ],
      cities: [{ playerId: p1.id, vertexId: 'v3' }],
    });

    expect(inventories.find((item) => item.playerId === p1.id)).toEqual({
      playerId: p1.id,
      road: PLAYER_PIECE_TYPES.road.maxPerPlayer - 2,
      settlement: PLAYER_PIECE_TYPES.settlement.maxPerPlayer - 1,
      city: PLAYER_PIECE_TYPES.city.maxPerPlayer - 1,
    });
    expect(inventories.find((item) => item.playerId === p2.id)).toEqual({
      playerId: p2.id,
      road: PLAYER_PIECE_TYPES.road.maxPerPlayer - 1,
      settlement: PLAYER_PIECE_TYPES.settlement.maxPerPlayer - 1,
      city: PLAYER_PIECE_TYPES.city.maxPerPlayer,
    });
  });

  it('treats missing cities array as zero cities placed', () => {
    const players = getActivePlayers(1);
    const inventories = createPlayerInventories(players, {
      roads: [],
      settlements: [],
    });
    expect(inventories[0].city).toBe(PLAYER_PIECE_TYPES.city.maxPerPlayer);
  });
});

describe('piece catalogs', () => {
  it('defines robber as a neutral desert piece', () => {
    expect(NEUTRAL_PIECE_TYPES.robber.startsOnTerrain).toBe('desert');
    expect(NEUTRAL_PIECE_TYPES.robber.blocksProduction).toBe(true);
  });

  it('matches base-game piece limits', () => {
    expect(PLAYER_PIECE_TYPES.road.maxPerPlayer).toBe(15);
    expect(PLAYER_PIECE_TYPES.settlement.maxPerPlayer).toBe(5);
    expect(PLAYER_PIECE_TYPES.city.maxPerPlayer).toBe(4);
  });
});
