import { RESOURCE_TYPES } from '../rules/constants.js';
import {
  actionForTarget,
  getEligibleRobberVictims,
  getInteractionMode,
  getLegalTargets,
  INTERACTION_MODES,
} from './interactions.js';

/**
 * Test-only bot players. Bots have no strategy: every choice is a random
 * legal option, and a normal turn is "roll, then end turn". They exist so a
 * single person can play through a full game without other humans.
 */

export const BOT_STEP_MIN_MS = 500;
export const BOT_STEP_MAX_MS = 1000;

export function getBotDelay(random = Math.random) {
  return BOT_STEP_MIN_MS + Math.floor(random() * (BOT_STEP_MAX_MS - BOT_STEP_MIN_MS));
}

function randomItem(items, random) {
  if (!items.length) return null;
  return items[Math.floor(random() * items.length)];
}

function rollDie(random) {
  return 1 + Math.floor(random() * 6);
}

export function createRandomDiscard(resources, amount, random = Math.random) {
  const cards = RESOURCE_TYPES.flatMap((resource) => Array(resources[resource] ?? 0).fill(resource));
  const discard = Object.fromEntries(RESOURCE_TYPES.map((resource) => [resource, 0]));

  for (let index = 0; index < amount && cards.length > 0; index += 1) {
    const cardIndex = Math.floor(random() * cards.length);
    const [resource] = cards.splice(cardIndex, 1);
    discard[resource] += 1;
  }

  return discard;
}

/**
 * Returns the next rules action a bot should take, or null when no bot needs
 * to act (for example, it is a human's turn or a human still has to discard).
 */
export function getBotAction({ game, topology, board, botPlayerIds, random = Math.random }) {
  if (!game || !botPlayerIds?.size || game.phase === 'gameOver') return null;

  if (game.phase === 'discard') {
    const discarder = game.players.find((player) =>
      botPlayerIds.has(player.id) && game.pendingDiscards?.[player.id],
    );
    if (!discarder) return null;
    return {
      type: 'discard',
      playerId: discarder.id,
      resources: createRandomDiscard(discarder.resources, game.pendingDiscards[discarder.id], random),
    };
  }

  if (!botPlayerIds.has(game.currentPlayerId)) return null;

  if (game.phase === 'setup') {
    const mode = getInteractionMode(game);
    const targets = getLegalTargets(game, topology, board, mode);
    const target = mode === INTERACTION_MODES.PLACE_ROAD
      ? randomItem(targets.edges, random)
      : randomItem(targets.intersections, random);
    return target ? actionForTarget(mode, game, target.id) : null;
  }

  if (game.phase === 'roll') {
    return { type: 'rollDice', playerId: game.currentPlayerId, dice: [rollDie(random), rollDie(random)] };
  }

  if (game.phase === 'robber') {
    const { hexes } = getLegalTargets(game, topology, board, INTERACTION_MODES.MOVE_ROBBER);
    const hex = randomItem(hexes, random);
    if (!hex) return null;
    const victim = randomItem(getEligibleRobberVictims(game, hex.hexId), random);
    return {
      type: 'moveRobber',
      playerId: game.currentPlayerId,
      tileId: hex.hexId,
      victimId: victim?.id,
    };
  }

  if (game.phase === 'action') {
    return { type: 'endTurn', playerId: game.currentPlayerId };
  }

  return null;
}
