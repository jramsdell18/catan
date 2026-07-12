import { describeLogEntry } from '../../game/interactions.js';

function ActionHistory({ game }) {
  if (!game?.log.length) return null;
  return (
    <section className="history-panel" aria-labelledby="history-title" data-testid="action-history">
      <p className="status-label" id="history-title">Recent actions</p>
      <ol>
        {[...game.log].reverse().slice(0, 8).map((entry, index) => (
          <li key={`${game.log.length - index}-${entry.type}`}>{describeLogEntry(entry, game.players)}</li>
        ))}
      </ol>
    </section>
  );
}

export default ActionHistory;
