import { RESOURCE_TYPES } from './constants.js';
import { visibleVictoryPoints } from './scoring.js';

const copy = (value) => structuredClone(value);

function totalResources(resources) {
  if (!resources) return 0;
  return RESOURCE_TYPES.reduce((sum, key) => sum + (resources[key] ?? 0), 0);
}

/**
 * Public victory points visible to every player (no hidden VP cards).
 * Settlements (1), cities (2), Longest Road (2), Largest Army (2).
 */
export function publicVictoryPoints(state, playerId) {
  const buildings = Object.values(state.board.intersections).filter(
    (intersection) => intersection.building?.playerId === playerId,
  );
  return (
    buildings.reduce((sum, intersection) => sum + (intersection.building.type === 'city' ? 2 : 1), 0) +
    (state.longestRoadPlayerId === playerId ? 2 : 0) +
    (state.largestArmyPlayerId === playerId ? 2 : 0)
  );
}

/**
 * Full VP total for a player, including unrevealed victory-point development cards.
 * Prefer this only for the owning player's private view or win checks.
 */
export function privateVictoryPoints(state, playerId) {
  return visibleVictoryPoints(state, playerId);
}

function sanitizePlayer(player, viewerId, state) {
  const resourceCount = totalResources(player.resources);
  const developmentCardCount = player.developmentCards.length;
  const isSelf = player.id === viewerId;

  if (isSelf) {
    return {
      id: player.id,
      name: player.name,
      color: player.color,
      resources: copy(player.resources),
      resourceCount,
      developmentCards: copy(player.developmentCards),
      developmentCardCount,
      playedKnights: player.playedKnights,
      pieces: copy(player.pieces),
      publicVictoryPoints: publicVictoryPoints(state, player.id),
      privateVictoryPoints: privateVictoryPoints(state, player.id),
      isSelf: true,
    };
  }

  return {
    id: player.id,
    name: player.name,
    color: player.color,
    // Resource identities and card types stay hidden from opponents.
    resources: null,
    resourceCount,
    developmentCards: null,
    developmentCardCount,
    playedKnights: player.playedKnights,
    pieces: copy(player.pieces),
    publicVictoryPoints: publicVictoryPoints(state, player.id),
    privateVictoryPoints: null,
    isSelf: false,
  };
}

function sanitizeRobbery(lastRobbery, viewerId) {
  if (!lastRobbery) return null;

  const involved =
    lastRobbery.thiefId === viewerId ||
    lastRobbery.victimId === viewerId ||
    lastRobbery.playerId === viewerId;

  // Support both current and future robbery payload shapes.
  const resource = lastRobbery.resource ?? lastRobbery.stolen ?? null;
  if (involved || resource == null) {
    return copy(lastRobbery);
  }

  return {
    ...copy(lastRobbery),
    resource: null,
    stolen: null,
    hidden: true,
  };
}

function sanitizeProduction(lastProduction, viewerId) {
  if (!lastProduction) return null;

  const production = copy(lastProduction);
  if (production.byPlayer && typeof production.byPlayer === 'object') {
    production.byPlayer = Object.fromEntries(
      Object.entries(production.byPlayer).map(([playerId, bundle]) => {
        if (playerId === viewerId) return [playerId, bundle];
        // Opponents only learn how many cards someone gained, not which resources.
        const count =
          typeof bundle === 'number'
            ? bundle
            : Object.values(bundle ?? {}).reduce((sum, amount) => sum + amount, 0);
        return [playerId, { hiddenCount: count }];
      }),
    );
  }
  return production;
}

/**
 * Build a deep-cloned, viewer-scoped game snapshot safe to send to one client
 * (or show on a pass-and-play device for that seat).
 *
 * Public: board, bank totals, phase, dice, awards, piece counts, hand sizes,
 * played knights, public VP, trade offers, discard requirements.
 *
 * Private to viewer: own resource breakdown, own development card types,
 * private VP total (includes unrevealed VP cards).
 *
 * Hidden from everyone in the view: development deck order/contents
 * (only remaining count is exposed).
 */
export function getPlayerView(game, viewerId) {
  if (!game) throw new Error('Game state is required.');
  if (!viewerId) throw new Error('Viewer player id is required.');
  if (!game.players.some((player) => player.id === viewerId)) {
    throw new Error(`Unknown viewer id: ${viewerId}.`);
  }

  const state = copy(game);

  return {
    viewerId,
    phase: state.phase,
    setupDirection: state.setupDirection,
    setupPlacements: state.setupPlacements,
    setupSettlementId: state.setupSettlementId,
    turnIndex: state.turnIndex,
    currentPlayerId: state.currentPlayerId,
    players: state.players.map((player) => sanitizePlayer(player, viewerId, state)),
    board: state.board,
    bank: state.bank,
    developmentDeckCount: Array.isArray(state.developmentDeck) ? state.developmentDeck.length : 0,
    // Never expose remaining deck composition to clients.
    developmentDeck: null,
    dice: state.dice,
    hasRolled: state.hasRolled,
    playedDevelopmentThisTurn: state.playedDevelopmentThisTurn,
    pendingDiscards: state.pendingDiscards ?? {},
    tradeOffer: state.tradeOffer,
    longestRoadPlayerId: state.longestRoadPlayerId,
    largestArmyPlayerId: state.largestArmyPlayerId,
    winnerId: state.winnerId,
    log: state.log,
    lastProduction: sanitizeProduction(state.lastProduction, viewerId),
    lastRobbery: sanitizeRobbery(state.lastRobbery, viewerId),
  };
}

/**
 * True when a value looks like a sanitized player view (not full engine state).
 */
export function isPlayerView(value) {
  return Boolean(value && value.viewerId && value.developmentDeck === null && Array.isArray(value.players));
}
