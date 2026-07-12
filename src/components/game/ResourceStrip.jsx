function ResourceStrip({ game }) {
  if (!game) return null;
  return (
    <div className="resource-strip" aria-label="Player resources" data-testid="player-resources">
      {game.players.map((player) => (
        <div
          className={player.id === game.currentPlayerId ? 'player-state active' : 'player-state'}
          key={player.id}
          data-testid={`player-state-${player.id}`}
          data-active={player.id === game.currentPlayerId ? 'true' : 'false'}
        >
          <strong>{player.name}</strong>
          <span data-testid={`player-resources-${player.id}`}>
            {Object.entries(player.resources).map(([resource, count]) => `${resource}: ${count}`).join(' | ')}
          </span>
        </div>
      ))}
    </div>
  );
}

export default ResourceStrip;
