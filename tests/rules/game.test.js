import { describe, expect, it } from 'vitest';
import { applyAction, createGame, DEVELOPMENT_DECK } from '../../src/rules/index.js';
import {
  FOUR_PLAYERS,
  THREE_PLAYERS,
  buildFixtureBoard,
  completeSetup,
  fixedRandom,
  giveResources,
  newGame,
  player,
  setPhase,
} from './fixtures.js';

describe('createGame', () => {
  it('starts in setup with empty hands and full banks', () => {
    const game = newGame();
    expect(game.phase).toBe('setup');
    expect(game.currentPlayerId).toBe('p1');
    expect(game.players).toHaveLength(3);
    expect(game.bank).toEqual({ wood: 19, brick: 19, ore: 19, hay: 19, sheep: 19 });
    expect(game.developmentDeck).toHaveLength(DEVELOPMENT_DECK.length);
    expect(player(game, 'p1').pieces).toEqual({ roads: 15, settlements: 5, cities: 4 });
  });

  it('rejects fewer than 3 or more than 4 players', () => {
    const board = buildFixtureBoard();
    expect(() => createGame({ board, players: THREE_PLAYERS.slice(0, 2) })).toThrow(/3–4/);
    expect(() =>
      createGame({
        board,
        players: [...FOUR_PLAYERS, { id: 'p5', name: 'X', color: 'green' }],
      }),
    ).toThrow(/3–4/);
  });

  it('rejects duplicate player ids', () => {
    expect(() =>
      createGame({
        board: buildFixtureBoard(),
        players: [
          { id: 'p1', name: 'A', color: 'red' },
          { id: 'p1', name: 'B', color: 'blue' },
          { id: 'p3', name: 'C', color: 'white' },
        ],
      }),
    ).toThrow(/unique/);
  });
});

describe('applyAction contract', () => {
  it('requires an action type', () => {
    expect(() => applyAction(newGame(), {})).toThrow(/Action type is required/);
  });

  it('rejects unknown actions', () => {
    expect(() => applyAction(newGame(), { type: 'teleport', playerId: 'p1' })).toThrow(/Unknown action/);
  });

  it('does not mutate the previous state object', () => {
    const game = newGame();
    const snapshot = structuredClone(game);
    const next = applyAction(game, {
      type: 'placeSettlement',
      playerId: 'p1',
      intersectionId: 'v0',
    });
    expect(game).toEqual(snapshot);
    expect(next.board.intersections.v0.building).toEqual({ type: 'settlement', playerId: 'p1' });
    expect(game.board.intersections.v0.building).toBeNull();
  });

  it('appends to the action log', () => {
    const next = applyAction(newGame(), {
      type: 'placeSettlement',
      playerId: 'p1',
      intersectionId: 'v0',
    });
    expect(next.log).toEqual([{ type: 'placeSettlement', playerId: 'p1', turn: 0 }]);
  });
});

describe('setup phase', () => {
  it('places settlement then requires its road before another settlement', () => {
    let game = newGame();
    game = applyAction(game, { type: 'placeSettlement', playerId: 'p1', intersectionId: 'v0' });
    expect(game.setupSettlementId).toBe('v0');
    expect(game.board.intersections.v0.building).toEqual({ type: 'settlement', playerId: 'p1' });

    expect(() =>
      applyAction(game, { type: 'placeSettlement', playerId: 'p1', intersectionId: 'v4' }),
    ).toThrow(/setup road/);

    game = applyAction(game, { type: 'placeRoad', playerId: 'p1', edgeId: 'e0' });
    expect(game.board.edges.e0.road).toBe('p1');
    expect(game.currentPlayerId).toBe('p2');
    expect(game.setupSettlementId).toBeNull();
  });

  it('rejects road before settlement in setup', () => {
    expect(() =>
      applyAction(newGame(), { type: 'placeRoad', playerId: 'p1', edgeId: 'e0' }),
    ).toThrow(/Place a settlement before/);
  });

  it('rejects out-of-turn setup placement', () => {
    expect(() =>
      applyAction(newGame(), { type: 'placeSettlement', playerId: 'p2', intersectionId: 'v0' }),
    ).toThrow(/not this player/);
  });

  it('rejects distance-rule violations during setup', () => {
    let game = newGame();
    game = applyAction(game, { type: 'placeSettlement', playerId: 'p1', intersectionId: 'v0' });
    game = applyAction(game, { type: 'placeRoad', playerId: 'p1', edgeId: 'e0' });
    expect(() =>
      applyAction(game, { type: 'placeSettlement', playerId: 'p2', intersectionId: 'v1' }),
    ).toThrow(/distance/);
  });

  it('runs the 3-player setup snake and grants one of every resource', () => {
    const game = completeSetup(newGame(), 3);
    expect(game.phase).toBe('roll');
    expect(game.currentPlayerId).toBe('p1');

    const startingHand = { wood: 1, brick: 1, ore: 1, hay: 1, sheep: 1 };
    expect(player(game, 'p1').resources).toEqual(startingHand);
    expect(player(game, 'p2').resources).toEqual(startingHand);
    expect(player(game, 'p3').resources).toEqual(startingHand);
    expect(game.bank).toEqual({ wood: 16, brick: 16, ore: 16, hay: 16, sheep: 16 });
  });

  it('completes 4-player setup into roll phase', () => {
    const game = completeSetup(newGame(FOUR_PLAYERS), 4);
    expect(game.phase).toBe('roll');
    expect(game.currentPlayerId).toBe('p1');
    expect(game.players).toHaveLength(4);
    expect(player(game, 'p4').resources).toEqual({ wood: 1, brick: 1, ore: 1, hay: 1, sheep: 1 });
    expect(game.bank).toEqual({ wood: 15, brick: 15, ore: 15, hay: 15, sheep: 15 });
  });
});

describe('dice, production, robber, discard', () => {
  it('distributes production on a non-7 roll and enters action phase', () => {
    let game = completeSetup(newGame());
    // p1 owns settlement on v6 (fields-4 hay, mountains-5 ore) and v0
    game = applyAction(game, { type: 'rollDice', playerId: 'p1', dice: [1, 3] }); // total 4
    expect(game.phase).toBe('action');
    expect(game.dice).toEqual([1, 3]);
    expect(game.lastProduction.total).toBe(4);
    expect(game.lastProduction.tiles).toContainEqual(expect.objectContaining({
      tileId: 't-fields-4', resource: 'hay', distributed: true, blocked: false,
    }));
    expect(game.lastProduction.gains.p1.hay).toBe(1);
    expect(player(game, 'p1').resources.hay).toBe(
      player(completeSetup(newGame()), 'p1').resources.hay + 1,
    );
  });

  it('gives two resources to a city on production', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = giveResources(game, 'p1', { ore: 3, hay: 2 });
    const beforeCity = player(game, 'p1').resources.ore;
    game = applyAction(game, { type: 'buildCity', playerId: 'p1', intersectionId: 'v6' });
    expect(player(game, 'p1').resources.ore).toBe(beforeCity - 3);

    game = setPhase(game, 'roll', 'p1');
    const beforeRoll = player(game, 'p1').resources.ore;
    game = applyAction(game, { type: 'rollDice', playerId: 'p1', dice: [4, 1] }); // 5 → mountains ore
    expect(player(game, 'p1').resources.ore).toBe(beforeRoll + 2);
  });

  it('skips production on the robber tile', () => {
    let game = completeSetup(newGame());
    game = applyAction(game, { type: 'rollDice', playerId: 'p1', dice: [3, 4] }); // 7
    expect(game.phase).toBe('robber');
    // t-forest-6 touches p2@v2 who holds starting resources — must name a victim
    game = applyAction(
      game,
      { type: 'moveRobber', playerId: 'p1', tileId: 't-forest-6', victimId: 'p2' },
      { random: () => 0 },
    );
    expect(game.board.robberTileId).toBe('t-forest-6');
    expect(game.lastRobbery).toMatchObject({ tileId: 't-forest-6', victimId: 'p2' });

    const woodAfterRob = {
      p1: player(game, 'p1').resources.wood,
      p2: player(game, 'p2').resources.wood,
    };
    game = applyAction(game, { type: 'endTurn', playerId: 'p1' });
    game = applyAction(game, { type: 'rollDice', playerId: 'p2', dice: [1, 5] }); // 6
    // Robber blocks t-forest-6; wood totals must not rise from production
    expect(player(game, 'p1').resources.wood).toBe(woodAfterRob.p1);
    expect(player(game, 'p2').resources.wood).toBe(woodAfterRob.p2);
  });

  it('forces discards when a player has more than 7 cards on a 7', () => {
    let game = completeSetup(newGame());
    game = giveResources(game, 'p2', { wood: 4, brick: 4 }); // + setup cards
    const p2Total = Object.values(player(game, 'p2').resources).reduce((a, b) => a + b, 0);
    expect(p2Total).toBeGreaterThan(7);

    game = applyAction(game, { type: 'rollDice', playerId: 'p1', dice: [2, 5] }); // 7
    expect(game.phase).toBe('discard');
    expect(game.pendingDiscards.p2).toBe(Math.floor(p2Total / 2));

    const required = game.pendingDiscards.p2;
    const hand = player(game, 'p2').resources;
    // totalResources() sums every RESOURCE_TYPES key — partial maps become NaN.
    const discard = { wood: 0, brick: 0, ore: 0, hay: 0, sheep: 0 };
    let remaining = required;
    for (const resource of ['wood', 'brick', 'ore', 'hay', 'sheep']) {
      const take = Math.min(remaining, hand[resource]);
      discard[resource] = take;
      remaining -= take;
    }
    expect(remaining).toBe(0);

    game = applyAction(game, { type: 'discard', playerId: 'p2', resources: discard });
    expect(game.phase).toBe('robber');
    expect(game.pendingDiscards).toEqual({});
  });


  it('rejects invalid dice values', () => {
    const game = completeSetup(newGame());
    expect(() =>
      applyAction(game, { type: 'rollDice', playerId: 'p1', dice: [0, 6] }),
    ).toThrow(/Dice must contain/);
  });

  it('steals a random resource when robber targets a victim', () => {
    let game = completeSetup(newGame());
    game = giveResources(game, 'p2', { sheep: 1 });
    game = applyAction(game, { type: 'rollDice', playerId: 'p1', dice: [6, 1] }); // 7
    expect(game.phase).toBe('robber');

    const beforeP1 = { ...player(game, 'p1').resources };
    const beforeP2Total = Object.values(player(game, 'p2').resources).reduce((a, b) => a + b, 0);

    game = applyAction(
      game,
      { type: 'moveRobber', playerId: 'p1', tileId: 't-hills-8', victimId: 'p2' },
      { random: () => 0 }, // steal first card in flattened hand list
    );

    expect(game.phase).toBe('action');
    const afterP2Total = Object.values(player(game, 'p2').resources).reduce((a, b) => a + b, 0);
    expect(afterP2Total).toBe(beforeP2Total - 1);
    const stolen = Object.keys(beforeP1).find(
      (r) => player(game, 'p1').resources[r] === beforeP1[r] + 1,
    );
    expect(stolen).toBeTruthy();
    expect(game.lastRobbery.stolenResource).toBe(stolen);
  });

  it('reports production skipped by a bank shortage', () => {
    let game = completeSetup(newGame());
    game = structuredClone(game);
    game.bank.hay = 0;
    game = applyAction(game, { type: 'rollDice', playerId: 'p1', dice: [1, 3] });
    expect(game.lastProduction.tiles).toContainEqual(expect.objectContaining({
      tileId: 't-fields-4', resource: 'hay', distributed: false, shortage: true,
    }));
    expect(game.lastProduction.gains.p1?.hay).toBeUndefined();
  });


  it('requires choosing a victim when eligible players exist', () => {
    let game = completeSetup(newGame());
    game = giveResources(game, 'p2', { sheep: 1 });
    game = applyAction(game, { type: 'rollDice', playerId: 'p1', dice: [6, 1] });
    expect(() =>
      applyAction(game, { type: 'moveRobber', playerId: 'p1', tileId: 't-hills-8' }),
    ).toThrow(/eligible player/);
  });
});

describe('building during action phase', () => {
  it('builds a road when the player can afford it and is connected', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = giveResources(game, 'p1', { wood: 1, brick: 1 });
    const woodBefore = player(game, 'p1').resources.wood;
    const brickBefore = player(game, 'p1').resources.brick;
    // p1 setup road e6 touches v6; e5 extends that network
    game = applyAction(game, { type: 'placeRoad', playerId: 'p1', edgeId: 'e5' });
    expect(game.board.edges.e5.road).toBe('p1');
    expect(player(game, 'p1').resources.wood).toBe(woodBefore - 1);
    expect(player(game, 'p1').resources.brick).toBe(brickBefore - 1);
  });

  it('rejects unaffordable roads', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = structuredClone(game);
    player(game, 'p1').resources.wood = 0;
    player(game, 'p1').resources.brick = 0;
    expect(() =>
      applyAction(game, { type: 'placeRoad', playerId: 'p1', edgeId: 'e5' }),
    ).toThrow(/cannot afford/);
  });

  it('builds a settlement on a connected empty vertex and charges cost', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = giveResources(game, 'p1', { wood: 1, brick: 1, hay: 1, sheep: 1 });
    // Connect p1 to free vertex v10 (setup buildings leave v10 legal for distance)
    game = structuredClone(game);
    game.board.edges.e9.road = 'p1';
    game.board.edges.e10.road = 'p1';

    const before = { ...player(game, 'p1').resources };
    game = applyAction(game, { type: 'placeSettlement', playerId: 'p1', intersectionId: 'v10' });
    expect(game.board.intersections.v10.building).toEqual({ type: 'settlement', playerId: 'p1' });
    expect(player(game, 'p1').pieces.settlements).toBe(2); // 5 - 2 setup - 1 build
    expect(player(game, 'p1').resources.wood).toBe(before.wood - 1);
    expect(player(game, 'p1').resources.brick).toBe(before.brick - 1);
    expect(player(game, 'p1').resources.hay).toBe(before.hay - 1);
    expect(player(game, 'p1').resources.sheep).toBe(before.sheep - 1);
  });

  it('upgrades a settlement to a city', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = giveResources(game, 'p1', { ore: 3, hay: 2 });
    game = applyAction(game, { type: 'buildCity', playerId: 'p1', intersectionId: 'v0' });
    expect(game.board.intersections.v0.building).toEqual({ type: 'city', playerId: 'p1' });
    expect(player(game, 'p1').pieces.cities).toBe(3);
    expect(player(game, 'p1').pieces.settlements).toBe(4); // returned one settlement piece
  });

  it('rejects city upgrade on an opponent settlement', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = giveResources(game, 'p1', { ore: 3, hay: 2 });
    expect(() =>
      applyAction(game, { type: 'buildCity', playerId: 'p1', intersectionId: 'v4' }),
    ).toThrow(/upgrade your settlement/);
  });
});

describe('development cards', () => {
  it('buys a development card from the deck', () => {
    let game = completeSetup(newGame(THREE_PLAYERS, fixedRandom(0)));
    game = setPhase(game, 'action', 'p1');
    game = giveResources(game, 'p1', { ore: 1, hay: 1, sheep: 1 });
    const deckSize = game.developmentDeck.length;
    game = applyAction(game, { type: 'buyDevelopment', playerId: 'p1' });
    expect(game.developmentDeck).toHaveLength(deckSize - 1);
    expect(player(game, 'p1').developmentCards).toHaveLength(1);
    expect(player(game, 'p1').developmentCards[0].boughtTurn).toBe(game.turnIndex);
  });

  it('cannot play a card bought this turn', () => {
    let game = completeSetup(newGame(THREE_PLAYERS, fixedRandom(0)));
    game = setPhase(game, 'action', 'p1');
    game = giveResources(game, 'p1', { ore: 1, hay: 1, sheep: 1 });
    game = applyAction(game, { type: 'buyDevelopment', playerId: 'p1' });
    const card = player(game, 'p1').developmentCards[0].type;
    if (card === 'victoryPoint') {
      expect(() =>
        applyAction(game, { type: 'playDevelopment', playerId: 'p1', card: 'victoryPoint' }),
      ).toThrow();
    } else {
      expect(() =>
        applyAction(game, { type: 'playDevelopment', playerId: 'p1', card }),
      ).toThrow(/unavailable|cannot be played/);
    }
  });

  it('plays a knight from a previous turn and enters robber phase', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = structuredClone(game);
    player(game, 'p1').developmentCards.push({ type: 'knight', boughtTurn: -1 });
    game = applyAction(game, { type: 'playDevelopment', playerId: 'p1', card: 'knight' });
    expect(game.phase).toBe('robber');
    expect(player(game, 'p1').playedKnights).toBe(1);
    expect(player(game, 'p1').developmentCards).toHaveLength(0);
    expect(game.lastDevelopment).toMatchObject({ type: 'played', card: 'knight' });
  });

  it('plays year of plenty for two resources', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = structuredClone(game);
    player(game, 'p1').developmentCards.push({ type: 'yearOfPlenty', boughtTurn: -1 });
    const woodBefore = player(game, 'p1').resources.wood;
    game = applyAction(game, {
      type: 'playDevelopment',
      playerId: 'p1',
      card: 'yearOfPlenty',
      resources: ['wood', 'brick'],
    });
    expect(player(game, 'p1').resources.wood).toBe(woodBefore + 1);
    expect(player(game, 'p1').resources.brick).toBe(player(completeSetup(newGame()), 'p1').resources.brick + 1);
    expect(game.lastDevelopment).toMatchObject({ card: 'yearOfPlenty', resources: ['wood', 'brick'] });
  });

  it('plays monopoly and takes a resource from all opponents', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = giveResources(game, 'p2', { sheep: 2 });
    game = giveResources(game, 'p3', { sheep: 1 });
    game = structuredClone(game);
    const expectedSheep = game.players.reduce((total, item) => total + item.resources.sheep, 0);
    player(game, 'p1').developmentCards.push({ type: 'monopoly', boughtTurn: -1 });
    game = applyAction(game, {
      type: 'playDevelopment',
      playerId: 'p1',
      card: 'monopoly',
      resource: 'sheep',
    });
    expect(player(game, 'p1').resources.sheep).toBe(expectedSheep);
    expect(player(game, 'p2').resources.sheep).toBe(0);
    expect(player(game, 'p3').resources.sheep).toBe(0);
    expect(game.lastDevelopment).toMatchObject({ card: 'monopoly', resource: 'sheep', collected: 5 });
  });

  it('plays road building for free roads', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = structuredClone(game);
    player(game, 'p1').developmentCards.push({ type: 'roadBuilding', boughtTurn: -1 });
    const roadsBefore = player(game, 'p1').pieces.roads;
    game = applyAction(game, {
      type: 'playDevelopment',
      playerId: 'p1',
      card: 'roadBuilding',
      edgeIds: ['e5', 'e7'],
    });
    expect(game.board.edges.e5.road).toBe('p1');
    expect(game.board.edges.e7.road).toBe('p1');
    expect(player(game, 'p1').pieces.roads).toBe(roadsBefore - 2);
    expect(game.lastDevelopment).toMatchObject({ card: 'roadBuilding', edgeIds: ['e5', 'e7'] });
    // Should not have spent wood/brick beyond setup holdings
  });

  it('allows only one development card per turn', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = structuredClone(game);
    player(game, 'p1').developmentCards.push(
      { type: 'yearOfPlenty', boughtTurn: -1 },
      { type: 'monopoly', boughtTurn: -1 },
    );
    game = applyAction(game, {
      type: 'playDevelopment',
      playerId: 'p1',
      card: 'yearOfPlenty',
      resources: ['wood', 'brick'],
    });
    expect(() =>
      applyAction(game, {
        type: 'playDevelopment',
        playerId: 'p1',
        card: 'monopoly',
        resource: 'wood',
      }),
    ).toThrow(/Only one development card/);
  });
});


describe('trade', () => {
  it('performs a default 4:1 maritime trade', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    // p1 has 3:1 port at v0! settlement on v0 owns generic port
    game = giveResources(game, 'p1', { sheep: 3 });
    const sheepBefore = player(game, 'p1').resources.sheep;
    const oreBefore = player(game, 'p1').resources.ore;
    game = applyAction(game, {
      type: 'maritimeTrade',
      playerId: 'p1',
      give: 'sheep',
      receive: 'ore',
    });
    // 3:1 because of port on v0
    expect(player(game, 'p1').resources.sheep).toBe(sheepBefore - 3);
    expect(player(game, 'p1').resources.ore).toBe(oreBefore + 1);
  });

  it('uses 2:1 when the player owns a matching resource port', () => {
    let game = completeSetup(newGame(FOUR_PLAYERS), 4);
    // p4 second settlement at v14 owns wood 2:1 port
    game = setPhase(game, 'action', 'p4');
    game = giveResources(game, 'p4', { wood: 2 });
    const woodBefore = player(game, 'p4').resources.wood;
    const oreBefore = player(game, 'p4').resources.ore;
    game = applyAction(game, {
      type: 'maritimeTrade',
      playerId: 'p4',
      give: 'wood',
      receive: 'ore',
    });
    expect(player(game, 'p4').resources.wood).toBe(woodBefore - 2);
    expect(player(game, 'p4').resources.ore).toBe(oreBefore + 1);
  });

  it('offers and accepts a domestic trade', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = giveResources(game, 'p1', { wood: 1 });
    game = giveResources(game, 'p2', { brick: 1 });

    game = applyAction(game, {
      type: 'offerTrade',
      playerId: 'p1',
      toPlayerId: 'p2',
      give: { wood: 1 },
      receive: { brick: 1 },
    });
    expect(game.tradeOffer.fromPlayerId).toBe('p1');

    game = applyAction(game, { type: 'acceptTrade', playerId: 'p2' });
    expect(game.tradeOffer).toBeNull();
    expect(player(game, 'p1').resources.wood).toBe(player(completeSetup(newGame()), 'p1').resources.wood);
    expect(player(game, 'p1').resources.brick).toBe(player(completeSetup(newGame()), 'p1').resources.brick + 1);
    expect(player(game, 'p2').resources.brick).toBe(player(completeSetup(newGame()), 'p2').resources.brick);
    expect(player(game, 'p2').resources.wood).toBe(player(completeSetup(newGame()), 'p2').resources.wood + 1);
  });

  it('cancels a trade offer', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = giveResources(game, 'p1', { wood: 1 });
    game = applyAction(game, {
      type: 'offerTrade',
      playerId: 'p1',
      give: { wood: 1 },
      receive: { brick: 1 },
    });
    game = applyAction(game, { type: 'cancelTrade', playerId: 'p1' });
    expect(game.tradeOffer).toBeNull();
  });

  it('rejects empty, invalid, and self-targeted trade offers', () => {
    const game = setPhase(completeSetup(newGame()), 'action', 'p1');
    expect(() => applyAction(game, {
      type: 'offerTrade', playerId: 'p1', give: {}, receive: { brick: 1 },
    })).toThrow(/at least one/);
    expect(() => applyAction(game, {
      type: 'offerTrade', playerId: 'p1', give: { wood: -1 }, receive: { brick: 1 },
    })).toThrow(/Invalid Offered/);
    expect(() => applyAction(game, {
      type: 'offerTrade', playerId: 'p1', toPlayerId: 'p1', give: { wood: 1 }, receive: { brick: 1 },
    })).toThrow(/another player/);
  });

  it('allows an eligible opponent to reject a trade', () => {
    let game = setPhase(completeSetup(newGame()), 'action', 'p1');
    game = applyAction(game, {
      type: 'offerTrade', playerId: 'p1', toPlayerId: 'p2', give: { wood: 1 }, receive: { brick: 1 },
    });
    expect(() => applyAction(game, { type: 'rejectTrade', playerId: 'p3' })).toThrow(/cannot reject/);
    game = applyAction(game, { type: 'rejectTrade', playerId: 'p2' });
    expect(game.tradeOffer).toBeNull();
    expect(game.lastTrade).toMatchObject({ type: 'rejected', playerId: 'p2' });
  });

  it('rejects acceptance after an offered hand becomes stale', () => {
    let game = setPhase(completeSetup(newGame()), 'action', 'p1');
    game = applyAction(game, {
      type: 'offerTrade', playerId: 'p1', toPlayerId: 'p2', give: { wood: 1 }, receive: { brick: 1 },
    });
    game = structuredClone(game);
    player(game, 'p2').resources.brick = 0;
    expect(() => applyAction(game, { type: 'acceptTrade', playerId: 'p2' })).toThrow(/no longer/);
  });

  it('expires an unaccepted offer when the turn ends', () => {
    let game = setPhase(completeSetup(newGame()), 'action', 'p1');
    game = applyAction(game, {
      type: 'offerTrade', playerId: 'p1', give: { wood: 1 }, receive: { brick: 1 },
    });
    game = applyAction(game, { type: 'endTurn', playerId: 'p1' });
    expect(game.tradeOffer).toBeNull();
    expect(game.lastTrade).toEqual({ type: 'expired', fromPlayerId: 'p1' });
  });
});

describe('turns and victory', () => {
  it('endTurn advances to the next player in roll phase', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = applyAction(game, { type: 'endTurn', playerId: 'p1' });
    expect(game.phase).toBe('roll');
    expect(game.currentPlayerId).toBe('p2');
    expect(game.hasRolled).toBe(false);
    expect(game.dice).toBeNull();
  });

  it('rejects actions after the game is over', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    game = structuredClone(game);
    // 5 cities = 10 VP
    for (const id of ['v0', 'v2', 'v4', 'v6', 'v8']) {
      game.board.intersections[id].building = { type: 'city', playerId: 'p1' };
    }
    game = applyAction(game, { type: 'endTurn', playerId: 'p1' });
    expect(game.phase).toBe('gameOver');
    expect(game.winnerId).toBe('p1');
    expect(() =>
      applyAction(game, { type: 'rollDice', playerId: 'p1', dice: [1, 1] }),
    ).toThrow(/game is over/);
  });

  it('awards longest road through normal play updates', () => {
    let game = completeSetup(newGame());
    game = setPhase(game, 'action', 'p1');
    // Clear buildings so a five-edge chain is not split by opponents, then
    // trigger recalculateAwards through a valid turn action.
    game = structuredClone(game);
    for (const intersection of Object.values(game.board.intersections)) {
      intersection.building = null;
    }
    for (const edge of Object.values(game.board.edges)) {
      edge.road = null;
    }
    for (const id of ['e0', 'e1', 'e2', 'e3', 'e4']) {
      game.board.edges[id].road = 'p1';
    }
    game = applyAction(game, { type: 'endTurn', playerId: 'p1' });
    expect(game.longestRoadPlayerId).toBe('p1');
  });
});
