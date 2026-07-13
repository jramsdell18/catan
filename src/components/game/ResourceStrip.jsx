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
  const visiblePlayer =
    players.find((player) => player.isSelf) ??
    players.find((player) => player.id === currentPlayerId) ??
    players[0];

  if (!visiblePlayer) return null;

  return (
    <div className="resource-strip" aria-label="Player resources" data-testid="player-resources">
      <div
        className="player-state active"
        data-testid={`player-state-${visiblePlayer.id}`}
        data-active={visiblePlayer.id === currentPlayerId ? 'true' : 'false'}
        data-private={visiblePlayer.isSelf === false || visiblePlayer.resources == null ? 'true' : 'false'}
      >
        <strong>{visiblePlayer.name}</strong>
        <span data-testid={`player-resources-${visiblePlayer.id}`}>{formatHand(visiblePlayer)}</span>
        <div className="player-stat-row" aria-label={`${visiblePlayer.name} counters`}>
          <span
            className="player-stat-pill"
            title="Victory points"
            aria-label={`Victory points: ${getVictoryPoints(visiblePlayer)}`}
            data-testid={`player-public-vp-${visiblePlayer.id}`}
          >
            <span className="player-stat-icon" aria-hidden="true">VP</span>
            <strong>{getVictoryPoints(visiblePlayer)}</strong>
          </span>
          <span
            className="player-stat-pill"
            title="Development cards"
            aria-label={`Development cards: ${getDevelopmentCardCount(visiblePlayer)}`}
            data-testid={`player-development-count-${visiblePlayer.id}`}
          >
            <span className="player-stat-icon" aria-hidden="true">D</span>
            <strong>{getDevelopmentCardCount(visiblePlayer)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

export default ResourceStrip;
