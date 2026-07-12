import { describe, expect, it } from 'vitest';
import {
  hasWon,
  longestRoadLength,
  recalculateAwards,
  visibleVictoryPoints,
} from '../../src/rules/index.js';
import { buildFixtureBoard, THREE_PLAYERS } from './fixtures.js';

function baseState(boardOverrides = (board) => board) {
  const board = boardOverrides(buildFixtureBoard());
  return {
    currentPlayerId: 'p1',
    players: THREE_PLAYERS.map((p) => ({
      ...p,
      resources: { wood: 0, brick: 0, ore: 0, hay: 0, sheep: 0 },
      developmentCards: [],
      playedKnights: 0,
    })),
    board,
    longestRoadPlayerId: null,
    largestArmyPlayerId: null,
  };
}

describe('longestRoadLength', () => {
  it('returns 0 with no roads', () => {
    const board = buildFixtureBoard();
    expect(longestRoadLength(board, 'p1')).toBe(0);
  });

  it('counts a continuous road chain', () => {
    const board = buildFixtureBoard();
    for (const id of ['e0', 'e1', 'e2', 'e3', 'e4']) {
      board.edges[id].road = 'p1';
    }
    expect(longestRoadLength(board, 'p1')).toBe(5);
  });

  it('cannot continue a path through an opponent building', () => {
    const board = buildFixtureBoard();
    for (const id of ['e0', 'e1', 'e2', 'e3', 'e4']) {
      board.edges[id].road = 'p1';
    }
    // Opponent at v2 splits e0–e1 from e2–e4. Paths may still start at v2,
    // so the longer free segment (e2–e4) is length 3.
    board.intersections.v2.building = { type: 'settlement', playerId: 'p2' };
    expect(longestRoadLength(board, 'p1')).toBe(3);
    expect(longestRoadLength(board, 'p1')).toBeLessThan(5);
  });
});


describe('recalculateAwards', () => {
  it('awards longest road at length 5 with a sole leader', () => {
    const state = baseState((board) => {
      for (const id of ['e0', 'e1', 'e2', 'e3', 'e4']) board.edges[id].road = 'p1';
      return board;
    });
    recalculateAwards(state);
    expect(state.longestRoadPlayerId).toBe('p1');
  });

  it('does not award longest road below length 5', () => {
    const state = baseState((board) => {
      for (const id of ['e0', 'e1', 'e2', 'e3']) board.edges[id].road = 'p1';
      return board;
    });
    recalculateAwards(state);
    expect(state.longestRoadPlayerId).toBeNull();
  });

  it('keeps longest road on a tie if the holder is still a leader', () => {
    // Engine only clears the award when the current holder is no longer among max leaders.
    const state = baseState((board) => {
      for (const id of ['e0', 'e1', 'e2', 'e3', 'e4']) board.edges[id].road = 'p1';
      for (const id of ['e10', 'e11', 'e12', 'e13', 'e14']) board.edges[id].road = 'p2';
      return board;
    });
    state.longestRoadPlayerId = 'p1';
    recalculateAwards(state);
    expect(state.longestRoadPlayerId).toBe('p1');
  });

  it('clears longest road when the holder is no longer a leader', () => {
    const state = baseState((board) => {
      for (const id of ['e0', 'e1', 'e2', 'e3', 'e4']) board.edges[id].road = 'p1';
      for (const id of ['e9', 'e10', 'e11', 'e12', 'e13', 'e14']) board.edges[id].road = 'p2';
      return board;
    });
    state.longestRoadPlayerId = 'p1';
    recalculateAwards(state);
    expect(state.longestRoadPlayerId).toBe('p2');
  });


  it('awards largest army at 3 knights with a sole leader', () => {
    const state = baseState();
    state.players[0].playedKnights = 3;
    recalculateAwards(state);
    expect(state.largestArmyPlayerId).toBe('p1');
  });

  it('does not award largest army below 3 knights', () => {
    const state = baseState();
    state.players[0].playedKnights = 2;
    recalculateAwards(state);
    expect(state.largestArmyPlayerId).toBeNull();
  });
});

describe('visibleVictoryPoints / hasWon', () => {
  it('scores settlements as 1 and cities as 2', () => {
    const state = baseState((board) => {
      board.intersections.v0.building = { type: 'settlement', playerId: 'p1' };
      board.intersections.v4.building = { type: 'city', playerId: 'p1' };
      return board;
    });
    expect(visibleVictoryPoints(state, 'p1')).toBe(3);
  });

  it('includes longest road, largest army, and VP cards', () => {
    const state = baseState((board) => {
      board.intersections.v0.building = { type: 'settlement', playerId: 'p1' };
      return board;
    });
    state.longestRoadPlayerId = 'p1';
    state.largestArmyPlayerId = 'p1';
    state.players[0].developmentCards = [
      { type: 'victoryPoint', boughtTurn: 0 },
      { type: 'victoryPoint', boughtTurn: 0 },
    ];
    // 1 settlement + 2 LR + 2 LA + 2 VP cards = 7
    expect(visibleVictoryPoints(state, 'p1')).toBe(7);
  });

  it('wins only on own turn at 10+ points', () => {
    const state = baseState((board) => {
      // 5 cities = 10 VP
      for (const id of ['v0', 'v2', 'v4', 'v6', 'v8']) {
        board.intersections[id].building = { type: 'city', playerId: 'p1' };
      }
      return board;
    });
    state.currentPlayerId = 'p1';
    expect(hasWon(state, 'p1')).toBe(true);

    state.currentPlayerId = 'p2';
    expect(hasWon(state, 'p1')).toBe(false);
  });

  it('does not win below 10 points', () => {
    const state = baseState((board) => {
      board.intersections.v0.building = { type: 'city', playerId: 'p1' };
      board.intersections.v2.building = { type: 'city', playerId: 'p1' };
      board.intersections.v4.building = { type: 'city', playerId: 'p1' };
      board.intersections.v6.building = { type: 'settlement', playerId: 'p1' };
      return board;
    });
    // 2+2+2+1 = 7
    state.currentPlayerId = 'p1';
    expect(visibleVictoryPoints(state, 'p1')).toBe(7);
    expect(hasWon(state, 'p1')).toBe(false);
  });
});
