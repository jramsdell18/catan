import { describe, expect, it, vi } from 'vitest';
import { getActivePlayers } from '../../src/game/pieces.js';
import {
  createSetupOrder,
  getCurrentSetupTurn,
  getSetupProgress,
  pickRandomStartingSeat,
} from '../../src/game/setupFlow.js';

describe('createSetupOrder', () => {
  it('builds a 3-player snake: clockwise then reverse', () => {
    const players = getActivePlayers(3);
    const order = createSetupOrder(players, 1);

    expect(order).toHaveLength(6);
    expect(order.map((turn) => turn.seat)).toEqual([1, 2, 3, 3, 2, 1]);
    expect(order.map((turn) => turn.round)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(order.map((turn) => turn.id)).toEqual([
      'setup-turn-1',
      'setup-turn-2',
      'setup-turn-3',
      'setup-turn-4',
      'setup-turn-5',
      'setup-turn-6',
    ]);
  });

  it('rotates the snake when a later seat starts', () => {
    const players = getActivePlayers(4);
    const order = createSetupOrder(players, 3);

    // clockwise from seat 3: 3,4,1,2 then reverse 2,1,4,3
    expect(order.map((turn) => turn.seat)).toEqual([3, 4, 1, 2, 2, 1, 4, 3]);
    expect(order).toHaveLength(8);
    expect(order.filter((turn) => turn.round === 1)).toHaveLength(4);
    expect(order.filter((turn) => turn.round === 2)).toHaveLength(4);
  });

  it('keeps player ids aligned with seats', () => {
    const players = getActivePlayers(3);
    const order = createSetupOrder(players, 2);
    for (const turn of order) {
      const player = players.find((item) => item.seat === turn.seat);
      expect(turn.playerId).toBe(player.id);
    }
  });
});

describe('pickRandomStartingSeat', () => {
  it('returns a seat from the provided players', () => {
    const players = getActivePlayers(4);
    const seat = pickRandomStartingSeat(players);
    expect(players.map((player) => player.seat)).toContain(seat);
  });

  it('uses Math.random for selection', () => {
    const players = getActivePlayers(3);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(pickRandomStartingSeat(players)).toBe(3);
    Math.random.mockRestore();
  });
});

describe('getCurrentSetupTurn', () => {
  it('returns null when setup is missing or not placing', () => {
    expect(getCurrentSetupTurn(null)).toBeNull();
    expect(getCurrentSetupTurn({ status: 'complete', order: [], turnIndex: 0 })).toBeNull();
  });

  it('returns the turn at turnIndex while placing', () => {
    const players = getActivePlayers(3);
    const order = createSetupOrder(players, 1);
    const setup = { status: 'placing', order, turnIndex: 2 };
    expect(getCurrentSetupTurn(setup)).toEqual(order[2]);
  });
});

describe('getSetupProgress', () => {
  it('returns null without setup state', () => {
    expect(getSetupProgress(null)).toBeNull();
  });

  it('reports progress counts and completion flag', () => {
    const players = getActivePlayers(3);
    const order = createSetupOrder(players, 1);

    expect(
      getSetupProgress({ status: 'placing', order, turnIndex: 2 }),
    ).toEqual({
      completedTurns: 2,
      totalTurns: 6,
      isComplete: false,
    });

    expect(
      getSetupProgress({ status: 'complete', order, turnIndex: 6 }),
    ).toEqual({
      completedTurns: 6,
      totalTurns: 6,
      isComplete: true,
    });
  });
});
