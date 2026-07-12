function bundleText(bundle) {
  if (bundle && typeof bundle.hiddenCount === 'number' && Object.keys(bundle).length === 1) {
    const n = bundle.hiddenCount;
    return n === 1 ? '1 hidden card' : `${n} hidden cards`;
  }
  return Object.entries(bundle)
    .map(([resource, amount]) => `${amount} ${resource}`)
    .join(', ');
}

function playerName(source, playerId) {
  return source.players.find((player) => player.id === playerId)?.name ?? playerId;
}

/**
 * @param {object} props
 * @param {object} props.game full engine state (fallback)
 * @param {object|null} [props.playerView] sanitized view preferred for privacy
 */
function RollOutcome({ game, playerView = null }) {
  const source = playerView ?? game;
  if (!source) return null;

  const production = source.lastProduction;
  const robbery = source.lastRobbery;
  if (!production && !robbery) return null;

  return (
    <section className="roll-outcome" aria-labelledby="outcome-title" data-testid="roll-outcome">
      <p className="status-label" id="outcome-title">
        Last outcome
      </p>
      {production && (
        <>
          {Object.keys(production.gains ?? {}).length === 0 && <p>No player received resources.</p>}
          {Object.entries(production.gains ?? {}).map(([playerId, gains]) => (
            <p key={playerId}>
              <strong>{playerName(source, playerId)}:</strong> {bundleText(gains)}
            </p>
          ))}
          {(production.tiles ?? [])
            .filter((tile) => tile.shortage)
            .map((tile) => (
              <p className="production-warning" key={tile.tileId}>
                Bank shortage: no {tile.resource} was distributed from {tile.tileId}.
              </p>
            ))}
          {(production.tiles ?? [])
            .filter((tile) => tile.blocked)
            .map((tile) => (
              <p className="production-warning" key={tile.tileId}>
                The robber blocked production on {tile.tileId}.
              </p>
            ))}
        </>
      )}
      {robbery && (
        <p>
          The robber moved to {robbery.tileId}.
          {robbery.victimId
            ? robbery.stolenResource
              ? ` ${playerName(source, robbery.victimId)} lost ${robbery.stolenResource}.`
              : ` ${playerName(source, robbery.victimId)} lost one hidden resource.`
            : ' No player was robbed.'}
        </p>
      )}
    </section>
  );
}

export default RollOutcome;
