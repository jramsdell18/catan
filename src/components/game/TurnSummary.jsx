import { INTERACTION_LABELS } from '../../game/interactions.js';
import RollOutcome from './RollOutcome.jsx';

/** Compact status card overlaid at the top of the board. */
function TurnSummary({
  game,
  playerView = null,
  playerMessage,
  diceTotal,
  gameError,
  interactionMode,
  requestedMode,
  onCancelInteraction,
  actionFeedback,
  currentPlayer = null,
  viewerRole,
  isViewerTurn,
}) {
  const waitingText = game && !isViewerTurn
    ? (viewerRole === 'spectator' ? 'Spectating only.' : 'Waiting for your turn.')
    : null;
  return (
    <div
      className="turn-summary hud-card"
      data-testid="status-panel"
      style={currentPlayer?.color ? { '--turn-color': currentPlayer.color } : undefined}
    >
      <p className="status-message" data-testid="status-message">{playerMessage}</p>
      {game && (
        <p className="hud-subline">
          <span data-testid="engine-phase">Engine phase: {game.phase}</span>
          {game.dice && <span data-testid="last-roll">Last roll: {game.dice.join(' + ')} = {diceTotal}</span>}
          {waitingText && <span data-testid="viewer-role">{waitingText}</span>}
        </p>
      )}
      {gameError && <p className="game-error" role="alert" data-testid="game-error">{gameError}</p>}
      {interactionMode && (
        <div className="interaction-status" data-testid="interaction-status">
          <span>{INTERACTION_LABELS[interactionMode]}</span>
          {requestedMode && (
            <button type="button" className="secondary-button compact-button" onClick={onCancelInteraction} data-testid="cancel-interaction">
              Cancel action
            </button>
          )}
        </div>
      )}
      {/* Game events are shown as toasts; this stays for screen readers and tests. */}
      {actionFeedback.message && (
        <p className={`action-feedback visually-hidden ${actionFeedback.status}`} aria-live="polite" data-testid="action-feedback" data-status={actionFeedback.status}>
          {actionFeedback.message}
        </p>
      )}
      <RollOutcome game={game} playerView={playerView} />
    </div>
  );
}

export default TurnSummary;
