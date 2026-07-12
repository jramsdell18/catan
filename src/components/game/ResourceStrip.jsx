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
          {typeof player.publicVictoryPoints === 'number' && (
            <span className="public-vp" data-testid={`player-public-vp-${player.id}`}>
              {player.publicVictoryPoints} VP
              {player.isSelf && typeof player.privateVictoryPoints === 'number'
                ? ` (${player.privateVictoryPoints} private)`
                : ''}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default ResourceStrip;
