/**
 * Player-view sanitization (M8 privacy boundary).
 *
 * Run:  npx vitest run tests/rules/playerView.test.js
 * See tests/README.md
 */
import { describe, expect, it } from 'vitest';
import {
  getPlayerView,
  isPlayerView,
  privateVictoryPoints,
  publicVictoryPoints,
} from '../../src/rules/index.js';
import { completeSetup, giveResources, newGame, player, setPhase } from './fixtures.js';

function seedPrivateHands(game) {
  let state = completeSetup(game);
  state = structuredClone(state);
  // p1 (viewer): mixed hand + a hidden VP card
  player(state, 'p1').resources = { wood: 2, brick: 1, ore: 0, hay: 0, sheep: 1 };
  player(state, 'p1').developmentCards = [
    { type: 'knight', boughtTurn: 0 },
    { type: 'victoryPoint', boughtTurn: 0 },
  ];
  // p2: different hand + monopoly (must stay secret)
  player(state, 'p2').resources = { wood: 0, brick: 0, ore: 3, hay: 2, sheep: 0 };
  player(state, 'p2').developmentCards = [{ type: 'monopoly', boughtTurn: 0 }];
  // p3: empty-ish
  player(state, 'p3').resources = { wood: 1, brick: 0, ore: 0, hay: 0, sheep: 0 };
  player(state, 'p3').developmentCards = [];
  state.developmentDeck = ['knight', 'yearOfPlenty', 'victoryPoint'];
  return state;
}

describe('publicVictoryPoints / privateVictoryPoints', () => {
  it('excludes victory-point cards from public totals', () => {
    const state = seedPrivateHands(newGame());
    // After setup each player has 2 settlements = 2 public VP
    expect(publicVictoryPoints(state, 'p1')).toBe(2);
    expect(privateVictoryPoints(state, 'p1')).toBe(3); // +1 VP card
    expect(publicVictoryPoints(state, 'p2')).toBe(2);
    expect(privateVictoryPoints(state, 'p2')).toBe(2);
  });
});

describe('getPlayerView', () => {
  it('requires a known viewer id', () => {
    const game = newGame();
    expect(() => getPlayerView(null, 'p1')).toThrow(/Game state is required/);
    expect(() => getPlayerView(game, 'unknown')).toThrow(/Unknown viewer/);
  });

  it('does not mutate the authoritative engine state', () => {
    const game = seedPrivateHands(newGame());
    const snapshot = structuredClone(game);
    getPlayerView(game, 'p1');
    expect(game).toEqual(snapshot);
  });

  it('exposes the viewer hand fully and redacts opponents', () => {
    const game = seedPrivateHands(newGame());
    const view = getPlayerView(game, 'p1');

    expect(isPlayerView(view)).toBe(true);
    expect(view.viewerId).toBe('p1');

    const self = view.players.find((p) => p.id === 'p1');
    const opponent = view.players.find((p) => p.id === 'p2');
    const other = view.players.find((p) => p.id === 'p3');

    expect(self.isSelf).toBe(true);
    expect(self.resources).toEqual({ wood: 2, brick: 1, ore: 0, hay: 0, sheep: 1 });
    expect(self.resourceCount).toBe(4);
    expect(self.developmentCards).toEqual([
      { type: 'knight', boughtTurn: 0 },
      { type: 'victoryPoint', boughtTurn: 0 },
    ]);
    expect(self.developmentCardCount).toBe(2);
    expect(self.publicVictoryPoints).toBe(2);
    expect(self.privateVictoryPoints).toBe(3);

    expect(opponent.isSelf).toBe(false);
    expect(opponent.resources).toBeNull();
    expect(opponent.resourceCount).toBe(5);
    expect(opponent.developmentCards).toBeNull();
    expect(opponent.developmentCardCount).toBe(1);
    expect(opponent.publicVictoryPoints).toBe(2);
    expect(opponent.privateVictoryPoints).toBeNull();
    // Must not leak monopoly type anywhere on the opponent object
    expect(JSON.stringify(opponent)).not.toContain('monopoly');

    expect(other.resourceCount).toBe(1);
    expect(other.developmentCardCount).toBe(0);
  });

  it('never exposes development deck contents, only remaining count', () => {
    const game = seedPrivateHands(newGame());
    const view = getPlayerView(game, 'p2');

    expect(view.developmentDeck).toBeNull();
    expect(view.developmentDeckCount).toBe(3);
    expect(JSON.stringify(view)).not.toContain('yearOfPlenty');
    // Opponent must not see p1's victoryPoint card type
    expect(JSON.stringify(view.players.find((p) => p.id === 'p1'))).not.toContain('victoryPoint');
    expect(JSON.stringify(view.players.find((p) => p.id === 'p1'))).not.toContain('knight');
  });

  it('keeps public board, bank, phase, and awards visible to all viewers', () => {
    let game = seedPrivateHands(newGame());
    game = setPhase(game, 'action', 'p1');
    game = structuredClone(game);
    game.longestRoadPlayerId = 'p2';
    game.largestArmyPlayerId = 'p3';
    game.dice = [3, 4];
    game.bank.wood = 12;

    const view = getPlayerView(game, 'p1');
    expect(view.phase).toBe('action');
    expect(view.currentPlayerId).toBe('p1');
    expect(view.dice).toEqual([3, 4]);
    expect(view.bank.wood).toBe(12);
    expect(view.board.robberTileId).toBe('t-desert');
    expect(view.board.intersections.v0.building).toBeTruthy();
    expect(view.longestRoadPlayerId).toBe('p2');
    expect(view.largestArmyPlayerId).toBe('p3');
    expect(view.players.find((p) => p.id === 'p2').publicVictoryPoints).toBe(4); // 2 settlements + LR
  });

  it('preserves pending discard counts without exposing hands', () => {
    let game = completeSetup(newGame());
    game = giveResources(game, 'p2', { wood: 4, brick: 4 });
    game = structuredClone(game);
    game.phase = 'discard';
    game.pendingDiscards = { p2: 5 };

    const view = getPlayerView(game, 'p1');
    expect(view.pendingDiscards).toEqual({ p2: 5 });
    expect(view.players.find((p) => p.id === 'p2').resources).toBeNull();
    expect(view.players.find((p) => p.id === 'p2').resourceCount).toBeGreaterThan(7);
  });

  it('hides stolen resource details from non-participants when lastRobbery is present', () => {
    const game = seedPrivateHands(newGame());
    const withRobbery = structuredClone(game);
    withRobbery.lastRobbery = {
      thiefId: 'p1',
      victimId: 'p2',
      resource: 'ore',
    };

    const thiefView = getPlayerView(withRobbery, 'p1');
    expect(thiefView.lastRobbery.resource).toBe('ore');

    const victimView = getPlayerView(withRobbery, 'p2');
    expect(victimView.lastRobbery.resource).toBe('ore');

    const bystanderView = getPlayerView(withRobbery, 'p3');
    expect(bystanderView.lastRobbery.resource).toBeNull();
    expect(bystanderView.lastRobbery.hidden).toBe(true);
    expect(JSON.stringify(bystanderView.lastRobbery)).not.toMatch(/"ore"/);
  });

  it('redacts other players resource bundles in lastProduction when present', () => {
    const game = seedPrivateHands(newGame());
    const withProduction = structuredClone(game);
    withProduction.lastProduction = {
      total: 6,
      byPlayer: {
        p1: { wood: 1, brick: 0, ore: 0, hay: 0, sheep: 0 },
        p2: { wood: 0, brick: 2, ore: 0, hay: 0, sheep: 0 },
      },
    };

    const view = getPlayerView(withProduction, 'p1');
    expect(view.lastProduction.byPlayer.p1).toEqual({ wood: 1, brick: 0, ore: 0, hay: 0, sheep: 0 });
    expect(view.lastProduction.byPlayer.p2).toEqual({ hiddenCount: 2 });
    expect(JSON.stringify(view.lastProduction.byPlayer.p2)).not.toContain('brick');
  });
});
