import RollOutcome from './RollOutcome.jsx';

/**
 * One-line prompt at the top of the board: what the local player should do now.
 * Details (phase, last roll breakdown) stay available but out of the way.
 */
function TurnSummary({
  game,
  playerView = null,
  playerMessage,
  diceTotal,
  gameError,
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
      className={`turn-summary hud-card${isViewerTurn ? ' is-your-turn' : ''}`}
      data-testid="status-panel"
      style={currentPlayer?.color ? { '--turn-color': currentPlayer.color } : undefined}
    >
      <div className="turn-summary-main">
        <span className="turn-dot" aria-hidden="true" />
        <p className="status-message" data-testid="status-message" aria-live="polite">{playerMessage}</p>
        <RollOutcome game={game} playerView={playerView} diceTotal={diceTotal} />
      </div>
      {game && (
        <p className="visually-hidden">
          <span data-testid="engine-phase">Engine phase: {game.phase}</span>
          {waitingText && <span data-testid="viewer-role">{waitingText}</span>}
        </p>
      )}
      {gameError && <p className="game-error" role="alert" data-testid="game-error">{gameError}</p>}
      {/* Game events are shown as toasts; this stays for screen readers and tests. */}
      {actionFeedback.message && (
        <p className={`action-feedback visually-hidden ${actionFeedback.status}`} aria-live="polite" data-testid="action-feedback" data-status={actionFeedback.status}>
          {actionFeedback.message}
        </p>
      )}
    </div>
  );
}

export default TurnSummary;
