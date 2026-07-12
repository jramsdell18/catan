import { createBoard, createGame, applyAction } from '../../src/rules/index.js';

/**
 * Compact linear board for deterministic rules tests.
 *
 * Topology: a 16-vertex path (v0–v15) with edges e0–e14.
 * Settlements may be placed on even vertices without violating distance
 * (adjacent odds are left empty): v0, v2, v4, v6, v8, v10, v12, v14.
 *
 * Tiles sit on short segments so production and starting resources are predictable.
 */
export function buildFixtureBoard() {
  const intersections = Array.from({ length: 16 }, (_, i) => ({ id: `v${i}` }));
  const edges = Array.from({ length: 15 }, (_, i) => ({
    id: `e${i}`,
    intersections: [`v${i}`, `v${i + 1}`],
  }));

  const tiles = [
    { id: 't-desert', terrain: 'desert', number: null, intersections: ['v0', 'v1'] },
    { id: 't-forest-6', terrain: 'forest', number: 6, intersections: ['v0', 'v1', 'v2'] },
    { id: 't-hills-8', terrain: 'hills', number: 8, intersections: ['v2', 'v3', 'v4'] },
    { id: 't-fields-4', terrain: 'fields', number: 4, intersections: ['v4', 'v5', 'v6'] },
    { id: 't-mountains-5', terrain: 'mountains', number: 5, intersections: ['v6', 'v7', 'v8'] },
    { id: 't-pasture-9', terrain: 'pasture', number: 9, intersections: ['v8', 'v9', 'v10'] },
    { id: 't-forest-3', terrain: 'forest', number: 3, intersections: ['v10', 'v11', 'v12'] },
    { id: 't-hills-10', terrain: 'hills', number: 10, intersections: ['v12', 'v13', 'v14'] },
    { id: 't-fields-11', terrain: 'fields', number: 11, intersections: ['v14', 'v15'] },
  ];

  const ports = [
    { intersections: ['v0', 'v1'], ratio: 3, resource: null },
    { intersections: ['v14', 'v15'], ratio: 2, resource: 'wood' },
  ];

  return createBoard({
    tiles,
    intersections,
    edges,
    ports,
    robberTileId: 't-desert',
  });
}

export const THREE_PLAYERS = [
  { id: 'p1', name: 'Ada', color: 'red' },
  { id: 'p2', name: 'Lin', color: 'blue' },
  { id: 'p3', name: 'Sam', color: 'white' },
];

export const FOUR_PLAYERS = [
  ...THREE_PLAYERS,
  { id: 'p4', name: 'Pat', color: 'orange' },
];

/** Always returns 0 — shuffle leaves deck order, dice need explicit overrides. */
export function fixedRandom(value = 0) {
  return () => value;
}

export function newGame(players = THREE_PLAYERS, random = fixedRandom()) {
  return createGame({
    board: buildFixtureBoard(),
    players,
    random,
  });
}

/**
 * Setup placements for 3 players on non-adjacent even vertices.
 * Order follows the engine snake: p1, p2, p3, p3, p2, p1.
 * Second-round settlements grant starting resources.
 */
const SETUP_PLANS_3 = [
  { playerId: 'p1', intersectionId: 'v0', edgeId: 'e0' },
  { playerId: 'p2', intersectionId: 'v4', edgeId: 'e4' },
  { playerId: 'p3', intersectionId: 'v8', edgeId: 'e8' },
  { playerId: 'p3', intersectionId: 'v12', edgeId: 'e12' },
  { playerId: 'p2', intersectionId: 'v2', edgeId: 'e1' },
  { playerId: 'p1', intersectionId: 'v6', edgeId: 'e6' },
];

const SETUP_PLANS_4 = [
  { playerId: 'p1', intersectionId: 'v0', edgeId: 'e0' },
  { playerId: 'p2', intersectionId: 'v4', edgeId: 'e4' },
  { playerId: 'p3', intersectionId: 'v8', edgeId: 'e8' },
  { playerId: 'p4', intersectionId: 'v12', edgeId: 'e12' },
  { playerId: 'p4', intersectionId: 'v14', edgeId: 'e14' },
  { playerId: 'p3', intersectionId: 'v10', edgeId: 'e10' },
  { playerId: 'p2', intersectionId: 'v2', edgeId: 'e1' },
  { playerId: 'p1', intersectionId: 'v6', edgeId: 'e6' },
];

export function completeSetup(game, playerCount = 3) {
  const plan = playerCount === 4 ? SETUP_PLANS_4 : SETUP_PLANS_3;
  let state = game;
  for (const step of plan) {
    state = applyAction(state, {
      type: 'placeSettlement',
      playerId: step.playerId,
      intersectionId: step.intersectionId,
    });
    state = applyAction(state, {
      type: 'placeRoad',
      playerId: step.playerId,
      edgeId: step.edgeId,
    });
  }
  return state;
}

export function player(state, id) {
  return state.players.find((p) => p.id === id);
}

export function giveResources(state, playerId, resources) {
  const next = structuredClone(state);
  const target = next.players.find((p) => p.id === playerId);
  for (const [resource, amount] of Object.entries(resources)) {
    target.resources[resource] += amount;
    next.bank[resource] -= amount;
  }
  return next;
}

export function setPhase(state, phase, currentPlayerId = state.currentPlayerId) {
  const next = structuredClone(state);
  next.phase = phase;
  next.currentPlayerId = currentPlayerId;
  if (phase === 'action') next.hasRolled = true;
  if (phase === 'roll') next.hasRolled = false;
  return next;
}
