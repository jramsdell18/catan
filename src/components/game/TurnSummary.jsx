import { INTERACTION_LABELS } from '../../game/interactions.js';

function TurnSummary({
  game,
  playerMessage,
  diceTotal,
  gameError,
  interactionMode,
  requestedMode,
  onCancelInteraction,
  actionFeedback,
}) {
  return (
    <div className="turn-summary" data-testid="status-panel">
      <p className="status-label">{game ? `Phase: ${game.phase}` : 'Room setup'}</p>
      <p className="status-message" data-testid="status-message">{playerMessage}</p>
      {game && <p className="helper-text" data-testid="engine-phase">Engine phase: {game.phase}</p>}
      {game?.dice && <p className="helper-text" data-testid="last-roll">Last roll: {game.dice.join(' + ')} = {diceTotal}</p>}
      {gameError && <p className="game-error" role="alert" data-testid="game-error">{gameError}</p>}
      {interactionMode && (
        <div className="interaction-status" data-testid="interaction-status">
          <strong>Board action</strong>
          <span>{INTERACTION_LABELS[interactionMode]}</span>
          {requestedMode && (
            <button type="button" className="secondary-button compact-button" onClick={onCancelInteraction} data-testid="cancel-interaction">
              Cancel action
            </button>
          )}
        </div>
      )}
      {actionFeedback.message && (
        <p className={`action-feedback ${actionFeedback.status}`} aria-live="polite" data-testid="action-feedback" data-status={actionFeedback.status}>
          {actionFeedback.message}
        </p>
      )}
    </div>
  );
}

export default TurnSummary;
