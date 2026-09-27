import { describe, expect, it } from 'vitest';
import { createRandomBoard } from '../../src/game/board.js';
import { BOT_STEP_MAX_MS, BOT_STEP_MIN_MS, getBotAction, getBotDelay, getBotTradeResponse } from '../../src/game/bots.js';
import { getActivePlayers } from '../../src/game/pieces.js';
import { createBoardPorts, createRulesBoard } from '../../src/game/rulesAdapter.js';
import { createBoardTopology } from '../../src/game/topology.js';
import { applyAction, createGame } from '../../src/rules/index.js';

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function createBotGame(playerCount = 4, seed = 2024) {
  const board = createRandomBoard(seed);
  const topology = createBoardTopology(board.hexes);
  const players = getActivePlayers(playerCount).map((player) => ({ ...player, name: player.label }));
  const game = createGame({ board: createRulesBoard(board, topology, createBoardPorts(topology, board.seed)), players });
  return { board, topology, game, playerIds: players.map((player) => player.id) };
}

describe('test bots', () => {
  it('waits between 0.5 and 1 second before acting', () => {
    const random = seededRandom(7);
    for (let index = 0; index < 50; index += 1) {
      const delay = getBotDelay(random);
      expect(delay).toBeGreaterThanOrEqual(BOT_STEP_MIN_MS);
      expect(delay).toBeLessThanOrEqual(BOT_STEP_MAX_MS);
    }
  });

  it('does nothing on a human turn', () => {
    const { board, topology, game, playerIds } = createBotGame();
    const botPlayerIds = new Set(playerIds.slice(1));
    expect(game.currentPlayerId).toBe(playerIds[0]);
    expect(getBotAction({ game, topology, board, botPlayerIds })).toBeNull();
  });

  it('plays only legal random moves, never builds or trades, and never stalls', () => {
    const { board, topology, playerIds } = createBotGame();
    let { game } = createBotGame();
    const botPlayerIds = new Set(playerIds);
    const random = seededRandom(99);
    const seenTypes = new Set();

    for (let step = 0; step < 400 && game.phase !== 'gameOver'; step += 1) {
      const action = getBotAction({ game, topology, board, botPlayerIds, random });
      expect(action, `bot stalled in ${game.phase}`).not.toBeNull();
      seenTypes.add(action.type);
      game = applyAction(game, action, { random });
    }

    expect(game.phase).not.toBe('setup');
    expect([...seenTypes].every((type) => [
      'placeSettlement', 'placeRoad', 'rollDice', 'discard', 'moveRobber', 'endTurn',
    ].includes(type))).toBe(true);
    expect(seenTypes).toContain('moveRobber');
    // Each player has exactly the two setup settlements and roads: bots never build.
    game.players.forEach((player) => {
      expect(player.pieces.settlements).toBe(3);
      expect(player.pieces.roads).toBe(13);
      expect(player.developmentCards).toHaveLength(0);
    });
  });

  it('answers trade offers automatically: accept when affordable, otherwise decline', () => {
    const { board, topology, playerIds } = createBotGame();
    let { game } = createBotGame();
    const random = seededRandom(5);
    const allBots = new Set(playerIds);
    while (game.phase === 'setup') game = applyAction(game, getBotAction({ game, topology, board, botPlayerIds: allBots, random }));
    game = applyAction(game, { type: 'rollDice', playerId: 'red', dice: [1, 1] });
    game = structuredClone(game);
    game.players.find((player) => player.id === 'blue').resources.brick = 0;
    game.players.find((player) => player.id === 'white').resources.brick = 3;
    game = applyAction(game, {
      type: 'offerTrade', playerId: 'red', toPlayerIds: ['white', 'blue'], give: { wood: 1 }, receive: { brick: 2 },
    });
    const botPlayerIds = new Set(['blue', 'white', 'orange']);

    const first = getBotTradeResponse(game, botPlayerIds);
    expect(first).toEqual({ type: 'rejectTrade', playerId: 'blue' });
    game = applyAction(game, first);
    const second = getBotAction({ game, topology, board, botPlayerIds });
    expect(second).toEqual({ type: 'acceptTrade', playerId: 'white' });
    game = applyAction(game, second);
    expect(game.tradeOffer).toBeNull();
    expect(game.lastTrade).toMatchObject({ type: 'accepted', toPlayerId: 'white', responses: { blue: 'declined', white: 'accepted' } });
    // Nothing left to answer, and it is still the human's turn.
    expect(getBotAction({ game, topology, board, botPlayerIds })).toBeNull();
  });
});
