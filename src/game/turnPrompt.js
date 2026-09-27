/**
 * One short line telling the local player what to do next. Kept pure so the
 * wording is unit-tested and every phase has exactly one obvious next step.
 */
const REQUESTED_MODE_PROMPTS = {
  placeRoad: 'Tap a glowing edge to build your road',
  placeSettlement: 'Tap a glowing spot to build your settlement',
  buildCity: 'Tap one of your settlements to make it a city',
  roadBuilding: 'Tap one or two glowing edges for free roads',
};

export function getTurnPrompt({
  game,
  currentPlayerName = 'Current player',
  isViewerTurn = false,
  sharedDevice = false,
  requestedMode = null,
  viewerMustDiscard = false,
  robberTileSelected = false,
}) {
  if (!game) return '';
  if (game.phase === 'gameOver') return `${currentPlayerName} won the game!`;
  if (viewerMustDiscard) return 'Too many cards: discard half your hand';
  if (!isViewerTurn) {
    if (game.phase === 'discard') return 'Waiting for players to discard…';
    return `Waiting for ${currentPlayerName}…`;
  }
  // On a shared device every seat plays from this screen, so name who is up.
  const who = sharedDevice ? `${currentPlayerName}: ` : '';
  const say = (text) => (who ? `${who}${text.charAt(0).toLowerCase()}${text.slice(1)}` : text);

  if (requestedMode && REQUESTED_MODE_PROMPTS[requestedMode]) return say(REQUESTED_MODE_PROMPTS[requestedMode]);
  switch (game.phase) {
    case 'setup':
      return game.setupSettlementId
        ? say('Place a road next to your new settlement')
        : say('Place your settlement: tap a glowing spot');
    case 'roll':
      return say('Roll the dice');
    case 'discard':
      return say('Players with more than 7 cards discard half');
    case 'robber':
      return robberTileSelected ? say('Choose a player to rob') : say('Move the robber: tap a hex');
    case 'action':
      return say('Build, trade, or end your turn');
    default:
      return say('Your turn');
  }
}
