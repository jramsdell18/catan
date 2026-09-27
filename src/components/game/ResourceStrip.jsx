import { RESOURCE_DISPLAY } from '../../game/resourceDisplay.js';

/**
 * Slim board overlay: every player's public hand count, plus the local hand as
 * resource chips. Uses the player view when available so opponents only show counts.
 */
function getVictoryPoints(player) {
  if (player.isSelf && typeof player.privateVictoryPoints === 'number') {
    return player.privateVictoryPoints;
  }
  return player.publicVictoryPoints ?? player.score?.publicTotal ?? 0;
}

function getDevelopmentCardCount(player) {
  return player.developmentCardCount ?? player.developmentCards?.length ?? 0;
}

function getHandCount(player) {
  if (typeof player.resourceCount === 'number') return player.resourceCount;
  return Object.values(player.resources ?? {}).reduce((sum, amount) => sum + amount, 0);
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
  const colorOf = (id) => game?.players.find((player) => player.id === id)?.color ?? players.find((player) => player.id === id)?.color;

  return (
    <div className="resource-strip" aria-label="Player resources" data-testid="player-resources">
      <ul className="hud-players" aria-label="Hand counts">
        {players.map((player) => {
          const count = getHandCount(player);
          return (
            <li
              key={player.id}
              className={`hud-player-chip${player.id === currentPlayerId ? ' is-current' : ''}${player.isSelf ? ' is-self' : ''}`}
              style={{ '--chip-color': colorOf(player.id) }}
              data-testid={`hand-count-${player.id}`}
              aria-label={`${player.name}: ${count} ${count === 1 ? 'card' : 'cards'}, ${getVictoryPoints(player)} victory points`}
            >
              <span className="hud-player-dot" aria-hidden="true" />
              <span className="hud-player-name">{player.name}</span>
              <strong>{count}</strong>
            </li>
          );
        })}
      </ul>
      <div
        className="player-state active"
        data-testid={`player-state-${visiblePlayer.id}`}
        data-active={visiblePlayer.id === currentPlayerId ? 'true' : 'false'}
        data-private={visiblePlayer.isSelf === false || visiblePlayer.resources == null ? 'true' : 'false'}
        style={{ '--chip-color': colorOf(visiblePlayer.id) }}
      >
        <strong className="player-state-name">{visiblePlayer.name}</strong>
        <span className="player-hand" data-testid={`player-resources-${visiblePlayer.id}`}>
          {visiblePlayer.resources
            ? RESOURCE_DISPLAY.map((resource) => (
              <span
                className="resource-chip"
                key={resource.id}
                title={resource.label}
                aria-label={`${resource.label}: ${visiblePlayer.resources[resource.id] ?? 0}`}
                data-empty={(visiblePlayer.resources[resource.id] ?? 0) === 0 ? 'true' : 'false'}
              >
                <span aria-hidden="true">{resource.icon}</span>
                <strong>{visiblePlayer.resources[resource.id] ?? 0}</strong>
              </span>
            ))
            : `${getHandCount(visiblePlayer)} cards`}
        </span>
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
  );
}

export default ResourceStrip;
