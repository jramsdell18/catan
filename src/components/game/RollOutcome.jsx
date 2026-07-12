function bundleText(bundle) {
  return Object.entries(bundle).map(([resource, amount]) => `${amount} ${resource}`).join(', ');
}

function RollOutcome({ game }) {
  if (!game) return null;
  const production = game.lastProduction;
  const robbery = game.lastRobbery;
  if (!production && !robbery) return null;

  return (
    <section className="roll-outcome" aria-labelledby="outcome-title" data-testid="roll-outcome">
      <p className="status-label" id="outcome-title">Last outcome</p>
      {production && (
        <>
          {Object.keys(production.gains).length === 0 && <p>No player received resources.</p>}
          {Object.entries(production.gains).map(([playerId, gains]) => (
            <p key={playerId}>
              <strong>{game.players.find((player) => player.id === playerId)?.name}:</strong> {bundleText(gains)}
            </p>
          ))}
          {production.tiles.filter((tile) => tile.shortage).map((tile) => (
            <p className="production-warning" key={tile.tileId}>
              Bank shortage: no {tile.resource} was distributed from {tile.tileId}.
            </p>
          ))}
          {production.tiles.filter((tile) => tile.blocked).map((tile) => (
            <p className="production-warning" key={tile.tileId}>The robber blocked production on {tile.tileId}.</p>
          ))}
        </>
      )}
      {robbery && (
        <p>
          The robber moved to {robbery.tileId}.
          {robbery.victimId ? ` ${game.players.find((player) => player.id === robbery.victimId)?.name} lost one hidden resource.` : ' No player was robbed.'}
        </p>
      )}
    </section>
  );
}

export default RollOutcome;
