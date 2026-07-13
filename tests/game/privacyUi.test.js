/**
 * M8 UI privacy audit helpers — pure adapters / contracts (no React mount).
 *
 * Run: npx vitest run tests/game/privacyUi.test.js
 */
import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../../src/rules/index.js';
import { resourceHandsFromGame } from '../../src/game/rulesAdapter.js';
import { completeSetup, giveResources, newGame, player } from '../rules/fixtures.js';
import { getActivePlayers } from '../../src/game/pieces.js';

describe('resourceHandsFromGame privacy', () => {
  it('embeds resource types only for the viewer seat when a playerView is supplied', () => {
    let game = completeSetup(newGame());
    game = giveResources(game, 'p1', { wood: 2 });
    game = giveResources(game, 'p2', { ore: 3 });
    const view = getPlayerView(game, 'p1');
    const players = getActivePlayers(3).map((item, index) => ({
      ...item,
      id: ['p1', 'p2', 'p3'][index],
    }));

    // Map fixture ids to active player list used by the board UI
    const seatPlayers = game.players.map((item) => ({ id: item.id, name: item.name }));
    const hands = resourceHandsFromGame(game, seatPlayers, view);

    const p1 = hands.find((hand) => hand.playerId === 'p1');
    const p2 = hands.find((hand) => hand.playerId === 'p2');

    const p2View = view.players.find((item) => item.id === 'p2');
    expect(p1.cards.some((card) => card.resource === 'wood')).toBe(true);
    expect(p2.cards.every((card) => card.resource === null)).toBe(true);
    expect(p2.cards).toHaveLength(p2View.resourceCount);
    expect(JSON.stringify(p2)).not.toContain('ore');
  });
});

describe('getPlayerView multiplayer wire contract', () => {
  it('never includes opponent resource keys or dev card types in JSON for a seat', () => {
    let game = completeSetup(newGame());
    game = structuredClone(game);
    player(game, 'p2').developmentCards = [{ type: 'monopoly', boughtTurn: 0 }];
    player(game, 'p2').resources.ore = 4;

    const wire = JSON.stringify(getPlayerView(game, 'p1'));
    expect(wire).not.toContain('monopoly');
    // Opponent ore count must not appear as a typed resource field for p2
    expect(wire).not.toMatch(/"id":"p2"[^}]*"ore":/);
    expect(wire).toContain('"developmentCards":null');
  });
});
