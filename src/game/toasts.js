/**
 * Turns new rules-log entries into short, player-coloured toast messages.
 * Works from the synced game state, so every client (and bot turns in solo
 * mode) produces the same notifications.
 */

export const TOAST_DURATION_MS = 3000;
export const MAX_TOASTS = 3;

const DEVELOPMENT_LABELS = {
  knight: 'a Knight',
  roadBuilding: 'Road Building',
  yearOfPlenty: 'Year of Plenty',
  monopoly: 'Monopoly',
};

const SIMPLE_MESSAGES = {
  placeSettlement: 'placed a settlement',
  placeRoad: 'placed a road',
  buildCity: 'placed a city',
  discard: 'discarded cards',
  buyDevelopment: 'bought a development card',
  maritimeTrade: 'traded with the bank',
  rejectTrade: 'declined the trade',
  cancelTrade: 'cancelled the trade offer',
};

function joinNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * @returns {{ playerId: string|null, message: string }|null}
 * `isLatest` allows details from last* fields, which only describe the newest entry.
 */
export function describeGameEvent(entry, game, { isLatest = false } = {}) {
  if (!entry || !game) return null;
  const nameOf = (id) => game.players.find((player) => player.id === id)?.name ?? id;
  const actor = nameOf(entry.playerId);

  if (SIMPLE_MESSAGES[entry.type]) {
    return { playerId: entry.playerId, message: `${actor} ${SIMPLE_MESSAGES[entry.type]}` };
  }
  if (entry.type === 'rollDice') {
    const total = isLatest && Array.isArray(game.dice) ? game.dice[0] + game.dice[1] : null;
    return { playerId: entry.playerId, message: total ? `${actor} rolled ${total}` : `${actor} rolled the dice` };
  }
  if (entry.type === 'moveRobber') {
    const victimId = isLatest ? game.lastRobbery?.victimId : null;
    return {
      playerId: entry.playerId,
      message: victimId ? `${actor} moved the robber and robbed ${nameOf(victimId)}` : `${actor} moved the robber`,
    };
  }
  if (entry.type === 'playDevelopment') {
    const card = isLatest ? DEVELOPMENT_LABELS[game.lastDevelopment?.card] : null;
    return { playerId: entry.playerId, message: `${actor} played ${card ?? 'a development card'}` };
  }
  if (entry.type === 'offerTrade') {
    const recipients = isLatest ? game.lastTrade?.toPlayerIds ?? game.tradeOffer?.toPlayerIds : null;
    return {
      playerId: entry.playerId,
      message: recipients?.length ? `${actor} offered a trade to ${joinNames(recipients.map(nameOf))}` : `${actor} offered a trade`,
    };
  }
  if (entry.type === 'acceptTrade') {
    const fromId = isLatest && game.lastTrade?.type === 'accepted' ? game.lastTrade.fromPlayerId : null;
    return fromId
      ? { playerId: fromId, message: `${nameOf(fromId)} traded with ${actor}` }
      : { playerId: entry.playerId, message: `${actor} accepted a trade` };
  }
  return null;
}

export function createToastsFromLog(game, previousLength) {
  const log = game?.log ?? [];
  if (log.length <= previousLength) return [];
  // A large jump means a fresh sync (for example joining mid-game): don't replay history.
  if (log.length - previousLength > MAX_TOASTS * 2) return [];
  return log.slice(previousLength).flatMap((entry, offset) => {
    const index = previousLength + offset;
    const event = describeGameEvent(entry, game, { isLatest: index === log.length - 1 });
    if (!event) return [];
    const color = game.players.find((player) => player.id === event.playerId)?.color ?? '#43534c';
    return [{ id: `${index}-${entry.type}-${entry.playerId}`, ...event, color }];
  });
}
