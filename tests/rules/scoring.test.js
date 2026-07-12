/**
 * Focused engine scoring tests (M7): branching/loops/blocking, award transfers, hidden VP.
 *
 * Run:  npx vitest run tests/rules/scoring.test.js
 */
import { describe, expect, it } from 'vitest';
import {
  getScoreBreakdown,
  hasWon,
  longestRoadLength,
  publicVictoryPoints,
  recalculateAwards,
  victoryPointCardCount,
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

/** Add a chord edge so the path board can form branches and loops. */
function withExtraEdge(board, id, a, b) {
  board.edges[id] = { id, intersections: [a, b], road: null };
  return board;
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

  it('uses the longest branch rather than summing all branches', () => {
    const board = withExtraEdge(buildFixtureBoard(), 'e-branch', 'v2', 'v10');
    // Connected Y: e0–e4, e-branch, e10–e12. Longest trail is
    // e4–e3–e2–e-branch–e10–e11–e12 (7), not the sum of every edge.
    for (const id of ['e0', 'e1', 'e2', 'e3', 'e4', 'e-branch', 'e10', 'e11', 'e12']) {
      board.edges[id].road = 'p1';
    }
    expect(longestRoadLength(board, 'p1')).toBe(7);
    expect(longestRoadLength(board, 'p1')).toBeLessThan(9);
  });

  it('counts a closed loop using each edge at most once', () => {
    const board = withExtraEdge(buildFixtureBoard(), 'e-chord', 'v0', 'v3');
    // Triangle-ish path v0-e0-v1-e1-v2-e2-v3-e-chord-v0 → 4 edges
    for (const id of ['e0', 'e1', 'e2', 'e-chord']) {
      board.edges[id].road = 'p1';
    }
    expect(longestRoadLength(board, 'p1')).toBe(4);
  });

  it('takes the longer of two disconnected road segments', () => {
    const board = buildFixtureBoard();
    for (const id of ['e0', 'e1']) board.edges[id].road = 'p1'; // length 2
    for (const id of ['e10', 'e11', 'e12', 'e13']) board.edges[id].road = 'p1'; // length 4
    expect(longestRoadLength(board, 'p1')).toBe(4);
  });

  it('blocks a continuous chain when an opponent city sits mid-path', () => {
    const board = buildFixtureBoard();
    for (const id of ['e0', 'e1', 'e2', 'e3', 'e4', 'e5']) {
      board.edges[id].road = 'p1';
    }
    board.intersections.v3.building = { type: 'city', playerId: 'p2' };
    // Segments: e0–e2 (3 edges via starts) and e3–e5 (3). Max 3.
    expect(longestRoadLength(board, 'p1')).toBe(3);
  });

  it('does not count opponent roads as part of the chain', () => {
    const board = buildFixtureBoard();
    for (const id of ['e0', 'e1', 'e2']) board.edges[id].road = 'p1';
    board.edges.e3.road = 'p2';
    board.edges.e4.road = 'p1';
    expect(longestRoadLength(board, 'p1')).toBe(3);
  });
});

describe('recalculateAwards — longest road transfers', () => {
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
    const state = baseState((board) => {
      for (const id of ['e0', 'e1', 'e2', 'e3', 'e4']) board.edges[id].road = 'p1';
      for (const id of ['e10', 'e11', 'e12', 'e13', 'e14']) board.edges[id].road = 'p2';
      return board;
    });
    state.longestRoadPlayerId = 'p1';
    recalculateAwards(state);
    expect(state.longestRoadPlayerId).toBe('p1');
  });

  it('transfers longest road when another player strictly exceeds the holder', () => {
    const state = baseState((board) => {
      for (const id of ['e0', 'e1', 'e2', 'e3', 'e4']) board.edges[id].road = 'p1'; // 5
      for (const id of ['e8', 'e9', 'e10', 'e11', 'e12', 'e13']) board.edges[id].road = 'p2'; // 6
      return board;
    });
    state.longestRoadPlayerId = 'p1';
    recalculateAwards(state);
    expect(state.longestRoadPlayerId).toBe('p2');
    expect(longestRoadLength(state.board, 'p2')).toBe(6);
  });

  it('clears longest road when the holder is broken by a block and no sole leader remains', () => {
    const state = baseState((board) => {
      for (const id of ['e0', 'e1', 'e2', 'e3', 'e4']) board.edges[id].road = 'p1';
      return board;
    });
    state.longestRoadPlayerId = 'p1';
    // Block splits p1 under 5; p2 has nothing.
    state.board.intersections.v2.building = { type: 'settlement', playerId: 'p2' };
    recalculateAwards(state);
    expect(longestRoadLength(state.board, 'p1')).toBeLessThan(5);
    expect(state.longestRoadPlayerId).toBeNull();
  });
});

describe('recalculateAwards — largest army transfers', () => {
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

  it('transfers largest army when another player plays more knights', () => {
    const state = baseState();
    state.players[0].playedKnights = 3;
    state.largestArmyPlayerId = 'p1';
    recalculateAwards(state);
    expect(state.largestArmyPlayerId).toBe('p1');

    state.players[1].playedKnights = 4;
    recalculateAwards(state);
    expect(state.largestArmyPlayerId).toBe('p2');
  });

  it('keeps largest army on a tie if the holder is still tied for the lead', () => {
    const state = baseState();
    state.players[0].playedKnights = 3;
    state.players[1].playedKnights = 3;
    state.largestArmyPlayerId = 'p1';
    recalculateAwards(state);
    expect(state.largestArmyPlayerId).toBe('p1');
  });

  it('clears largest army when the holder is no longer among leaders', () => {
    const state = baseState();
    state.players[0].playedKnights = 3;
    state.largestArmyPlayerId = 'p1';
    state.players[0].playedKnights = 2;
    state.players[1].playedKnights = 3;
    recalculateAwards(state);
    expect(state.largestArmyPlayerId).toBe('p2');
  });
});

describe('score breakdown and hidden victory points', () => {
  it('scores settlements as 1 and cities as 2', () => {
    const state = baseState((board) => {
      board.intersections.v0.building = { type: 'settlement', playerId: 'p1' };
      board.intersections.v4.building = { type: 'city', playerId: 'p1' };
      return board;
    });
    expect(visibleVictoryPoints(state, 'p1')).toBe(3);
    expect(getScoreBreakdown(state, 'p1')).toMatchObject({
      settlements: 1,
      cities: 1,
      settlementPoints: 1,
      cityPoints: 2,
      publicTotal: 3,
      privateTotal: 3,
      victoryPointCards: 0,
    });
  });

  it('keeps victory-point cards out of public totals but in private totals', () => {
    const state = baseState((board) => {
      board.intersections.v0.building = { type: 'settlement', playerId: 'p1' };
      return board;
    });
    state.longestRoadPlayerId = 'p1';
    state.largestArmyPlayerId = 'p1';
    state.players[0].developmentCards = [
      { type: 'victoryPoint', boughtTurn: 0 },
      { type: 'victoryPoint', boughtTurn: 0 },
      { type: 'knight', boughtTurn: 0 },
    ];

    // 1 settlement + 2 LR + 2 LA = 5 public; +2 VP cards = 7 private
    expect(publicVictoryPoints(state, 'p1')).toBe(5);
    expect(visibleVictoryPoints(state, 'p1')).toBe(7);
    expect(victoryPointCardCount(state, 'p1')).toBe(2);
    expect(getScoreBreakdown(state, 'p1')).toMatchObject({
      publicTotal: 5,
      privateTotal: 7,
      victoryPointCards: 2,
      longestRoad: 2,
      largestArmy: 2,
    });
  });

  it('does not credit opponents for another players victory-point cards', () => {
    const state = baseState((board) => {
      board.intersections.v0.building = { type: 'settlement', playerId: 'p1' };
      board.intersections.v4.building = { type: 'settlement', playerId: 'p2' };
      return board;
    });
    state.players[0].developmentCards = [{ type: 'victoryPoint', boughtTurn: 0 }];
    expect(publicVictoryPoints(state, 'p1')).toBe(1);
    expect(visibleVictoryPoints(state, 'p1')).toBe(2);
    expect(publicVictoryPoints(state, 'p2')).toBe(1);
    expect(visibleVictoryPoints(state, 'p2')).toBe(1);
  });

  it('wins only on own turn at 10+ points including hidden VP cards', () => {
    const state = baseState((board) => {
      // 4 cities = 8 public + 2 VP cards = 10 private
      for (const id of ['v0', 'v2', 'v4', 'v6']) {
        board.intersections[id].building = { type: 'city', playerId: 'p1' };
      }
      return board;
    });
    state.players[0].developmentCards = [
      { type: 'victoryPoint', boughtTurn: 0 },
      { type: 'victoryPoint', boughtTurn: 0 },
    ];
    state.currentPlayerId = 'p1';
    expect(publicVictoryPoints(state, 'p1')).toBe(8);
    expect(visibleVictoryPoints(state, 'p1')).toBe(10);
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

  it('reports road length on the score breakdown for award UI', () => {
    const state = baseState((board) => {
      for (const id of ['e0', 'e1', 'e2', 'e3', 'e4']) board.edges[id].road = 'p1';
      return board;
    });
    recalculateAwards(state);
    const breakdown = getScoreBreakdown(state, 'p1');
    expect(breakdown.longestRoadLength).toBe(5);
    expect(breakdown.longestRoad).toBe(2);
  });
});
