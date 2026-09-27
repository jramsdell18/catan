import { useEffect } from 'react';
import { TOAST_DURATION_MS } from '../../game/toasts.js';

function GameToast({ toast, onDone }) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDone(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [onDone, toast.id]);

  return (
    <li
      className="game-toast"
      style={{ '--toast-color': toast.color, '--toast-duration': `${TOAST_DURATION_MS}ms` }}
      data-testid="game-toast"
      data-player-id={toast.playerId ?? ''}
    >
      <span className="game-toast-dot" aria-hidden="true" />
      {toast.message}
    </li>
  );
}

/** Short-lived, non-interactive game event notifications. */
function GameToasts({ toasts, onDone }) {
  return (
    <ol className="game-toasts" role="status" aria-live="polite" aria-label="Game events">
      {toasts.map((toast) => <GameToast key={toast.id} toast={toast} onDone={onDone} />)}
    </ol>
  );
}

export default GameToasts;
