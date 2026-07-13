/**
 * Renders hands from a player view when available so opponents only see card counts.
 * Falls back to full engine state only when no view is provided.
 */
function formatHand(player) {
  if (player.resources) {
    return Object.entries(player.resources)
      .map(([resource, count]) => `${resource}: ${count}`)
      .join(' | ');
  }

  const count = player.resourceCount ?? 0;
  return count === 1 ? '1 card' : `${count} cards`;
}

function getVictoryPoints(player) {
  if (player.isSelf && typeof player.privateVictoryPoints === 'number') {
    return player.privateVictoryPoints;
  }
  return player.publicVictoryPoints ?? player.score?.publicTotal ?? 0;
}

function getDevelopmentCardCount(player) {
  return player.developmentCardCount ?? player.developmentCards?.length ?? 0;
}

function ResourceStrip({ game, playerView = null }) {
  const source = playerView ?? game;
  if (!source) return null;

  const players = source.players;
  const currentPlayerId = source.currentPlayerId ?? game?.currentPlayerId;

  return (
    <div className="resource-strip" aria-label="Player resources" data-testid="player-resources">
      {players.map((player) => (
        <div
          className={player.id === currentPlayerId ? 'player-state active' : 'player-state'}
          key={player.id}
          data-testid={`player-state-${player.id}`}
          data-active={player.id === currentPlayerId ? 'true' : 'false'}
          data-private={player.isSelf === false || player.resources == null ? 'true' : 'false'}
        >
          <strong>{player.name}</strong>
          <span data-testid={`player-resources-${player.id}`}>{formatHand(player)}</span>
          <div className="player-stat-row" aria-label={`${player.name} counters`}>
            <span
              className="player-stat-pill"
              title="Victory points"
              aria-label={`Victory points: ${getVictoryPoints(player)}`}
              data-testid={`player-public-vp-${player.id}`}
            >
              <span className="player-stat-icon" aria-hidden="true">VP</span>
              <strong>{getVictoryPoints(player)}</strong>
            </span>
            <span
              className="player-stat-pill"
              title="Development cards"
              aria-label={`Development cards: ${getDevelopmentCardCount(player)}`}
              data-testid={`player-development-count-${player.id}`}
            >
              <span className="player-stat-icon" aria-hidden="true">D</span>
              <strong>{getDevelopmentCardCount(player)}</strong>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ResourceStrip;
