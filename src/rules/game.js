import {
  BUILDING_COSTS,
  DEVELOPMENT_DECK,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PIECE_LIMITS,
  RESOURCE_TYPES,
  TERRAIN_RESOURCE,
  emptyResources,
} from './constants.js';
import { canPlaceRoad, canPlaceSettlement, cloneBoard, getPlayerPortRatio } from './board.js';
import { hasWon, recalculateAwards } from './scoring.js';

const copy = (value) => structuredClone(value);
const totalResources = (resources) => RESOURCE_TYPES.reduce((sum, key) => sum + resources[key], 0);
const playerById = (state, id) => state.players.find((player) => player.id === id);
const currentPlayer = (state) => playerById(state, state.currentPlayerId);

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function createGame({ players, board, random = Math.random }) {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Base Catan requires ${MIN_PLAYERS}–${MAX_PLAYERS} players.`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('Player ids must be unique.');

  const gamePlayers = players.map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    resources: emptyResources(),
    developmentCards: [],
    playedKnights: 0,
    pieces: { roads: PIECE_LIMITS.roads, settlements: PIECE_LIMITS.settlements, cities: PIECE_LIMITS.cities },
  }));

  return {
    phase: 'setup',
    setupDirection: 1,
    setupPlacements: 0,
    setupSettlementId: null,
    turnIndex: 0,
    currentPlayerId: gamePlayers[0].id,
    players: gamePlayers,
    board: cloneBoard(board),
    bank: Object.fromEntries(RESOURCE_TYPES.map((resource) => [resource, 19])),
    developmentDeck: shuffle(DEVELOPMENT_DECK, random),
    dice: null,
    hasRolled: false,
    playedDevelopmentThisTurn: false,
    pendingDiscards: {},
    tradeOffer: null,
    longestRoadPlayerId: null,
    largestArmyPlayerId: null,
    winnerId: null,
    log: [],
  };
}

function requireTurn(state, playerId) {
  if (state.currentPlayerId !== playerId) throw new Error('It is not this player’s turn.');
}

function requirePhase(state, ...phases) {
  if (!phases.includes(state.phase)) throw new Error(`Action is not allowed during ${state.phase}.`);
}

function hasResources(player, cost) {
  return Object.entries(cost).every(([resource, amount]) => player.resources[resource] >= amount);
}

function transferCost(state, player, cost) {
  if (!hasResources(player, cost)) throw new Error('Player cannot afford this action.');
  for (const [resource, amount] of Object.entries(cost)) {
    player.resources[resource] -= amount;
    state.bank[resource] += amount;
  }
}

function giveFromBank(state, player, bundle) {
  for (const [resource, amount] of Object.entries(bundle)) {
    if (!RESOURCE_TYPES.includes(resource) || !Number.isInteger(amount) || amount < 0) throw new Error('Invalid resource bundle.');
    if (state.bank[resource] < amount) throw new Error(`The bank does not have enough ${resource}.`);
  }
  for (const [resource, amount] of Object.entries(bundle)) {
    state.bank[resource] -= amount;
    player.resources[resource] += amount;
  }
}

function finishSetupRoad(state) {
  state.setupPlacements += 1;
  state.setupSettlementId = null;
  const lastIndex = state.players.length - 1;
  if (state.setupDirection === 1 && state.turnIndex === lastIndex) {
    state.setupDirection = -1;
  } else if (state.setupDirection === -1 && state.turnIndex === 0) {
    state.phase = 'roll';
    state.currentPlayerId = state.players[0].id;
    return;
  } else {
    state.turnIndex += state.setupDirection;
  }
  state.currentPlayerId = state.players[state.turnIndex].id;
}

function placeSettlement(state, action) {
  requireTurn(state, action.playerId);
  const player = currentPlayer(state);
  const setup = state.phase === 'setup';
  requirePhase(state, 'setup', 'action');
  if (setup && state.setupSettlementId) throw new Error('Place the setup road before another settlement.');
  if (!canPlaceSettlement(state.board, action.intersectionId, action.playerId, !setup)) {
    throw new Error('Settlement placement violates connection or distance rules.');
  }
  if (player.pieces.settlements < 1) throw new Error('No settlement pieces remain.');
  if (!setup) transferCost(state, player, BUILDING_COSTS.settlement);

  state.board.intersections[action.intersectionId].building = { type: 'settlement', playerId: action.playerId };
  player.pieces.settlements -= 1;
  if (setup) {
    state.setupSettlementId = action.intersectionId;
    if (state.setupDirection === -1) grantStartingResources(state, player);
  }
}

function grantStartingResources(state, player) {
  for (const resource of RESOURCE_TYPES) {
    if (state.bank[resource] < 1) throw new Error(`The bank does not have enough ${resource}.`);
    state.bank[resource] -= 1;
    player.resources[resource] += 1;
  }
}

function placeRoad(state, action, free = false) {
  requireTurn(state, action.playerId);
  requirePhase(state, 'setup', 'action');
  const player = currentPlayer(state);
  const setupIntersection = state.phase === 'setup' ? state.setupSettlementId : null;
  if (state.phase === 'setup' && !setupIntersection) throw new Error('Place a settlement before its setup road.');
  if (!canPlaceRoad(state.board, action.edgeId, action.playerId, setupIntersection)) throw new Error('Invalid road placement.');
  if (player.pieces.roads < 1) throw new Error('No road pieces remain.');
  if (state.phase !== 'setup' && !free) transferCost(state, player, BUILDING_COSTS.road);
  state.board.edges[action.edgeId].road = action.playerId;
  player.pieces.roads -= 1;
  if (state.phase === 'setup') finishSetupRoad(state);
}

function distributeProduction(state, total) {
  for (const tile of Object.values(state.board.tiles)) {
    if (tile.number !== total || tile.id === state.board.robberTileId) continue;
    const resource = TERRAIN_RESOURCE[tile.terrain];
    const claims = tile.intersections
      .map((id) => state.board.intersections[id].building)
      .filter(Boolean)
      .map((building) => ({ player: playerById(state, building.playerId), amount: building.type === 'city' ? 2 : 1 }));
    const demand = claims.reduce((sum, claim) => sum + claim.amount, 0);
    if (state.bank[resource] < demand) continue;
    for (const claim of claims) {
      state.bank[resource] -= claim.amount;
      claim.player.resources[resource] += claim.amount;
    }
  }
}

function rollDice(state, action, random) {
  requireTurn(state, action.playerId);
  requirePhase(state, 'roll');
  const dice = action.dice ?? [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)];
  if (!Array.isArray(dice) || dice.length !== 2 || dice.some((die) => !Number.isInteger(die) || die < 1 || die > 6)) {
    throw new Error('Dice must contain two values from 1 to 6.');
  }
  state.dice = dice;
  state.hasRolled = true;
  if (dice[0] + dice[1] === 7) {
    state.pendingDiscards = Object.fromEntries(
      state.players.filter((p) => totalResources(p.resources) > 7).map((p) => [p.id, Math.floor(totalResources(p.resources) / 2)]),
    );
    state.phase = Object.keys(state.pendingDiscards).length ? 'discard' : 'robber';
  } else {
    distributeProduction(state, dice[0] + dice[1]);
    state.phase = 'action';
  }
}

function discard(state, action) {
  requirePhase(state, 'discard');
  const required = state.pendingDiscards[action.playerId];
  const player = playerById(state, action.playerId);
  if (!required || !player) throw new Error('This player does not need to discard.');
  if (totalResources(action.resources) !== required || !hasResources(player, action.resources)) throw new Error(`Player must discard exactly ${required} cards.`);
  for (const [resource, amount] of Object.entries(action.resources)) {
    player.resources[resource] -= amount;
    state.bank[resource] += amount;
  }
  delete state.pendingDiscards[action.playerId];
  if (!Object.keys(state.pendingDiscards).length) state.phase = 'robber';
}

function moveRobber(state, action, random) {
  requireTurn(state, action.playerId);
  requirePhase(state, 'robber');
  if (!state.board.tiles[action.tileId] || action.tileId === state.board.robberTileId) throw new Error('Robber must move to a different tile.');
  const eligible = new Set(
    state.board.tiles[action.tileId].intersections
      .map((id) => state.board.intersections[id].building?.playerId)
      .filter((id) => id && id !== action.playerId && totalResources(playerById(state, id).resources) > 0),
  );
  if (action.victimId && !eligible.has(action.victimId)) throw new Error('Selected player cannot be robbed.');
  if (!action.victimId && eligible.size) throw new Error('Choose an eligible player to rob.');
  state.board.robberTileId = action.tileId;
  if (action.victimId) {
    const victim = playerById(state, action.victimId);
    const cards = RESOURCE_TYPES.flatMap((resource) => Array(victim.resources[resource]).fill(resource));
    const stolen = cards[Math.floor(random() * cards.length)];
    victim.resources[stolen] -= 1;
    currentPlayer(state).resources[stolen] += 1;
  }
  state.phase = 'action';
}

function buildCity(state, action) {
  requireTurn(state, action.playerId);
  requirePhase(state, 'action');
  const player = currentPlayer(state);
  const building = state.board.intersections[action.intersectionId]?.building;
  if (building?.playerId !== action.playerId || building.type !== 'settlement') throw new Error('A city must upgrade your settlement.');
  if (player.pieces.cities < 1) throw new Error('No city pieces remain.');
  transferCost(state, player, BUILDING_COSTS.city);
  building.type = 'city';
  player.pieces.cities -= 1;
  player.pieces.settlements += 1;
}

function buyDevelopment(state, action) {
  requireTurn(state, action.playerId);
  requirePhase(state, 'action');
  if (!state.developmentDeck.length) throw new Error('Development deck is empty.');
  const player = currentPlayer(state);
  transferCost(state, player, BUILDING_COSTS.development);
  player.developmentCards.push({ type: state.developmentDeck.pop(), boughtTurn: state.turnIndex });
}

function playDevelopment(state, action) {
  requireTurn(state, action.playerId);
  requirePhase(state, 'roll', 'action');
  if (state.playedDevelopmentThisTurn) throw new Error('Only one development card may be played per turn.');
  const player = currentPlayer(state);
  const index = player.developmentCards.findIndex((card) => card.type === action.card && card.boughtTurn !== state.turnIndex);
  if (index < 0 || action.card === 'victoryPoint') throw new Error('Development card is unavailable or cannot be played.');
  player.developmentCards.splice(index, 1);
  state.playedDevelopmentThisTurn = true;
  if (action.card === 'knight') {
    player.playedKnights += 1;
    state.phase = 'robber';
  } else if (action.card === 'yearOfPlenty') {
    if (!Array.isArray(action.resources) || action.resources.length !== 2) throw new Error('Choose two resources.');
    giveFromBank(state, player, action.resources.reduce((bundle, resource) => ({ ...bundle, [resource]: (bundle[resource] ?? 0) + 1 }), {}));
  } else if (action.card === 'monopoly') {
    if (!RESOURCE_TYPES.includes(action.resource)) throw new Error('Choose a valid resource.');
    for (const opponent of state.players.filter((p) => p.id !== player.id)) {
      player.resources[action.resource] += opponent.resources[action.resource];
      opponent.resources[action.resource] = 0;
    }
  } else if (action.card === 'roadBuilding') {
    const edgeIds = action.edgeIds ?? [];
    if (edgeIds.length < 1 || edgeIds.length > 2) throw new Error('Choose one or two roads.');
    for (const edgeId of edgeIds) placeRoad(state, { playerId: action.playerId, edgeId }, true);
  }
}

function maritimeTrade(state, action) {
  requireTurn(state, action.playerId);
  requirePhase(state, 'action');
  if (!RESOURCE_TYPES.includes(action.give) || !RESOURCE_TYPES.includes(action.receive) || action.give === action.receive) throw new Error('Invalid trade resources.');
  const player = currentPlayer(state);
  const ratio = getPlayerPortRatio(state.board, action.playerId, action.give);
  if (player.resources[action.give] < ratio || state.bank[action.receive] < 1) throw new Error('Trade cannot be completed.');
  player.resources[action.give] -= ratio;
  state.bank[action.give] += ratio;
  state.bank[action.receive] -= 1;
  player.resources[action.receive] += 1;
}

function offerTrade(state, action) {
  requireTurn(state, action.playerId);
  requirePhase(state, 'action');
  if (!hasResources(currentPlayer(state), action.give)) throw new Error('Offering player lacks those resources.');
  state.tradeOffer = { fromPlayerId: action.playerId, toPlayerId: action.toPlayerId ?? null, give: copy(action.give), receive: copy(action.receive) };
}

function acceptTrade(state, action) {
  requirePhase(state, 'action');
  const offer = state.tradeOffer;
  if (!offer || (offer.toPlayerId && offer.toPlayerId !== action.playerId) || offer.fromPlayerId === action.playerId) throw new Error('No available trade offer.');
  const from = playerById(state, offer.fromPlayerId);
  const to = playerById(state, action.playerId);
  if (!hasResources(from, offer.give) || !hasResources(to, offer.receive)) throw new Error('A player no longer has the offered resources.');
  for (const resource of RESOURCE_TYPES) {
    const given = offer.give[resource] ?? 0;
    const received = offer.receive[resource] ?? 0;
    from.resources[resource] += received - given;
    to.resources[resource] += given - received;
  }
  state.tradeOffer = null;
}

function endTurn(state, action) {
  requireTurn(state, action.playerId);
  requirePhase(state, 'action');
  if (hasWon(state, action.playerId)) {
    state.phase = 'gameOver';
    state.winnerId = action.playerId;
    return;
  }
  state.turnIndex += 1;
  state.currentPlayerId = state.players[state.turnIndex % state.players.length].id;
  state.phase = 'roll';
  state.dice = null;
  state.hasRolled = false;
  state.playedDevelopmentThisTurn = false;
  state.tradeOffer = null;
}

export function applyAction(game, action, { random = Math.random } = {}) {
  if (!action?.type) throw new Error('Action type is required.');
  if (game.phase === 'gameOver') throw new Error('The game is over.');
  const state = copy(game);
  const handlers = {
    placeSettlement: () => placeSettlement(state, action),
    placeRoad: () => placeRoad(state, action),
    buildCity: () => buildCity(state, action),
    rollDice: () => rollDice(state, action, random),
    discard: () => discard(state, action),
    moveRobber: () => moveRobber(state, action, random),
    buyDevelopment: () => buyDevelopment(state, action),
    playDevelopment: () => playDevelopment(state, action),
    maritimeTrade: () => maritimeTrade(state, action),
    offerTrade: () => offerTrade(state, action),
    acceptTrade: () => acceptTrade(state, action),
    cancelTrade: () => { requireTurn(state, action.playerId); state.tradeOffer = null; },
    endTurn: () => endTurn(state, action),
  };
  if (!handlers[action.type]) throw new Error(`Unknown action: ${action.type}.`);
  handlers[action.type]();
  recalculateAwards(state);
  state.log.push({ type: action.type, playerId: action.playerId ?? null, turn: state.turnIndex });
  if (state.phase !== 'gameOver' && action.playerId && hasWon(state, action.playerId)) {
    state.phase = 'gameOver';
    state.winnerId = action.playerId;
  }
  return state;
}
